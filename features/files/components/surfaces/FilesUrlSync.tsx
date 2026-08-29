/**
 * features/files/components/surfaces/FilesUrlSync.tsx
 *
 * Render-less Redux ↔ URL bridge for the `/files` route family.
 *
 * Responsibility split:
 *
 *   - URL → Redux  (one-shot, on mount):
 *       Server route pages parse `searchParams` into a `uiPatch` and
 *       pass it to `PageShell` as `initialUiPatch`. PageShell applies
 *       that via the `useOneShotUiHydration` hook below — NOT this
 *       component. The reason: server-rendered HTML must match the
 *       URL on first paint, and the `searchParams` API is only
 *       available in Server Components.
 *
 *   - Redux → URL  (continuous, this component):
 *       This component subscribes to the relevant Redux UI selectors
 *       and writes them back to `?…` whenever the user changes
 *       anything — through `commitUrlParams` on `/files/all` (a
 *       history write that still notifies every other url-state
 *       control), and through `router.replace` on the sections that
 *       resolve their view server-side. It uses `replace` (not
 *       `push`) so a back-button press doesn't get polluted by every
 *       filter toggle. Folder NAVIGATION (which rewrites the pathname) lives
 *       in `PageShell.handleSelectFolder` and uses `navigateFilesFolderPath`
 *       (`history.pushState` on `/files/all`, `router.push` when crossing
 *       sections) so back/forward retraces folder history without remounting
 *       the shell.
 *
 *   - The component is intentionally render-less — drop it once into
 *     `PageShell` and forget about it.
 */

"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAppSelector, useAppStore } from "@/lib/redux/hooks";
import {
  selectActiveFileId,
  selectChipFilter,
  selectColumnFilters,
  selectDetailsLevel,
  selectKindFilter,
  selectSearchQuery,
  selectSort,
  selectViewMode,
  selectVisibleColumns,
} from "@/features/files/redux/selectors";
import { commitUrlParams } from "@ai-matrx/kit/url-state";
import {
  isOnFilesAllRoute,
  paramsEqual,
  serializeUiToParams,
} from "@/features/files/utils/url-state";

export interface FilesUrlSyncProps {
  /**
   * Param keys that this component owns. Anything OUTSIDE this set
   * (e.g. `?utm_source=…`) is preserved verbatim — we only diff
   * inside our own keyspace so we don't fight other code that
   * pushes unrelated params.
   *
   * Defaults to the full set we serialise. Override only in tests.
   */
  ownedKeys?: ReadonlyArray<string>;
}

const DEFAULT_OWNED_KEYS = [
  "view",
  "sort",
  "dir",
  "kind",
  "details",
  "chip",
  "q",
  "file",
  "cols",
  "cf.name",
  "cf.type",
  "cf.ext",
  "cf.mime",
  "cf.path",
  "cf.owner",
  "cf.modified",
  "cf.created",
  "cf.size",
  "cf.access",
  "cf.rag",
] as const;

export function FilesUrlSync({
  ownedKeys = DEFAULT_OWNED_KEYS,
}: FilesUrlSyncProps = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const currentSearchParams = useSearchParams();
  const store = useAppStore();

  // Subscribe to every UI fragment we care about. These selectors are
  // already memoised, so the component only re-runs when one of them
  // actually changes.
  const viewMode = useAppSelector(selectViewMode);
  const sort = useAppSelector(selectSort);
  const kindFilter = useAppSelector(selectKindFilter);
  const detailsLevel = useAppSelector(selectDetailsLevel);
  const searchQuery = useAppSelector(selectSearchQuery);
  const chipFilter = useAppSelector(selectChipFilter);
  const activeFileId = useAppSelector(selectActiveFileId);
  const columnFilters = useAppSelector(selectColumnFilters);
  const visibleColumns = useAppSelector(selectVisibleColumns);

  // Skip the very first effect tick — `initialUiPatch` was applied just
  // before mount via `useOneShotUiHydration`, and we don't want to
  // immediately re-emit those same values back into the URL (which is
  // a no-op semantically, but a wasted `router.replace`).
  const skippedFirstRef = useRef(false);

  useEffect(() => {
    if (!skippedFirstRef.current) {
      skippedFirstRef.current = true;
      return;
    }

    const nextOwned = serializeUiToParams({
      viewMode,
      sortBy: sort.sortBy,
      sortDir: sort.sortDir,
      kindFilter,
      detailsLevel,
      searchQuery,
      chipFilter,
      activeFileId,
      columnFilters,
      visibleColumns,
    });

    // Diff against the SAME owned-key subset of the current URL, not
    // the whole query. Otherwise unrelated params (e.g. analytics)
    // would force every check to mismatch.
    const currentOwned = new URLSearchParams();
    for (const key of ownedKeys) {
      const value = currentSearchParams.get(key);
      if (value !== null) currentOwned.set(key, value);
    }

    if (paramsEqual(nextOwned, currentOwned)) return;

    const browserPath =
      typeof window !== "undefined" ? window.location.pathname : pathname;

    if (isOnFilesAllRoute(browserPath)) {
      // A patch over OUR keys only — `commitUrlParams` merges it into the live
      // query string, so non-owned params (`?ref=…`) survive untouched, keys
      // at their default are dropped instead of accumulating, an unchanged URL
      // is a no-op, and — the reason this is not a raw `replaceState` — every
      // other url-state-backed control on the page is told to re-read.
      const patch: Record<string, string | null> = {};
      for (const key of ownedKeys) patch[key] = nextOwned.get(key);
      commitUrlParams(patch, "replace");
    } else {
      // Other `/files/*` sections resolve their view server-side, so the write
      // has to be a real (soft) navigation rather than a history poke.
      const merged = new URLSearchParams();
      for (const [key, value] of currentSearchParams.entries()) {
        if (!ownedKeys.includes(key)) merged.set(key, value);
      }
      for (const [key, value] of nextOwned.entries()) merged.set(key, value);
      const qs = merged.toString();
      router.replace(qs ? `${browserPath}?${qs}` : browserPath, {
        scroll: false,
      });
    }

    // The Redux store is stable across renders; useAppStore() is only
    // here for the "did mount" sentinel and intentionally unread.
    void store;
  }, [
    viewMode,
    sort.sortBy,
    sort.sortDir,
    kindFilter,
    detailsLevel,
    searchQuery,
    chipFilter,
    activeFileId,
    columnFilters,
    visibleColumns,
    pathname,
    currentSearchParams,
    router,
    ownedKeys,
    store,
  ]);

  return null;
}
