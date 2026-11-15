// assets/js/csv.js — Membuat dan mengunduh file CSV. Dipakai oleh reports.js.
// Sel teks yang diawali = + - @ diberi tanda ' di depan agar tidak dieksekusi sebagai rumus di Excel/Sheets (CSV injection).
export function toCsv(headers, rows) {
  const cell = (v) => {
    if (v === null || v === undefined) return '';
    if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
    let s = String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers, ...rows].map((row) => row.map(cell).join(',')).join('\r\n');
}

// BOM (\uFEFF) agar Excel membaca huruf UTF-8 dengan benar.
export function downloadCsv(filename, csv) {
  const url = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
