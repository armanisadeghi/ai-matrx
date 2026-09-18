// features/masterwork/review/vocabulary.ts
//
// THE EXPERT'S OWN WORDS FOR THE REVIEW — "mine / not mine / mine but wrong".
//
// 🚨 Why this exists (Arman, 2026-09-15): "If the system is getting a result
// that the expert says 'Yes, that's great' or simply gives a thumbs up, then we
// have the most important indication we need." The doctrine says the same in
// `common-docs/systems/masterwork/doctrine/CORE.md` §5 Grading: "Each rule
// carries its origin so the expert can say 'yes, that's mine' rule by rule; the
// review is mine / not mine / mine but wrong, and the last two rows are the
// next session's agenda."
//
// THIS IS WORDING, NEVER A SECOND STATE MACHINE. The four review verbs and the
// statuses under them are unchanged (`RuleDecisionActions`, `ruleState`):
//
//     mine            -> approve
//     not mine        -> reject, with the reason "Not mine."
//     mine but wrong  -> request changes, carrying the Expert's correction
//
// A rule reviewed in either wording lands in exactly the same row state, so a
// Rulebook can be read, built, audited and replayed without anyone knowing
// which words the Expert saw. The guard is
// `features/masterwork/review/__tests__/ownership-review.test.tsx`.
//
// THE KNOB: `masterwork.review` / `vocabulary`.
//   auto (default) — resolve per Rulebook: the ownership words when the expert
//                    behind it is a PERSON we can ask, the standard words when
//                    it is somebody else's material. Asking a reader of a book
//                    "is this rule yours?" is a question they cannot answer.
//   ownership      — the ownership words everywhere in this organization.
//   standard       — approve / reject / request changes everywhere.
//
// Opinions become knobs (law 6): an organization that trains its people on one
// vocabulary sets it once and every Rulebook obeys.

import { useEffectiveKnob } from "@/lib/scoped-config/effectiveKnobs";
import type { Rulebook, RulebookRule } from "../types";

/** The two wordings. `auto` is a KNOB value, never a rendered vocabulary. */
export type ReviewVocabulary = "standard" | "ownership";
export type ReviewVocabularySetting = ReviewVocabulary | "auto";

export const REVIEW_VOCABULARY_KNOB_FEATURE = "masterwork.review";
export const REVIEW_VOCABULARY_KNOB_KEY = "vocabulary";

/** The reason stored on a rule the Expert says is not theirs. */
export const NOT_MINE_REASON = "Not mine.";

export function isReviewVocabularySetting(
  value: unknown,
): value is ReviewVocabularySetting {
  return value === "auto" || value === "standard" || value === "ownership";
}

/**
 * The intake answers that mean the knowledge is SOMEBODY ELSE'S — the two
 * options on "Where does the knowledge live today?" that put no person in the
 * room (`features/masterwork/intake/NewRulebookFlow.tsx`). Matched on the
 * distinctive prefix so a later copy tweak to the helper half cannot silently
 * flip a Rulebook's vocabulary.
 */
const IMPERSONAL_KNOWLEDGE_PREFIXES = ["Someone else's material", "Nothing yet"];

function intakeRecord(rulebook: Rulebook): Record<string, unknown> | null {
  const meta = rulebook.metadata;
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null;
  const intake = (meta as Record<string, unknown>).intake;
  if (!intake || typeof intake !== "object" || Array.isArray(intake)) return null;
  return intake as Record<string, unknown>;
}

/** A rule whose provenance is a person SPEAKING, in any lane. */
function ruleCameFromAPerson(rule: RulebookRule): boolean {
  const ref = rule.source_ref;
  if (!ref) return false;
  return (
    ref.interview === true ||
    typeof ref.conversation_id === "string" ||
    typeof ref.message_id === "string" ||
    (ref.time_range != null && Number.isFinite(ref.time_range.start))
  );
}

/**
 * Is the expert behind this Rulebook a PERSON we can ask "is this yours?"
 *
 * Answered from what the Rulebook already holds, never from a new field:
 *   1. the Expert's own intake answer about where the knowledge lives — the
 *      question they were asked precisely so the system would know this;
 *   2. failing that (older Rulebooks never asked), the rules' own provenance:
 *      an interview, a recording, a chat import or an Oracle tap all mean a
 *      person spoke.
 * A Rulebook distilled only from somebody else's book answers false, and its
 * reviewer keeps the standard words.
 */
export function expertIsAPerson(rulebook: Rulebook): boolean {
  const intake = intakeRecord(rulebook);
  const lives = intake?.knowledge_lives;
  if (typeof lives === "string" && lives.trim()) {
    const answers = lives
      .split("|")
      .map((value) => value.trim())
      .filter(Boolean);
    const personal = answers.filter(
      (answer) =>
        !IMPERSONAL_KNOWLEDGE_PREFIXES.some((prefix) => answer.startsWith(prefix)),
    );
    if (answers.length > 0) return personal.length > 0;
  }
  return (rulebook.rules ?? []).some(ruleCameFromAPerson);
}

/** The knob value + this Rulebook = the words this reviewer actually sees. */
export function resolveReviewVocabulary(
  setting: ReviewVocabularySetting,
  rulebook: Rulebook | null,
): ReviewVocabulary {
  if (setting === "ownership" || setting === "standard") return setting;
  if (!rulebook) return "standard";
  return expertIsAPerson(rulebook) ? "ownership" : "standard";
}

export const REVIEW_VOCABULARY_KNOB_FULL_KEY =
  `${REVIEW_VOCABULARY_KNOB_FEATURE}.${REVIEW_VOCABULARY_KNOB_KEY}` as const;

/**
 * The wording for this Rulebook's review.
 *
 * Read through the LADDER (`platform.knob_resolve`), not the flat register:
 * the row declares `overridable_by = {organization,user}`, and a reader that
 * ignored the rungs would make that declaration a lie — an Expert who set her
 * own wording in Settings would watch the page keep the platform default.
 *
 * Until the read lands, and if it never does, the answer is the per-Rulebook
 * `auto` resolution. That is deliberate and it is NOT a silent stand-in for
 * missing data: both wordings write the same statuses, so the worst case is a
 * reviewer seeing the other set of words, never a review that does not land.
 * Blanking the review buttons over a label would be the real defect.
 */
export function useReviewVocabulary(
  rulebook: Rulebook | null,
  organizationId: string | null | undefined,
  userId: string | null | undefined,
): ReviewVocabulary {
  const raw = useEffectiveKnob(
    organizationId,
    userId,
    REVIEW_VOCABULARY_KNOB_FULL_KEY,
  );
  const setting: ReviewVocabularySetting = isReviewVocabularySetting(raw)
    ? raw
    : "auto";
  return resolveReviewVocabulary(setting, rulebook);
}

/**
 * The labels each wording puts on the SAME verbs. `improve` and `edit` keep
 * their words in both: they are what the Expert does next, not a claim about
 * whose judgment it is.
 */
export const REVIEW_VOCABULARY_LABELS: Record<
  ReviewVocabulary,
  { approve: string; reject: string; requestChanges: string; improve: string; edit: string }
> = {
  standard: {
    approve: "Approve",
    reject: "Reject",
    requestChanges: "Request changes",
    improve: "Improve",
    edit: "Edit",
  },
  ownership: {
    approve: "Mine",
    reject: "Not mine",
    requestChanges: "Mine but wrong",
    improve: "Improve",
    edit: "Edit",
  },
};

/** Hover text — the same promise in each wording, never a different effect. */
export const REVIEW_VOCABULARY_TITLES: Record<
  ReviewVocabulary,
  { approve: string; reject: string; requestChanges: string }
> = {
  standard: {
    approve: "Approve this rule — the only action that approves.",
    reject: "Send it back with your reason.",
    requestChanges: "Say what should change; the rule keeps its current state.",
  },
  ownership: {
    approve: "Yes, that's mine — this is how you actually do it. It counts as approved.",
    reject:
      "You never said this and you don't do it. It leaves your book and goes back to the interviewer.",
    requestChanges:
      "The idea is yours but this got it wrong — say what it should say. It keeps its current state until you approve the fix.",
  },
};
