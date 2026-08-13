"use client";

/**
 * features/scheduling/lib/admin-scheduling-scope.ts
 *
 * Runtime scope plumbing for the `matrx-admin/scheduling` surface.
 *
 * The shape of this surface forces the indirection here. Seven route-tabbed
 * pages share one shell (`SchedulingAdminLayoutClient`), and the shell is the
 * only component always mounted — so it owns the OUTER
 * `SurfaceRuntimeProvider`. But every value except `active_tab` is state of
 * the TAB, and the tab is `children`: the shell cannot see it. So each tab
 * publishes a GETTER for its own slice into the tiny module store below, and
 * the shell's `getScope` calls it at Run time.
 *
 * The Cron tester is the exception and does NOT publish here: it mounts its
 * own provider (`cron-tester-surface.ts`) nested inside the shell's, and the
 * registry resolves deepest-first, so its richer scope wins on that tab
 * outright. This module serves the other six.
 *
 * Two properties this buys, both deliberate:
 *
 *  - Values are read when the user presses ▶, never captured on mount, so the
 *    agent sees what is on screen right then (the same contract
 *    `SurfaceRuntimeProvider.getScope` has).
 *  - Only the MOUNTED tab's slice is ever emitted. The store holds one slot
 *    and stamps it with the tab that published it; if that does not match the
 *    tab the pathname says is active (mid-navigation, or a tab that publishes
 *    nothing), the slice is dropped rather than emitted stale. A surface that
 *    reported the Runs tab's filters while the admin was on Scanner health
 *    would be lying, and the whole point of the manifest is that it cannot.
 */

import { useEffect, useRef } from "react";

import {
  createAdminSchedulingScope,
  type AdminSchedulingScopeValues,
  type AdminSchedulingTab,
} from "@/features/surfaces/manifests/admin-scheduling.manifest";
import type { SurfaceScopePayload } from "@/features/surfaces/types";

/** Everything a tab may publish — `active_tab` is the shell's to derive. */
export type AdminSchedulingScopeSlice = Omit<
  AdminSchedulingScopeValues,
  "active_tab"
>;

const BASE_PATH = "/administration/automation/scheduling";

/**
 * Which tab a pathname is on. Mirrors the shell's NAV_ITEMS: Overview is the
 * exact base path, every other tab is a segment under it. An unrecognized
 * path under the base falls back to "overview" — the shell only renders on
 * these seven routes, so this is unreachable in practice rather than a guess
 * the surface would emit as fact.
 */
export function adminSchedulingTabFromPathname(
  pathname: string,
): AdminSchedulingTab {
  const rest = pathname.startsWith(BASE_PATH)
    ? pathname.slice(BASE_PATH.length).replace(/^\/|\/$/g, "")
    : "";
  switch (rest) {
    case "tasks":
      return "tasks";
    case "runs":
      return "runs";
    case "orphan-leases":
      return "orphan_leases";
    case "cron-tester":
      return "cron_tester";
    case "scanner-health":
      return "scanner_health";
    case "templates":
      return "templates";
    default:
      return "overview";
  }
}

// ── The one-slot publisher ─────────────────────────────────────────────────

type Slot = {
  tab: AdminSchedulingTab;
  get: () => AdminSchedulingScopeSlice;
};

let slot: Slot | null = null;

/**
 * Publish this tab's slice of the surface scope. Call it from the tab page
 * with a closure over live state:
 *
 * ```ts
 * useAdminSchedulingScopeSlice("runs", () => ({
 *   run_status_filter: status === "__all__" ? "any" : status,
 *   run_row_count: rows.length,
 * }));
 * ```
 *
 * The getter is held in a ref refreshed every render, so the registered
 * closure always reads the LATEST state rather than the one from mount — the
 * same indirection `useSurfaceWriteHandlers` uses, for the same reason.
 */
export function useAdminSchedulingScopeSlice(
  tab: AdminSchedulingTab,
  get: () => AdminSchedulingScopeSlice,
): void {
  const getRef = useRef(get);
  useEffect(() => {
    getRef.current = get;
  });

  useEffect(() => {
    const entry: Slot = { tab, get: () => getRef.current() };
    slot = entry;
    // Clear only OUR entry: on a tab switch React mounts the next page before
    // unmounting this one, so a blind `slot = null` would wipe the incoming
    // tab's registration.
    return () => {
      if (slot === entry) slot = null;
    };
  }, [tab]);
}

/**
 * Build the live scope for the shell's provider. `active_tab` comes from the
 * pathname (always knowable); everything else comes from the mounted tab, and
 * only when it is the tab the pathname agrees is active.
 */
export function buildAdminSchedulingScope(
  pathname: string,
): SurfaceScopePayload {
  const activeTab = adminSchedulingTabFromPathname(pathname);
  const slice = slot?.tab === activeTab ? slot.get() : {};
  return createAdminSchedulingScope({ active_tab: activeTab, ...slice });
}

/**
 * Drop `undefined`/`null` entries so an absent value stays ABSENT rather than
 * being emitted as an explicit null. `alwaysAvailable: false` means "the key
 * may not be there", and the Surface Context window reads a present-but-null
 * key as a value the page failed to fill.
 */
export function definedOnly<T extends Record<string, unknown>>(values: T): T {
  return Object.fromEntries(
    Object.entries(values).filter(([, v]) => v !== undefined && v !== null),
  ) as T;
}
