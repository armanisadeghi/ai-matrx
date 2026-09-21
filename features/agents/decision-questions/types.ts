/**
 * The `decision_questions` message part — the author-side contract.
 *
 * Canonical contract: `common-docs/systems/agents/typed-messages/FEATURE.md`
 * ("Part `decision_questions`"). A question asks the model for ONE typed
 * answer about the STATE, and the state is the OTHER parts of the same
 * message — never something this part carries.
 *
 * THE PART ITSELF IS THE SERVER'S. `DecisionQuestionsPart` below is
 * `Extract<UserInputPart, { type: "decision_questions" }>` from the generated
 * OpenAPI union, exactly like `TextBlock` — the local duplicate that stood
 * here until the server lane landed the part in that union is gone, so a
 * field the server adds arrives with the next `pnpm sync-types` instead of
 * drifting. What stays local is the AUTHORING ergonomics the wire contract
 * deliberately does not carry: the per-type criteria shapes (the generated
 * `criteria` is the union of all three), the constructor, and the
 * loose-record readers.
 */

import type { UserInputPart } from "@/features/agents/types/request.types";

/** `noul` is the platform's yes/no answer type (Yes/No in the UI). */
export type DecisionQuestionType = "noul" | "choice" | "score";

/**
 * Yes/No clarifiers. Both optional — the instruction may stand alone.
 *
 * A present key carries a real description: the server's contract is
 * `criteria: dict[str, str]`, so a null value is REFUSED (422), not read as
 * "no description". Omit the key instead.
 */
export type NoulCriteria = {
  true?: string;
  false?: string;
  // A TYPE, never an interface: only a type alias carries the implicit index
  // signature that makes it assignable to the wire's `dict[str, str]`, and an
  // interface here forced every writer through a cast.
};

/** 2–255 named options, each with a description (the server requires one). */
export type ChoiceCriteria = Record<string, string>;

/** 2–10 ordered levels, lowest first. */
export type ScoreCriteria = string[];

export interface DecisionQuestionSpec {
  /** Output field name — snake_case, unique inside the part. */
  name: string;
  type: DecisionQuestionType;
  /** The question itself. A slot: `{{variable}}` works. */
  instructions: string;
  criteria?: NoulCriteria | ChoiceCriteria | ScoreCriteria | null;
  /** The author's hint only. The consumer decides the cut. */
  suggested_threshold?: number | null;
}

/**
 * 🚨 BOTH KEYS, ALWAYS. `__kind` is the kind marker and is DATA (the __kind
 * law); `type` is how EVERY message-part reader on the platform dispatches —
 * aidream's `reconstruct_content` reads `block.get("type", "text")` and its
 * `_content_type` reads `type` alone, so a part stored with only `__kind`
 * arrives at the provider layer as an empty TEXT block and the decision is
 * never found (`DecisionQuestionsMissing`). The generated part makes `__kind`
 * optional because the server defaults it; every writer HERE declares both,
 * which is what `newDecisionQuestionsPart` is for.
 */
export type DecisionQuestionsPart = Extract<
  UserInputPart,
  { type: "decision_questions" }
>;

/** One question exactly as the server declares it on the wire. */
export type DecisionQuestionWire = DecisionQuestionsPart["questions"][number];

export const DECISION_QUESTIONS_KIND = "decision_questions" as const;

/** The ONE constructor for the part — both keys, never one. */
export function newDecisionQuestionsPart(
  questions: DecisionQuestionSpec[],
): DecisionQuestionsPart {
  return {
    __kind: DECISION_QUESTIONS_KIND,
    type: DECISION_QUESTIONS_KIND,
    questions,
  };
}

/** Contract bounds from FEATURE.md — not taste, not adjustable per surface. */
export const CHOICE_OPTION_MIN = 2;
export const CHOICE_OPTION_MAX = 255;
export const SCORE_LEVEL_MIN = 2;
export const SCORE_LEVEL_MAX = 10;

/**
 * The discriminator for a message content part.
 *
 * Kinds discriminate on `__kind`; the older media/text parts discriminate on
 * `type`. One reader so no surface has to know which era a part came from.
 */
export function partKind(part: Record<string, unknown>): string {
  const kind = part.__kind;
  if (typeof kind === "string" && kind) return kind;
  const type = part.type;
  return typeof type === "string" ? type : "";
}

export function isDecisionQuestionsPart(
  part: Record<string, unknown> | null | undefined,
): part is Record<string, unknown> & DecisionQuestionsPart {
  return !!part && partKind(part) === DECISION_QUESTIONS_KIND;
}

/** Read the questions out of a loose part record without trusting its shape. */
export function readQuestions(
  part: Record<string, unknown> | null | undefined,
): DecisionQuestionSpec[] {
  if (!part) return [];
  const raw = (part as { questions?: unknown }).questions;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (q): q is DecisionQuestionSpec =>
      !!q && typeof q === "object" && !Array.isArray(q),
  );
}
