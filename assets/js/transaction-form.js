// assets/js/transaction-form.js — Komponen bersama untuk form Penjualan & Pembelian:
// (1) editor baris produk, (2) dialog tambah pelanggan/pemasok. Dipakai oleh transaction-page.js.
import { supabase } from './supabaseClient.js';
import { escapeHtml, formatRupiah, showMessage, hideMessage, setLoading, friendlyError } from './utils.js';

// Subtotal baris: sama dengan qty * round(harga, 2) di SQL (dihitung dalam sen agar tanpa selisih desimal).
export const lineTotal = (qty, price) => Math.round(qty * Math.round(Number(price) * 100)) / 100;

// lines: [{ product_id, qty, price }]; stockById: Map(id -> { name, stock_qty }).
// Mengembalikan teks error atau null. Validasi akhir tetap dilakukan database.
export function validateLines(lines, stockById, limitByStock) {
  if (lines.length === 0) return 'Tambahkan minimal 1 produk.';
  const used = new Map();
  for (const [i, l] of lines.entries()) {
    const row = `Baris ${i + 1}`;
    if (!l.product_id) return `${row}: pilih produk.`;
    if (!Number.isInteger(l.qty) || l.qty < 1) return `${row}: jumlah harus bilangan bulat minimal 1.`;
    if (!Number.isFinite(l.price) || l.price < 0) return `${row}: harga tidak valid.`;
    used.set(l.product_id, (used.get(l.product_id) || 0) + l.qty);
  }
  if (limitByStock) {
    for (const [id, qty] of used) {
      const p = stockById.get(id);
      if (p && qty > p.stock_qty) return `Stok ${p.name} tidak cukup (tersisa ${p.stock_qty}, diminta ${qty}).`;
    }
  }
  return null;
}

export function createItemEditor({ tbody, totalEl, priceField, defaultPriceKey, limitByStock }) {
  let byId = new Map();
  let options = '';
  const cell = (tr, field) => tr.querySelector(`[data-field="${field}"]`);
  const readLines = () => [...tbody.rows].map((tr) => ({
    product_id: cell(tr, 'product').value,
    qty: parseInt(cell(tr, 'qty').value, 10),
    price: parseFloat(cell(tr, 'price').value),
  }));

  function refresh() {
    let total = 0;
    for (const tr of tbody.rows) {
      const qty = parseInt(cell(tr, 'qty').value, 10);
      const price = parseFloat(cell(tr, 'price').value);
      const sub = Number.isInteger(qty) && Number.isFinite(price) ? lineTotal(qty, price) : 0;
      cell(tr, 'subtotal').textContent = formatRupiah(sub);
      total += sub;
    }
    totalEl.textContent = formatRupiah(total);
  }

  function addRow() {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><select class="form-select" data-field="product" aria-label="Produk"><option value="">Pilih produk</option>${options}</select></td>
      <td><input class="form-input" data-field="qty" type="number" min="1" step="1" value="1" aria-label="Jumlah"></td>
      <td><input class="form-input" data-field="price" type="number" min="0" step="0.01" value="0" aria-label="Harga satuan"></td>
      <td class="text-right" data-field="subtotal">${formatRupiah(0)}</td>
      <td><button class="btn btn--secondary btn--sm" type="button" data-action="remove" aria-label="Hapus baris">Hapus</button></td>`;
    tbody.append(tr);
    refresh();
  }

  function reset() { tbody.innerHTML = ''; addRow(); }

  // Memperbarui daftar produk tanpa menghapus baris yang sedang diisi.
  function setProducts(list) {
    byId = new Map(list.map((p) => [p.id, p]));
    options = list.map((p) =>
      `<option value="${p.id}">${escapeHtml(p.name)} (${escapeHtml(p.sku)})${limitByStock ? ` — stok ${p.stock_qty}` : ''}</option>`).join('');
    for (const tr of tbody.rows) {
      const select = cell(tr, 'product');
      const current = select.value;
      select.innerHTML = `<option value="">Pilih produk</option>${options}`;
      select.value = current;
    }
  }

  tbody.addEventListener('change', (event) => {
    if (event.target.dataset.field !== 'product') return;
    const product = byId.get(event.target.value);
    cell(event.target.closest('tr'), 'price').value = product ? product[defaultPriceKey] : 0;
    refresh();
  });
  tbody.addEventListener('input', refresh);
  tbody.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action="remove"]');
    if (!button) return;
    button.closest('tr').remove();
    if (tbody.rows.length === 0) addRow();
    refresh();
  });

  return {
    addRow, reset, setProducts,
    validate: () => validateLines(readLines(), byId, limitByStock),
    getItems: () => readLines().map((l) => ({ product_id: l.product_id, qty: l.qty, [priceField]: l.price })),
  };
}

// Dialog kecil untuk menambah pelanggan / pemasok (tabel: 'customers' atau 'suppliers').
export function setupPartyDialog({ dialog, form, message, table, businessId, onCreated }) {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    hideMessage(message);
    if (!form.reportValidity()) return;
    const button = form.querySelector('[type="submit"]');
    setLoading(button, true, 'Menyimpan...');
    try {
      const { data, error } = await supabase.from(table)
        .insert({ business_id: businessId, name: form.elements.name.value.trim(), phone: form.elements.phone.value.trim() || null })
        .select('id,name').single();
      if (error) throw error;
      form.reset();
      dialog.close();
      onCreated(data);
    } catch (error) {
      showMessage(message, friendlyError(error));
    } finally {
      setLoading(button, false);
    }
  });
}
