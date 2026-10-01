/**
 * A TURN STILL MOVING IS NEVER "FINISHED WITHOUT WRITING AN ANSWER".
 *
 * Break this guards (bench 2026-10-01 16:44Z, conversation 7bde4d03-…): the
 * person answered an `ask_person` card; the server ran the parked turn forward
 * and it stopped again on `board_read`, a tool only the open page can run. The
 * re-read conversation's newest row was exactly the row below (chat.message
 * position 2: thinking, then two tool calls, no text). Nothing said the turn
 * was waiting, so the card read "This run finished without writing an answer.
 * Run it again" — while the work went on (board_read 16:44:53 → board_open_item
 * → apply_surface_write → board_add_tile → the real answer at 16:48:54).
 *
 * The rule, stated once: a turn is open only while something can still finish
 * it — the conversation is running, streaming or parked; a server operation is
 * still live; or a client call is pending on this page. A row that ends on a
 * tool call with none of those is DEAD, and must say so (Law 4) rather than
 * sit silently under its tool cards.
 */
import { isAnswerlessTurn, turnIsStillOpen, type AnswerlessTurnInput } from "../answerless-turn";

const settledEmpty: AnswerlessTurnInput = {
  isTurnAnswer: true,
  isStreamActive: false,
  failed: false,
  coldMarkdownReady: true,
  messageId: "0a857874-0000-4000-8000-000000000002",
  renderedText: "",
  attachmentCount: 0,
  mediaBlockCount: 0,
  typedPartCount: 0,
  streamedAnswerBlockCount: 0,
};

/** chat.message position 2 of conversation 7bde4d03-…, as persisted. */
const resumedRowParkedOnClientTool = [
  { type: "thinking", text: "" },
  { type: "tool_call", name: "board_read", call_id: "toolu_a", arguments: {} },
  { type: "tool_call", name: "context", call_id: "toolu_b", arguments: {} },
];

type OpenSignals = {
  instanceStatus?: string;
  operationInFlight?: boolean;
  pendingCallOnPage?: boolean;
  requestAwaitingPerson?: boolean;
};

const answerlessFor = (
  rowParts: ReadonlyArray<{ type?: string; name?: string }>,
  signals: OpenSignals = {},
) =>
  isAnswerlessTurn({
    ...settledEmpty,
    awaitingPerson: turnIsStillOpen({
      instanceStatus: signals.instanceStatus ?? "complete",
      requestAwaitingPerson: signals.requestAwaitingPerson ?? false,
      operationInFlight: signals.operationInFlight ?? false,
      pendingCallOnPage: signals.pendingCallOnPage ?? false,
      rowParts,
    }),
  });

describe("a turn is open only while something can still finish it", () => {
  it("the 16:44Z card: a client call still pending on this page keeps it open", () => {
    expect(answerlessFor(resumedRowParkedOnClientTool, { pendingCallOnPage: true })).toBe(false);
  });

  it("a server operation still running (or waiting on this page) keeps it open", () => {
    expect(answerlessFor(resumedRowParkedOnClientTool, { operationInFlight: true })).toBe(false);
  });

  it("a conversation the client is running, streaming or has parked keeps it open", () => {
    for (const instanceStatus of ["running", "streaming", "paused"]) {
      expect(answerlessFor(resumedRowParkedOnClientTool, { instanceStatus })).toBe(false);
    }
  });

  it("a turn parked on the person keeps it open", () => {
    expect(
      answerlessFor([{ type: "tool_call", name: "ask_person" }], { requestAwaitingPerson: true }),
    ).toBe(false);
    expect(answerlessFor([{ type: "tool_call", name: "ask_person" }])).toBe(false);
  });

  it("DEAD AFTER A TOOL CALL — nothing can finish it — says so (Law 4)", () => {
    expect(answerlessFor(resumedRowParkedOnClientTool)).toBe(true);
    expect(answerlessFor([{ type: "tool_call", name: "web_search" }])).toBe(true);
  });

  it("still speaks for a settled row that only thought — the original defect", () => {
    expect(answerlessFor([{ type: "thinking" }])).toBe(true);
    expect(answerlessFor([])).toBe(true);
  });
});
