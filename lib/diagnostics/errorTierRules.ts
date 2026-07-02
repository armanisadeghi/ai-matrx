/**
 * errorTierRules.ts  —  THE agent-editable downgrade system.
 *
 * Every captured error starts at `red` (DEFAULT_TIER). To make a specific error
 * — or a whole class of error — quieter, you add a rule to DOWNGRADE_RULES that
 * matches it and points at a calmer tier (`orange` = small dot, `yellow` =
 * silent). Nothing else in the system needs to change: the store classifies
 * each error through `classifyTier()` at capture time, and the badge + window
 * read the result.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * HOW TO DOWNGRADE AN ERROR (the canonical flow)
 *
 *   1. An admin sees a red error in the Error Inspector and decides it isn't a
 *      real problem ("this one shouldn't be an error").
 *   2. They click "Copy for AI" on that error. The payload includes a
 *      ready-to-paste `<suggested-downgrade-rule>` block — the exact rule
 *      literal that matches THAT error (built by `buildDowngradeRuleStub`).
 *   3. A coding agent pastes that literal into the DOWNGRADE_RULES array below,
 *      sets `tier` to "orange" or "yellow", and writes a one-line `reason`.
 *   4. On reload the error is reclassified to the new tier. Repeat to taste.
 *
 * Rules are evaluated top-to-bottom; the FIRST match wins. Put specific rules
 * (a single code on a single relation) above broad ones (a whole source). Every
 * field you set in `match` must hold (logical AND); a field you omit is ignored.
 * An empty `match` matches NOTHING by design — a rule must say what it targets.
 *
 * Keep this file pure (no imports of React/Redux/the store at runtime) so it
 * can be evaluated on the capture hot path with zero coupling.
 * ──────────────────────────────────────────────────────────────────────────
 */

import type {
  CapturedError,
  CapturedErrorSource,
  CapturedOperation,
} from "./errorCaptureStore";
import { DEFAULT_TIER, type ErrorTier } from "./errorTiers";

/** Path to this file — surfaced in the Copy-for-AI payload so an agent knows where to write. */
export const TIER_RULES_FILE = "lib/diagnostics/errorTierRules.ts";

/** A field may target one value or any-of a list. */
type OneOrMany<T> = T | T[];

/**
 * The criteria for a rule. Every provided field must match (AND). Strings are
 * matched case-insensitively where noted. Omit a field to ignore it.
 */
export interface ErrorMatch {
  /** Where the error came from. The most common thing to target. */
  source?: OneOrMany<CapturedErrorSource>;
  /** Postgres / PostgREST / app error code, e.g. "PGRST116", "42501". */
  code?: OneOrMany<string>;
  /** Table / RPC function name, or (for API errors) "METHOD /path". */
  relation?: OneOrMany<string>;
  /** Supabase verb. */
  operation?: OneOrMany<CapturedOperation>;
  /** Postgres schema. */
  schema?: OneOrMany<string>;
  /** Error.name, e.g. "AbortError", "TypeError". */
  name?: OneOrMany<string>;
  /** Exact HTTP status. */
  status?: OneOrMany<number>;
  /** Inclusive HTTP status range, e.g. [400, 499] for all client errors. */
  statusRange?: [number, number];
  /** Case-insensitive substring of the route (pathname). */
  routeIncludes?: string;
  /** Case-insensitive substring of the error message. */
  messageIncludes?: string;
  /** Regular-expression source tested (case-insensitive) against the message. */
  messagePattern?: string;
}

export interface DowngradeRule {
  /** Stable slug, unique within this file. Used for display + dedupe. */
  id: string;
  /** The tier this rule downgrades a matching error TO. */
  tier: ErrorTier;
  /** One line: why this is safe to downgrade. Shown in the inspector. */
  reason: string;
  /** Optional ISO date the rule was added — pure documentation. */
  addedAt?: string;
  /** What this rule targets. */
  match: ErrorMatch;
}

// ════════════════════════════════════════════════════════════════════════
// DOWNGRADE RULES — edit this array to tune what's loud.
//
// Day 1: keep this list SHORT. Nearly everything should stay red until you've
// actually seen it and decided it's noise. The two seeds below are genuine
// non-errors and double as worked examples of the two tiers.
// ════════════════════════════════════════════════════════════════════════
export const DOWNGRADE_RULES: DowngradeRule[] = [
  {
    id: "request-aborted",
    tier: "yellow",
    reason:
      "Request cancelled by navigation / unmount / superseding fetch — expected control flow, not a failure.",
    addedAt: "2026-06-28",
    match: {
      // supabase-postgrest is included because postgrest-js RESOLVES an aborted
      // request with an error object (no throw); the capture layer tags it with
      // name "AbortError" so this one rule covers every Supabase call site.
      source: ["api-network", "supabase-exception", "supabase-postgrest"],
      name: "AbortError",
    },
  },
  {
    id: "resize-observer-loop",
    tier: "yellow",
    reason:
      "Benign browser warning ('ResizeObserver loop limit exceeded') — never actionable.",
    addedAt: "2026-06-28",
    match: {
      source: ["runtime-exception", "console-error"],
      messageIncludes: "ResizeObserver loop",
    },
  },
  {
    id: "stream-total-timeout",
    tier: "yellow",
    reason:
      "The 24h stream-lifetime ceiling — by-design, effectively never a real failure.",
    addedAt: "2026-06-29",
    match: {
      source: "agent-stream-client-error",
      code: "total_timeout",
    },
  },
  {
    id: "user-toast-handled",
    tier: "orange",
    reason:
      "A toast.error is already handled and shown to the user — minor by nature, not an unhandled error.",
    addedAt: "2026-06-29",
    match: {
      source: "user-toast",
    },
  },
  {
    id: "tool-error-normal-operation",
    tier: "yellow",
    reason:
      "A failed tool call is NORMAL agent operation — the agent receives the error and adapts (e.g. the sql guard rejecting a forbidden `grant`/`delete from`). Not an admin-facing failure. Promote a SPECIFIC tool to red with a rule ABOVE this one if its failure is genuinely a bug.",
    addedAt: "2026-06-29",
    match: {
      source: "agent-stream-tool-error",
    },
  },
  {
    id: "redux-rejected-handled",
    tier: "orange",
    reason:
      "A rejected thunk is typically handled by its slice (rollback / error-state). Minor by default — promote a critical slice to red, or silence a noisy one to yellow, by matching `relation` (the thunk name) ABOVE this rule.",
    addedAt: "2026-06-29",
    match: {
      source: "redux-rejected",
    },
  },
];

// ── Matching engine ──────────────────────────────────────────────────────

function asList<T>(v: OneOrMany<T> | undefined): T[] | undefined {
  if (v === undefined) return undefined;
  return Array.isArray(v) ? v : [v];
}

function someEq<T>(want: OneOrMany<T> | undefined, got: T | undefined): boolean {
  const list = asList(want);
  if (!list) return true; // field not constrained
  if (got === undefined || got === null) return false;
  return list.includes(got);
}

function ciIncludes(haystack: string | undefined, needle?: string): boolean {
  if (needle === undefined) return true;
  if (!haystack) return false;
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

/** True only if the match is non-empty AND every constrained field holds. */
export function errorMatchesRule(e: CapturedError, match: ErrorMatch): boolean {
  const keys = Object.keys(match);
  if (keys.length === 0) return false; // empty match targets nothing, by design

  if (!someEq(match.source, e.source)) return false;
  if (!someEq(match.code, e.code)) return false;
  if (!someEq(match.relation, e.relation)) return false;
  if (!someEq(match.operation, e.operation)) return false;
  if (!someEq(match.schema, e.schema)) return false;
  if (!someEq(match.name, e.name)) return false;
  if (!someEq(match.status, e.status)) return false;

  if (match.statusRange) {
    const [lo, hi] = match.statusRange;
    if (typeof e.status !== "number" || e.status < lo || e.status > hi) {
      return false;
    }
  }
  if (!ciIncludes(e.route, match.routeIncludes)) return false;
  if (!ciIncludes(e.message, match.messageIncludes)) return false;
  if (match.messagePattern !== undefined) {
    try {
      if (!new RegExp(match.messagePattern, "i").test(e.message)) return false;
    } catch {
      return false; // a malformed pattern never matches (and never throws on the hot path)
    }
  }
  return true;
}

export interface TierClassification {
  tier: ErrorTier;
  /** The rule that produced a downgrade, if any. */
  ruleId?: string;
  /** The rule's reason, for display. */
  reason?: string;
}

/**
 * Classify a captured error into a visibility tier. Walks DOWNGRADE_RULES in
 * order; first match wins; default is `red`. Never throws.
 */
export function classifyTier(e: CapturedError): TierClassification {
  for (const rule of DOWNGRADE_RULES) {
    try {
      if (errorMatchesRule(e, rule.match)) {
        return { tier: rule.tier, ruleId: rule.id, reason: rule.reason };
      }
    } catch {
      // A broken rule must never break capture — skip it.
    }
  }
  return { tier: DEFAULT_TIER };
}

// ── Rule-stub builder (the "Copy for AI" closes the loop) ─────────────────

// MATRX-EXCEPTION: `?? ""` is the honest default for an explicitly-optional
// slug input (pure string derivation for a rule-stub id, not a boundary write).
function slug(s: string | undefined, fallback: string): string {
  const base = (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return base || fallback;
}

/**
 * Build a ready-to-paste DowngradeRule literal that targets THIS exact error.
 * The agent drops it into DOWNGRADE_RULES, flips `tier`, and writes a reason.
 * We target the most specific signature available (source + code + relation,
 * falling back to a message substring) so the rule fires on this error without
 * accidentally silencing unrelated ones.
 */
export function buildDowngradeRuleStub(e: CapturedError): string {
  const match: ErrorMatch = { source: e.source };
  if (e.code) match.code = e.code;
  if (e.relation) match.relation = e.relation;
  if (e.name) match.name = e.name;
  if (typeof e.status === "number") match.status = e.status;
  // If we have neither code nor relation, anchor on a stable message chunk so
  // the rule is specific enough not to over-match.
  if (!e.code && !e.relation) {
    const chunk = e.message.slice(0, 60).trim();
    if (chunk) match.messageIncludes = chunk;
  }

  const id = [slug(e.source, "error"), slug(e.code ?? e.relation, "")]
    .filter(Boolean)
    .join("-");

  const matchLines = Object.entries(match)
    .map(([k, v]) => `      ${k}: ${JSON.stringify(v)},`)
    .join("\n");

  return `  {
    id: ${JSON.stringify(id || "downgrade-me")},
    tier: "yellow", // change to "orange" for a dot, or keep "yellow" to silence
    reason: "TODO: why this is not a real error",
    addedAt: ${JSON.stringify(new Date().toISOString().slice(0, 10))},
    match: {
${matchLines}
    },
  },`;
}
