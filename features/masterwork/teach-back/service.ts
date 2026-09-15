// features/masterwork/teach-back/service.ts
//
// THE TEACH-BACK — the client half's pure part: the wire shape, the parser, the
// sentences, and the knobs this lane obeys.
//
// Server half: `aidream/aidream/services/distillation/teach_back.py`
// (`POST /masterworks/teach-back`). Doctrine:
// `common-docs/systems/masterwork/doctrine/CORE.md` §5 (grading is extraction —
// every rule carries its origin so the Expert can say "yes, that's mine") and
// §7 (that sentence is the release gate).
//
// THE SESSION LIVES HERE, NOT ON THE SERVER. Every round is one HTTP call, and
// the request carries the rounds so far, because the screen is the only thing
// that knows what the Expert has actually heard. That is what makes a
// teach-back resumable in the ordinary way — a durable run pointer and a
// rejoin — instead of needing a bespoke session row nothing else in Masterwork
// has. Same shape as the Bad Example probe, for the same reason.

import type { paths } from "@/types/python-generated/api-types";

/**
 * Served by `aidream/aidream/services/distillation/teach_back.py`.
 *
 * Cast pending the OpenAPI type sync, the precedent the unfolding, prediction
 * and probe lanes all set: `pnpm sync-types` needs a machine with database
 * access. Until it runs, a wrong path fails LOUDLY with the real HTTP error and
 * everything else on this screen stays typed. Remedy: `pnpm sync-types`.
 */
export const TEACH_BACK_PATH = "/masterworks/teach-back" as keyof paths;

/** The feature these knobs belong to — registered by
 *  `aidream/scripts/seed_teach_back_approach.py`. */
export const TEACH_BACK_KNOB_FEATURE = "masterwork.teach_back";

/**
 * The values the knobs START at, declared here so a missing row degrades into a
 * visible warning rather than a broken screen. NOT a fallback the system settles
 * into: the banner names the problem every time it is used.
 */
export const DECLARED_KNOB_DEFAULTS = {
  rounds: 6,
  explanation_seconds: 60,
  voice_default_on: true,
};

/** `rulebook` = built from what the Expert has given us. `generalist` = they
 *  have given us nothing yet, and the explanation says so out loud. */
export type TeachBackBasis = "rulebook" | "generalist";

/** One round of a teach-back session, exactly as the wire carries it. */
export interface TeachBackRound {
  /** The ONE decision this round explained back, in the Expert's words. */
  subject: string;
  /** The explanation exactly as it was shown and spoken. */
  explanation: string;
  basis: TeachBackBasis | "";
  /**
   * The Rulebook rule ids this explanation leaned on. THESE are the rules a
   * "yes, that's it" signs — carried back so the server stamps exactly the
   * rules that were on screen, never whatever the Rulebook holds by then.
   */
  rule_ids: string[];
  /** The Expert's own words. Empty until they answer this round. */
  correction: string;
}

/** The terminal `masterwork_teach_back_round` payload. */
export interface TeachBackRoundResult {
  rulebookId: string;
  rulebookVersion: number;
  /**
   * The durable run this round ran under — the SUBJECT the Expert's signature
   * is written against (`masterwork.expert_signature` on
   * `platform.output_feedback`). Empty when the run was not durable, and the
   * screen then says the sign-off cannot be recorded rather than faking it.
   */
  runId: string;
  roundIndex: number;
  roundCount: number;
  done: boolean;
  doneReason: string;
  subject: string;
  explanation: string;
  basis: TeachBackBasis | "";
  ruleIdsCited: string[];
  uncertainPart: string;
  /**
   * WHICH round this call actually distilled, or 0 when there was nothing to
   * distil (round one, or "yes, that's it" pressed without correcting first).
   *
   * 🚨 NEVER DERIVED FROM `rulesAdded`. Zero rules from a correction and zero
   * rules because nobody corrected anything are different facts, and "nothing
   * new came out of that one" is a LIE about the second — which is exactly what
   * the live sign-off screen said on 2026-09-15 before this field existed.
   */
  distilledRound: number;
  rulesAdded: number;
  ruleIds: string[];
  duplicatesSkipped: number;
  quotesVerified: number;
  quotesUnverified: number;
  signedRuleIds: string[];
  signatureNote: string;
  alreadyDistilled: boolean;
  answeredRounds: number;
}

/**
 * Narrow the terminal document, or reject it loudly.
 *
 * `round_index` + `round_count` are the discriminator: a payload without them
 * is not a teach-back round, and adopting it would leave the screen showing the
 * previous explanation beside the next round's counts.
 */
export function parseTeachBackRound(raw: unknown): TeachBackRoundResult | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  if (!("round_index" in data) || !("round_count" in data)) return null;
  const ids = Array.isArray(data.rule_ids) ? data.rule_ids : [];
  const cited = Array.isArray(data.rule_ids_cited) ? data.rule_ids_cited : [];
  const signed = Array.isArray(data.signed_rule_ids) ? data.signed_rule_ids : [];
  const already = Array.isArray(data.already_distilled)
    ? data.already_distilled
    : [];
  const basis = String(data.basis ?? "");
  return {
    rulebookId: String(data.rulebook_id ?? ""),
    rulebookVersion: Number(data.rulebook_version ?? 0),
    runId: String(data.run_id ?? ""),
    roundIndex: Number(data.round_index ?? 0),
    roundCount: Number(data.round_count ?? 0),
    done: Boolean(data.done),
    doneReason: String(data.done_reason ?? ""),
    subject: String(data.subject ?? ""),
    explanation: String(data.explanation ?? ""),
    // A value we do not recognise is dropped rather than rendered: the screen
    // says whose judgment this is, and a word we cannot read is not an answer.
    basis: basis === "rulebook" || basis === "generalist" ? basis : "",
    ruleIdsCited: cited.map((id) => String(id)),
    uncertainPart: String(data.uncertain_part ?? ""),
    distilledRound: Number(data.distilled_round ?? 0),
    rulesAdded: Number(data.rules_added ?? 0),
    ruleIds: ids.map((id) => String(id)),
    duplicatesSkipped: Number(data.duplicates_skipped ?? 0),
    quotesVerified: Number(data.quotes_verified ?? 0),
    quotesUnverified: Number(data.quotes_unverified ?? 0),
    signedRuleIds: signed.map((id) => String(id)),
    signatureNote: String(data.signature_note ?? ""),
    alreadyDistilled: already.length > 0,
    answeredRounds: Number(data.answered_rounds ?? 0),
  };
}

/**
 * WHOSE JUDGMENT IS ON SCREEN — the sentence above every explanation.
 *
 * 🚨 A generalist explanation presented as "here's what we learned from you"
 * would be the platform lying about the one thing it sells: one person's
 * deviation from the consensus (CORE.md §2). So the basis is never decorative,
 * never derived from a rule count, and never silent.
 */
export function describeBasis(basis: TeachBackBasis | ""): string {
  if (basis === "generalist") {
    return (
      "You haven't given us anything yet, so this is how anyone competent would " +
      "do it — not you. Everything you correct from here is your method."
    );
  }
  if (basis === "rulebook") {
    return "This is built from what you've already told us. Some of it will be wrong.";
  }
  // NOTHING FAILS SILENTLY: we do not know, and we say we do not know rather
  // than picking the flattering half.
  return (
    "We couldn't tell whether this was built from your rules or from general " +
    "practice — read it as a stranger's guess until you've corrected it."
  );
}

/**
 * What the last correction was worth, in the Expert's words.
 *
 * ZERO IS AN HONEST ANSWER AND SAYS SO. A correction that carried no reusable
 * judgment writes no rule, and the screen has to be able to say that without
 * reading as a failure — otherwise the Expert learns to pad their answers.
 */
export function describeCorrection(
  result: TeachBackRoundResult,
): string | null {
  if (result.alreadyDistilled) {
    return (
      "We had already turned that correction into rules, so nothing was added a " +
      "second time. Your rules from it are on the Rulebook."
    );
  }
  // Nothing was submitted this round — round one, or they signed off without
  // correcting anything. Saying "nothing new came out of that one" here talks
  // about an answer they never gave.
  if (result.distilledRound === 0) return null;
  if (result.rulesAdded === 0) {
    return (
      "Nothing new came out of that one — either it's already one of your " +
      "rules, or what you said was about this one case rather than something " +
      "you'd apply again. Both are fine; keep going."
    );
  }
  const plural = result.rulesAdded === 1 ? "rule" : "rules";
  const skipped = result.duplicatesSkipped
    ? `, skipping ${result.duplicatesSkipped} you already have`
    : "";
  const unverified = result.quotesUnverified
    ? ` ${result.quotesUnverified} could not be matched word-for-word to what you said and is flagged for you to check.`
    : "";
  return (
    `That became ${result.rulesAdded} draft ${plural}${skipped} — waiting on ` +
    `the Rulebook for you to approve.${unverified}`
  );
}

/** The request body for one round. */
export interface TeachBackRequestBody extends Record<string, unknown> {
  rulebook_id: string;
  rounds: TeachBackRound[];
  agreed: boolean;
  topic?: string;
  signature_subject_id?: string;
  round_cap?: number;
  source_note?: string;
}

/**
 * THE ONE PLACE the wire body is built — the screen and its guard both go
 * through it, the precedent `buildProbeRequest` set on the probe lane.
 *
 * `agreed` and the rounds are the whole contract: the server distils the LAST
 * round's correction and then decides whether to explain again, so a screen
 * that sent the rounds in the wrong order, or dropped an unanswered one, would
 * silently re-explain ground the Expert already closed.
 *
 * `signature_subject_id` rides along ONLY on the agreeing call, and it is the
 * run id of the round being signed — the same subject the client wrote its
 * `masterwork.expert_signature` verdict against, so the stamp on the rules and
 * the verdict row point at one another.
 */
export function buildTeachBackRequest(input: {
  rulebookId: string;
  topic: string;
  rounds: TeachBackRound[];
  agreed: boolean;
  signatureSubjectId?: string;
  roundCap?: number;
}): TeachBackRequestBody {
  const subject = input.rounds.length
    ? input.rounds[input.rounds.length - 1].subject
    : "";
  const body: TeachBackRequestBody = {
    rulebook_id: input.rulebookId,
    rounds: input.rounds.map((round) => ({
      subject: round.subject,
      explanation: round.explanation,
      basis: round.basis,
      rule_ids: round.rule_ids,
      correction: round.correction,
    })),
    agreed: input.agreed,
  };
  const topic = input.topic.trim();
  if (topic) body.topic = topic;
  const note = (topic || subject).slice(0, 300);
  if (note) body.source_note = note;
  if (input.agreed && input.signatureSubjectId) {
    body.signature_subject_id = input.signatureSubjectId;
  }
  if (input.roundCap) body.round_cap = input.roundCap;
  return body;
}
