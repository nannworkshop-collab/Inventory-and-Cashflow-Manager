// assets/js/chart.js — Membuat grafik batang (SVG) tanpa library. Fungsi murni: data masuk -> teks SVG keluar.
// Dipakai oleh: dashboard.js (dan nanti cashflow/reports).
import { escapeHtml, formatRupiah, formatTanggal } from './utils.js';

// days: [{ day: '2026-11-14', pemasukan: 100, pengeluaran: 50 }, ...]
export function renderChartSvg(days, label) {
  const W = 600, H = 220, top = 12, bottom = 28, side = 8;
  const plotH = H - top - bottom;
  const max = Math.max(1, ...days.flatMap((d) => [Number(d.pemasukan), Number(d.pengeluaran)]));
  const slot = (W - side * 2) / Math.max(days.length, 1);
  const bw = Math.max(slot / 2 - 2, 1);
  const barH = (v) => (Math.max(0, Number(v)) / max) * plotH;
  const bar = (x, v, color) =>
    `<rect x="${x.toFixed(1)}" y="${(top + plotH - barH(v)).toFixed(1)}" width="${bw.toFixed(1)}" height="${barH(v).toFixed(1)}" fill="${color}"/>`;
  const groups = days.map((d, i) => {
    const x = side + i * slot + 1;
    const title = `${formatTanggal(d.day)}: masuk ${formatRupiah(d.pemasukan)}, keluar ${formatRupiah(d.pengeluaran)}`;
    const tick = i % 2 === 0
      ? `<text x="${(x + bw).toFixed(1)}" y="${H - 8}" font-size="10" text-anchor="middle" fill="currentColor">${escapeHtml(String(d.day).slice(8))}</text>` : '';
    return `<g><title>${escapeHtml(title)}</title>${bar(x, d.pemasukan, 'var(--color-income)')}${bar(x + bw + 2, d.pengeluaran, 'var(--color-expense)')}${tick}</g>`;
  }).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${escapeHtml(label)}">` +
    `<line x1="${side}" x2="${W - side}" y1="${top + plotH}" y2="${top + plotH}" stroke="var(--color-border)"/>${groups}</svg>`;
}
