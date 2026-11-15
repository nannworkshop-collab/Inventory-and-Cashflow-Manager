// assets/js/utils.js — Fungsi bantu umum (tanpa akses ke Supabase).
export const $ = (selector, root = document) => root.querySelector(selector);

const rupiah = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
export const formatRupiah = (n) => rupiah.format(Number(n) || 0);

// '2026-11-14' -> '14 Nov 2026' (dibuat dari bagian angka agar tidak bergeser zona waktu)
export function formatTanggal(iso) {
  if (!iso) return '-';
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Wajib dipakai sebelum memasukkan teks pengguna ke innerHTML (cegah XSS).
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function showMessage(el, text, type = 'error') {
  el.textContent = text;
  el.className = `alert alert--${type}`;
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  el.hidden = false;
}
export function hideMessage(el) { el.hidden = true; el.textContent = ''; }

export function setLoading(button, isLoading, loadingText = 'Memproses...') {
  if (isLoading) { button.dataset.label = button.dataset.label || button.textContent; button.textContent = loadingText; }
  else if (button.dataset.label) { button.textContent = button.dataset.label; }
  button.disabled = isLoading;
  button.setAttribute('aria-busy', String(isLoading));
}

const ERROR_MAP = [
  ['invalid login credentials', 'Email atau password salah.'],
  ['email not confirmed', 'Email belum dikonfirmasi. Cek kotak masuk emailmu.'],
  ['user already registered', 'Email ini sudah terdaftar. Silakan masuk.'],
  ['password should be at least', 'Password terlalu pendek.'],
  ['rate limit', 'Terlalu banyak percobaan. Coba lagi beberapa menit lagi.'],
  ['failed to fetch', 'Tidak bisa terhubung ke server. Periksa koneksi internetmu.'],
  ['duplicate key', 'Data dengan nilai yang sama sudah ada (misalnya SKU ganda).'],
  ['row-level security', 'Kamu tidak punya izin untuk tindakan ini.'],
];
// Pesan dari fungsi database (create_sale dll.) sudah berbahasa Indonesia -> diteruskan apa adanya.
export function friendlyError(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  const hit = ERROR_MAP.find(([key]) => msg.includes(key));
  return hit ? hit[1] : (error?.message || 'Terjadi kesalahan. Coba lagi.');
}

export function showToast(text, type = 'success') {
  let region = $('.toast-region');
  if (!region) {
    region = document.createElement('div');
    region.className = 'toast-region';
    region.setAttribute('aria-live', 'polite');
    document.body.append(region);
  }
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.textContent = text;
  region.append(toast);
  setTimeout(() => toast.remove(), 4000);
}

// '2026-11-14T06:45:00Z' -> '14 Nov 2026, 13.45' (zona waktu perangkat)
export const formatWaktu = (iso) =>
  iso ? new Date(iso).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '-';

// Awal & akhir bulan (format 'YYYY-MM-DD') untuk tanggal tertentu.
export function monthRange(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  const y = date.getFullYear();
  const m = date.getMonth();
  return { from: `${y}-${p(m + 1)}-01`, to: `${y}-${p(m + 1)}-${p(new Date(y, m + 1, 0).getDate())}` };
}

// Pengeluaran bersih satu baris kas: pengeluaran asli = +jumlah, pembatalan pemasukan = -jumlah, selain itu null.
// Rumus yang sama dengan get_cash_summary di 004_reporting.sql, sehingga laporan = dashboard.
export function signedExpense(row) {
  const amount = Number(row.amount);
  if (row.direction === 'out' && !row.reversal_of) return amount;
  if (row.direction === 'in' && row.reversal_of) return -amount;
  return null;
}
