/**
 * Dated changes in plain words — the PURE half shared by the reminder toast, the attention dock
 * and the list page, so all three say the same sentence about the same change.
 *
 * Every sentence names both values (Arman's rule for this primitive: a refusal always shows what
 * was expected and what was found), never an id, and the date the way the SOURCE stated it.
 */

import { formatDistanceStrict } from "date-fns";
import type { DatedChange, DatedChangeAttention } from "./service";

export const DATED_CHANGES_PAGE_HREF = "/administration/automation/scheduling/dated-changes";
export const OFFERINGS_PAGE_HREF = "/administration/ai/ai-models/offerings";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function money(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
}

function tokens(n: unknown): string {
  if (typeof n !== "number") return "";
  return n >= 1000 ? `${Math.round(n / 1000)}K` : String(n);
}

/** `$0.75 in / $3.75 out / $0.075 cached` — one tier, or each tier with its ceiling. */
export function formatPricing(value: unknown): string {
  if (!Array.isArray(value) || value.length === 0) return "no price";
  const tiers = value.filter((t): t is Record<string, unknown> => !!t && typeof t === "object");
  const one = (t: Record<string, unknown>) =>
    [
      money(t.input_price) && `${money(t.input_price)} in`,
      money(t.output_price) && `${money(t.output_price)} out`,
      money(t.cached_input_price) && `${money(t.cached_input_price)} cached`,
    ]
      .filter(Boolean)
      .join(" / ");
  if (tiers.length === 1) return one(tiers[0]);
  return tiers
    .map((t) => (t.max_tokens == null ? `above: ${one(t)}` : `up to ${tokens(t.max_tokens)} tokens: ${one(t)}`))
    .join("; ");
}

/** "January 1, 2027 (America/Los_Angeles)" — the local date the source stated, with its zone. */
export function formatEffective(change: Pick<DatedChange, "effectiveLocal" | "timeZone">): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(change.effectiveLocal);
  if (!m) return change.effectiveLocal;
  const [, y, mo, d, hh, mm] = m;
  const date = `${MONTHS[Number(mo) - 1]} ${Number(d)}, ${y}`;
  const time = hh === "00" && mm === "00" ? "" : ` at ${hh}:${mm}`;
  const zone = change.timeZone ? ` (${change.timeZone.replace(/_/g, " ")})` : " (no time zone stated — read as UTC for now)";
  return `${date}${time}${zone}`;
}

function distance(fromIso: string, now: number): string {
  try {
    return formatDistanceStrict(new Date(fromIso), new Date(now));
  } catch {
    return "some time";
  }
}

function lagText(seconds: unknown): string | null {
  if (typeof seconds !== "number" || seconds <= 600) return null;
  const hours = seconds / 3600;
  return hours >= 1 ? `${Math.round(hours)} hour${Math.round(hours) === 1 ? "" : "s"}` : `${Math.round(seconds / 60)} minutes`;
}

export interface DatedChangeWords {
  /** The record's name: "gemini-3.8-flash price". */
  title: string;
  /** Short state: "refused", "due in 94 days", "applied 2 hours ago". */
  state: string;
  sentence: string;
  severity: "critical" | "warning";
  /** Toast headline. */
  headline: string;
  /** Refused, failed, overdue, drift and an unconfirmed time zone can never be dismissed or muted. */
  dismissible: boolean;
}

const CRITICAL = new Set<DatedChangeAttention>(["refused", "failed", "overdue"]);

export function describeDatedChange(change: DatedChange, now: number = Date.now()): DatedChangeWords {
  const label = change.targetLabel ?? "A model";
  const title = `${label} price`;
  const expected = formatPricing(change.expected);
  const next = formatPricing(change.newValue);
  const when = formatEffective(change);
  const kind = change.attention;
  const outcome = change.outcome;
  const dismissible = change.mutable;
  const severity = kind && CRITICAL.has(kind) ? "critical" : "warning";

  switch (kind) {
    case "refused": {
      const observed = outcome.observed !== undefined ? formatPricing(outcome.observed) : null;
      const base = typeof outcome.sentence === "string" ? outcome.sentence : "This change was refused. Nothing was changed.";
      return {
        title,
        state: "refused",
        sentence: observed
          ? `${base} Expected ${expected}; found ${observed}; it would have set ${next} per million tokens. Set the price by hand or schedule a corrected change, then mark this resolved.`
          : `${base} Mark this resolved once the price is right.`,
        severity,
        headline: `Refused: ${title} change on ${when}`,
        dismissible,
      };
    }
    case "failed": {
      const err = typeof outcome.error === "string" ? ` The database said: ${outcome.error}.` : "";
      return {
        title,
        state: "failed",
        sentence: `Applying the ${title} change due ${when} raised an error, so nothing was changed.${err} It will not be retried on its own: fix the cause, then set the price by hand or schedule it again, and mark this resolved.`,
        severity,
        headline: `Failed: ${title} change on ${when}`,
        dismissible,
      };
    }
    case "overdue":
      return {
        title,
        state: `overdue by ${distance(change.effectiveAt, now)}`,
        sentence: `The ${title} change (${expected} → ${next} per million tokens) was due ${when} and has not been applied — the runner that applies dated changes is off or failing. Every call since then has been costed at the old price.`,
        severity,
        headline: `Overdue: ${title} change`,
        dismissible,
      };
    case "drift": {
      const later =
        JSON.stringify(change.projectedExpected) !== JSON.stringify(change.currentValue)
          ? ` (after the changes scheduled before it, it will be ${formatPricing(change.projectedExpected)})`
          : "";
      return {
        title,
        state: `will be refused on ${when.split(" (")[0]}`,
        sentence: `The ${title} is ${formatPricing(change.currentValue)} today${later}, but this change expects ${expected}. On ${when} it will be refused and change nothing unless the price or the change is corrected — cancel and schedule it again with the right expected price.`,
        severity,
        headline: `Will be refused: ${title} change`,
        dismissible,
      };
    }
    case "zone_unconfirmed":
      return {
        title,
        state: `changes in ${distance(change.effectiveAt, now)}`,
        sentence: `Confirm the time zone this change uses. The ${title} changes from ${expected} to ${next} per million tokens on ${when}, but the source names no time zone, so it will apply at midnight UTC unless you say otherwise. Open it and set the provider's time zone (or UTC) before then.`,
        severity,
        headline: `${title} change: time zone not stated`,
        dismissible,
      };
    case "upcoming":
      return {
        title,
        state: `changes in ${distance(change.effectiveAt, now)}`,
        sentence: `The ${title} changes from ${expected} to ${next} per million tokens on ${when}. ${change.reason}`,
        severity,
        headline: `Coming up: ${title} change`,
        dismissible,
      };
    case "applied": {
      const lag = lagText(outcome.lag_seconds);
      const early = outcome.already_at_new_value === true;
      const late = lag
        ? ` It applied ${lag} late; calls between ${when} and then were costed at the old price.`
        : "";
      return {
        title,
        state: `applied ${change.appliedAt ? `${distance(change.appliedAt, now)} ago` : ""}`.trim(),
        sentence: early
          ? `The ${title} was already ${next} when its date came — someone changed it early — so nothing needed changing.`
          : `The ${title} is now ${next} per million tokens.${late}`,
        severity,
        headline: `Applied: ${title} change`,
        dismissible,
      };
    }
    default:
      return {
        title,
        state: change.status,
        sentence: `${expected} → ${next} per million tokens on ${when}.`,
        severity: "warning",
        headline: title,
        dismissible: true,
      };
  }
}
