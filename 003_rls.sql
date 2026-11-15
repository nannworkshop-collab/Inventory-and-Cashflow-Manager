-- 003_rls.sql
-- Row Level Security: setiap pengguna hanya melihat data bisnis tempat ia menjadi anggota.
-- RLS sudah AKTIF sejak 001_schema.sql (tanpa policy = semua ditolak).
-- Di sini kita membuka akses secukupnya. Dua lapis pengaman:
--   (a) policy RLS  = baris mana yang boleh dilihat/diubah
--   (b) GRANT/REVOKE = kolom/tabel mana yang boleh ditulis langsung
-- Data transaksi (penjualan, pembelian, pengeluaran, stok, kas) TIDAK bisa ditulis
-- langsung dari frontend: hanya dibaca. Perubahan hanya lewat fungsi RPC (002).

-- 1. Hak akses tabel ---------------------------------------------------------
revoke all on all tables in schema public from anon;   -- pengunjung tanpa login: nol akses

-- Tabel transaksi: authenticated hanya boleh SELECT.
revoke insert, update, delete on
  public.sales, public.sale_items, public.purchases, public.purchase_items,
  public.expenses, public.stock_movements, public.cash_transactions
  from authenticated;

-- Bisnis & profil: dibuat lewat RPC/trigger; yang boleh diubah hanya kolom tertentu.
revoke insert, update, delete on public.businesses, public.profiles from authenticated;
grant update (name) on public.businesses to authenticated;
grant update (full_name, phone) on public.profiles to authenticated;

-- Produk: stock_qty TIDAK boleh diubah langsung (harus lewat RPC + stock_movements).
revoke insert, update on public.products from authenticated;
grant insert (business_id, sku, name, unit, buy_price, sell_price, min_stock) on public.products to authenticated;
grant update (sku, name, unit, buy_price, sell_price, min_stock, is_active) on public.products to authenticated;

-- 2. Policy ------------------------------------------------------------------
-- profiles: hanya milik sendiri
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- businesses: anggota boleh melihat; owner/admin boleh mengubah nama
create policy businesses_select on public.businesses for select to authenticated
  using (public.is_member(id));
create policy businesses_update on public.businesses for update to authenticated
  using (public.has_role(id, array['owner','admin']))
  with check (public.has_role(id, array['owner','admin']));

-- business_members: anggota boleh melihat rekan; owner mengelola anggota
create policy members_select on public.business_members for select to authenticated
  using (public.is_member(business_id));
create policy members_manage on public.business_members for all to authenticated
  using (public.has_role(business_id, array['owner']))
  with check (public.has_role(business_id, array['owner']));

-- Data master: anggota boleh baca/tambah/ubah. Pemasok & pelanggan: hanya owner/admin
-- boleh hapus. Produk TIDAK bisa dihapus (riwayat transaksi merujuknya): nonaktifkan via is_active.
create policy products_select on public.products for select to authenticated using (public.is_member(business_id));
create policy products_insert on public.products for insert to authenticated with check (public.is_member(business_id));
create policy products_update on public.products for update to authenticated
  using (public.is_member(business_id)) with check (public.is_member(business_id));

create policy suppliers_select on public.suppliers for select to authenticated using (public.is_member(business_id));
create policy suppliers_insert on public.suppliers for insert to authenticated with check (public.is_member(business_id));
create policy suppliers_update on public.suppliers for update to authenticated
  using (public.is_member(business_id)) with check (public.is_member(business_id));
create policy suppliers_delete on public.suppliers for delete to authenticated
  using (public.has_role(business_id, array['owner','admin']));

create policy customers_select on public.customers for select to authenticated using (public.is_member(business_id));
create policy customers_insert on public.customers for insert to authenticated with check (public.is_member(business_id));
create policy customers_update on public.customers for update to authenticated
  using (public.is_member(business_id)) with check (public.is_member(business_id));
create policy customers_delete on public.customers for delete to authenticated
  using (public.has_role(business_id, array['owner','admin']));

-- Data transaksi: hanya SELECT (penulisan lewat RPC)
create policy sales_select on public.sales for select to authenticated using (public.is_member(business_id));
create policy sale_items_select on public.sale_items for select to authenticated using (public.is_member(business_id));
create policy purchases_select on public.purchases for select to authenticated using (public.is_member(business_id));
create policy purchase_items_select on public.purchase_items for select to authenticated using (public.is_member(business_id));
create policy expenses_select on public.expenses for select to authenticated using (public.is_member(business_id));
create policy stock_movements_select on public.stock_movements for select to authenticated using (public.is_member(business_id));
create policy cash_transactions_select on public.cash_transactions for select to authenticated using (public.is_member(business_id));
