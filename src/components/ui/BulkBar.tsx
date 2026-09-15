import { Trash2 } from 'lucide-react';

// A checkbox that supports the indeterminate ("some but not all") state, used for
// the header "select all" toggle in every list.
export function SelectCheckbox({
  checked,
  indeterminate = false,
  onChange,
  ariaLabel,
  className = '',
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: () => void;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <input
      type="checkbox"
      checked={checked}
      ref={(el) => {
        if (el) el.indeterminate = indeterminate && !checked;
      }}
      onChange={onChange}
      onClick={(e) => e.stopPropagation()}
      aria-label={ariaLabel}
      className={`h-4 w-4 cursor-pointer accent-emerald-500 ${className}`}
    />
  );
}

// Bulk-action bar that appears once one or more rows are selected. Works in both
// the dark admin dashboards and the light reception pages via `variant`.
export function BulkBar({
  count,
  onClear,
  onDelete,
  deleting = false,
  deleteLabel = 'Delete selected',
  variant = 'dark',
  children,
}: {
  count: number;
  onClear: () => void;
  onDelete?: () => void;
  deleting?: boolean;
  deleteLabel?: string;
  variant?: 'dark' | 'light';
  /** Extra actions rendered before the delete button. */
  children?: React.ReactNode;
}) {
  if (count === 0) return null;
  const dark = variant === 'dark';
  return (
    <div
      className={`mb-3 flex items-center justify-between gap-3 rounded-xl px-4 py-2.5 border ${
        dark ? 'border-emerald-400/30 bg-emerald-500/10' : 'border-emerald-200 bg-emerald-50'
      }`}
    >
      <span className={`text-sm font-medium ${dark ? 'text-emerald-200' : 'text-emerald-800'}`}>
        {count} selected
      </span>
      <div className="flex items-center gap-2">
        {children}
        <button
          onClick={onClear}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
            dark
              ? 'border border-white/15 bg-white/5 text-slate-200 hover:bg-white/10'
              : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
          }`}
        >
          Clear
        </button>
        {onDelete && (
          <button
            onClick={onDelete}
            disabled={deleting}
            className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-500 disabled:opacity-60"
          >
            <Trash2 className="w-3.5 h-3.5" />
            {deleting ? 'Deleting…' : deleteLabel}
          </button>
        )}
      </div>
    </div>
  );
}
