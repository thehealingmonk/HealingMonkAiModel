import { useCallback, useMemo, useState } from 'react';

// Reusable multi-select for any list/table. Tracks a set of selected row ids and
// derives the header checkbox state from the currently-VISIBLE ids (so filtering
// never leaves an off-screen row silently selected). Use across every panel that
// wants a "select all" + bulk action.
export function useRowSelection(visibleIds: string[]) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const isSelected = useCallback((id: string) => selected.has(id), [selected]);

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const someSelected = visibleIds.some((id) => selected.has(id));

  const toggleAll = useCallback(() => {
    setSelected((prev) => (visibleIds.every((id) => prev.has(id)) ? new Set() : new Set(visibleIds)));
  }, [visibleIds]);

  const clear = useCallback(() => setSelected(new Set()), []);

  // Only the selected ids that are actually visible right now.
  const selectedVisible = useMemo(
    () => visibleIds.filter((id) => selected.has(id)),
    [visibleIds, selected]
  );

  return {
    selected,
    setSelected,
    isSelected,
    toggle,
    toggleAll,
    clear,
    allSelected,
    someSelected,
    selectedVisible,
    count: selectedVisible.length,
  };
}
