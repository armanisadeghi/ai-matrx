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
 *
 * =============================================================================
 * 🚨 THE DETECTOR MUST LOOK WHERE THE PERSON IS LOOKING (walk 18, defect C)
 * =============================================================================
 *
 * On production 2026-09-21, twice in five interview turns, this notice printed
 * DIRECTLY UNDER a 170-word question the interviewer had just written, on the
 * product's most important capture surface. The turn was not empty; the
 * detector was looking at the wrong thing.
 *
 * Root cause, read off the walk's own rows (`chat.message`, conversation
 * `e9e9b52a-…`, positions 22–27): a live turn renders from the STREAM, not
 * from the persisted row. `AgentAssistantMessage`'s "lifetime rule" keeps
 * `MarkdownStream` bound to `requestId` for the whole session, so the words on
 * screen come from `activeRequests.byRequestId[…].renderBlocks` — while this
 * decision was fed `extractFlatText(record)`, which is `""` until (and unless)
 * the end-of-stream commit lands on that row. Two different sources, one of
 * them the one nobody was reading. That is why it was intermittent, why one
 * turn cleared "within a second or two" (the commit landed) and why the other
 * needed a reload (hydration re-read the row from the DB, where the text had
 * been all along).
 *
 * So the rule is now stated once, structurally: EVERY PERSON-VISIBLE OUTPUT
 * KIND COUNTS AS AN ANSWER — the streamed blocks actually on screen, the
 * persisted text, attachments, generated media, and typed parts such as
 * `decision_questions` / `decision_answers` (first-class message parts since
 * 2026-09-20, aidream 00a2ae6181 / e9df34bb93), whose whole content is the
 * part and never text. Only the model's own chain-of-thought and its tool work
 * are excluded, because those were exactly what the original defect dressed up
 * as an answer.
 */

/**
 * Message-part types that are NOT an answer a person can read: the model's
 * chain-of-thought and its tool work. Everything else in `cx_message.content`
 * — text, media, attachments, and every typed/structured part — IS output the
 * person sees, and therefore an answer.
 *
 * Deliberately an exclusion list, not an inclusion list: a new Python
 * `MessagePart` variant is person-visible by default, so a kind we have not
 * heard of yet can never be called "nothing came back".
 */
const NON_ANSWER_PART_TYPES: ReadonlySet<string> = new Set([
  "thinking",
  "reasoning",
  "tool_call",
  "tool_result",
]);

/**
 * How many of a row's persisted parts are output a person can see, counting
 * only the ones that are NOT plain text (the text is measured separately, as
 * `renderedText`, because it has to be trimmed).
 *
 * Exported so the guard can assert it over the real part shapes the platform
 * writes, rather than over a hand-made stand-in.
 */
export function countPersonVisibleParts(
  parts: ReadonlyArray<{ type?: string | null }> | null | undefined,
): number {
  if (!parts) return 0;
  let count = 0;
  for (const part of parts) {
    const type = part?.type ?? "text";
    if (type === "text") continue;
    if (NON_ANSWER_PART_TYPES.has(type)) continue;
    count += 1;
  }
  return count;
}

/**
 * Tools whose call ENDS the turn to wait for a person (an agent asking for a
 * yes, a sign-in, a code). A turn that stops on one of these has not finished:
 * the ask's own card is its status, and it resumes when the person answers.
 */
const PERSON_WAITING_TOOLS: ReadonlySet<string> = new Set(["ask_person"]);

/**
 * True when a persisted row ends its turn by asking the person — it carries a
 * `tool_call` part for a {@link PERSON_WAITING_TOOLS} tool. Used after a reload,
 * when the live stream's suspension signal is gone and only the row remains.
 */
export function rowAsksThePerson(
  parts: ReadonlyArray<{ type?: string | null; name?: string | null }> | null | undefined,
): boolean {
  if (!parts) return false;
  return parts.some(
    (part) => part?.type === "tool_call" && PERSON_WAITING_TOOLS.has(part?.name ?? ""),
  );
}

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
  /**
   * Typed / structured parts on the row that are neither text nor the model's
   * own thinking or tool work — `decision_questions`, `decision_answers`, and
   * every future `MessagePart` variant. Count with
   * {@link countPersonVisibleParts}.
   */
  typedPartCount: number;
  /**
   * How many blocks THIS TURN ACTUALLY STREAMED onto the screen, excluding
   * thinking / reasoning. While a turn is rendered from its stream source —
   * the whole session, per `AgentAssistantMessage`'s lifetime rule — this, not
   * `renderedText`, is what the person is reading. Zero for a row hydrated
   * from the database, which has no stream behind it.
   */
  streamedAnswerBlockCount: number;
  /**
   * True while the run is suspended waiting on the person — an approval card
   * for a page write, a client tool, or a server tool that parked the turn to
   * ask the person (`ask_person`: the stream's `suspended_awaiting_client`
   * info, or a row ending on that tool call after a reload). The turn has not
   * finished, so it must never say it "finished without writing an answer"
   * (seen live 2026-09-26 under a pending "Formula for one step" card, and
   * under an open sign-in ask). Optional: absent = false.
   */
  awaitingPerson?: boolean;
}

/**
 * True when this settled, unfailed answer has nothing at all to show, so the
 * screen must say that in words instead of rendering an empty bubble.
 */
export function isAnswerlessTurn(input: AnswerlessTurnInput): boolean {
  if (!input.isTurnAnswer) return false;
  if (input.isStreamActive) return false;
  if (input.awaitingPerson) return false;
  if (input.failed) return false;
  if (!input.coldMarkdownReady) return false;
  if (!input.messageId) return false;
  if (input.attachmentCount > 0) return false;
  if (input.mediaBlockCount > 0) return false;
  if (input.typedPartCount > 0) return false;
  if (input.streamedAnswerBlockCount > 0) return false;
  return input.renderedText.trim().length === 0;
}
