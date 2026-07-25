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
  pageSize: 50,
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
