/**
 * THE ONE typed suggestion payload family for keyword MEANING (C9 / P12).
 *
 * Four things an agent may propose about what a keyword MEANS to a site —
 * a matcher, a worth, a stamp, or an edit to the site's guidelines document —
 * and nothing else. This module is the single definition: it is what the
 * `apply_keyword_meaning` assist action carries, what the review panel renders,
 * what the approval handler replays through the human write paths, and the
 * shape aidream's `keyword_meaning_suggest` tool mirrors byte-for-byte
 * (`aidream/services/keyword_meaning/proposal.py`).
 *
 * 🚨 A PROPOSAL IS NOT A CHANGE. Nothing in this file writes anything. A
 * proposal lives ONLY as a `platform.assists` row until a human approves it —
 * that is the whole of P12: "when the system runs again the next day, the new
 * agent is not going to see the suggestions that have not been approved."
 *
 * Pure types + narrowing + description. No imports from `features/assists`
 * (that module imports THIS one), no data access, no React.
 *
 * SoR: /systems/marketing/seo/seo-keywords/value-system.md § Suggestions
 */

import type { Json } from "@/types/database.types";

/** Matcher kinds, mirroring `dvm_kind_check` on `seo.dimension_value_matcher`. */
export const MATCHER_KINDS = [
  "exact",
  "word",
  "contains",
  "starts_with",
  "ends_with",
  "place",
  "fact",
  "condition",
] as const;
export type MatcherKind = (typeof MATCHER_KINDS)[number];

/** Worth effects, mirroring `svw_effect_check` plus `clear` (remove the row). */
export const WORTH_EFFECTS = ["add", "scale", "never", "clear"] as const;
export type WorthEffect = (typeof WORTH_EFFECTS)[number];

/**
 * Which dimension VALUE the proposal is about, carried with human labels.
 *
 * The labels ride on the payload deliberately: a producer writes human copy at
 * emit time, so the review list never renders an opaque id and never needs a
 * second read to say what it is about (assists FEATURE.md, producer rules).
 */
export interface ProposalValueRef {
  /** `platform.categories.id` of the VALUE (not the dimension). */
  valueId: string;
  /** The dimension's slug, e.g. `traffic_class`. */
  dimensionSlug: string;
  dimensionLabel: string;
  /** The value's SHORT slug (no `dimension:` prefix) — what the RPCs take. */
  valueSlug: string;
  valueLabel: string;
}

export interface MatcherProposal extends ProposalValueRef {
  proposal: "matcher";
  matcherKind: MatcherKind;
  /** Text matchers only. */
  pattern?: string | null;
  /** `place` matchers — `seo.geo_place.id` + its name, for display. */
  placeId?: string | null;
  placeLabel?: string | null;
  /** `fact` matchers — another dimension value's id + its label. */
  factValueId?: string | null;
  factLabel?: string | null;
  /** `condition` matchers — a `seo.gsc_dig_rule.id` + its name. */
  conditionRuleId?: string | null;
  conditionLabel?: string | null;
  notes?: string | null;
}

export interface WorthProposal extends ProposalValueRef {
  proposal: "worth";
  effect: WorthEffect;
  /** Required for `add` and `scale`; ignored for `never` / `clear`. */
  amount?: number | null;
  notes?: string | null;
}

export interface StampProposal extends ProposalValueRef {
  proposal: "stamp";
  keywordIds: string[];
  /** The phrases, in the same order — so the card can show what it will stamp. */
  keywordPhrases: string[];
  notes?: string | null;
}

export interface GuidelineEditProposal {
  proposal: "guideline_edit";
  /**
   * The `guidelines_version` the agent read. Approval refuses on drift rather
   * than silently overwriting an edit the human made in the meantime.
   */
  baseVersion: number;
  /** The FULL proposed document, not a patch — what will be saved verbatim. */
  proposedText: string;
  /** One-line headline only; proposedText is the exact replacement payload. */
  summary: string;
}

export type KeywordMeaningProposal =
  | MatcherProposal
  | WorthProposal
  | StampProposal
  | GuidelineEditProposal;

export type KeywordMeaningProposalKind = KeywordMeaningProposal["proposal"];

/** Who proposed this, and from which run — rendered on the card. */
export interface KeywordMeaningProvenance {
  agentId?: string;
  agentName?: string;
  runId?: string;
  conversationId?: string;
  toolCallId?: string;
  /** Stamped server-side by `seo.keyword_meaning_suggest` (`auth.uid()`). */
  proposedBy?: string;
}

// ── narrowing (the ledger row is Json; a row that will not narrow never renders) ──

function str(v: Json | undefined): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function optStr(v: Json | undefined): string | null | undefined {
  return typeof v === "string" ? v : v === null ? null : undefined;
}

function valueRef(
  obj: Record<string, Json | undefined>,
): ProposalValueRef | null {
  const valueId = str(obj.valueId);
  const dimensionSlug = str(obj.dimensionSlug);
  const valueSlug = str(obj.valueSlug);
  if (!valueId || !dimensionSlug || !valueSlug) return null;
  return {
    valueId,
    dimensionSlug,
    dimensionLabel: str(obj.dimensionLabel) ?? dimensionSlug,
    valueSlug,
    valueLabel: str(obj.valueLabel) ?? valueSlug,
  };
}

export function toKeywordMeaningProposal(
  value: Json | undefined,
): KeywordMeaningProposal | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const obj = value as Record<string, Json | undefined>;
  switch (obj.proposal) {
    case "matcher": {
      const ref = valueRef(obj);
      const matcherKind = MATCHER_KINDS.find((k) => k === obj.matcherKind);
      if (!ref || !matcherKind) return null;
      return {
        ...ref,
        proposal: "matcher",
        matcherKind,
        pattern: optStr(obj.pattern),
        placeId: optStr(obj.placeId),
        placeLabel: optStr(obj.placeLabel),
        factValueId: optStr(obj.factValueId),
        factLabel: optStr(obj.factLabel),
        conditionRuleId: optStr(obj.conditionRuleId),
        conditionLabel: optStr(obj.conditionLabel),
        notes: optStr(obj.notes),
      };
    }
    case "worth": {
      const ref = valueRef(obj);
      const effect = WORTH_EFFECTS.find((e) => e === obj.effect);
      if (!ref || !effect) return null;
      return {
        ...ref,
        proposal: "worth",
        effect,
        amount: typeof obj.amount === "number" ? obj.amount : null,
        notes: optStr(obj.notes),
      };
    }
    case "stamp": {
      const ref = valueRef(obj);
      if (!ref || !Array.isArray(obj.keywordIds)) return null;
      const keywordIds = obj.keywordIds.filter(
        (id): id is string => typeof id === "string",
      );
      if (keywordIds.length === 0) return null;
      const phrases = Array.isArray(obj.keywordPhrases)
        ? obj.keywordPhrases.filter((p): p is string => typeof p === "string")
        : [];
      return {
        ...ref,
        proposal: "stamp",
        keywordIds,
        keywordPhrases: phrases,
        notes: optStr(obj.notes),
      };
    }
    case "guideline_edit": {
      const proposedText = str(obj.proposedText);
      if (proposedText === undefined) return null;
      return {
        proposal: "guideline_edit",
        baseVersion:
          typeof obj.baseVersion === "number" ? obj.baseVersion : 0,
        proposedText,
        summary: str(obj.summary) ?? "Update the keyword guidelines",
      };
    }
    default:
      return null;
  }
}

export function toKeywordMeaningProvenance(
  value: Json | undefined,
): KeywordMeaningProvenance {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const obj = value as Record<string, Json | undefined>;
  return {
    agentId: str(obj.agentId),
    agentName: str(obj.agentName),
    runId: str(obj.runId),
    conversationId: str(obj.conversationId),
    toolCallId: str(obj.toolCallId),
    proposedBy: str(obj.proposedBy),
  };
}

// ── description (used by the card, the review list, and the batch confirm) ──

const MATCHER_KIND_WORDS: Record<MatcherKind, string> = {
  exact: "is exactly",
  word: "contains the word",
  contains: "contains",
  starts_with: "starts with",
  ends_with: "ends with",
  place: "mentions the place",
  fact: "already has",
  condition: "meets the condition",
};

/** What the matcher actually looks at, in the user's words. */
export function matcherTarget(p: MatcherProposal): string {
  switch (p.matcherKind) {
    case "place":
      return p.placeLabel ?? p.placeId ?? "(no place chosen)";
    case "fact":
      return p.factLabel ?? p.factValueId ?? "(no value chosen)";
    case "condition":
      return p.conditionLabel ?? p.conditionRuleId ?? "(no rule chosen)";
    default:
      return p.pattern ?? "(no text)";
  }
}

export interface ProposalDescription {
  /** One line naming the change — the review row's primary text. */
  headline: string;
  /** One line naming the EXACT write that approval performs. */
  writePath: string;
}

/**
 * THE one place a proposal is turned into words. The chip, the card, the
 * review row and the batch-confirm list all read this, so a user can never be
 * shown one description and have a different thing happen.
 */
export function describeKeywordMeaningProposal(
  p: KeywordMeaningProposal,
): ProposalDescription {
  switch (p.proposal) {
    case "matcher":
      return {
        headline: `Find "${p.valueLabel}" when the keyword ${MATCHER_KIND_WORDS[p.matcherKind]} "${matcherTarget(p)}"`,
        writePath: `Adds one ${p.matcherKind} matcher to ${p.dimensionLabel} → ${p.valueLabel}. Nothing is stamped until you re-run the matchers.`,
      };
    case "worth": {
      const effect =
        p.effect === "add"
          ? `add ${(p.amount ?? 0) >= 0 ? "+" : ""}${p.amount ?? 0}`
          : p.effect === "scale"
            ? `scale ×${p.amount ?? 1}`
            : p.effect === "never"
              ? "never (a keyword with this value is worth nothing)"
              : "no worth at all";
      return {
        headline: `Make "${p.valueLabel}" worth: ${effect}`,
        writePath: `Sets this site's worth row for ${p.dimensionLabel} → ${p.valueLabel}. Scores recompute on the next read.`,
      };
    }
    case "stamp": {
      const n = p.keywordIds.length;
      return {
        headline: `Stamp ${n} keyword${n === 1 ? "" : "s"} as "${p.valueLabel}"`,
        writePath:
          p.dimensionSlug === "traffic_class"
            ? `Records your ruling that ${n} keyword${n === 1 ? " is" : "s are"} ${p.valueLabel}. A human ruling outranks every matcher and the AI.`
            : `Stamps ${p.dimensionLabel} → ${p.valueLabel} on ${n} keyword${n === 1 ? "" : "s"} as your own ruling.`,
      };
    }
    case "guideline_edit":
      return {
        headline: p.summary,
        writePath:
          "Replaces this site's keyword guidelines document. Every agent reads the new version from its next run on.",
      };
  }
}

/** Grouping label for the review list. */
export const PROPOSAL_KIND_LABEL: Record<KeywordMeaningProposalKind, string> = {
  matcher: "Matchers",
  worth: "Worth",
  stamp: "Stamps",
  guideline_edit: "Guidelines",
};
