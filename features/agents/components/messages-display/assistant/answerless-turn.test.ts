import { isAnswerlessTurn, type AnswerlessTurnInput } from "./answerless-turn";

/**
 * The witness for the production case found on 2026-09-18: `Quick Test Agent`
 * on `/agents/92c37a37-…/build` reported "Worked for 1.2s", showed the full
 * action bar, and rendered no answer and no error. Before the fix this case
 * returned no signal at all — the component had no notion of an empty answer,
 * so the screen showed an empty bubble the person could like, copy and speak.
 */
const settledEmptyAnswer: AnswerlessTurnInput = {
  isTurnAnswer: true,
  isStreamActive: false,
  failed: false,
  coldMarkdownReady: true,
  messageId: "1f0a3b2c-0000-4000-8000-000000000001",
  renderedText: "",
  attachmentCount: 0,
  mediaBlockCount: 0,
};

describe("isAnswerlessTurn", () => {
  it("flags the settled turn that produced no answer at all", () => {
    expect(isAnswerlessTurn(settledEmptyAnswer)).toBe(true);
  });

  it("flags whitespace-only output — a blank line is not an answer", () => {
    expect(
      isAnswerlessTurn({ ...settledEmptyAnswer, renderedText: "\n  \t \n" }),
    ).toBe(true);
  });

  it("stays silent while the answer is still streaming", () => {
    expect(
      isAnswerlessTurn({ ...settledEmptyAnswer, isStreamActive: true }),
    ).toBe(false);
  });

  it("stays silent on a failed turn — the error card speaks for it", () => {
    expect(isAnswerlessTurn({ ...settledEmptyAnswer, failed: true })).toBe(
      false,
    );
  });

  it("stays silent on an intermediate iteration of an agentic turn", () => {
    // The server reserves one cx_message per iteration; a tool-call iteration
    // carries no text and is NOT the answer.
    expect(
      isAnswerlessTurn({ ...settledEmptyAnswer, isTurnAnswer: false }),
    ).toBe(false);
  });

  it("stays silent before the row settles", () => {
    expect(isAnswerlessTurn({ ...settledEmptyAnswer, messageId: null })).toBe(
      false,
    );
  });

  it("stays silent while a cold-load skeleton is still standing in", () => {
    expect(
      isAnswerlessTurn({ ...settledEmptyAnswer, coldMarkdownReady: false }),
    ).toBe(false);
  });

  it("stays silent when the answer is an attachment rather than text", () => {
    expect(
      isAnswerlessTurn({ ...settledEmptyAnswer, attachmentCount: 1 }),
    ).toBe(false);
  });

  it("stays silent when the answer is generated media rather than text", () => {
    expect(
      isAnswerlessTurn({ ...settledEmptyAnswer, mediaBlockCount: 1 }),
    ).toBe(false);
  });

  it("stays silent when there is real text", () => {
    expect(
      isAnswerlessTurn({ ...settledEmptyAnswer, renderedText: "WATCHABLE TEST OK" }),
    ).toBe(false);
  });
});
