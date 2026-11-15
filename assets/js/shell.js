// assets/js/shell.js — Kerangka semua halaman aplikasi: cek login, sidebar, nama bisnis, tombol keluar, menu HP.
// Dipakai oleh: dashboard.js, inventory.js (dan halaman modul lain). Bergantung pada: auth.js, utils.js.
import { requireBusiness, signOut } from './auth.js';
import { escapeHtml } from './utils.js';

const MENU = [
  ['index', 'Dashboard'], ['inventory', 'Inventori'], ['sales', 'Penjualan'], ['purchasing', 'Pembelian'],
  ['expenses', 'Pengeluaran'], ['cashflow', 'Arus Kas'], ['reports', 'Laporan'], ['settings', 'Pengaturan'],
];
const ROLE_LABEL = { owner: 'Pemilik', admin: 'Admin', staff: 'Staf' };

// Mengembalikan { session, business } atau null (jika belum login -> sudah di-redirect).
export async function initShell() {
  const ctx = await requireBusiness();
  if (!ctx) return null;
  const page = (location.pathname.split('/').pop() || 'index').replace(/\.html$/, '');
  const links = MENU.map(([key, label]) =>
    `<a class="sidebar__link" href="${key}.html"${key === page ? ' aria-current="page"' : ''}>${label}</a>`).join('');
  const sidebar = document.getElementById('sidebar');
  sidebar.innerHTML = `
    <div class="sidebar__brand">Inventory &amp; Cashflow</div>
    <nav class="sidebar__nav" aria-label="Menu utama">${links}</nav>
    <div class="sidebar__profile">
      <p>${escapeHtml(ctx.session.user.email)}<br>${ROLE_LABEL[ctx.business.role] || ''}</p>
      <button class="btn btn--secondary btn--sm btn--block" id="logout-btn" type="button">Keluar</button>
    </div>`;
  document.getElementById('business-name').textContent = ctx.business.name;
  document.getElementById('logout-btn').addEventListener('click', signOut);

  const backdrop = document.getElementById('sidebar-backdrop');
  const toggle = document.getElementById('menu-toggle');
  const setOpen = (open) => {
    sidebar.classList.toggle('is-open', open);
    backdrop.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
  };
  toggle.addEventListener('click', () => setOpen(!sidebar.classList.contains('is-open')));
  backdrop.addEventListener('click', () => setOpen(false));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setOpen(false); });
  return ctx;
}
