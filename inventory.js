// assets/js/inventory.js — Mengatur inventory.html: daftar produk, tambah/ubah, penyesuaian stok, riwayat stok.
// Bergantung pada: shell.js, supabaseClient.js, utils.js. Fungsi database: adjust_stock (002_functions.sql).
// Aturan: stok TIDAK diubah langsung lewat tabel products; selalu lewat adjust_stock agar tercatat di stock_movements.
import { initShell } from './shell.js';
import { supabase } from './supabaseClient.js';
import { $, formatRupiah, formatWaktu, escapeHtml, showMessage, hideMessage, showToast, setLoading, friendlyError } from './utils.js';

const MOVEMENT_LABEL = { sale: 'Penjualan', purchase: 'Pembelian', adjustment: 'Penyesuaian', reversal: 'Pembatalan' };
let ctx = null;
let products = [];
let editingId = null;
let adjustingId = null;

const canAdjust = () => ['owner', 'admin'].includes(ctx.business.role);
const productDialog = $('#product-dialog');
const adjustDialog = $('#adjust-dialog');
const historyDialog = $('#history-dialog');

async function loadProducts() {
  const { data, error } = await supabase.from('products')
    .select('id,sku,name,unit,buy_price,sell_price,stock_qty,min_stock,is_active')
    .eq('business_id', ctx.business.id).order('name');
  if (error) throw error;
  products = data;
  renderTable();
}

function renderTable() {
  const term = $('#search').value.trim().toLowerCase();
  const rows = products.filter((p) => !term || p.name.toLowerCase().includes(term) || p.sku.toLowerCase().includes(term));
  const state = $('#list-state');
  state.hidden = rows.length > 0;
  state.className = 'empty-state';
  state.textContent = products.length === 0 ? 'Belum ada produk. Klik "Tambah produk" untuk memulai.' : 'Tidak ada produk yang cocok.';
  $('#table-wrap').hidden = rows.length === 0;
  $('#product-body').innerHTML = rows.map((p) => {
    const badge = !p.is_active ? '<span class="badge badge--danger">Nonaktif</span>'
      : p.stock_qty <= p.min_stock ? '<span class="badge badge--warning">Stok menipis</span>'
      : '<span class="badge badge--success">Aman</span>';
    const stockBtn = canAdjust() ? `<button class="btn btn--secondary btn--sm" type="button" data-action="adjust" data-id="${p.id}">Stok</button>` : '';
    return `<tr><td>${escapeHtml(p.sku)}</td><td>${escapeHtml(p.name)}</td>` +
      `<td class="text-right">${formatRupiah(p.buy_price)}</td><td class="text-right">${formatRupiah(p.sell_price)}</td>` +
      `<td class="text-right">${p.stock_qty} ${escapeHtml(p.unit)}</td><td class="text-right">${p.min_stock}</td><td>${badge}</td>` +
      `<td><button class="btn btn--secondary btn--sm" type="button" data-action="edit" data-id="${p.id}">Ubah</button> ` +
      `${stockBtn} <button class="btn btn--secondary btn--sm" type="button" data-action="history" data-id="${p.id}">Riwayat</button></td></tr>`;
  }).join('');
}

function openProduct(product) {
  editingId = product ? product.id : null;
  const f = $('#product-form').elements;
  hideMessage($('#product-message'));
  $('#product-dialog-title').textContent = product ? 'Ubah produk' : 'Tambah produk';
  f.sku.value = product?.sku ?? '';
  f.name.value = product?.name ?? '';
  f.unit.value = product?.unit ?? 'pcs';
  f.buy_price.value = product?.buy_price ?? 0;
  f.sell_price.value = product?.sell_price ?? 0;
  f.min_stock.value = product?.min_stock ?? 0;
  f.is_active.checked = product ? product.is_active : true;
  f.initial_stock.value = 0;
  $('#active-group').hidden = !product;
  $('#initial-stock-group').hidden = Boolean(product) || !canAdjust();
  productDialog.showModal();
}

async function adjust(productId, qtyChange, note) {
  const { error } = await supabase.rpc('adjust_stock', {
    p_business_id: ctx.business.id, p_product_id: productId, p_qty_change: qtyChange, p_note: note,
  });
  if (error) throw error;
}

async function openHistory(product) {
  $('#history-title').textContent = `Riwayat stok: ${product.name}`;
  const body = $('#history-body');
  const state = $('#history-state');
  body.innerHTML = '';
  state.hidden = false;
  state.className = 'loading-state';
  state.textContent = 'Memuat...';
  historyDialog.showModal();
  const { data, error } = await supabase.from('stock_movements')
    .select('created_at,movement_type,qty_change,note')
    .eq('business_id', ctx.business.id).eq('product_id', product.id)
    .order('created_at', { ascending: false }).limit(50);
  if (error) { state.className = 'alert alert--error'; state.textContent = friendlyError(error); return; }
  state.hidden = data.length > 0;
  state.className = 'empty-state';
  state.textContent = 'Belum ada pergerakan stok.';
  body.innerHTML = data.map((m) =>
    `<tr><td>${formatWaktu(m.created_at)}</td><td>${MOVEMENT_LABEL[m.movement_type] || escapeHtml(m.movement_type)}</td>` +
    `<td class="text-right ${m.qty_change > 0 ? 'text-income' : 'text-expense'}">${m.qty_change > 0 ? '+' : ''}${m.qty_change}</td>` +
    `<td>${escapeHtml(m.note || '')}</td></tr>`).join('');
}

$('#product-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const message = $('#product-message');
  hideMessage(message);
  if (!event.target.reportValidity()) return;
  const f = event.target.elements;
  const values = {
    sku: f.sku.value.trim(), name: f.name.value.trim(), unit: f.unit.value.trim() || 'pcs',
    buy_price: Number(f.buy_price.value || 0), sell_price: Number(f.sell_price.value || 0),
    min_stock: parseInt(f.min_stock.value || '0', 10),
  };
  if (!values.sku || !values.name) { showMessage(message, 'SKU dan nama produk wajib diisi.'); return; }
  const button = $('#product-submit');
  setLoading(button, true, 'Menyimpan...');
  try {
    if (editingId) {
      const { error } = await supabase.from('products').update({ ...values, is_active: f.is_active.checked }).eq('id', editingId);
      if (error) throw error;
    } else {
      const { data, error } = await supabase.from('products')
        .insert({ business_id: ctx.business.id, ...values }).select('id').single();
      if (error) throw error;
      const stock = parseInt(f.initial_stock.value || '0', 10);
      if (stock > 0 && canAdjust()) await adjust(data.id, stock, 'Stok awal');
    }
    productDialog.close();
    showToast('Produk disimpan.');
    await loadProducts();
  } catch (error) {
    showMessage(message, friendlyError(error));
  } finally {
    setLoading(button, false);
  }
});

$('#adjust-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const message = $('#adjust-message');
  hideMessage(message);
  const f = event.target.elements;
  const qty = parseInt(f.qty_change.value, 10);
  if (!Number.isInteger(qty) || qty === 0) { showMessage(message, 'Isi perubahan stok berupa bilangan bulat, bukan 0.'); return; }
  const button = $('#adjust-submit');
  setLoading(button, true, 'Menyimpan...');
  try {
    await adjust(adjustingId, qty, f.note.value.trim() || null);
    adjustDialog.close();
    showToast('Stok diperbarui.');
    await loadProducts();
  } catch (error) {
    showMessage(message, friendlyError(error));
  } finally {
    setLoading(button, false);
  }
});

$('#product-body').addEventListener('click', (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const product = products.find((p) => p.id === button.dataset.id);
  if (!product) return;
  if (button.dataset.action === 'edit') openProduct(product);
  if (button.dataset.action === 'adjust') {
    adjustingId = product.id;
    hideMessage($('#adjust-message'));
    $('#adjust-title').textContent = `Sesuaikan stok: ${product.name} (sekarang ${product.stock_qty} ${product.unit})`;
    $('#adjust-form').reset();
    adjustDialog.showModal();
  }
  if (button.dataset.action === 'history') openHistory(product);
});

$('#add-product').addEventListener('click', () => { if (ctx) openProduct(null); });
$('#search').addEventListener('input', () => { if (ctx) renderTable(); });
document.querySelectorAll('[data-close]').forEach((btn) => btn.addEventListener('click', () => btn.closest('dialog').close()));

(async function init() {
  ctx = await initShell();
  if (!ctx) return;
  try {
    await loadProducts();
  } catch (error) {
    $('#list-state').hidden = true;
    showMessage($('#page-message'), `Gagal memuat produk: ${friendlyError(error)}`);
  }
})();
