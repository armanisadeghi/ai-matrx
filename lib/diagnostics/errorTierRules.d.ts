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
import type { CapturedError, CapturedErrorSource, CapturedOperation } from "./errorCaptureStore";
import { type ErrorTier } from "./errorTiers";
/** Path to this file — surfaced in the Copy-for-AI payload so an agent knows where to write. */
export declare const TIER_RULES_FILE = "lib/diagnostics/errorTierRules.ts";
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
    /** Case-insensitive regular expression over relation for parameterized endpoints. */
    relationPattern?: string;
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
    /**
     * The producer's own severity verdict, for sources that carry one (today:
     * server stream warnings). A rule can only see this because the capture site
     * passes it as a FIRST-CLASS field — it used to be buried in the stringified
     * `details` blob, where no rule could ever reach it, which is why a
     * self-declared recoverable warning had no way to be anything but red.
     */
    recoverable?: boolean;
    /** The producer's own level, e.g. "low" | "medium" | "high". */
    level?: OneOrMany<string>;
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
    /** False keeps a known local-only class out of the durable repair queue. */
    persist?: boolean;
    /** What this rule targets. */
    match: ErrorMatch;
}
export declare const DOWNGRADE_RULES: DowngradeRule[];
/** True only if the match is non-empty AND every constrained field holds. */
export declare function errorMatchesRule(e: CapturedError, match: ErrorMatch): boolean;
export interface TierClassification {
    tier: ErrorTier;
    /** False means the matched class is useful locally but never actionable durably. */
    persist?: boolean;
    /** The rule that produced a downgrade, if any. */
    ruleId?: string;
    /** The rule's reason, for display. */
    reason?: string;
}
/**
 * Classify a captured error into a display tier. Walks DOWNGRADE_RULES in
 * order; first match wins; default is `red`. Never throws.
 */
export declare function classifyTier(e: CapturedError): TierClassification;
/**
 * Build a ready-to-paste DowngradeRule literal that targets THIS exact error.
 * The agent drops it into DOWNGRADE_RULES, flips `tier`, and writes a reason.
 * We target the most specific signature available (source + code + relation,
 * falling back to a message substring) so the rule fires on this error without
 * accidentally silencing unrelated ones.
 */
export declare function buildDowngradeRuleStub(e: CapturedError): string;
export {};
