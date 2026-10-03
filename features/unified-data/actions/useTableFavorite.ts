"use client";

// features/unified-data/actions/useTableFavorite.ts — lane TABLE-ACTIONS (wave 1, item 9)
//
// ONE FAVORITE FOR A TABLE, WHEREVER IT IS STARRED: the Data home's own marks
// (`useDataHomeMarks`, the synced `lists.dataHomeStarred` preference), keyed by the Data home row
// id `table:<organization>:<table>`. The table page's star, its ⋯ "Add to favorites" and the Data
// home row's star all flip the same entry, so a table starred on its page is first on the home.

import { toast } from "@/lib/toast";
import { DATA_HOME_STAR_CAP, nextStarred, useDataHomeMarks } from "@/features/unified-data/home/useDataHomeMarks";

/** The Data home row id of a table (`dataHomeRows.ts` `toRow`: `${kind}:${organization}:${item}`). */
export function tableStarId(tableId: string, organizationId: string | null): string {
  return `table:${organizationId ?? "-"}:${tableId}`;
}

export const STAR_CAP_SAID = `You can keep up to ${DATA_HOME_STAR_CAP} favorites. Remove one first.`;

/** Flip one row id in the marks; says the cap out loud instead of dropping the star. */
export function useStarToggle(): { starred: readonly string[]; toggle: (id: string) => void } {
  const marks = useDataHomeMarks();
  return {
    starred: marks.starred,
    toggle: (id) => {
      const { next, refused } = nextStarred(marks.starred, id);
      if (refused) {
        toast.error(STAR_CAP_SAID);
        return;
      }
      marks.setStarred(next);
    },
  };
}

/** The table's favorite state and its toggle. Null organization: not known yet, nothing to flip. */
export function useTableFavorite(tableId: string, organizationId: string | null) {
  const { starred, toggle } = useStarToggle();
  const id = tableStarId(tableId, organizationId);
  return {
    known: organizationId !== null,
    isFavorite: starred.includes(id),
    toggle: () => {
      if (organizationId !== null) toggle(id);
    },
  };
}
