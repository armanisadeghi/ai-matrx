/**
 * @jest-environment jsdom
 *
 * Conversation tools — the pure halves of in-thread find, the pinned filter,
 * keyboard navigation between messages, and regenerate's anchor. The DOM find
 * test walks a real rendered transcript fragment: the ranges must cover the
 * matched text exactly and the content must never be mutated.
 */

import {
  collectFindRanges,
  findTextMatches,
} from "../find-in-conversation";
import { filterGroupsToPinned, groupMessageIds, groupsToRender } from "../pinned-filter";
import { findStatusText } from "../find-in-conversation";
import { nextMessageIndex } from "../message-keyboard-nav";
import { findRegenerateAnchor } from "@/features/agents/redux/execution-system/message-crud/regenerate-anchor";
import type { DisplayGroup } from "../../display-groups";

describe("findTextMatches", () => {
  it("finds every case-insensitive occurrence, non-overlapping", () => {
    expect(findTextMatches("Revenue grew. revenue fell. REVENUE", "revenue")).toEqual([
      [0, 7],
      [14, 21],
      [28, 35],
    ]);
    expect(findTextMatches("aaaa", "aa")).toEqual([
      [0, 2],
      [2, 4],
    ]);
  });
  it("matches nothing for an empty or whitespace query", () => {
    expect(findTextMatches("anything", "")).toEqual([]);
    expect(findTextMatches("anything", "   ")).toEqual([]);
  });
});

describe("collectFindRanges", () => {
  it("builds ranges over rendered text without mutating the DOM", () => {
    const root = document.createElement("div");
    root.innerHTML =
      '<div data-message-group="1"><p>The <strong>quarterly</strong> report</p></div>' +
      '<div data-message-group="2"><p>Quarterly numbers <code>quarterly()</code></p></div>' +
      '<div data-find-ignore><button>quarterly</button></div>';
    const before = root.innerHTML;
    const ranges = collectFindRanges(root, "QUARTERLY");
    expect(ranges.map((r) => r.toString())).toEqual(["quarterly", "Quarterly", "quarterly"]);
    expect(root.innerHTML).toBe(before);
  });
});

const G = (groups: DisplayGroup[]) => groups;

describe("pinned filter", () => {
  const groups = G([
    { kind: "user", key: "u1", messageId: "m-u1" },
    {
      kind: "assistant",
      key: "a1",
      members: [
        { key: "k1", messageId: "m-a1", requestId: null, isStreamActive: false },
        { key: "k2", messageId: "m-a2", requestId: null, isStreamActive: false },
      ],
    } as DisplayGroup,
    { kind: "user", key: "u2", messageId: "m-u2" },
  ]);

  it("reads every message id a group shows", () => {
    expect(groupMessageIds(groups[1])).toEqual(["m-a1", "m-a2"]);
  });

  it("keeps only groups holding a pinned message", () => {
    const kept = filterGroupsToPinned(groups, new Set(["m-a2"]));
    expect(kept.map((g) => g.key)).toEqual(["a1"]);
    expect(filterGroupsToPinned(groups, new Set())).toEqual([]);
  });
});

describe("nextMessageIndex", () => {
  it("moves between messages and clamps at the ends", () => {
    expect(nextMessageIndex(0, "ArrowDown", 3)).toBe(1);
    expect(nextMessageIndex(2, "ArrowDown", 3)).toBe(2);
    expect(nextMessageIndex(0, "ArrowUp", 3)).toBe(0);
    expect(nextMessageIndex(1, "Home", 3)).toBe(0);
    expect(nextMessageIndex(1, "End", 3)).toBe(2);
    expect(nextMessageIndex(1, "x", 3)).toBeNull();
    expect(nextMessageIndex(0, "ArrowDown", 0)).toBeNull();
  });
});

describe("findRegenerateAnchor", () => {
  const msgs = [
    { id: "u1", role: "user", position: 1 },
    { id: "a1", role: "assistant", position: 2 },
    { id: "u2", role: "user", position: 3 },
    { id: "a2", role: "assistant", position: 4 },
    { id: "a3", role: "assistant", position: 5 },
  ];
  it("anchors on the question the LATEST answer replied to", () => {
    expect(findRegenerateAnchor(msgs, "a3")).toEqual({ userMessageId: "u2", userPosition: 3 });
    expect(findRegenerateAnchor(msgs, "a2")).toEqual({ userMessageId: "u2", userPosition: 3 });
  });
  it("refuses an older answer (regenerating it would drop later turns)", () => {
    expect(findRegenerateAnchor(msgs, "a1")).toBeNull();
    expect(findRegenerateAnchor(msgs, "missing")).toBeNull();
    expect(findRegenerateAnchor(msgs, "u2")).toBeNull();
  });
  it("still regenerates when the loaded window starts AFTER the question", () => {
    // The chat loads the newest rows only; the question can be outside them.
    // Real shape: conversation 6327cba2 loaded positions 2..13, no user row.
    const tail = [
      { id: "t2", role: "tool", position: 2 },
      { id: "a3", role: "assistant", position: 3 },
      { id: "t4", role: "tool", position: 4 },
      { id: "a5", role: "assistant", position: 5 },
    ];
    expect(findRegenerateAnchor(tail, "a5")).toEqual({ userMessageId: null, userPosition: null });
    expect(findRegenerateAnchor(tail, "t4")).toBeNull();
  });
  it("ignores deleted rows", () => {
    expect(
      findRegenerateAnchor(
        [...msgs, { id: "u3", role: "user", position: 6, deletedAt: "2026-09-25" }],
        "a3",
      ),
    ).toEqual({ userMessageId: "u2", userPosition: 3 });
  });
});

describe("groupsToRender (verify-RC-B9 F3)", () => {
  const all = [
    { kind: "user", key: "u0", messageId: "old" },
    { kind: "user", key: "u1", messageId: "m-u1" },
  ] as DisplayGroup[];
  const windowed = [all[1]];
  it("renders EVERY group while find is open, so every message is searchable", () => {
    expect(groupsToRender({ all, windowed, findOpen: true, pinnedOnly: false, pinned: new Set() })).toEqual(all);
  });
  it("keeps the window otherwise, and the pinned view reads all groups", () => {
    expect(groupsToRender({ all, windowed, findOpen: false, pinnedOnly: false, pinned: new Set() })).toEqual(windowed);
    expect(groupsToRender({ all, windowed, findOpen: false, pinnedOnly: true, pinned: new Set(["old"]) })).toEqual([all[0]]);
  });
});

describe("findStatusText", () => {
  it("never claims 'No matches' before the whole history is searched", () => {
    expect(findStatusText({ query: "x", matches: 0, current: 0, history: { state: "loading", loaded: 40 } })).toBe(
      "Loading earlier messages… 40",
    );
    expect(findStatusText({ query: "x", matches: 0, current: 0, history: { state: "done", loaded: 231 } })).toBe(
      "No matches in 231 messages",
    );
    expect(findStatusText({ query: "x", matches: 3, current: 1, history: { state: "done", loaded: 231 } })).toBe("2 of 3");
    expect(findStatusText({ query: "x", matches: 0, current: 0, history: { state: "partial", loaded: 50 } })).toBe(
      "No matches in the 50 messages that loaded — earlier history could not be read",
    );
    expect(findStatusText({ query: "", matches: 0, current: 0, history: { state: "done", loaded: 3 } })).toBe("");
    // Loaded but the newly rendered messages have not been searched yet.
    expect(
      findStatusText({ query: "x", matches: 0, current: 0, history: { state: "done", loaded: 231 }, searching: true }),
    ).toBe("Searching all 231 messages…");
  });
});
