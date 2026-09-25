/**
 * RC-B5 — a grouped (multi-iteration) turn edits in place.
 *
 * In-session, every row of a multi-iteration turn shares one requestId and
 * only the LAST row renders (the whole request). The pencil's target is the
 * last row with answer text — often an EARLIER row — so without the persisted
 * view the flagged row has no spot on screen and the pencil does nothing.
 */
import { collapseByRequestId, membersForRender } from "./collapse-by-request-id";

type Member = { key: string; requestId: string | null; messageId: string };

const turn: Member[] = [
  { key: "a", requestId: "req-1", messageId: "row-answer-text" },
  { key: "b", requestId: "req-1", messageId: "row-trailing-tool-call" },
];

test("streaming view: one render per request — the text row has no spot", () => {
  const rendered = collapseByRequestId(turn).map((m) => m.messageId);
  expect(rendered).toEqual(["row-trailing-tool-call"]);
  expect(rendered).not.toContain("row-answer-text");
});

test("editing view: every row renders from its persisted content", () => {
  const rendered = membersForRender(turn, true);
  expect(rendered.map((m) => m.messageId)).toEqual(["row-answer-text", "row-trailing-tool-call"]);
  // No stream source — so an edit's editedText can never stand in for the
  // whole request, and each row shows exactly its own stored text.
  expect(rendered.every((m) => m.requestId === null)).toBe(true);
});

test("a single-row request keeps its stream source even while edited", () => {
  const single: Member[] = [{ key: "a", requestId: "req-2", messageId: "only-row" }];
  expect(membersForRender(single, true)).toEqual(single);
});

test("not editing: unchanged cardinality", () => {
  expect(membersForRender(turn, false)).toEqual(collapseByRequestId(turn));
});
