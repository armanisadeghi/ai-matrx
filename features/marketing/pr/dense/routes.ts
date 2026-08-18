/**
 * Press Room deep links.
 *
 * THE DOOR LAW needs a URL for every record this console names. Two of the
 * three record types already have registry routes:
 *
 *   journalist  → `party`   → /crm/{id}          (crm.party — the ONE record)
 *   site        → `web_site`→ /marketing/sites/{id}
 *
 * `seo.story_angle` and `seo.source_request` have NO entry in
 * `features/scopes/registry/entityRegistry.ts` — this pillar is new and the
 * registry is a shared file this bake-off entrant may not edit. So the door is
 * built here instead: every angle, request and coverage item is addressable as
 * a real URL on this very page, which means it can be opened, opened in a new
 * tab, bookmarked, and pasted to a colleague. `EntityRef` is still the
 * renderer — it just receives an explicit `href` (its documented escape hatch
 * for "same record, different shell").
 *
 * When `story_angle` / `source_request` get registry tokens, these helpers are
 * the only place that changes.
 */

export const PRESS_ROOM_PATH = "/marketing/pr/dense";

export type PressTab = "angles" | "requests" | "pipeline" | "coverage";
export type FocusKind = "angle" | "request" | "coverage";

export interface FocusRef {
  kind: FocusKind;
  id: string;
}

export function parseFocus(value: string | null): FocusRef | null {
  if (!value) return null;
  const [kind, id] = value.split(":");
  if (!id) return null;
  if (kind === "angle" || kind === "request" || kind === "coverage") {
    return { kind, id };
  }
  return null;
}

export function serializeFocus(focus: FocusRef | null): string | null {
  return focus ? `${focus.kind}:${focus.id}` : null;
}

export function parseTab(value: string | null): PressTab {
  return value === "requests" || value === "pipeline" || value === "coverage"
    ? value
    : "angles";
}

/** The tab a focused record naturally belongs to. */
export function tabForFocus(focus: FocusRef): PressTab {
  if (focus.kind === "request") return "requests";
  if (focus.kind === "coverage") return "coverage";
  return "angles";
}

export function pressRoomHref(options: {
  tab?: PressTab;
  focus?: FocusRef | null;
  scenario?: string | null;
}): string {
  const params = new URLSearchParams();
  if (options.tab && options.tab !== "angles") params.set("tab", options.tab);
  const focus = serializeFocus(options.focus ?? null);
  if (focus) params.set("focus", focus);
  if (options.scenario && options.scenario !== "live") {
    params.set("state", options.scenario);
  }
  const query = params.toString();
  return query ? `${PRESS_ROOM_PATH}?${query}` : PRESS_ROOM_PATH;
}

export function angleHref(id: string): string {
  return pressRoomHref({ tab: "angles", focus: { kind: "angle", id } });
}

export function requestHref(id: string): string {
  return pressRoomHref({ tab: "requests", focus: { kind: "request", id } });
}

export function coverageHref(id: string): string {
  return pressRoomHref({ tab: "coverage", focus: { kind: "coverage", id } });
}

/** Media lists live in the CRM; the outreach-list index is the door. */
export const MEDIA_LISTS_HREF = "/crm/outreach-lists";
