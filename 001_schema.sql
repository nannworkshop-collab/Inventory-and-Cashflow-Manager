-- 001_schema.sql
-- Tabel inti Inventory & Cashflow Manager (PostgreSQL / Supabase).
-- Jalankan di Supabase: SQL Editor, atau `supabase db push`.
-- Aturan utama: setiap data milik bisnis punya business_id (multi-tenant).
-- RLS & fungsi RPC ada di 002_functions.sql dan 003_rls.sql.

-- 1. Bisnis, profil, anggota ------------------------------------------------
create table public.businesses (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) > 0),
  owner_id    uuid not null references auth.users(id),
  created_at  timestamptz not null default now()
);

create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  phone       text,
  created_at  timestamptz not null default now()
);

create table public.business_members (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null default 'staff' check (role in ('owner','admin','staff')),
  created_at  timestamptz not null default now(),
  unique (business_id, user_id)
);
create index on public.business_members (user_id);

-- 2. Master data -------------------------------------------------------------
create table public.products (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  sku         text not null check (length(trim(sku)) > 0),
  name        text not null check (length(trim(name)) > 0),
  unit        text not null default 'pcs',
  buy_price   numeric(14,2) not null default 0 check (buy_price >= 0),
  sell_price  numeric(14,2) not null default 0 check (sell_price >= 0),
  stock_qty   integer not null default 0 check (stock_qty >= 0),
  min_stock   integer not null default 0 check (min_stock >= 0),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (business_id, sku)
);
create index on public.products (business_id, name);

create table public.suppliers (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name        text not null check (length(trim(name)) > 0),
  phone       text,
  address     text,
  created_at  timestamptz not null default now()
);
create index on public.suppliers (business_id);

create table public.customers (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name        text not null check (length(trim(name)) > 0),
  phone       text,
  address     text,
  created_at  timestamptz not null default now()
);
create index on public.customers (business_id);

-- 3. Penjualan ---------------------------------------------------------------
create table public.sales (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses(id) on delete cascade,
  customer_id  uuid references public.customers(id) on delete set null,
  invoice_no   text not null,
  sale_date    date not null default current_date,
  total        numeric(14,2) not null check (total >= 0),
  status       text not null default 'completed' check (status in ('completed','cancelled')),
  notes        text,
  created_by   uuid references auth.users(id),
  created_at   timestamptz not null default now(),
  cancelled_at timestamptz,
  unique (business_id, invoice_no),
  check ((status = 'cancelled') = (cancelled_at is not null))
);
create index on public.sales (business_id, sale_date desc);

create table public.sale_items (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  sale_id     uuid not null references public.sales(id) on delete cascade,
  product_id  uuid not null references public.products(id),
  qty         integer not null check (qty > 0),
  unit_price  numeric(14,2) not null check (unit_price >= 0),
  subtotal    numeric(14,2) not null check (subtotal >= 0),
  check (subtotal = qty * unit_price)
);
create index on public.sale_items (sale_id);
create index on public.sale_items (business_id, product_id);

-- 4. Pembelian ---------------------------------------------------------------
create table public.purchases (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references public.businesses(id) on delete cascade,
  supplier_id   uuid references public.suppliers(id) on delete set null,
  purchase_no   text not null,
  purchase_date date not null default current_date,
  total         numeric(14,2) not null check (total >= 0),
  status        text not null default 'completed' check (status in ('completed','cancelled')),
  notes         text,
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  cancelled_at  timestamptz,
  unique (business_id, purchase_no),
  check ((status = 'cancelled') = (cancelled_at is not null))
);
create index on public.purchases (business_id, purchase_date desc);

create table public.purchase_items (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  purchase_id uuid not null references public.purchases(id) on delete cascade,
  product_id  uuid not null references public.products(id),
  qty         integer not null check (qty > 0),
  unit_cost   numeric(14,2) not null check (unit_cost >= 0),
  subtotal    numeric(14,2) not null check (subtotal >= 0),
  check (subtotal = qty * unit_cost)
);
create index on public.purchase_items (purchase_id);
create index on public.purchase_items (business_id, product_id);

-- 5. Pengeluaran operasional -------------------------------------------------
create table public.expenses (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses(id) on delete cascade,
  category     text not null check (length(trim(category)) > 0),
  description  text,
  amount       numeric(14,2) not null check (amount > 0),
  expense_date date not null default current_date,
  status       text not null default 'completed' check (status in ('completed','cancelled')),
  created_by   uuid references auth.users(id),
  created_at   timestamptz not null default now(),
  cancelled_at timestamptz,
  check ((status = 'cancelled') = (cancelled_at is not null))
);
create index on public.expenses (business_id, expense_date desc);

-- 6. Pergerakan stok & kas (buku besar) --------------------------------------
-- qty_change: positif = stok masuk, negatif = stok keluar.
create table public.stock_movements (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null references public.businesses(id) on delete cascade,
  product_id     uuid not null references public.products(id),
  movement_type  text not null check (movement_type in ('sale','purchase','adjustment','reversal')),
  qty_change     integer not null check (qty_change <> 0),
  reference_type text check (reference_type in ('sale','purchase','manual')),
  reference_id   uuid,
  note           text,
  created_by     uuid references auth.users(id),
  created_at     timestamptz not null default now()
);
create index on public.stock_movements (business_id, product_id, created_at desc);

-- direction: 'in' = pemasukan, 'out' = pengeluaran.
-- Saldo kas = SUM(in) - SUM(out) dari tabel ini SAJA (satu sumber kebenaran).
-- Pembatalan = baris baru dengan arah berlawanan (reversal_of), bukan DELETE.
create table public.cash_transactions (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null references public.businesses(id) on delete cascade,
  direction      text not null check (direction in ('in','out')),
  category       text not null check (length(trim(category)) > 0),
  amount         numeric(14,2) not null check (amount > 0),
  trx_date       date not null default current_date,
  description    text,
  reference_type text check (reference_type in ('sale','purchase','expense','manual')),
  reference_id   uuid,
  reversal_of    uuid references public.cash_transactions(id),
  created_by     uuid references auth.users(id),
  created_at     timestamptz not null default now()
);
create index on public.cash_transactions (business_id, trx_date desc);
create index on public.cash_transactions (business_id, category);
create index on public.cash_transactions (reference_type, reference_id);

-- 7. Keamanan: aktifkan RLS di SEMUA tabel sejak awal ---------------------------
-- Supabase memberi akses default ke role anon/authenticated. Tanpa RLS, siapa pun
-- yang memegang anon key bisa membaca tabel. RLS aktif + belum ada policy = semua
-- akses ditolak. Policy yang membuka akses per bisnis dibuat di 003_rls.sql.
alter table public.businesses        enable row level security;
alter table public.profiles          enable row level security;
alter table public.business_members  enable row level security;
alter table public.products          enable row level security;
alter table public.suppliers         enable row level security;
alter table public.customers         enable row level security;
alter table public.sales             enable row level security;
alter table public.sale_items        enable row level security;
alter table public.purchases         enable row level security;
alter table public.purchase_items    enable row level security;
alter table public.expenses          enable row level security;
alter table public.stock_movements   enable row level security;
alter table public.cash_transactions enable row level security;
