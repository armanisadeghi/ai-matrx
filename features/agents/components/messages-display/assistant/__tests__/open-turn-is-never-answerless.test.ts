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
 * The rule, stated once: a row whose last piece of work is a tool call has not
 * finished — the model always speaks again after its tools return. Likewise a
 * conversation the client is still running or resuming.
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

const answerlessFor = (
  rowParts: ReadonlyArray<{ type?: string; name?: string }>,
  instanceStatus: string = "complete",
) =>
  isAnswerlessTurn({
    ...settledEmpty,
    awaitingPerson: turnIsStillOpen({
      instanceStatus,
      requestAwaitingPerson: false,
      rowParts,
    }),
  });

describe("a turn that is still moving is never answerless", () => {
  it("a re-read row that ends on a client tool call is still open (the 16:44Z card)", () => {
    expect(answerlessFor(resumedRowParkedOnClientTool)).toBe(false);
  });

  it("a row that ends on any tool call is still open — the model speaks after its tools", () => {
    expect(answerlessFor([{ type: "tool_call", name: "web_search" }])).toBe(false);
  });

  it("a conversation the client is running or resuming is still open", () => {
    for (const status of ["running", "streaming", "paused"]) {
      expect(answerlessFor([{ type: "thinking" }], status)).toBe(false);
    }
  });

  it("still speaks for a settled row that only thought — the original defect", () => {
    expect(answerlessFor([{ type: "thinking" }])).toBe(true);
    expect(answerlessFor([])).toBe(true);
  });

  it("a row whose tool work is followed by text is judged by its text, not left open", () => {
    expect(
      turnIsStillOpen({
        instanceStatus: "complete",
        requestAwaitingPerson: false,
        rowParts: [{ type: "tool_call", name: "board_add_tile" }, { type: "text" }],
      }),
    ).toBe(false);
  });
});
