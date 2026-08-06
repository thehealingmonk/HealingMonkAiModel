import { FileSpreadsheet } from 'lucide-react';
import { CsvColumn, downloadCsv } from '@/utils/exportCsv';

/**
 * "Export Excel" button — downloads the given rows as a CSV (opens in Excel /
 * Google Sheets). Disabled when there is nothing to export. Generic over the row
 * type so each list passes its own typed columns.
 */
export default function ExportButton<T>({
  filename,
  columns,
  rows,
  label = 'Export Excel',
}: {
  filename: string;
  columns: CsvColumn<T>[];
  rows: T[];
  label?: string;
}) {
  const disabled = rows.length === 0;
  return (
    <button
      type="button"
      onClick={() => !disabled && downloadCsv(filename, columns, rows)}
      disabled={disabled}
      title={disabled ? 'Nothing to export' : `Export ${rows.length} row${rows.length > 1 ? 's' : ''} to Excel (CSV)`}
      className="inline-flex items-center gap-1.5 border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-50 disabled:cursor-not-allowed text-emerald-700 font-medium text-sm py-2 px-3 rounded-lg transition-colors"
    >
      <FileSpreadsheet className="w-4 h-4" /> {label}
    </button>
  );
}
