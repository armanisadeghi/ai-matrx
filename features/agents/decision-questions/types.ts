/**
 * The `decision_questions` message part — the author-side contract.
 *
 * Canonical contract: `common-docs/systems/agents/typed-messages/FEATURE.md`
 * ("Part `decision_questions`"). A question asks the model for ONE typed
 * answer about the STATE, and the state is the OTHER parts of the same
 * message — never something this part carries.
 *
 * 🚨 TEMPORARY LOCAL TYPE. The server lane is adding `decision_questions` to
 * the OpenAPI `UserInputPart` union. WHEN `types/python-generated/api-types.ts`
 * carries it, delete `DecisionQuestionsPart` below and re-export
 * `Extract<UserInputPart, { __kind: "decision_questions" }>` from
 * `features/agents/types/message-types.ts` exactly like `TextBlock` does —
 * this file must never outlive the generated union.
 */

/** `noul` is the platform's yes/no answer type (Yes/No in the UI). */
export type DecisionQuestionType = "noul" | "choice" | "score";

/** Yes/No clarifiers. Both optional — the instruction may stand alone. */
export interface NoulCriteria {
  true?: string | null;
  false?: string | null;
}

/** 2–255 named options, each with an optional description. */
export type ChoiceCriteria = Record<string, string | null>;

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

export interface DecisionQuestionsPart {
  __kind: "decision_questions";
  questions: DecisionQuestionSpec[];
}

export const DECISION_QUESTIONS_KIND = "decision_questions" as const;

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
