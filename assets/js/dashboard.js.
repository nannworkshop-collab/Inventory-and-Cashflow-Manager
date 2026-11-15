// assets/js/dashboard.js — Mengisi index.html (Dashboard).
// Bergantung pada: shell.js (login & sidebar), supabaseClient.js, chart.js, utils.js, dan fungsi SQL di 004_reporting.sql.
// Semua angka kas berasal dari fungsi database yang sama dengan halaman Arus Kas & Laporan -> angka selalu konsisten.
import { initShell } from './shell.js';
import { supabase } from './supabaseClient.js';
import { renderChartSvg } from './chart.js';
import { $, formatRupiah, formatTanggal, escapeHtml, showMessage, friendlyError } from './utils.js';

const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

async function rpc(name, args) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data;
}
async function run(query) {
  const { data, error, count } = await query;
  if (error) throw error;
  return { data, count };
}

async function load(business) {
  const id = business.id;
  const now = new Date();
  const monthStart = iso(new Date(now.getFullYear(), now.getMonth(), 1));
  const monthEnd = iso(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  const chartFrom = iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 13));
  const [allTime, month, sales, products, low, recent, days] = await Promise.all([
    rpc('get_cash_summary', { p_business_id: id, p_from: null, p_to: null }),
    rpc('get_cash_summary', { p_business_id: id, p_from: monthStart, p_to: monthEnd }),
    rpc('get_sales_summary', { p_business_id: id, p_from: monthStart, p_to: monthEnd }),
    run(supabase.from('products').select('id', { count: 'exact', head: true }).eq('business_id', id).eq('is_active', true)),
    run(supabase.from('low_stock_products').select('id,sku,name,unit,stock_qty,min_stock', { count: 'exact' })
      .eq('business_id', id).order('stock_qty').limit(5)),
    run(supabase.from('cash_transactions').select('id,trx_date,direction,category,amount,description,reversal_of')
      .eq('business_id', id).order('created_at', { ascending: false }).limit(8)),
    rpc('get_cash_by_day', { p_business_id: id, p_from: chartFrom, p_to: iso(now) }),
  ]);

  $('#stat-sales').textContent = formatRupiah(sales[0].total_penjualan);
  $('#stat-expense').textContent = formatRupiah(month[0].pengeluaran);
  $('#stat-balance').textContent = formatRupiah(allTime[0].saldo);
  $('#stat-products').textContent = String(products.count ?? 0);
  $('#stat-low').textContent = String(low.count ?? 0);

  renderLowStock(low.data);
  renderRecent(recent.data);
  const hasData = days.some((d) => Number(d.pemasukan) !== 0 || Number(d.pengeluaran) !== 0);
  $('#chart-empty').hidden = hasData;
  $('#chart-legend').hidden = !hasData;
  $('#chart').innerHTML = hasData ? renderChartSvg(days, 'Grafik pemasukan dan pengeluaran 14 hari terakhir') : '';
}

function renderLowStock(rows) {
  $('#low-empty').hidden = rows.length > 0;
  $('#low-wrap').hidden = rows.length === 0;
  $('#low-body').innerHTML = rows.map((p) =>
    `<tr><td>${escapeHtml(p.name)}<br><span class="text-muted">${escapeHtml(p.sku)}</span></td>` +
    `<td class="text-right"><span class="badge badge--warning">${p.stock_qty} ${escapeHtml(p.unit)}</span></td>` +
    `<td class="text-right">${p.min_stock}</td></tr>`).join('');
}

function renderRecent(rows) {
  $('#recent-empty').hidden = rows.length > 0;
  $('#recent-wrap').hidden = rows.length === 0;
  $('#recent-body').innerHTML = rows.map((t) => {
    const isIn = t.direction === 'in';
    const note = t.reversal_of ? ' <span class="badge badge--danger">Pembatalan</span>' : '';
    return `<tr><td>${formatTanggal(t.trx_date)}</td><td>${escapeHtml(t.description || t.category)}${note}</td>` +
      `<td class="text-right ${isIn ? 'text-income' : 'text-expense'}">${isIn ? '+' : '-'}${formatRupiah(t.amount)}</td></tr>`;
  }).join('');
}

(async function init() {
  const ctx = await initShell();
  if (!ctx) return;
  const message = $('#page-message');
  try {
    await load(ctx.business);
  } catch (error) {
    showMessage(message, `Gagal memuat dashboard: ${friendlyError(error)}`);
  }
})();
