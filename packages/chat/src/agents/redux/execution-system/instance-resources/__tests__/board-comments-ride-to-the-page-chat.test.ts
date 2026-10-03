/**
 * A comment on something that is not a chat answer — the whole board, a task
 * tile, a passage of a note tile — rides the next message of the PAGE's chat
 * (THREADS F4), naming its record so the model reads
 * `comment c5 on task “Ship pricing page”`.
 *
 * SUT: `remarkToWire` (record target → record_token/record_id/record_title) and
 * the remark sink registry (`remark-sink.ts`).
 * Breaks it catches: a record comment sent with no target (the model reads an
 * unplaced comment); a message comment that lost its message target; a sink
 * that outlives its page (a comment on another page staged into a closed
 * board's chat); a second page's sink not restoring the first on unmount.
 *
 * Use case: Priya plans the Q3 launch on her board.
 */
import { remarkToWire } from "../remarks-wire";
import type { RemarkItem } from "../remarks";
import { activeRemarkSink, registerRemarkSink, resetRemarkSinksForTest, type RemarkSink } from "../remark-sink";

afterEach(() => resetRemarkSinksForTest());

const onTask: RemarkItem = {
  kind: "comment",
  target: {
    conversationId: null,
    messageId: null,
    record: { token: "task", id: "task-ship-pricing", title: "Ship pricing page" },
  },
  commentId: "cmt-41",
  quote: null,
  body: "Can this move to Oct 14?",
};

it("a comment on a record names the record on the wire", () => {
  expect(remarkToWire(onTask)).toEqual({
    kind: "comment",
    target: { record_token: "task", record_id: "task-ship-pricing", record_title: "Ship pricing page" },
    body: "Can this move to Oct 14?",
    comment_id: "cmt-41",
  });
});

it("a passage of a note tile carries the quote and the note", () => {
  const wire = remarkToWire({
    ...onTask,
    target: { conversationId: null, messageId: null, record: { token: "note", id: "note-9", title: "  " } },
    quote: "pricing page by Oct 14",
  });
  expect(wire?.target).toEqual({ record_token: "note", record_id: "note-9" });
  expect(wire).toMatchObject({ quote: "pricing page by Oct 14" });
});

it("a comment on a chat answer keeps its message target", () => {
  const wire = remarkToWire({
    ...onTask,
    target: { conversationId: "conv-1", messageId: "answer-3", record: null },
  });
  expect(wire?.target).toEqual({ message_id: "answer-3" });
});

describe("the remark sink", () => {
  const sink = (log: string[], name: string): RemarkSink => ({ stage: (item) => log.push(`${name}:${item.kind}`) });

  it("is absent on a page with no chat, and the newest page wins until it leaves", () => {
    expect(activeRemarkSink()).toBeNull();
    const log: string[] = [];
    const releaseBoard = registerRemarkSink(sink(log, "board"));
    const releaseWorkspace = registerRemarkSink(sink(log, "workspace"));
    activeRemarkSink()?.stage(onTask);
    releaseWorkspace();
    activeRemarkSink()?.stage(onTask);
    releaseBoard();
    expect(activeRemarkSink()).toBeNull();
    expect(log).toEqual(["workspace:comment", "board:comment"]);
  });
});
