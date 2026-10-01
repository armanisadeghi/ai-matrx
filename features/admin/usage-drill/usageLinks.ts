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

/** How far `zone`'s wall clock is ahead of UTC at instant `t` (ms). */
function zoneOffset(t: number, zone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: zone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(new Date(t))
      .map((p) => [p.type, p.value]),
  );
  const wall = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour) % 24, Number(parts.minute), Number(parts.second));
  return wall - Math.floor(t / 1000) * 1000;
}

/**
 * The instant a wall-clock time in `zone` names ("2026-09-28", 14 in America/Los_Angeles →
 * 2026-09-28T21:00Z), as the address grammar's moment (to the minute, UTC). Never the server's own
 * clock: `Date.parse` of a bare local string reads the machine's zone.
 */
export function zonedMoment(day: string, hour: number, zone: string): string {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  const guess = Date.UTC(y, m - 1, d, hour);
  let t = guess - zoneOffset(guess, zone);
  t = guess - zoneOffset(t, zone);
  return `${new Date(t).toISOString().slice(0, 16)}Z`;
}

/** Does this address carry one of the Spend Explorer's drill filters (`f.<dimension>`)? */
export function spendAddressAsks(params: URLSearchParams): boolean {
  return [...params.keys()].some((k) => k.startsWith("f."));
}

/** Does it carry a day or an hour, which are the VIEWER's local calendar (so only the browser can map it)? */
export function spendAddressNeedsZone(params: URLSearchParams): boolean {
  return Boolean(params.get("f.day") || params.get("f.hour"));
}

/**
 * The Spend Explorer's address as a usage-explorer link (lane DRILL-PRESETS-RETIRE; lane
 * DRILL-FLIP-FIXES R4). The view is the cut of the first filter the usage definition knows (so "this
 * agent" opens Spend by agent on that agent), else Spend by person. A conversation or a sign-in session
 * opens the per-execution grain (`def=ai_usage_executions`, its "by conversation" / "by session" view),
 * which narrows by every Spend filter. Spend's `f.day` / `f.hour` are the VIEWER's local day and hour
 * (`admin_spend_breakdown` cut them in the browser's zone): `zone` maps them to their real instants; a
 * caller without the viewer's zone (a server redirect) checks `spendAddressNeedsZone` first and lets
 * the browser map them. The slim spend page's organization filter (`org_filter`) narrows by
 * organization. `dropped` names anything that could not be carried, to be said, never silently lost.
 */
export function spendAddressToUsage(params: URLSearchParams, zone = "UTC"): { href: string; dropped: string[] } {
  const filters: Record<string, string | null> = {};
  const dropped: string[] = [];
  let window: string | undefined;
  let executions: "by_conversation" | "by_session" | null = null;
  for (const [key, raw] of params.entries()) {
    if (!key.startsWith("f.")) continue;
    const dim = key.slice(2);
    const value = raw === "(none)" ? null : raw;
    if (dim === "day" && value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      window = `${zonedMoment(value, 0, zone)}..${zonedMoment(nextDay(value), 0, zone)}`;
      continue;
    }
    if (dim === "hour" && value) {
      const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2})/.exec(value);
      if (m) {
        const from = zonedMoment(m[1]!, Number(m[2]), zone);
        window = `${from}..${new Date(Date.parse(from) + 3_600_000).toISOString().slice(0, 16)}Z`;
        continue;
      }
    }
    if (dim === "conversation" || dim === "session") {
      filters[dim] = value;
      executions ??= dim === "conversation" ? "by_conversation" : "by_session";
      continue;
    }
    const usageDim = SPEND_TO_USAGE[dim];
    if (usageDim) filters[usageDim] = value;
    else dropped.push(dim);
  }
  const orgFilter = params.get("org_filter");
  if (orgFilter && !("organization" in filters)) filters.organization = orgFilter;
  if (!window) {
    const win = params.get("win");
    const from = params.get("from");
    const to = params.get("to");
    if (win === "custom" && from && to) window = `${from}..${nextDay(to)}`;
    else if (win && SPEND_WINDOW[win]) window = SPEND_WINDOW[win];
  }
  if (executions) {
    const out = new URLSearchParams();
    for (const [dim, value] of Object.entries(filters)) out.set(`f.${dim}`, value ?? "(none)");
    if (window) out.set("w", window);
    return { href: usageDefinitionHref("ai_usage_executions", { view: executions, params: out }), dropped };
  }
  const first = Object.keys(filters)[0];
  const view = (first ? `spend_by_${first}` : "spend_by_person") as UsageViewKey;
  return { href: usageViewHref(view, filters, window), dropped };
}

// ── THE THREE GRAINS ON ONE SCREEN (VERIFY-DRILL-LIVE F2) ────────────────────────────────────────
// /administration/usage answers all three definitions; `def=<token>` in the address picks which one
// the explorer asks (absent = ai_usage). The Saved views menu and the findings panel offer the other
// two's built-in views and findings, grouped by these names.

export const USAGE_DEFINITIONS = {
  ai_usage: "Usage",
  ai_usage_executions: "Per execution",
  ai_calls: "Model calls",
} as const;
export type UsageDefinition = keyof typeof USAGE_DEFINITIONS;

/** The definition an address asks (`def=`), else ai_usage. */
export function usageDefinitionOf(params: URLSearchParams): UsageDefinition {
  const def = params.get("def");
  return def && def in USAGE_DEFINITIONS ? (def as UsageDefinition) : "ai_usage";
}

/** The usage screen on one definition: a built-in view, or a question in the address grammar. */
export function usageDefinitionHref(token: UsageDefinition, open: { view?: string; params?: URLSearchParams } = {}): string {
  const params = new URLSearchParams(open.params);
  if (token !== "ai_usage") params.set("def", token);
  if (open.view) params.set("view", `builtin:${open.view}`);
  const query = params.toString();
  return query ? `${USAGE_PATH}?${query}` : USAGE_PATH;
}

/** The other two grains, as the explorer's siblings; `go` is the host's navigation (a router push). */
export function usageSiblings(
  current: UsageDefinition,
  go: (href: string) => void,
): Array<{ token: UsageDefinition; group: string; go: (open: { view?: string; params?: URLSearchParams }) => void }> {
  return (Object.keys(USAGE_DEFINITIONS) as UsageDefinition[])
    .filter((t) => t !== current)
    .map((token) => ({ token, group: USAGE_DEFINITIONS[token], go: (open) => go(usageDefinitionHref(token, open)) }));
}
