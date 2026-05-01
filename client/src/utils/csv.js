/**
 * Build a CSV string from a 2D array of cells and trigger a browser download.
 * Includes a UTF-8 BOM so Excel opens Hebrew correctly.
 */
export function downloadCSV(filename, rows) {
  const csv = rows.map(r => r.map(escapeCSVCell).join(',')).join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function escapeCSVCell(v) {
  if (v == null) return '';
  const s = String(v);
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

/** Format a date for CSV output — locale-aware, but readable in Excel. */
export function csvDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('he-IL') + ' ' +
         d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
}
