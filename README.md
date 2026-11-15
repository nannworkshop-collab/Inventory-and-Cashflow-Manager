# Inventory & Cashflow Manager

Aplikasi inventori dan arus kas untuk UMKM. Multi-bisnis (setiap bisnis hanya melihat datanya sendiri), dibangun dengan HTML5, CSS3, dan JavaScript murni di atas Supabase (PostgreSQL + Auth). Tanpa framework frontend dan tanpa proses build.

## Fitur
Autentikasi · Dashboard · Inventori (stok, riwayat pergerakan) · Penjualan · Pembelian · Pengeluaran · Arus Kas (filter tanggal/kategori) · Laporan (penjualan, pengeluaran, stok, arus kas + Export CSV) · Pengaturan profil & bisnis.

## Struktur proyek
```
index.html  login.html  register.html  inventory.html  sales.html  purchasing.html
expenses.html  cashflow.html  reports.html  settings.html
vercel.json  .gitignore  README.md
assets/css/   global.css  layout.css  components.css
assets/js/    config.js  supabaseClient.js  auth.js  utils.js  shell.js  chart.js  csv.js
              transaction-form.js  transaction-page.js  login.js  register.js  dashboard.js
              inventory.js  sales.js  purchasing.js  expenses.js  cashflow.js  reports.js  settings.js
assets/img/   .gitkeep
supabase/migrations/   001_schema.sql  002_functions.sql  003_rls.sql  004_reporting.sql
docs/         01-arsitektur.md  02-database-dan-keamanan.md  03-konfigurasi-dan-autentikasi.md  04-skenario-pengujian.md  05-deployment.md
```

## Mulai cepat
1. Buat project Supabase, lalu jalankan **berurutan** di SQL Editor: `001` → `002` → `003` → `004`.
2. Isi `assets/js/config.js` (Project URL + anon/publishable key). Jangan pernah memakai kunci `service_role`.
3. Jalankan lewat server lokal (ES Modules tidak jalan jika file dibuka langsung): Live Server di VS Code, atau `npx serve .`
4. Buka `register.html`, daftar, lalu ikuti skenario di `docs/04-skenario-pengujian.md`.
5. Deploy: lihat `docs/05-deployment.md`.

## Prinsip desain
- **Stok, penjualan, dan kas konsisten:** semua perubahan lewat fungsi database (RPC) dalam satu transaksi. Tabel transaksi dan kolom `stock_qty` tidak bisa ditulis langsung dari browser.
- **Tidak ada hapus transaksi:** pembatalan = status `cancelled` + stok dikembalikan + kas dibalik lewat baris baru.
- **Satu sumber angka:** Dashboard, Arus Kas, dan Laporan memakai fungsi SQL yang sama (`004_reporting.sql`).
- **Isolasi data:** RLS di semua tabel; fungsi akses (`is_member`, `has_role`) dipakai policy.

## Batasan yang perlu diketahui
- Belum ada layar untuk mengundang anggota atau mengatur peran. Tabel dan RLS sudah siap. Sementara itu tambahkan anggota lewat SQL ke `business_members`.
- Belum ada layar ganti password atau "lupa password".
- Satu pengguna memakai bisnis pertamanya (belum ada pemilih bisnis).
- Customisasi per pelanggan baru berupa pemisahan data per bisnis dan nama bisnis. Logo, tema, atau mata uang belum ada (bisa ditambah, misalnya kolom `settings jsonb` di `businesses`).
- Stok berupa bilangan bulat, mata uang Rupiah, transaksi tidak bisa diedit (hanya dibatalkan), belum ada retur sebagian dan halaman detail isi transaksi.
- Semua SQL dan alur ke Supabase **belum pernah dijalankan oleh penulis kode ini di database asli**. Uji dengan `docs/04-skenario-pengujian.md` sebelum dipakai untuk data nyata.
