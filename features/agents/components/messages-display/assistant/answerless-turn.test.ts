import {
  countPersonVisibleParts,
  isAnswerlessTurn,
  rowAsksThePerson,
  type AnswerlessTurnInput,
} from "./answerless-turn";
import { selectRequestAwaitingPerson } from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";
import type { RootState } from "@/lib/redux/store";

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
  typedPartCount: 0,
  streamedAnswerBlockCount: 0,
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

  it("stays silent while the run waits on the person (an approval card is open)", () => {
    expect(
      isAnswerlessTurn({ ...settledEmptyAnswer, awaitingPerson: true }),
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

/**
 * Walk 18, defect C — the notice printed UNDER a 170-word question the
 * interviewer had just written, twice in five turns, on production.
 *
 * The witness is the walk's own turn 4: `chat.message` rows at positions
 * 22–27 of conversation `e9e9b52a-df84-4d07-9ad1-60f4f151a45a`
 * (`walk18-Drain and Heater Verdict`, 2026-09-21). The turn's three assistant
 * rows are `thinking + tool_call`, `thinking + tool_call + tool_call`, and a
 * 456-character text answer — a turn that plainly wrote something. It rendered
 * from its live stream, so what the person read came from the stream's render
 * blocks while the persisted row this decision was reading had not yet been
 * committed with that text.
 */
describe("a turn that streamed an answer is never answerless", () => {
  it("stays silent when the answer is on screen from the stream, not the row", () => {
    expect(
      isAnswerlessTurn({
        ...settledEmptyAnswer,
        // The row has not been committed with its text yet — the exact state
        // the screen was in when the false notice printed.
        renderedText: "",
        // …while 1 text block for this request is on screen.
        streamedAnswerBlockCount: 1,
      }),
    ).toBe(false);
  });

  it("still speaks for a turn that only thought and called tools", () => {
    // The 2026-09-18 defect this whole file exists for: "Worked for 1.2s" over
    // an empty bubble. Thinking / reasoning blocks are excluded from the
    // streamed count (selectAnswerBlockCount), so it stays 0 here.
    expect(
      isAnswerlessTurn({ ...settledEmptyAnswer, streamedAnswerBlockCount: 0 }),
    ).toBe(true);
  });

  it("stays silent when the whole answer is a typed part", () => {
    expect(
      isAnswerlessTurn({ ...settledEmptyAnswer, typedPartCount: 1 }),
    ).toBe(false);
  });
});

/**
 * The part-shape half of the same rule, asserted over the REAL shapes the
 * platform writes into `cx_message.content` — `decision_questions` and
 * `decision_answers` became first-class message parts on 2026-09-20 (aidream
 * 00a2ae6181 / e9df34bb93) and carry no text at all.
 */
describe("countPersonVisibleParts", () => {
  it("counts a decision_questions part as output the person sees", () => {
    expect(
      countPersonVisibleParts([
        {
          type: "decision_questions",
        },
      ]),
    ).toBe(1);
  });

  it("counts a decision_answers part — a decision holder writes no text", () => {
    expect(countPersonVisibleParts([{ type: "decision_answers" }])).toBe(1);
  });

  it("counts a part type we have never heard of — new kinds are visible by default", () => {
    expect(countPersonVisibleParts([{ type: "some_future_kind" }])).toBe(1);
  });

  it("counts neither thinking nor tool work — that was the original defect", () => {
    // Walk 18's turn-4 rows, verbatim in shape: two tool-calling iterations.
    expect(
      countPersonVisibleParts([
        { type: "thinking" },
        { type: "tool_call" },
        { type: "tool_call" },
        { type: "tool_result" },
        { type: "reasoning" },
      ]),
    ).toBe(0);
  });

  it("does not count plain text — `renderedText` measures that", () => {
    expect(countPersonVisibleParts([{ type: "text" }, {}])).toBe(0);
  });

  it("is 0 for a row with no parts", () => {
    expect(countPersonVisibleParts(undefined)).toBe(0);
    expect(countPersonVisibleParts([])).toBe(0);
  });
});


/**
 * The live case from 2026-09-26: an agent asked for a sign-in with
 * `ask_person`, the turn parked, and under the open ask card the screen said
 * "This run finished without writing an answer. Run it again". The turn had
 * not finished — it was waiting on the person.
 */
describe("a turn parked on the person is waiting, never answerless", () => {
  // The persisted row, exactly as `chat.message` stores it (conversation
  // 847a3d1e-…, position 3): thinking, then the ask.
  const parkedRow = [
    { type: "thinking", text: "They gave the username; ask for the password." },
    { type: "tool_call", name: "ask_person", call_id: "toolu_1", arguments: {} },
  ];

  it("recognises a reloaded row that ends by asking the person", () => {
    expect(rowAsksThePerson(parkedRow)).toBe(true);
    expect(rowAsksThePerson([{ type: "tool_call", name: "web_search" }])).toBe(false);
    expect(rowAsksThePerson([{ type: "text" }])).toBe(false);
    expect(rowAsksThePerson(null)).toBe(false);
  });

  it("the live stream's suspension, or a parked tool output, marks the request as waiting", () => {
    const stateWith = (request: Record<string, unknown>) =>
      ({
        activeRequests: {
          byRequestId: { r1: { infoEvents: [], toolLifecycle: {}, ...request } },
        },
      }) as unknown as RootState;

    expect(selectRequestAwaitingPerson("r1")(stateWith({}))).toBe(false);
    expect(
      selectRequestAwaitingPerson("r1")(
        stateWith({ infoEvents: [{ code: "suspended_awaiting_client" }] }),
      ),
    ).toBe(true);
    expect(
      selectRequestAwaitingPerson("r1")(
        stateWith({
          toolLifecycle: {
            c1: { result: { __kind: "action_request.parked", action_request_id: "x" } },
          },
        }),
      ),
    ).toBe(true);
    expect(selectRequestAwaitingPerson("missing")(stateWith({}))).toBe(false);
  });

  it("with that signal the settled empty turn stays silent", () => {
    expect(
      isAnswerlessTurn({
        ...settledEmptyAnswer,
        awaitingPerson: rowAsksThePerson(parkedRow),
      }),
    ).toBe(false);
  });
});
