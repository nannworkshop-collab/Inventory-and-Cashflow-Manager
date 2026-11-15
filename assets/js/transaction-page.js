// assets/js/transaction-page.js — Logika satu halaman transaksi (Penjualan atau Pembelian), diatur lewat konfigurasi.
// Dipakai oleh: sales.js, purchasing.js. Bergantung pada: shell.js, transaction-form.js, utils.js, fungsi RPC di 002_functions.sql.
// Alur simpan: validasi form -> supabase.rpc(createRpc) -> database memproses stok + kas dalam satu transaksi -> muat ulang data.
import { initShell } from './shell.js';
import { supabase } from './supabaseClient.js';
import { createItemEditor, setupPartyDialog } from './transaction-form.js';
import { $, formatRupiah, formatTanggal, escapeHtml, showMessage, hideMessage, showToast, setLoading, friendlyError, todayISO } from './utils.js';

export async function initTransactionPage(cfg) {
  const ctx = await initShell();
  if (!ctx) return;
  const businessId = ctx.business.id;
  const canCancel = ['owner', 'admin'].includes(ctx.business.role);
  const message = $('#page-message');
  const form = $('#tx-form');
  const partySelect = $('#party');
  const partyDialog = $('#party-dialog');
  const editor = createItemEditor({
    tbody: $('#items-body'), totalEl: $('#tx-total'),
    priceField: cfg.priceField, defaultPriceKey: cfg.defaultPriceKey, limitByStock: cfg.limitByStock,
  });

  async function loadProducts() {
    let query = supabase.from('products').select('id,sku,name,sell_price,buy_price,stock_qty')
      .eq('business_id', businessId).eq('is_active', true).order('name');
    if (cfg.limitByStock) query = query.gt('stock_qty', 0);
    const { data, error } = await query;
    if (error) throw error;
    editor.setProducts(data);
    $('#form-empty').hidden = data.length > 0;
    $('#form-wrap').hidden = data.length === 0;
  }

  async function loadParties(selectId) {
    const { data, error } = await supabase.from(cfg.partyTable).select('id,name').eq('business_id', businessId).order('name');
    if (error) throw error;
    partySelect.innerHTML = `<option value="">${escapeHtml(cfg.partyNone)}</option>` +
      data.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
    if (selectId) partySelect.value = selectId;
  }

  async function loadHistory() {
    const { data, error } = await supabase.from(cfg.table)
      .select(`id,${cfg.noField},${cfg.dateField},total,status,${cfg.partyTable}(name)`)
      .eq('business_id', businessId)
      .order(cfg.dateField, { ascending: false }).order('created_at', { ascending: false }).limit(50);
    if (error) throw error;
    $('#history-state').hidden = data.length > 0;
    $('#history-wrap').hidden = data.length === 0;
    $('#history-body').innerHTML = data.map((row) => {
      const done = row.status === 'completed';
      const badge = done ? '<span class="badge badge--success">Selesai</span>' : '<span class="badge badge--danger">Dibatalkan</span>';
      const action = done && canCancel
        ? `<button class="btn btn--secondary btn--sm" type="button" data-id="${row.id}" data-no="${escapeHtml(row[cfg.noField])}">Batalkan</button>` : '';
      return `<tr><td>${escapeHtml(row[cfg.noField])}</td><td>${formatTanggal(row[cfg.dateField])}</td>` +
        `<td>${escapeHtml(row[cfg.partyTable]?.name || cfg.partyNone)}</td><td class="text-right">${formatRupiah(row.total)}</td>` +
        `<td>${badge}</td><td>${action}</td></tr>`;
    }).join('');
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    hideMessage(message);
    if (!form.reportValidity()) return;
    const problem = editor.validate();
    if (problem) { showMessage(message, problem); return; }
    const button = $('#tx-submit');
    setLoading(button, true, 'Menyimpan...');
    try {
      const { error } = await supabase.rpc(cfg.createRpc, {
        p_business_id: businessId,
        [cfg.partyParam]: partySelect.value || null,
        [cfg.dateParam]: $('#tx-date').value,
        p_notes: $('#tx-notes').value.trim() || null,
        p_items: editor.getItems(),
      });
      if (error) throw error;
      showToast(cfg.savedText);
      form.reset();
      $('#tx-date').value = todayISO();
      editor.reset();
      await Promise.all([loadProducts(), loadHistory()]);
    } catch (error) {
      showMessage(message, friendlyError(error));
    } finally {
      setLoading(button, false);
    }
  });

  $('#history-body').addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-id]');
    if (!button) return;
    if (!window.confirm(`Batalkan ${button.dataset.no}? Stok dan kas akan dibalik otomatis.`)) return;
    hideMessage(message);
    button.disabled = true;
    try {
      const { error } = await supabase.rpc(cfg.cancelRpc, { [cfg.cancelParam]: button.dataset.id });
      if (error) throw error;
      showToast(cfg.canceledText);
      await Promise.all([loadProducts(), loadHistory()]);
    } catch (error) {
      button.disabled = false;
      showMessage(message, friendlyError(error));
    }
  });

  $('#add-row').addEventListener('click', () => editor.addRow());
  $('#add-party').addEventListener('click', () => partyDialog.showModal());
  document.querySelectorAll('[data-close]').forEach((btn) => btn.addEventListener('click', () => btn.closest('dialog').close()));
  setupPartyDialog({
    dialog: partyDialog, form: $('#party-form'), message: $('#party-message'),
    table: cfg.partyTable, businessId,
    onCreated: (party) => loadParties(party.id).catch((error) => showMessage(message, friendlyError(error))),
  });

  $('#tx-date').value = todayISO();
  try {
    await Promise.all([loadProducts(), loadParties(), loadHistory()]);
    editor.reset();
  } catch (error) {
    showMessage(message, `Gagal memuat data: ${friendlyError(error)}`);
  }
}
