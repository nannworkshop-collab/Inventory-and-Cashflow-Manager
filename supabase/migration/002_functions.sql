-- 002_functions.sql
-- Fungsi RPC: setiap fungsi berjalan sebagai SATU transaksi database.
-- Jika satu langkah gagal (misal stok kurang), SEMUA perubahan dibatalkan otomatis.
-- Frontend memanggilnya dengan: supabase.rpc('nama_fungsi', { ...parameter })
-- security definer = fungsi berjalan dengan hak pemilik, jadi cek akses dilakukan
-- manual lewat require_role(). set search_path = '' = keamanan (semua nama pakai public.).

-- 1. Pembantu akses ----------------------------------------------------------
create or replace function public.is_member(p_business_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.business_members m
                 where m.business_id = p_business_id and m.user_id = (select auth.uid()));
$$;

create or replace function public.has_role(p_business_id uuid, p_roles text[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.business_members m
                 where m.business_id = p_business_id and m.user_id = (select auth.uid())
                   and m.role = any(p_roles));
$$;

-- Hanya dipanggil dari fungsi lain (tidak bisa dipanggil dari frontend).
create or replace function public.require_role(p_business_id uuid, p_roles text[])
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Belum login'; end if;
  if not public.has_role(p_business_id, p_roles) then
    raise exception 'Tidak punya akses ke bisnis ini';
  end if;
end $$;

-- 2. Pengguna & bisnis -------------------------------------------------------
-- Saat user baru mendaftar di Supabase Auth, otomatis dibuatkan baris profiles.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.create_business(p_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Belum login'; end if;
  if p_name is null or length(trim(p_name)) = 0 then raise exception 'Nama bisnis wajib diisi'; end if;
  insert into public.businesses (name, owner_id) values (trim(p_name), auth.uid()) returning id into v_id;
  insert into public.business_members (business_id, user_id, role) values (v_id, auth.uid(), 'owner');
  return v_id;
end $$;

-- 3. Penjualan ---------------------------------------------------------------
-- p_items contoh: [{"product_id":"...","qty":2,"unit_price":15000}]
-- unit_price boleh dihilangkan -> memakai harga jual produk.
create or replace function public.create_sale(
  p_business_id uuid, p_customer_id uuid, p_sale_date date, p_notes text, p_items jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := gen_random_uuid();
  v_date date := coalesce(p_sale_date, current_date);
  v_no text; v_seq integer; v_total numeric(14,2) := 0;
  v_item record; v_prod public.products%rowtype; v_price numeric(14,2); v_sub numeric(14,2);
begin
  perform public.require_role(p_business_id, array['owner','admin','staff']);
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Penjualan harus punya minimal 1 produk';
  end if;
  if p_customer_id is not null and not exists
     (select 1 from public.customers c where c.id = p_customer_id and c.business_id = p_business_id) then
    raise exception 'Pelanggan tidak ditemukan';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_business_id::text)); -- cegah nomor faktur ganda
  select count(*) + 1 into v_seq from public.sales where business_id = p_business_id;
  v_no := 'INV-' || to_char(v_date, 'YYMMDD') || '-' || lpad(v_seq::text, 4, '0');

  insert into public.sales (id, business_id, customer_id, invoice_no, sale_date, total, notes, created_by)
  values (v_id, p_business_id, p_customer_id, v_no, v_date, 0, p_notes, auth.uid());

  for v_item in select * from jsonb_to_recordset(p_items) as x(product_id uuid, qty integer, unit_price numeric) loop
    if v_item.qty is null or v_item.qty <= 0 then raise exception 'Qty harus lebih dari 0'; end if;
    select * into v_prod from public.products
     where id = v_item.product_id and business_id = p_business_id and is_active for update;
    if not found then raise exception 'Produk tidak ditemukan atau nonaktif'; end if;
    if v_prod.stock_qty < v_item.qty then
      raise exception 'Stok % tidak cukup (tersisa %)', v_prod.name, v_prod.stock_qty;
    end if;
    v_price := round(coalesce(v_item.unit_price, v_prod.sell_price), 2);
    v_sub := v_item.qty * v_price;

    insert into public.sale_items (business_id, sale_id, product_id, qty, unit_price, subtotal)
    values (p_business_id, v_id, v_prod.id, v_item.qty, v_price, v_sub);
    update public.products set stock_qty = stock_qty - v_item.qty where id = v_prod.id;
    insert into public.stock_movements (business_id, product_id, movement_type, qty_change, reference_type, reference_id, note, created_by)
    values (p_business_id, v_prod.id, 'sale', -v_item.qty, 'sale', v_id, v_no, auth.uid());
    v_total := v_total + v_sub;
  end loop;

  update public.sales set total = v_total where id = v_id;
  if v_total > 0 then
    insert into public.cash_transactions (business_id, direction, category, amount, trx_date, description, reference_type, reference_id, created_by)
    values (p_business_id, 'in', 'Penjualan', v_total, v_date, 'Penjualan ' || v_no, 'sale', v_id, auth.uid());
  end if;
  return v_id;
end $$;

-- 4. Pembelian ---------------------------------------------------------------
-- p_items contoh: [{"product_id":"...","qty":10,"unit_cost":8000}]
create or replace function public.create_purchase(
  p_business_id uuid, p_supplier_id uuid, p_purchase_date date, p_notes text, p_items jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := gen_random_uuid();
  v_date date := coalesce(p_purchase_date, current_date);
  v_no text; v_seq integer; v_total numeric(14,2) := 0;
  v_item record; v_prod public.products%rowtype; v_cost numeric(14,2); v_sub numeric(14,2);
begin
  perform public.require_role(p_business_id, array['owner','admin','staff']);
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Pembelian harus punya minimal 1 produk';
  end if;
  if p_supplier_id is not null and not exists
     (select 1 from public.suppliers s where s.id = p_supplier_id and s.business_id = p_business_id) then
    raise exception 'Pemasok tidak ditemukan';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_business_id::text));
  select count(*) + 1 into v_seq from public.purchases where business_id = p_business_id;
  v_no := 'PO-' || to_char(v_date, 'YYMMDD') || '-' || lpad(v_seq::text, 4, '0');

  insert into public.purchases (id, business_id, supplier_id, purchase_no, purchase_date, total, notes, created_by)
  values (v_id, p_business_id, p_supplier_id, v_no, v_date, 0, p_notes, auth.uid());

  for v_item in select * from jsonb_to_recordset(p_items) as x(product_id uuid, qty integer, unit_cost numeric) loop
    if v_item.qty is null or v_item.qty <= 0 then raise exception 'Qty harus lebih dari 0'; end if;
    if v_item.unit_cost is null or v_item.unit_cost < 0 then raise exception 'Harga beli tidak valid'; end if;
    select * into v_prod from public.products
     where id = v_item.product_id and business_id = p_business_id and is_active for update;
    if not found then raise exception 'Produk tidak ditemukan atau nonaktif'; end if;
    v_cost := round(v_item.unit_cost, 2);
    v_sub := v_item.qty * v_cost;

    insert into public.purchase_items (business_id, purchase_id, product_id, qty, unit_cost, subtotal)
    values (p_business_id, v_id, v_prod.id, v_item.qty, v_cost, v_sub);
    update public.products set stock_qty = stock_qty + v_item.qty where id = v_prod.id;
    insert into public.stock_movements (business_id, product_id, movement_type, qty_change, reference_type, reference_id, note, created_by)
    values (p_business_id, v_prod.id, 'purchase', v_item.qty, 'purchase', v_id, v_no, auth.uid());
    v_total := v_total + v_sub;
  end loop;

  update public.purchases set total = v_total where id = v_id;
  if v_total > 0 then
    insert into public.cash_transactions (business_id, direction, category, amount, trx_date, description, reference_type, reference_id, created_by)
    values (p_business_id, 'out', 'Pembelian', v_total, v_date, 'Pembelian ' || v_no, 'purchase', v_id, auth.uid());
  end if;
  return v_id;
end $$;

-- 5. Pengeluaran operasional -------------------------------------------------
create or replace function public.create_expense(
  p_business_id uuid, p_category text, p_description text, p_amount numeric, p_expense_date date)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_date date := coalesce(p_expense_date, current_date);
begin
  perform public.require_role(p_business_id, array['owner','admin','staff']);
  if p_category is null or length(trim(p_category)) = 0 then raise exception 'Kategori wajib diisi'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Jumlah harus lebih dari 0'; end if;

  insert into public.expenses (business_id, category, description, amount, expense_date, created_by)
  values (p_business_id, trim(p_category), p_description, round(p_amount, 2), v_date, auth.uid())
  returning id into v_id;
  insert into public.cash_transactions (business_id, direction, category, amount, trx_date, description, reference_type, reference_id, created_by)
  values (p_business_id, 'out', trim(p_category), round(p_amount, 2), v_date, p_description, 'expense', v_id, auth.uid());
  return v_id;
end $$;

-- 6. Pembatalan (reversal) -- tidak ada DELETE ---------------------------------
-- Stok dikembalikan lewat stock_movements 'reversal'; kas dibalik lewat baris baru
-- dengan arah berlawanan (reversal_of menunjuk baris asli). Hanya owner/admin.
create or replace function public.cancel_sale(p_sale_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_sale public.sales%rowtype; v_item record; v_cash public.cash_transactions%rowtype;
begin
  select * into v_sale from public.sales where id = p_sale_id for update;
  if not found then raise exception 'Penjualan tidak ditemukan'; end if;
  perform public.require_role(v_sale.business_id, array['owner','admin']);
  if v_sale.status <> 'completed' then raise exception 'Penjualan sudah dibatalkan'; end if;

  for v_item in select product_id, qty from public.sale_items where sale_id = p_sale_id loop
    update public.products set stock_qty = stock_qty + v_item.qty where id = v_item.product_id;
    insert into public.stock_movements (business_id, product_id, movement_type, qty_change, reference_type, reference_id, note, created_by)
    values (v_sale.business_id, v_item.product_id, 'reversal', v_item.qty, 'sale', p_sale_id, 'Pembatalan ' || v_sale.invoice_no, auth.uid());
  end loop;

  for v_cash in select * from public.cash_transactions
                where reference_type = 'sale' and reference_id = p_sale_id and reversal_of is null loop
    insert into public.cash_transactions (business_id, direction, category, amount, trx_date, description, reference_type, reference_id, reversal_of, created_by)
    values (v_cash.business_id, case v_cash.direction when 'in' then 'out' else 'in' end, v_cash.category,
            v_cash.amount, current_date, 'Pembatalan ' || v_sale.invoice_no, 'sale', p_sale_id, v_cash.id, auth.uid());
  end loop;

  update public.sales set status = 'cancelled', cancelled_at = now() where id = p_sale_id;
end $$;

create or replace function public.cancel_purchase(p_purchase_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_pur public.purchases%rowtype; v_item record; v_stock integer; v_cash public.cash_transactions%rowtype;
begin
  select * into v_pur from public.purchases where id = p_purchase_id for update;
  if not found then raise exception 'Pembelian tidak ditemukan'; end if;
  perform public.require_role(v_pur.business_id, array['owner','admin']);
  if v_pur.status <> 'completed' then raise exception 'Pembelian sudah dibatalkan'; end if;

  for v_item in select product_id, qty from public.purchase_items where purchase_id = p_purchase_id loop
    select stock_qty into v_stock from public.products where id = v_item.product_id for update;
    if v_stock < v_item.qty then
      raise exception 'Stok sudah terpakai, pembelian tidak bisa dibatalkan (tersisa %, perlu %)', v_stock, v_item.qty;
    end if;
    update public.products set stock_qty = stock_qty - v_item.qty where id = v_item.product_id;
    insert into public.stock_movements (business_id, product_id, movement_type, qty_change, reference_type, reference_id, note, created_by)
    values (v_pur.business_id, v_item.product_id, 'reversal', -v_item.qty, 'purchase', p_purchase_id, 'Pembatalan ' || v_pur.purchase_no, auth.uid());
  end loop;

  for v_cash in select * from public.cash_transactions
                where reference_type = 'purchase' and reference_id = p_purchase_id and reversal_of is null loop
    insert into public.cash_transactions (business_id, direction, category, amount, trx_date, description, reference_type, reference_id, reversal_of, created_by)
    values (v_cash.business_id, case v_cash.direction when 'in' then 'out' else 'in' end, v_cash.category,
            v_cash.amount, current_date, 'Pembatalan ' || v_pur.purchase_no, 'purchase', p_purchase_id, v_cash.id, auth.uid());
  end loop;

  update public.purchases set status = 'cancelled', cancelled_at = now() where id = p_purchase_id;
end $$;

create or replace function public.cancel_expense(p_expense_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_exp public.expenses%rowtype; v_cash public.cash_transactions%rowtype;
begin
  select * into v_exp from public.expenses where id = p_expense_id for update;
  if not found then raise exception 'Pengeluaran tidak ditemukan'; end if;
  perform public.require_role(v_exp.business_id, array['owner','admin']);
  if v_exp.status <> 'completed' then raise exception 'Pengeluaran sudah dibatalkan'; end if;

  for v_cash in select * from public.cash_transactions
                where reference_type = 'expense' and reference_id = p_expense_id and reversal_of is null loop
    insert into public.cash_transactions (business_id, direction, category, amount, trx_date, description, reference_type, reference_id, reversal_of, created_by)
    values (v_cash.business_id, 'in', v_cash.category, v_cash.amount, current_date,
            'Pembatalan pengeluaran', 'expense', p_expense_id, v_cash.id, auth.uid());
  end loop;

  update public.expenses set status = 'cancelled', cancelled_at = now() where id = p_expense_id;
end $$;

-- 7. Penyesuaian stok manual (stok awal, stok opname) ----------------------------
-- p_qty_change positif = tambah, negatif = kurangi. Selalu tercatat di stock_movements.
create or replace function public.adjust_stock(
  p_business_id uuid, p_product_id uuid, p_qty_change integer, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_prod public.products%rowtype;
begin
  perform public.require_role(p_business_id, array['owner','admin']);
  if p_qty_change is null or p_qty_change = 0 then raise exception 'Perubahan stok tidak boleh 0'; end if;
  select * into v_prod from public.products where id = p_product_id and business_id = p_business_id for update;
  if not found then raise exception 'Produk tidak ditemukan'; end if;
  if v_prod.stock_qty + p_qty_change < 0 then raise exception 'Stok tidak boleh negatif'; end if;

  update public.products set stock_qty = stock_qty + p_qty_change where id = v_prod.id;
  insert into public.stock_movements (business_id, product_id, movement_type, qty_change, reference_type, note, created_by)
  values (p_business_id, v_prod.id, 'adjustment', p_qty_change, 'manual', coalesce(p_note, 'Penyesuaian stok'), auth.uid());
end $$;

-- 8. Hak eksekusi: hanya user login yang boleh memanggil RPC ------------------
revoke execute on function
  public.is_member(uuid), public.has_role(uuid, text[]), public.create_business(text),
  public.create_sale(uuid, uuid, date, text, jsonb), public.create_purchase(uuid, uuid, date, text, jsonb),
  public.create_expense(uuid, text, text, numeric, date), public.cancel_sale(uuid),
  public.cancel_purchase(uuid), public.cancel_expense(uuid), public.adjust_stock(uuid, uuid, integer, text)
  from public, anon;
grant execute on function
  public.is_member(uuid), public.has_role(uuid, text[]), public.create_business(text),
  public.create_sale(uuid, uuid, date, text, jsonb), public.create_purchase(uuid, uuid, date, text, jsonb),
  public.create_expense(uuid, text, text, numeric, date), public.cancel_sale(uuid),
  public.cancel_purchase(uuid), public.cancel_expense(uuid), public.adjust_stock(uuid, uuid, integer, text)
  to authenticated;
-- Fungsi internal: tidak boleh dipanggil dari frontend sama sekali.
revoke execute on function public.require_role(uuid, text[]), public.handle_new_user()
  from public, anon, authenticated;
