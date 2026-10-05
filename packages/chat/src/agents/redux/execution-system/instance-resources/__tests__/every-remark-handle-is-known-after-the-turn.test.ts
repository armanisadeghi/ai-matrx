/**
 * After a reply, EVERY "Reply in thread · cN" line must be a door — not only the
 * first (live walk 2026-10-05: c1 was a button, c2/c3/c4 plain text until reload).
 * A receipt cannot say which of several handle-less remarks on one answer it
 * means, so the turn reads its own saved message, which names them all.
 * Use case: four notes on one answer, sent together; the agent replies in each thread.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { remarkByHandle, withPersistedHandles, withReceiptHandle, readReceiptThread } from "../remark-handles";

const ANSWER = "896a8a95-6ffa-4ba1-8271-d363773b6449";
const item = (n: number, extra: Record<string, unknown> = {}) => ({
  kind: "comment", id: `res_${n}`, target: { message_id: ANSWER }, quote: `q${n}`, body: `note ${n}`, ...extra,
});
const local = [{ type: "text", text: "go" }, { type: "input_remarks", items: [item(1), item(2), item(3), item(4)] }];
const saved = [{ type: "text", text: "go" }, { type: "input_remarks", items: [1, 2, 3, 4].map((n) => item(n, { handle: `c${n}` })) }];

it("the defect: four handle-less remarks on one answer are ambiguous to a receipt, so only the saved row can stamp them", () => {
  const messages = [{ id: "u1", role: "user", content: local }];
  const thread = readReceiptThread({ entity_type: "message", entity_id: ANSWER, root_id: "r", handle: "c2" })!;
  expect(withReceiptHandle(messages, thread)).toBeNull();
});

it("the saved message stamps every handle, matched by the remark's own id", () => {
  const stamped = withPersistedHandles(local, saved)!;
  const messages = [{ id: "u1", content: stamped }];
  for (const n of [1, 2, 3, 4]) expect(remarkByHandle(messages, `c${n}`)?.id).toBe(`res_${n}`);
});

it("never guesses: a saved row without the remark's id stamps nothing", () => {
  const strangers = [{ type: "input_remarks", items: [{ ...item(9), handle: "c1" }] }];
  expect(withPersistedHandles(local, strangers)).toBeNull();
});

it("is wired: the stream asks for the stamp when a turn ends", () => {
  const stream = readFileSync(join(__dirname, "../../thunks/process-stream.ts"), "utf8");
  expect(stream).toContain("stampPersistedRemarkHandles({ conversationId })");
});
