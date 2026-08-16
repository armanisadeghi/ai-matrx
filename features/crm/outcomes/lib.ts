// features/crm/outcomes/lib.ts
//
// Pure core for attribution outcomes (platform.outcome_event, IC-5).
// The jsonb `match_detail` is read ONLY through the narrowers here — never
// poked at raw in a component (the lib/extras.ts convention).
//
// The one idea that matters: attribution takes credit on the LOW BAR (a pitched
// domain + a link inside the 0-90-day window), so the UI's whole defence is the
// evidence drawer — every signal the matcher checked, INCLUDING the ones that
// did not fire, so a human can disagree in one click.

import type { Database } from "@/types/database.types";

export type OutcomeEventRow =
  Database["platform"]["Tables"]["outcome_event"]["Row"];

export type OutcomeStatus = "proposed" | "confirmed" | "rejected";

export interface OutcomeSignal {
  name: string;
  fired: boolean;
  detail: string;
}

export interface OutcomeDetailView {
  signals: OutcomeSignal[];
  competingInteractionIds: string[];
  daysAfterPitch: number | null;
  additionalAppearances: number;
  pitchedDomainSource: string | null;
  explanation: string | null;
  autoConfirmed: boolean;
  humanNote: string | null;
}

const SIGNAL_LABELS: Record<string, string> = {
  domain_window: "Domain + timing window",
  author_match: "Byline matches who you pitched",
  fast_turnaround: "Fast turnaround",
  motivating_record: "The exact link you asked for",
  first_seen_known: "Link's first-seen date is known",
  competing_pitches: "Competing pitches",
};

export function signalLabel(name: string): string {
  return SIGNAL_LABELS[name] ?? name.replace(/_/g, " ");
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function parseOutcomeDetail(matchDetail: unknown): OutcomeDetailView {
  const detail = asRecord(matchDetail);
  const rawSignals = Array.isArray(detail.signals) ? detail.signals : [];
  const signals: OutcomeSignal[] = [];
  for (const raw of rawSignals) {
    const record = asRecord(raw);
    if (typeof record.name === "string" && typeof record.detail === "string") {
      signals.push({
        name: record.name,
        fired: record.fired === true,
        detail: record.detail,
      });
    }
  }
  const competing = Array.isArray(detail.competing_interaction_ids)
    ? detail.competing_interaction_ids.filter(
        (value): value is string => typeof value === "string",
      )
    : [];
  const human = asRecord(detail.human_decision);
  return {
    signals,
    competingInteractionIds: competing,
    daysAfterPitch:
      typeof detail.days_after_pitch === "number" ? detail.days_after_pitch : null,
    additionalAppearances:
      typeof detail.additional_appearances === "number"
        ? detail.additional_appearances
        : 0,
    pitchedDomainSource:
      typeof detail.pitched_domain_source === "string"
        ? detail.pitched_domain_source
        : null,
    explanation:
      typeof detail.explanation === "string" ? detail.explanation : null,
    autoConfirmed: detail.auto_confirmed === true,
    humanNote: typeof human.note === "string" ? human.note : null,
  };
}

export function outcomeDomain(row: OutcomeEventRow): string {
  if (row.evidence_url) {
    try {
      return new URL(row.evidence_url).hostname.replace(/^www\./, "");
    } catch {
      // fall through to the dedupe key
    }
  }
  // dedupe_key = link_appeared:{interaction_id}:{domain}
  const parts = row.dedupe_key.split(":");
  return parts.length >= 3 ? parts.slice(2).join(":") : "a pitched site";
}

/** The verdict sentence — what happened and whether we are sure. */
export function outcomeVerdict(row: OutcomeEventRow): {
  headline: string;
  detail: string;
  tone: "win" | "pending" | "rejected";
} {
  const domain = outcomeDomain(row);
  const parsed = parseOutcomeDetail(row.match_detail);
  const days =
    parsed.daysAfterPitch !== null ? `${parsed.daysAfterPitch} days after your pitch` : "after your pitch";
  if (row.status === "rejected") {
    return {
      headline: `Not our win: ${domain}`,
      detail: `A link from ${domain} appeared ${days}, but a human ruled it was not caused by the pitch.`,
      tone: "rejected",
    };
  }
  if (row.status === "confirmed") {
    return {
      headline: `${domain} linked to you`,
      detail:
        `The link went live ${days}. ` +
        (parsed.autoConfirmed && !row.decided_by
          ? "Credited automatically — one click reverses it if it isn't yours."
          : "Confirmed by a human."),
      tone: "win",
    };
  }
  return {
    headline: `Did ${domain} link because of your pitch?`,
    detail: `A link appeared ${days}, but the evidence is ambiguous — confirm or reject it.`,
    tone: "pending",
  };
}

export function confidenceLabel(confidence: number): string {
  if (confidence >= 75) return "Very likely";
  if (confidence >= 50) return "Likely";
  if (confidence >= 30) return "Uncertain";
  return "Weak";
}

export const OUTCOME_STATUS_LABELS: Record<OutcomeStatus, string> = {
  proposed: "Needs your call",
  confirmed: "Win",
  rejected: "Not ours",
};
