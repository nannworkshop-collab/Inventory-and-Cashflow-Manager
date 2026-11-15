-- 004_reporting.sql
-- SATU sumber hitungan untuk Dashboard, Arus Kas, dan Laporan (agar angkanya selalu sama).
-- Tanpa "security definer": berjalan dengan hak user pemanggil, jadi RLS tetap berlaku.
--
-- Rumus kas bersih (pembatalan = baris dengan reversal_of terisi):
--   pemasukan   = masuk(asli) - keluar(pembatalan)
--   pengeluaran = keluar(asli) - masuk(pembatalan)
--   saldo       = pemasukan - pengeluaran  (selalu = total masuk - total keluar)

create or replace function public.get_cash_summary(
  p_business_id uuid, p_from date default null, p_to date default null)
returns table (pemasukan numeric, pengeluaran numeric, saldo numeric)
language sql stable set search_path = '' as $$
  with t as (
    select
      coalesce(sum(case when c.direction = 'in'  and c.reversal_of is null     then c.amount
                        when c.direction = 'out' and c.reversal_of is not null then -c.amount
                        else 0 end), 0) as pem,
      coalesce(sum(case when c.direction = 'out' and c.reversal_of is null     then c.amount
                        when c.direction = 'in'  and c.reversal_of is not null then -c.amount
                        else 0 end), 0) as peng
    from public.cash_transactions c
    where c.business_id = p_business_id
      and (p_from is null or c.trx_date >= p_from)
      and (p_to   is null or c.trx_date <= p_to)
  )
  select pem, peng, pem - peng from t;
$$;

-- Satu baris per hari (termasuk hari tanpa transaksi) untuk grafik.
create or replace function public.get_cash_by_day(p_business_id uuid, p_from date, p_to date)
returns table (day date, pemasukan numeric, pengeluaran numeric)
language sql stable set search_path = '' as $$
  select (p_from + g)::date,
    coalesce(sum(c.amount) filter (where c.direction = 'in'  and c.reversal_of is null), 0)
      - coalesce(sum(c.amount) filter (where c.direction = 'out' and c.reversal_of is not null), 0),
    coalesce(sum(c.amount) filter (where c.direction = 'out' and c.reversal_of is null), 0)
      - coalesce(sum(c.amount) filter (where c.direction = 'in'  and c.reversal_of is not null), 0)
  from generate_series(0, p_to - p_from) g
  left join public.cash_transactions c
    on c.business_id = p_business_id and c.trx_date = p_from + g
  group by g
  order by g;
$$;

-- Total penjualan yang selesai (tidak termasuk yang dibatalkan).
create or replace function public.get_sales_summary(
  p_business_id uuid, p_from date default null, p_to date default null)
returns table (total_penjualan numeric, jumlah_transaksi bigint)
language sql stable set search_path = '' as $$
  select coalesce(sum(s.total), 0), count(*)
  from public.sales s
  where s.business_id = p_business_id and s.status = 'completed'
    and (p_from is null or s.sale_date >= p_from)
    and (p_to   is null or s.sale_date <= p_to);
$$;

-- Produk dengan stok menipis (stok <= minimum). Sudah terfilter RLS lewat security_invoker.
create or replace view public.low_stock_products with (security_invoker = true) as
  select id, business_id, sku, name, unit, stock_qty, min_stock
  from public.products
  where is_active and stock_qty <= min_stock;

revoke all on public.low_stock_products from anon;
grant select on public.low_stock_products to authenticated;
revoke execute on function
  public.get_cash_summary(uuid, date, date), public.get_cash_by_day(uuid, date, date),
  public.get_sales_summary(uuid, date, date) from public, anon;
grant execute on function
  public.get_cash_summary(uuid, date, date), public.get_cash_by_day(uuid, date, date),
  public.get_sales_summary(uuid, date, date) to authenticated;
