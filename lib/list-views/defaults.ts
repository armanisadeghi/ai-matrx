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
  version: 1,
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

/**
 * Merge a surface's declared overrides + the user's stored prefs onto the
 * defaults.
 *
 * A stored blob whose `version` is older than the surface's declared version
 * is treated as stale SHAPE and dropped in favour of the defaults — that is
 * the backfill. Without it, adding a column to a surface means every existing
 * user gets it switched on, because their stored `hiddenColumns: []` predates
 * the column existing and still wins the merge.
 */
export function resolveListViewPrefs(
  surfaceDefaults: Partial<ListViewPrefs> | undefined,
  stored: Partial<ListViewPrefs> | undefined,
): ListViewPrefs {
  const base: ListViewPrefs = { ...LIST_VIEW_DEFAULTS, ...(surfaceDefaults ?? {}) };
  const storedIsCurrent = stored != null && stored.version === base.version;
  if (!storedIsCurrent) {
    if (stored != null) {
      console.warn(
        `[list-views] stored prefs are shape v${stored.version ?? "0"} but the ` +
          `surface declares v${base.version} — re-seeding from defaults. ` +
          "The user's view choice is preserved; column selection is reset.",
      );
      // Preserve the choices that survive a shape change; reset the ones tied
      // to the shape itself (columns).
      return {
        ...base,
        view: stored.view ?? base.view,
        density: stored.density ?? base.density,
        sort: stored.sort ?? base.sort,
        direction: stored.direction ?? base.direction,
        favoritesFirst: stored.favoritesFirst ?? base.favoritesFirst,
      };
    }
    return base;
  }
  return { ...base, ...stored };
}
