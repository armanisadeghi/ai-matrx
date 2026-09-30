// features/admin/usage-drill/usageLinks.ts — EVERY LINK INTO AI USAGE (lane DRILL-PRESETS-RETIRE,
// PROGRESS-DRILL-FINISH decisions 11, 20).
//
// The usage explorer (/administration/usage) answers every old usage screen as a built-in Saved
// view of the `ai_usage` definition (aidream apps/shared/records/scripts/drill-definitions/
// ai_usage.drill.ts `views`). An address that names a view and asks nothing of its own opens that
// view, narrowed by the address's `f.<dimension>` filters and `w` window
// (components/official/drill-explorer/questionParts.ts viewQuestionFromAddress). These builders are
// the one place a screen writes such a link:
//
//   usagePersonHref(id)            the old /administration/users/usage?user=<id>
//   usageViewHref(key, filters, w) any built-in view
//   spendAddressToUsage(params)    the Spend Explorer's address grammar (win / from / to / f.<dim>,
//                                  person = `user`) in the explorer's, with what it could not carry
//
// The Spend page's hand-off (UsageExplorer's spendHref) is the inverse and goes at the flip.

export const USAGE_PATH = "/administration/usage";

/** The built-in views of `ai_usage` a link may name (the definition file is their truth). */
export type UsageViewKey =
  | "usage_by_person"
  | "usage_by_person_and_origin"
  | `spend_by_${"organization" | "person" | "agent" | "app" | "feature" | "origin" | "trigger" | "source" | "model" | "day" | "hour"}`;

/** A built-in view, narrowed by Dimension filters (`null` = "not set") and a window (`30d`, `today`, `<from>..<to>`). */
export function usageViewHref(view: UsageViewKey, filters: Record<string, string | null> = {}, window?: string): string {
  const params = new URLSearchParams({ view: `builtin:${view}` });
  for (const [dim, value] of Object.entries(filters)) params.set(`f.${dim}`, value ?? "(none)");
  if (window) params.set("w", window);
  return `${USAGE_PATH}?${params.toString()}`;
}

/** One person's AI usage: the "Usage by person" view on that person. */
export function usagePersonHref(personId: string): string {
  return usageViewHref("usage_by_person", { person: personId });
}

// ── THE SPEND EXPLORER'S ADDRESS → THE USAGE EXPLORER'S ──────────────────────────────────────────
// Spend: `win=today|yesterday|last24h|last7d|last30d|custom&from=<day>&to=<day>` (two INCLUSIVE local
// days) and `f.<dim>=<key>` with dims organization, user, agent, app, feature, origin, trigger,
// source, model, conversation, session, day, hour; "(none)" is the empty group.

const SPEND_TO_USAGE: Record<string, string> = {
  user: "person", organization: "organization", agent: "agent", app: "app", feature: "feature",
  origin: "origin", trigger: "trigger", source: "source", model: "model",
};
const SPEND_WINDOW: Record<string, string> = { today: "today", yesterday: "yesterday", last24h: "24h", last7d: "7d", last30d: "30d" };

function nextDay(day: string): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}

/** Does this address carry anything of the Spend Explorer's (a window or a filter)? */
export function spendAddressAsks(params: URLSearchParams): boolean {
  return params.has("win") || [...params.keys()].some((k) => k.startsWith("f."));
}

/**
 * The Spend Explorer's address as a usage-explorer link. The view is the cut of the first filter
 * the usage definition knows (so "this agent" opens Spend by agent on that agent), else Spend by
 * person. What the usage definition cannot narrow by — a conversation or a sign-in session (those
 * cuts live on ai_usage_executions) — is returned in `dropped`, to be said, never silently lost.
 */
export function spendAddressToUsage(params: URLSearchParams): { href: string; dropped: string[] } {
  const filters: Record<string, string | null> = {};
  const dropped: string[] = [];
  let window: string | undefined;
  for (const [key, raw] of params.entries()) {
    if (!key.startsWith("f.")) continue;
    const dim = key.slice(2);
    const value = raw === "(none)" ? null : raw;
    if (dim === "day" && value) {
      window = `${value}..${nextDay(value)}`;
      continue;
    }
    if (dim === "hour" && value) {
      const from = value.length === 16 ? `${value}` : value.slice(0, 16);
      window = `${from}..${new Date(Date.parse(from) + 3_600_000).toISOString().slice(0, 16)}`;
      continue;
    }
    const usageDim = SPEND_TO_USAGE[dim];
    if (usageDim) filters[usageDim] = value;
    else dropped.push(dim === "session" ? "sign-in session" : dim);
  }
  if (!window) {
    const win = params.get("win");
    const from = params.get("from");
    const to = params.get("to");
    if (win === "custom" && from && to) window = `${from}..${nextDay(to)}`;
    else if (win && SPEND_WINDOW[win]) window = SPEND_WINDOW[win];
  }
  const first = Object.keys(filters)[0];
  const view = (first ? `spend_by_${first}` : "spend_by_person") as UsageViewKey;
  return { href: usageViewHref(view, filters, window), dropped };
}
