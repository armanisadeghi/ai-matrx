// features/unified-data/standard-field-columns/standardColumnState.ts
//
// THE COLUMNS A PERSON PICKS ARE KEPT. A list's column choices persist through its own
// `useListViewPrefs` blob (the same `hiddenColumns` / `shownColumns` / `columnOrder` the
// canonical list shell keeps), never a new store. Custom-field columns start hidden the way the
// shell's auto-hidden columns do: a custom column the person showed is remembered as shown.

import type { ListViewPrefs } from "@/lib/redux/preferences/userPreferencesSlice";
import { effectiveHiddenColumns, hiddenColumnsPatch } from "@/lib/entity-list/columnWidths";
import { resolveColumnOrder } from "@/lib/entity-list/components/EntityListTable";

export interface StandardColumnState {
  order: string[];
  hidden: string[];
  onChange: (next: { order: string[]; hidden: string[] }) => void;
}

export function standardColumnState(
  declaredIds: readonly string[],
  customIds: readonly string[],
  prefs: Pick<ListViewPrefs, "hiddenColumns" | "shownColumns" | "columnOrder">,
  setPrefs: (patch: Partial<ListViewPrefs>) => void,
): StandardColumnState {
  const hidden = effectiveHiddenColumns(prefs.hiddenColumns ?? [], customIds, prefs.shownColumns ?? []);
  const order = resolveColumnOrder(declaredIds, prefs.columnOrder);
  return {
    order,
    hidden,
    onChange: (next) => {
      const sameHidden = JSON.stringify([...next.hidden].sort()) === JSON.stringify([...hidden].sort());
      const sameOrder = JSON.stringify(next.order) === JSON.stringify(order);
      if (sameHidden && sameOrder) return;
      setPrefs({
        ...(sameHidden ? {} : hiddenColumnsPatch(next.hidden, hidden, prefs.shownColumns ?? [])),
        ...(sameOrder ? {} : { columnOrder: next.order }),
      });
    },
  };
}
