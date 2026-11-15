// assets/js/expenses.js — Mengatur expenses.html: catat pengeluaran operasional dan batalkan jika salah.
// Bergantung pada: shell.js, supabaseClient.js, utils.js. RPC: create_expense, cancel_expense (002_functions.sql).
// Setiap pengeluaran otomatis tercatat di cash_transactions oleh database.
import { initShell } from './shell.js';
import { supabase } from './supabaseClient.js';
import { $, formatRupiah, formatTanggal, escapeHtml, showMessage, hideMessage, showToast, setLoading, friendlyError, todayISO } from './utils.js';

let ctx = null;
const form = $('#expense-form');
const message = $('#page-message');

async function loadHistory() {
  const { data, error } = await supabase.from('expenses')
    .select('id,expense_date,category,description,amount,status')
    .eq('business_id', ctx.business.id)
    .order('expense_date', { ascending: false }).order('created_at', { ascending: false }).limit(50);
  if (error) throw error;
  const canCancel = ['owner', 'admin'].includes(ctx.business.role);
  $('#history-state').hidden = data.length > 0;
  $('#history-wrap').hidden = data.length === 0;
  $('#history-body').innerHTML = data.map((e) => {
    const done = e.status === 'completed';
    const badge = done ? '<span class="badge badge--success">Selesai</span>' : '<span class="badge badge--danger">Dibatalkan</span>';
    const action = done && canCancel ? `<button class="btn btn--secondary btn--sm" type="button" data-id="${e.id}">Batalkan</button>` : '';
    return `<tr><td>${formatTanggal(e.expense_date)}</td><td>${escapeHtml(e.category)}</td><td>${escapeHtml(e.description || '')}</td>` +
      `<td class="text-right">${formatRupiah(e.amount)}</td><td>${badge}</td><td>${action}</td></tr>`;
  }).join('');
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  hideMessage(message);
  if (!ctx || !form.reportValidity()) return;
  const category = $('#category').value.trim();
  const amount = parseFloat($('#amount').value);
  if (!category) { showMessage(message, 'Kategori wajib diisi.'); return; }
  if (!Number.isFinite(amount) || amount <= 0) { showMessage(message, 'Jumlah harus lebih dari 0.'); return; }
  const button = $('#expense-submit');
  setLoading(button, true, 'Menyimpan...');
  try {
    const { error } = await supabase.rpc('create_expense', {
      p_business_id: ctx.business.id, p_category: category, p_description: $('#description').value.trim() || null,
      p_amount: amount, p_expense_date: $('#expense-date').value,
    });
    if (error) throw error;
    showToast('Pengeluaran tersimpan.');
    form.reset();
    $('#expense-date').value = todayISO();
    await loadHistory();
  } catch (error) {
    showMessage(message, friendlyError(error));
  } finally {
    setLoading(button, false);
  }
});

$('#history-body').addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-id]');
  if (!button || !window.confirm('Batalkan pengeluaran ini? Kas akan dikembalikan otomatis.')) return;
  hideMessage(message);
  button.disabled = true;
  try {
    const { error } = await supabase.rpc('cancel_expense', { p_expense_id: button.dataset.id });
    if (error) throw error;
    showToast('Pengeluaran dibatalkan.');
    await loadHistory();
  } catch (error) {
    button.disabled = false;
    showMessage(message, friendlyError(error));
  }
});

(async function init() {
  ctx = await initShell();
  if (!ctx) return;
  $('#expense-date').value = todayISO();
  try { await loadHistory(); } catch (error) { showMessage(message, `Gagal memuat data: ${friendlyError(error)}`); }
})();
