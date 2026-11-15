// assets/js/reports.js — Mengatur reports.html: laporan penjualan, pengeluaran, stok, arus kas + Export CSV.
// Angka total berasal dari fungsi database yang sama dengan Dashboard & Arus Kas (004_reporting.sql).
// Bergantung pada: shell.js, supabaseClient.js, csv.js, utils.js.
import { initShell } from './shell.js';
import { supabase } from './supabaseClient.js';
import { toCsv, downloadCsv } from './csv.js';
import { $, formatRupiah, formatTanggal, escapeHtml, showMessage, hideMessage, setLoading, friendlyError, monthRange, signedExpense } from './utils.js';

let ctx = null;
let current = null; // laporan yang sedang tampil: { id, columns, rows, summary, range }
const NUMERIC = ['money', 'moneyBlank', 'int'];

// Mengambil SEMUA baris (PostgREST membatasi 1000 per permintaan) agar laporan tidak terpotong diam-diam.
async function fetchAll(build) {
  const size = 1000;
  const all = [];
  for (let from = 0; ; from += size) {
    const { data, error } = await build().range(from, from + size - 1);
    if (error) throw error;
    all.push(...data);
    if (data.length < size) return all;
  }
}
async function rpc(name, args) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data[0];
}
const round2 = (n) => Math.round(n * 100) / 100;

const REPORTS = {
  sales: {
    label: 'Laporan penjualan', dates: true,
    async load(range) {
      const rows = await fetchAll(() => supabase.from('sales').select('invoice_no,sale_date,status,total,customers(name)')
        .eq('business_id', ctx.business.id).gte('sale_date', range.from).lte('sale_date', range.to)
        .order('sale_date').order('invoice_no'));
      const sum = await rpc('get_sales_summary', { p_business_id: ctx.business.id, p_from: range.from, p_to: range.to });
      return {
        columns: [['No. faktur', 'text'], ['Tanggal', 'date'], ['Pelanggan', 'text'], ['Status', 'text'], ['Total', 'money']],
        rows: rows.map((r) => [r.invoice_no, r.sale_date, r.customers?.name || 'Pelanggan umum',
          r.status === 'completed' ? 'Selesai' : 'Dibatalkan', Number(r.total)]),
        summary: [['Total penjualan (selesai)', Number(sum.total_penjualan), 'money'], ['Jumlah transaksi selesai', Number(sum.jumlah_transaksi), 'int']],
      };
    },
  },
  expenses: {
    label: 'Laporan pengeluaran', dates: true,
    async load(range) {
      const cash = await fetchAll(() => supabase.from('cash_transactions').select('trx_date,direction,category,amount,description,reversal_of')
        .eq('business_id', ctx.business.id).gte('trx_date', range.from).lte('trx_date', range.to)
        .order('trx_date').order('created_at').order('id'));
      const sum = await rpc('get_cash_summary', { p_business_id: ctx.business.id, p_from: range.from, p_to: range.to });
      const rows = cash.filter((r) => signedExpense(r) !== null)
        .map((r) => [r.trx_date, r.category, r.description || '', r.reversal_of ? 'Pembatalan (mengurangi)' : 'Pengeluaran', signedExpense(r)]);
      return {
        columns: [['Tanggal', 'date'], ['Kategori', 'text'], ['Keterangan', 'text'], ['Jenis', 'text'], ['Jumlah', 'money']],
        rows, summary: [['Total pengeluaran (bersih, termasuk pembelian stok)', Number(sum.pengeluaran), 'money']],
      };
    },
  },
  cashflow: {
    label: 'Laporan arus kas', dates: true,
    async load(range) {
      const cash = await fetchAll(() => supabase.from('cash_transactions').select('trx_date,direction,category,amount,description,reversal_of')
        .eq('business_id', ctx.business.id).gte('trx_date', range.from).lte('trx_date', range.to)
        .order('trx_date').order('created_at').order('id'));
      const sum = await rpc('get_cash_summary', { p_business_id: ctx.business.id, p_from: range.from, p_to: range.to });
      return {
        columns: [['Tanggal', 'date'], ['Kategori', 'text'], ['Keterangan', 'text'], ['Masuk', 'moneyBlank'], ['Keluar', 'moneyBlank']],
        rows: cash.map((r) => [r.trx_date, r.category, (r.description || '') + (r.reversal_of ? ' (pembatalan)' : ''),
          r.direction === 'in' ? Number(r.amount) : 0, r.direction === 'out' ? Number(r.amount) : 0]),
        summary: [['Pemasukan (bersih)', Number(sum.pemasukan), 'money'], ['Pengeluaran (bersih)', Number(sum.pengeluaran), 'money'], ['Saldo periode', Number(sum.saldo), 'money']],
      };
    },
  },
  stock: {
    label: 'Laporan stok', dates: false,
    async load() {
      const rows = await fetchAll(() => supabase.from('products').select('sku,name,unit,stock_qty,min_stock,buy_price,is_active')
        .eq('business_id', ctx.business.id).order('name').order('id'));
      const active = rows.filter((p) => p.is_active);
      const status = (p) => (!p.is_active ? 'Nonaktif' : p.stock_qty <= p.min_stock ? 'Stok menipis' : 'Aman');
      return {
        columns: [['SKU', 'text'], ['Nama', 'text'], ['Satuan', 'text'], ['Stok', 'int'], ['Min. stok', 'int'], ['Harga beli', 'money'], ['Nilai stok', 'money'], ['Status', 'text']],
        rows: rows.map((p) => [p.sku, p.name, p.unit, p.stock_qty, p.min_stock, Number(p.buy_price), round2(p.stock_qty * Number(p.buy_price)), status(p)]),
        summary: [
          ['Total nilai stok (produk aktif)', round2(active.reduce((t, p) => t + round2(p.stock_qty * Number(p.buy_price)), 0)), 'money'],
          ['Produk aktif', active.length, 'int'],
          ['Stok menipis', active.filter((p) => p.stock_qty <= p.min_stock).length, 'int'],
        ],
      };
    },
  },
};

function format(kind, value) {
  if (kind === 'money') return formatRupiah(value);
  if (kind === 'moneyBlank') return Number(value) ? formatRupiah(value) : '';
  if (kind === 'date') return formatTanggal(value);
  if (kind === 'int') return Number(value).toLocaleString('id-ID');
  return escapeHtml(value);
}

function render(report) {
  const right = (kind) => (NUMERIC.includes(kind) ? ' class="text-right"' : '');
  $('#report-title').textContent = report.label;
  $('#report-head').innerHTML = `<tr>${report.columns.map(([label, kind]) => `<th scope="col"${right(kind)}>${label}</th>`).join('')}</tr>`;
  $('#report-body').innerHTML = report.rows.map((row) =>
    `<tr>${row.map((v, i) => `<td${right(report.columns[i][1])}>${format(report.columns[i][1], v)}</td>`).join('')}</tr>`).join('');
  $('#summary').innerHTML = report.summary.map(([label, value, kind]) =>
    `<article class="card stat-card"><h3 class="stat-card__label">${escapeHtml(label)}</h3><p class="stat-card__value">${format(kind, value)}</p></article>`).join('');
  $('#report-state').hidden = report.rows.length > 0;
  $('#report-wrap').hidden = report.rows.length === 0;
  $('#report-result').hidden = false;
  $('#row-count').textContent = `${report.rows.length.toLocaleString('id-ID')} baris`;
}

$('#report-type').addEventListener('change', () => { $('#date-fields').hidden = !REPORTS[$('#report-type').value].dates; });

$('#report-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!ctx) return;
  const message = $('#page-message');
  hideMessage(message);
  const id = $('#report-type').value;
  const range = { from: $('#r-from').value, to: $('#r-to').value };
  if (REPORTS[id].dates && (!range.from || !range.to || range.from > range.to)) {
    showMessage(message, 'Isi tanggal awal dan akhir dengan benar (awal tidak boleh setelah akhir).');
    return;
  }
  const button = $('#show-btn');
  setLoading(button, true, 'Memuat...');
  try {
    const data = await REPORTS[id].load(range);
    current = { id, label: REPORTS[id].label, dates: REPORTS[id].dates, range, ...data };
    render(current);
  } catch (error) {
    showMessage(message, `Gagal memuat laporan: ${friendlyError(error)}`);
  } finally {
    setLoading(button, false);
  }
});

$('#export-btn').addEventListener('click', () => {
  if (!current) return;
  const span = current.dates ? `_${current.range.from}_${current.range.to}` : '';
  const headers = current.columns.map(([label]) => label);
  downloadCsv(`${current.label.toLowerCase().replace(/\s+/g, '-')}${span}.csv`, toCsv(headers, current.rows));
});

(async function init() {
  ctx = await initShell();
  if (!ctx) return;
  const range = monthRange();
  $('#r-from').value = range.from;
  $('#r-to').value = range.to;
})();
