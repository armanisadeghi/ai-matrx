"use client";

/**
 * The ONE URL-state module for the Press Room.
 *
 * Everything that decides what is on screen lives in the query string, so any
 * state a user can reach is a state they can share, bookmark and reload into:
 *
 *   ?brand=<id>          which business (the agency operator manages several)
 *   &site=<id>           which of that business's sites
 *   &view=<queue view>   which slice of the angle queue is showing
 *   &sort=<queue sort>   how that slice is ordered (absent = the view's default)
 *   &focus=angle:<id>    the open record — angle | request | coverage
 *   &data=<scenario>     force a load state (see `PRESS_ROOM_SCENARIOS`)
 *
 * THE DOOR LAW needs a URL for every record this surface names. Two of the
 * three record types already have registry routes (`party` → /crm/{id},
 * `web_site` → /marketing/sites/{id}). `seo.story_angle` and
 * `seo.source_request` have NO entry in the shared entity registry — this
 * pillar is new and the registry is a shared file this work may not edit — so
 * the door is built HERE: every angle, request and coverage item is addressable
 * as a real URL on this very page, and `EntityRef` still renders it, receiving
 * an explicit `href` (its documented escape hatch). When those tables get
 * registry tokens, these helpers are the only place that changes.
 *
 * The path always comes from `marketingRoutes.press()` — never a hand-built
 * "/marketing/pr" string.
 */

import { useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { marketingRoutes } from "@/features/marketing/lib/routes";
import {
  QUEUE_SORTS,
  defaultSortForView,
  type QueueSort,
} from "@/features/marketing/pr/scoring";

// ─── Scenario switch ────────────────────────────────────────────────────────

/**
 * `?data=` forces one of the load states so the unglamorous ones are reachable
 * and reviewable on the real route. `live` is the default and the real path;
 * the switch only ever FORCES a state — the honest copy for a stall still comes
 * from the real React Query signals (see `data.ts`).
 */
export const PRESS_ROOM_SCENARIOS = [
  "live",
  "ready",
  "empty",
  "error",
  "stalled",
] as const;
export type PressRoomScenario = (typeof PRESS_ROOM_SCENARIOS)[number];

export function parseScenario(value: string | null): PressRoomScenario {
  return PRESS_ROOM_SCENARIOS.includes(value as PressRoomScenario)
    ? (value as PressRoomScenario)
    : "live";
}

export const SCENARIO_COPY: Record<
  Exclude<PressRoomScenario, "live">,
  { label: string; blurb: string }
> = {
  ready: {
    label: "Forced: sample data",
    blurb: "The sample press room, without querying your own rows.",
  },
  empty: {
    label: "Forced: empty",
    blurb: "What a site with no analysis yet looks like.",
  },
  error: {
    label: "Forced: read failure",
    blurb: "What a failed read against seo.story_angle looks like.",
  },
  stalled: {
    label: "Forced: stalled read",
    blurb: "What a read that never answers looks like.",
  },
};

// ─── Focus ──────────────────────────────────────────────────────────────────

export type FocusKind = "angle" | "request" | "coverage";

export interface FocusRef {
  kind: FocusKind;
  id: string;
}

export function parseFocus(value: string | null): FocusRef | null {
  if (!value) return null;
  const separator = value.indexOf(":");
  if (separator < 0) return null;
  const kind = value.slice(0, separator);
  const id = value.slice(separator + 1);
  if (!id) return null;
  if (kind === "angle" || kind === "request" || kind === "coverage") {
    return { kind, id };
  }
  return null;
}

export function serializeFocus(focus: FocusRef | null): string | null {
  return focus ? `${focus.kind}:${focus.id}` : null;
}

// ─── Hrefs ──────────────────────────────────────────────────────────────────

export function parseSort(
  value: string | null,
  viewId: string,
): { sort: QueueSort; isDefault: boolean } {
  const match = QUEUE_SORTS.find((entry) => entry.id === value);
  return match
    ? { sort: match.id, isDefault: false }
    : { sort: defaultSortForView(viewId), isDefault: true };
}

export interface PressRoomHrefOptions {
  brand?: string | null;
  site?: string | null;
  view?: string | null;
  sort?: QueueSort | null;
  focus?: FocusRef | null;
  scenario?: PressRoomScenario | null;
}

export function pressRoomHref(options: PressRoomHrefOptions): string {
  const params = new URLSearchParams();
  if (options.brand) params.set("brand", options.brand);
  if (options.site) params.set("site", options.site);
  if (options.view && options.view !== "live") params.set("view", options.view);
  if (options.sort) params.set("sort", options.sort);
  const focus = serializeFocus(options.focus ?? null);
  if (focus) params.set("focus", focus);
  if (options.scenario && options.scenario !== "live") {
    params.set("data", options.scenario);
  }
  const query = params.toString();
  const base = marketingRoutes.press();
  return query ? `${base}?${query}` : base;
}

// ─── The hook ───────────────────────────────────────────────────────────────

export interface PressRoomUrlState {
  brandId: string;
  siteId: string;
  viewId: string;
  /** Resolved: the explicit `?sort=`, or the view's own default. */
  sort: QueueSort;
  /** True when no `?sort=` is present and the view's default is in force. */
  sortIsDefault: boolean;
  focus: FocusRef | null;
  scenario: PressRoomScenario;
  /** Patch any subset. Changing the brand always clears the site AND the focus. */
  set: (next: {
    brand?: string;
    site?: string;
    view?: string;
    sort?: QueueSort | null;
    focus?: FocusRef | null;
    scenario?: PressRoomScenario;
  }) => void;
  /** A shareable link to whatever is on screen right now. */
  href: (overrides?: Partial<PressRoomHrefOptions>) => string;
}

export function usePressRoomUrl(): PressRoomUrlState {
  const router = useRouter();
  const searchParams = useSearchParams();

  const brandId = searchParams.get("brand") ?? "";
  const siteId = searchParams.get("site") ?? "";
  const viewId = searchParams.get("view") ?? "live";
  const { sort, isDefault: sortIsDefault } = parseSort(
    searchParams.get("sort"),
    viewId,
  );
  // Memoised on the RAW string: `parseFocus` returns a fresh object every call,
  // and a new object identity every render would invalidate every consumer.
  const focusRaw = searchParams.get("focus");
  const focus = useMemo(() => parseFocus(focusRaw), [focusRaw]);
  const scenario = parseScenario(searchParams.get("data"));

  const set = useCallback<PressRoomUrlState["set"]>(
    (next) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next.brand !== undefined) {
        if (next.brand) params.set("brand", next.brand);
        else params.delete("brand");
        // A site and a focused row belong to the previous business.
        params.delete("site");
        params.delete("focus");
      }
      if (next.site !== undefined) {
        if (next.site) params.set("site", next.site);
        else params.delete("site");
        params.delete("focus");
      }
      if (next.view !== undefined) {
        if (next.view && next.view !== "live") params.set("view", next.view);
        else params.delete("view");
        // Each view carries its own default order; an explicit choice made in
        // one view must not silently govern the next one.
        params.delete("sort");
      }
      if (next.sort !== undefined) {
        if (next.sort) params.set("sort", next.sort);
        else params.delete("sort");
      }
      if (next.focus !== undefined) {
        const value = serializeFocus(next.focus);
        if (value) params.set("focus", value);
        else params.delete("focus");
      }
      if (next.scenario !== undefined) {
        if (next.scenario && next.scenario !== "live") {
          params.set("data", next.scenario);
        } else {
          params.delete("data");
        }
      }
      const query = params.toString();
      // Every field here is a discrete choice (brand, site, view, sort,
      // focus) — one change, one history entry, Back undoes exactly it.
      router.push(query ? `?${query}` : marketingRoutes.press(), {
        scroll: false,
      });
    },
    [router, searchParams],
  );

  const href = useCallback<PressRoomUrlState["href"]>(
    (overrides) =>
      pressRoomHref({
        brand: brandId,
        site: siteId,
        view: viewId,
        sort: sortIsDefault ? null : sort,
        focus,
        scenario,
        ...overrides,
      }),
    [brandId, siteId, viewId, sort, sortIsDefault, focus, scenario],
  );

  return useMemo(
    () => ({
      brandId,
      siteId,
      viewId,
      sort,
      sortIsDefault,
      focus,
      scenario,
      set,
      href,
    }),
    [brandId, siteId, viewId, sort, sortIsDefault, focus, scenario, set, href],
  );
}
