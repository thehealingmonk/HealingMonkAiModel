// Tiny client-side CSV/Excel exporter. CSV opens natively in Excel / Google
// Sheets, needs no dependency, and works entirely in the browser.

export interface CsvColumn<T> {
  header: string;
  /** Cell value for a row. Return a number for numeric columns (money, counts). */
  value: (row: T) => string | number | null | undefined;
}

// Escape one cell per RFC-4180: wrap in quotes if it holds a comma, quote or
// newline, and double any embedded quotes.
function esc(v: unknown): string {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv<T>(columns: CsvColumn<T>[], rows: T[]): string {
  const head = columns.map((c) => esc(c.header)).join(',');
  const body = rows.map((r) => columns.map((c) => esc(c.value(r))).join(',')).join('\r\n');
  return body ? `${head}\r\n${body}` : head;
}

/**
 * Build a CSV from the given columns/rows and trigger a browser download.
 * A UTF-8 BOM is prepended so Excel renders ₹, accents and other Unicode
 * correctly. The filename is stamped with today's date.
 */
export function downloadCsv<T>(filename: string, columns: CsvColumn<T>[], rows: T[]): void {
  const csv = toCsv(columns, rows);
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
