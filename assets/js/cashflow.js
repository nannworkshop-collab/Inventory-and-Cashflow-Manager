// assets/js/cashflow.js — Mengatur cashflow.html: riwayat kas dengan filter tanggal, kategori, dan arah.
// Ringkasan memakai get_cash_summary (004_reporting.sql) -> angka sama dengan Dashboard & Laporan.
// Tabel kas hanya dibaca di sini; pencatatan terjadi otomatis lewat Penjualan, Pembelian, dan Pengeluaran.
import { initShell } from './shell.js';
import { supabase } from './supabaseClient.js';
import { $, formatRupiah, formatTanggal, escapeHtml, showMessage, hideMessage, setLoading, friendlyError, monthRange } from './utils.js';

const PAGE_LIMIT = 200;
let ctx = null;

async function rpc(name, args) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data[0];
}

async function loadCategories() {
  const { data, error } = await supabase.from('cash_transactions').select('category').eq('business_id', ctx.business.id).limit(1000);
  if (error) throw error;
  const select = $('#f-category');
  const current = select.value;
  const names = [...new Set(data.map((r) => r.category))].sort((a, b) => a.localeCompare(b, 'id'));
  select.innerHTML = '<option value="">Semua kategori</option>' + names.map((n) => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('');
  select.value = names.includes(current) ? current : '';
}

async function load() {
  const from = $('#f-from').value || null;
  const to = $('#f-to').value || null;
  if (from && to && from > to) throw new Error('Tanggal awal tidak boleh setelah tanggal akhir.');
  const category = $('#f-category').value;
  const direction = $('#f-direction').value;
  let query = supabase.from('cash_transactions')
    .select('id,trx_date,direction,category,amount,description,reversal_of', { count: 'exact' })
    .eq('business_id', ctx.business.id);
  if (from) query = query.gte('trx_date', from);
  if (to) query = query.lte('trx_date', to);
  if (category) query = query.eq('category', category);
  if (direction) query = query.eq('direction', direction);
  query = query.order('trx_date', { ascending: false }).order('created_at', { ascending: false }).limit(PAGE_LIMIT);

  const [period, allTime, rows] = await Promise.all([
    rpc('get_cash_summary', { p_business_id: ctx.business.id, p_from: from, p_to: to }),
    rpc('get_cash_summary', { p_business_id: ctx.business.id, p_from: null, p_to: null }),
    query,
  ]);
  if (rows.error) throw rows.error;

  $('#stat-in').textContent = formatRupiah(period.pemasukan);
  $('#stat-out').textContent = formatRupiah(period.pengeluaran);
  $('#stat-period').textContent = formatRupiah(period.saldo);
  $('#stat-balance').textContent = formatRupiah(allTime.saldo);
  $('#list-state').hidden = rows.data.length > 0;
  $('#table-wrap').hidden = rows.data.length === 0;
  $('#limit-note').hidden = (rows.count ?? 0) <= PAGE_LIMIT;
  $('#limit-note').textContent = `Menampilkan ${PAGE_LIMIT} dari ${rows.count} transaksi terbaru. Persempit filter untuk melihat yang lain.`;
  $('#cash-body').innerHTML = rows.data.map((t) => {
    const isIn = t.direction === 'in';
    const tag = t.reversal_of ? ' <span class="badge badge--danger">Pembatalan</span>' : '';
    return `<tr><td>${formatTanggal(t.trx_date)}</td><td>${escapeHtml(t.category)}</td><td>${escapeHtml(t.description || '')}${tag}</td>` +
      `<td class="text-right text-income">${isIn ? formatRupiah(t.amount) : ''}</td>` +
      `<td class="text-right text-expense">${isIn ? '' : formatRupiah(t.amount)}</td></tr>`;
  }).join('');
}

async function apply() {
  const message = $('#page-message');
  const button = $('#apply-btn');
  hideMessage(message);
  setLoading(button, true, 'Memuat...');
  try { await load(); } catch (error) { showMessage(message, friendlyError(error)); } finally { setLoading(button, false); }
}

function resetFilters() {
  const range = monthRange();
  $('#f-from').value = range.from;
  $('#f-to').value = range.to;
  $('#f-category').value = '';
  $('#f-direction').value = '';
}

$('#filter-form').addEventListener('submit', (event) => { event.preventDefault(); if (ctx) apply(); });
$('#reset-btn').addEventListener('click', () => { resetFilters(); if (ctx) apply(); });

(async function init() {
  ctx = await initShell();
  if (!ctx) return;
  resetFilters();
  try { await loadCategories(); } catch (error) { showMessage($('#page-message'), friendlyError(error)); }
  await apply();
})();
