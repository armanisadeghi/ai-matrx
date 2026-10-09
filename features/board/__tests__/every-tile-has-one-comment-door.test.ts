/**
 * Every board item type says where comments on its tile live (THREADS F4):
 * a record item names its record's OWN thread (the one its page shows); only
 * board-only content — and record types with no thread of their own, named
 * here — post on the board's thread.
 *
 * SUT: `BoardItemType.comments` across `BOARD_ITEM_TYPES` (`items/catalog.ts`).
 * Breaks it catches: a record item that posts its comments on the board (they
 * would never show on the task's own page); a board-only item claiming a
 * record; a draft (record not created yet) offering a door to nothing; a
 * thread keyed by the item KEY instead of the platform token (`war-room` is
 * not a token; `war_room` is).
 */
import { BOARD_ITEM_TYPES } from "../items/catalog";
import type { NodeSource } from "../board/document";

/** Record types with no registered entity token, so no thread of their own (their tiles post on the board). */
const NO_THREAD_OF_THEIR_OWN = new Set([
  "data-table",
  "list",
  "study-kit",
  // The social records have no registered entity token yet (social posts, accounts, ads, collections).
  "social-post",
  "social-profile",
  "social-outlier-feed",
  "social-ad",
  "social-swipe-collection",
]);

const recordTypes = BOARD_ITEM_TYPES.filter((t) => "name" in t.surface);
const boardOnlyTypes = BOARD_ITEM_TYPES.filter((t) => "none" in t.surface);

it.each(recordTypes.map((t) => [t.key]))("record item %s comments on its own record (or is named as having none)", (key) => {
  const type = BOARD_ITEM_TYPES.find((t) => t.key === key)!;
  if (NO_THREAD_OF_THEIR_OWN.has(key)) {
    expect(type.comments).toBeNull();
    return;
  }
  expect(typeof type.comments).toBe("function");
});

it.each(boardOnlyTypes.map((t) => [t.key]))("board-only item %s posts on the board", (key) => {
  expect(BOARD_ITEM_TYPES.find((t) => t.key === key)!.comments).toBeNull();
});

it("a saved record tile names its record by platform token; a draft names nothing", () => {
  const sources: Record<string, { saved: NodeSource; draft: NodeSource; token: string }> = {
    task: { saved: { kind: "entity", entity: "task", id: "t-1" }, draft: { kind: "entity", entity: "task", id: null }, token: "task" },
    "war-room": { saved: { kind: "entity", entity: "war-room", id: "w-1" }, draft: { kind: "entity", entity: "war-room", id: null }, token: "war_room" },
    chat: { saved: { kind: "entity", entity: "chat", id: "c-1" }, draft: { kind: "entity", entity: "chat", id: null }, token: "conversation" },
    note: { saved: { kind: "entity", entity: "note", id: "n-1" }, draft: { kind: "entity", entity: "note", id: null }, token: "note" },
  };
  for (const [key, { saved, draft, token }] of Object.entries(sources)) {
    const comments = BOARD_ITEM_TYPES.find((t) => t.key === key)!.comments!;
    expect(comments(saved)).toEqual({ token, id: (saved as { id: string }).id });
    expect(comments(draft)).toBeNull();
  }
});

it("a data record tile comments on the record", () => {
  const record = BOARD_ITEM_TYPES.find((t) => t.matches({ kind: "record", tableId: "tbl", recordId: "rec-5" }))!;
  expect(record.comments!({ kind: "record", tableId: "tbl", recordId: "rec-5" })).toEqual({ token: "record", id: "rec-5" });
});
