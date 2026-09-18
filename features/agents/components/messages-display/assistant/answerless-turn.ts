/**
 * THE ANSWERLESS TURN — a run that finished and produced no answer must SAY SO.
 *
 * Found on production 2026-09-18 on the exact screen a person watches an agent
 * work (`/agents/<id>/build` and `/agents/<id>/run`): a turn rendered
 * "Worked for 1.2s", a full action bar (like / dislike / copy / speak / edit /
 * share) — and nothing else. No text, no error, no remedy. The model had
 * returned an empty answer, and the screen dressed that as a successful reply
 * the person could rate and copy.
 *
 * That is law 4 (nothing fails silently) breaking at the worst possible place:
 * the surface where a non-technical Expert judges whether the agent he just
 * instructed did its job. He cannot tell "the agent said nothing" from "the
 * answer failed to render".
 *
 * The decision lives here as a pure function, apart from the 600-line render
 * component, so it can be proven failing-then-passing without a browser
 * (`answerless-turn.test.ts`). The render component owns only the words.
 *
 * WHAT IS *NOT* ANSWERLESS — every one of these was a live case in the wild:
 *   - a turn still streaming (the answer has not arrived yet);
 *   - a FAILED turn — `AssistantError` already speaks for it, with Retry;
 *   - an intermediate iteration of a multi-step agentic turn: the server
 *     reserves one `cx_message` per iteration and only the LAST one carries the
 *     answer, so a tool-call iteration legitimately has no text;
 *   - a turn whose answer is media or an attachment rather than text;
 *   - a row that has not settled yet (no `messageId`), or whose markdown is
 *     still deferred on a cold load — both are "not known yet", never "empty".
 */

export interface AnswerlessTurnInput {
  /** Is this member the turn's ANSWER (the last one), not an intermediate step? */
  isTurnAnswer: boolean;
  /** True while this row is the active streaming bubble. */
  isStreamActive: boolean;
  /** True when the turn failed — the error path owns that case. */
  failed: boolean;
  /** False while a cold-load skeleton stands in for the persisted markdown. */
  coldMarkdownReady: boolean;
  /** `cx_message.id`; null/undefined until the row settles. */
  messageId: string | null | undefined;
  /** The text this turn renders (citation markers included). */
  renderedText: string;
  /** Attachment parts on the row (documents, resource parts). */
  attachmentCount: number;
  /** Non-text content blocks (generated image / audio / video, data events). */
  mediaBlockCount: number;
}

/**
 * True when this settled, unfailed answer has nothing at all to show, so the
 * screen must say that in words instead of rendering an empty bubble.
 */
export function isAnswerlessTurn(input: AnswerlessTurnInput): boolean {
  if (!input.isTurnAnswer) return false;
  if (input.isStreamActive) return false;
  if (input.failed) return false;
  if (!input.coldMarkdownReady) return false;
  if (!input.messageId) return false;
  if (input.attachmentCount > 0) return false;
  if (input.mediaBlockCount > 0) return false;
  return input.renderedText.trim().length === 0;
}
