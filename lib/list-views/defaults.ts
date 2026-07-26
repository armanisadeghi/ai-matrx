// lib/list-views/defaults.ts
//
// The platform-wide defaults for a feature-entry list surface, and the shape a
// surface overrides when it wants something different.

import type { ListViewPrefs } from "@/lib/redux/preferences/userPreferencesSlice";

/**
 * Canonical defaults. Table-first is deliberate: the table is the only view
 * that can show every column, sort/filter every column, and reach every
 * per-record action from one menu. Cards are a browsing affordance on top.
 */
export const LIST_VIEW_DEFAULTS: ListViewPrefs = {
  view: "table",
  density: "comfortable",
  sort: "updated",
  direction: "desc",
  favoritesFirst: true,
  // 25, not 50+: the first page must be cheap. A list surface that ships a
  // 100-row default page is fine at 30 records and hostile at 2,000.
  pageSize: 25,
  hiddenColumns: [],
};

export const LIST_VIEW_PAGE_SIZES = [25, 50, 100, 200] as const;

/** Merge a surface's declared overrides + the user's stored prefs onto the defaults. */
export function resolveListViewPrefs(
  surfaceDefaults: Partial<ListViewPrefs> | undefined,
  stored: Partial<ListViewPrefs> | undefined,
): ListViewPrefs {
  return {
    ...LIST_VIEW_DEFAULTS,
    ...(surfaceDefaults ?? {}),
    ...(stored ?? {}),
  };
}
