/**
 * THE TRIAL — types and pure logic for the moment the system tries to imitate
 * the expert, and for turning the expert's corrections back into RULES.
 *
 * Arman, 2026-08-24, on what this is for: *"it's not that we want the AI in
 * that conversation to get better at this. We want our RULES to get better so
 * that we can always identify these going forward."* Everything in this file
 * exists to serve that sentence — the stamps the trial produces are a
 * by-product; the matcher proposals are the point.
 *
 * No React, no data access, no agent ids. The agents are reached by MANDATE
 * (`seo.session_stamp_proposer`, `seo.session_rule_writer`); this module only
 * shapes what they are told and narrows what they answer.
 */

import { MANDATE_KEYS } from "@ai-matrx/agents/mandates";
import type { KIND_KEY } from "@ai-matrx/content-ir";
import type { FacetDimension } from "@/features/marketing/seo/value-system/dimensions/data";
import type {
  SeoRulingConfirmationSet,
  SeoRulingCorrectionSet,
  SeoRulingDimensionCatalog,
  SeoRulingExampleSet,
  SeoRulingKeywordSet,
  SeoRulingMatcherHitSet,
  SeoRulingMatcherSet,
} from "@/features/content-ir/kinds/generated/kinds.generated";
import type { MatcherProbeHit, SessionQueueRow } from "./data";

/** The two mandates this loop runs. Never an agent id — see the SoR. */
export const STAMP_PROPOSER_MANDATE = MANDATE_KEYS.seo__session_stamp_proposer;
export const RULE_WRITER_MANDATE = MANDATE_KEYS.seo__session_rule_writer;

/** Matcher kinds a rule proposal may use — the text ones need no foreign id. */
export const TEXT_MATCHER_KINDS = [
  "exact",
  "word",
  "contains",
  "starts_with",
  "ends_with",
] as const;
export type TextMatcherKind = (typeof TEXT_MATCHER_KINDS)[number];

/* ------------------------------------------------- what the human taught */

/**
 * One thing the person said, and why. The reason is not decoration: it is the
 * training material the proposer imitates and the rule writer quotes back
 * (P24).
 */
export interface SessionRuling {
  keywordId: string;
  phrase: string;
  dimensionSlug: string;
  dimensionLabel: string;
  valueId: string;
  valueSlug: string;
  valueLabel: string;
  reason: string;
}

/**
 * Which dimension the trial should answer: the one this person has been
 * ruling. Asking the system to imitate a dimension the human never touched is
 * asking it to guess, and a guess is what the whole loop refuses.
 */
export function trialDimensionSlug(rulings: SessionRuling[]): string | null {
  const tally = new Map<string, number>();
  for (const ruling of rulings) {
    tally.set(ruling.dimensionSlug, (tally.get(ruling.dimensionSlug) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [slug, count] of tally) {
    if (count > bestCount) {
      best = slug;
      bestCount = count;
    }
  }
  return best;
}

/* ------------------------------------------------------ what the trial says */

export type TrialSource = "rule" | "ai";

export interface TrialProposal {
  keywordId: string;
  keyword: string;
  clicks: number;
  impressions: number;
  /** `rule` — this site's own matcher decided it. `ai` — the rules were silent. */
  source: TrialSource;
  valueId: string;
  valueSlug: string;
  valueLabel: string;
  /** One plain sentence saying why, written for the person reading it. */
  reason: string;
  matcherKind?: string | null;
  matcherPattern?: string | null;
}

export type TrialStatus = "unreviewed" | "right" | "wrong";

export interface TrialVerdict {
  proposal: TrialProposal;
  status: TrialStatus;
  /** Set only when the person corrected it. */
  correctedValueId?: string;
  correctedValueSlug?: string;
  correctedValueLabel?: string;
  correctionReason?: string;
}

/** Rule-sourced proposals, straight from the site's own matchers. */
export function proposalsFromMatchers(
  rows: SessionQueueRow[],
  probe: Map<string, MatcherProbeHit[]>,
  dimensionSlug: string,
): TrialProposal[] {
  const out: TrialProposal[] = [];
  for (const row of rows) {
    const hit = probe
      .get(row.keywordId)
      ?.find((candidate) => candidate.dimensionSlug === dimensionSlug);
    if (!hit) continue;
    out.push({
      keywordId: row.keywordId,
      keyword: row.keyword,
      clicks: row.clicks,
      impressions: row.impressions,
      source: "rule",
      valueId: hit.valueId,
      valueSlug: hit.valueSlug,
      valueLabel: hit.valueLabel,
      reason: hit.matcherPattern
        ? `Your own rule: the search ${matcherKindWords(hit.matcherKind)} “${hit.matcherPattern}”.`
        : "Your own rule matched this search.",
      matcherKind: hit.matcherKind,
      matcherPattern: hit.matcherPattern,
    });
  }
  return out;
}

export function matcherKindWords(kind: string): string {
  switch (kind) {
    case "exact":
      return "is exactly";
    case "word":
      return "contains the word";
    case "starts_with":
      return "starts with";
    case "ends_with":
      return "ends with";
    case "place":
      return "mentions the place";
    case "fact":
      return "already carries";
    default:
      return "contains";
  }
}

/* ------------------------------------------ what the agents are told (input) */

/*
 * Every value below is a REGISTERED KIND (aidream `aidream/kinds/seo_ruling_session.py`,
 * offered by the `seo.ruling_session_proposal` / `seo.ruling_session_teach`
 * provisions): an object carrying `__kind` plus ONE list field. A kind is never a
 * bare array, so the builders wrap — the records inside are unchanged.
 */

/**
 * The shapes are the REGISTRY's, never written down here: `kinds.generated.ts`
 * is generated from the live registry (`pnpm shape:types`). A registered kind's
 * `__kind` and its defaulted list field are optional in its generated type
 * (pydantic defaults them), but every builder below always emits both, so the
 * offered type makes every top-level field required.
 */
type Offered<T extends { [KIND_KEY]?: string }> = T & Required<T>;

export type RulingKeywordSet = Offered<SeoRulingKeywordSet>;
export type RulingDimensionCatalog = Offered<SeoRulingDimensionCatalog>;
export type RulingExampleSet = Offered<SeoRulingExampleSet>;
export type RulingMatcherHitSet = Offered<SeoRulingMatcherHitSet>;
export type RulingCorrectionSet = Offered<SeoRulingCorrectionSet>;
export type RulingConfirmationSet = Offered<SeoRulingConfirmationSet>;
export type RulingMatcherSet = Offered<SeoRulingMatcherSet>;

/** The keywords a proposer is asked to stamp. */
export function keywordsPayload(
  rows: Array<{
    keywordId: string;
    keyword: string;
    clicks: number;
    impressions: number;
  }>,
): RulingKeywordSet {
  return {
    __kind: "seo_ruling_keyword_set",
    keywords: rows.map((row) => ({
      keyword_id: row.keywordId,
      phrase: row.keyword,
      clicks: row.clicks,
      impressions: row.impressions,
    })),
  };
}

/** The vocabulary an agent may choose from — nothing outside it is allowed. */
export function dimensionCatalogPayload(
  dimensions: FacetDimension[],
  onlySlug?: string | null,
): RulingDimensionCatalog {
  return {
    __kind: "seo_ruling_dimension_catalog",
    dimensions: dimensions
      .filter((dimension) => (onlySlug ? dimension.slug === onlySlug : true))
      .map((dimension) => ({
        slug: dimension.slug,
        label: dimension.label,
        description: dimension.description,
        values: dimension.values
          .filter((value) => !value.abstain)
          .map((value) => ({
            slug: value.key,
            label: value.label,
            description: value.description,
          })),
      })),
  };
}

export function humanExamplesPayload(
  rulings: SessionRuling[],
): RulingExampleSet {
  return {
    __kind: "seo_ruling_example_set",
    examples: rulings.map((ruling) => ({
      phrase: ruling.phrase,
      dimension_slug: ruling.dimensionSlug,
      dimension_label: ruling.dimensionLabel,
      value_slug: ruling.valueSlug,
      value_label: ruling.valueLabel,
      reason: ruling.reason,
    })),
  };
}

export function matcherHitsPayload(
  proposals: TrialProposal[],
): RulingMatcherHitSet {
  return {
    __kind: "seo_ruling_matcher_hit_set",
    hits: proposals
      .filter((proposal) => proposal.source === "rule")
      .map((proposal) => ({
        phrase: proposal.keyword,
        value_slug: proposal.valueSlug,
        matcher_kind: proposal.matcherKind ?? "contains",
        pattern: proposal.matcherPattern ?? "",
      })),
  };
}

export function correctionsPayload(
  verdicts: TrialVerdict[],
): RulingCorrectionSet {
  return {
    __kind: "seo_ruling_correction_set",
    corrections: verdicts
      .filter(
        (verdict) => verdict.status === "wrong" && verdict.correctedValueSlug,
      )
      .map((verdict) => ({
        phrase: verdict.proposal.keyword,
        proposed_value_slug: verdict.proposal.valueSlug,
        proposed_value_label: verdict.proposal.valueLabel,
        corrected_value_slug: verdict.correctedValueSlug ?? "",
        corrected_value_label: verdict.correctedValueLabel ?? "",
        human_reason: verdict.correctionReason ?? "",
      })),
  };
}

export function confirmationsPayload(
  verdicts: TrialVerdict[],
): RulingConfirmationSet {
  return {
    __kind: "seo_ruling_confirmation_set",
    confirmations: verdicts
      .filter((verdict) => verdict.status === "right")
      .map((verdict) => ({
        phrase: verdict.proposal.keyword,
        value_slug: verdict.proposal.valueSlug,
        value_label: verdict.proposal.valueLabel,
      })),
  };
}

/** The site rules behind rule-sourced proposals (the teach round's context). */
export function existingMatchersPayload(
  verdicts: TrialVerdict[],
): RulingMatcherSet {
  return {
    __kind: "seo_ruling_matcher_set",
    matchers: verdicts
      .filter((verdict) => verdict.proposal.source === "rule")
      .map((verdict) => ({
        value_slug: verdict.proposal.valueSlug,
        matcher_kind: verdict.proposal.matcherKind ?? "contains",
        pattern: verdict.proposal.matcherPattern ?? "",
      })),
  };
}

/* ------------------------------------------ what the agents answer (output) */

export interface AgentStampProposal {
  keywordId: string;
  valueSlug: string;
  confidence: number | null;
  reason: string;
}

/** Narrow the proposer's answer. A row that will not narrow is DROPPED, not guessed. */
export function coerceStampProposals(value: unknown): AgentStampProposal[] {
  const list = pickArray(value, "proposals");
  return list.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const keywordId = str(entry.keyword_id) ?? str(entry.keywordId);
    const valueSlug = str(entry.value_slug) ?? str(entry.valueSlug);
    if (!keywordId || !valueSlug) return [];
    const confidence = entry.confidence;
    return [
      {
        keywordId,
        valueSlug,
        confidence: typeof confidence === "number" ? confidence : null,
        reason: str(entry.reason) ?? "The system thought this fitted.",
      },
    ];
  });
}

export interface AgentRuleProposal {
  valueSlug: string;
  dimensionSlug: string;
  matcherKind: TextMatcherKind;
  pattern: string;
  plainWords: string;
  notes: string | null;
  replacesPattern: string | null;
}

/** Narrow the rule writer's answer. Zero rules is a legitimate, honest answer. */
export function coerceRuleProposals(
  value: unknown,
  fallbackDimensionSlug: string,
): AgentRuleProposal[] {
  const list = pickArray(value, "rules");
  return list.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const valueSlug = str(entry.value_slug) ?? str(entry.valueSlug);
    const pattern = (str(entry.pattern) ?? "").trim().toLowerCase();
    const kind = TEXT_MATCHER_KINDS.find(
      (candidate) =>
        candidate === (str(entry.matcher_kind) ?? str(entry.matcherKind)),
    );
    if (!valueSlug || !pattern || !kind) return [];
    return [
      {
        valueSlug,
        dimensionSlug:
          str(entry.dimension_slug) ??
          str(entry.dimensionSlug) ??
          fallbackDimensionSlug,
        matcherKind: kind,
        pattern,
        plainWords:
          str(entry.plain_words) ??
          str(entry.plainWords) ??
          `Catch searches that ${matcherKindWords(kind)} “${pattern}”.`,
        notes: str(entry.notes) ?? null,
        replacesPattern:
          str(entry.replaces_pattern) ?? str(entry.replacesPattern) ?? null,
      },
    ];
  });
}

/* ------------------------------------------------------------- the scoreboard */

export interface TrialScore {
  reviewed: number;
  right: number;
  wrong: number;
  /** Right as a whole percent, or null when nothing was reviewed. */
  percent: number | null;
  /** The honest headline — never celebratory when the batch went badly. */
  headline: string;
}

export function scoreTrial(verdicts: TrialVerdict[]): TrialScore {
  const right = verdicts.filter((v) => v.status === "right").length;
  const wrong = verdicts.filter((v) => v.status === "wrong").length;
  const reviewed = right + wrong;
  const percent = reviewed === 0 ? null : Math.round((right / reviewed) * 100);
  let headline: string;
  if (reviewed === 0) {
    headline = "Nothing reviewed yet.";
  } else if (percent !== null && percent >= 80) {
    headline = `The system got ${right} of ${reviewed} right (${percent}%).`;
  } else if (percent !== null && percent >= 50) {
    headline = `The system got ${right} of ${reviewed} right (${percent}%) — you had to fix ${wrong}.`;
  } else {
    headline = `The system got this batch mostly WRONG — ${right} of ${reviewed} right (${percent ?? 0}%). Your corrections matter more than usual here.`;
  }
  return { reviewed, right, wrong, percent, headline };
}

/* ------------------------------------------------------------------- helpers */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

/**
 * The agent answers `{ "proposals": [...] }`, but a model that returns the bare
 * array has still answered the question — accept both rather than fail a good
 * run on a wrapper.
 */
function pickArray(value: unknown, key: string): unknown[] {
  if (Array.isArray(value)) return value;
  if (isRecord(value) && Array.isArray(value[key])) return value[key];
  return [];
}
