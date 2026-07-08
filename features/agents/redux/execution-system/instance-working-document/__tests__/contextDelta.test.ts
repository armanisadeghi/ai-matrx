import { applyContextDeltaToContent } from "../contextDelta";
import type { ContextDeltaData } from "@/types/python-generated/stream-events";

const splice = (
  overrides: Partial<ContextDeltaData>,
): ContextDeltaData => ({
  type: "context_delta",
  key: "working_document",
  command: "str_replace",
  delta_kind: "splice",
  ...overrides,
});

const full = (content: string): ContextDeltaData => ({
  type: "context_delta",
  key: "working_document",
  command: "overwrite",
  delta_kind: "full",
  content,
  new_len: content.length,
});

describe("applyContextDeltaToContent", () => {
  it("applies a mid-string splice", () => {
    const current = "The quick brown fox jumps over the lazy dog.";
    const next = "The quick red panda jumps over the lazy dog.";
    // Backend computes the minimal splice; simulate one (replace "brown fox"
    // region). Common prefix "The quick " (10), suffix " jumps over the lazy dog."
    const d = splice({
      start: 10,
      end: 19,
      text: "red panda",
      base_len: current.length,
      new_len: next.length,
    });
    expect(applyContextDeltaToContent(current, d)).toBe(next);
  });

  it("applies an append splice at the end", () => {
    const current = "# Notes";
    const d = splice({
      command: "append",
      start: 7,
      end: 7,
      text: "\n\nMore.",
      base_len: 7,
      new_len: 14,
    });
    expect(applyContextDeltaToContent(current, d)).toBe("# Notes\n\nMore.");
  });

  it("applies the full form", () => {
    expect(applyContextDeltaToContent("anything", full("replaced"))).toBe(
      "replaced",
    );
  });

  it("rejects a splice when the local copy diverged (base_len mismatch)", () => {
    const d = splice({
      start: 0,
      end: 1,
      text: "X",
      base_len: 100, // local copy is NOT 100 chars — user typed mid-turn
      new_len: 100,
    });
    expect(applyContextDeltaToContent("short", d)).toBeNull();
  });

  it("rejects out-of-range splice bounds", () => {
    const d = splice({
      start: 3,
      end: 99,
      text: "X",
      base_len: 5,
      new_len: 5,
    });
    expect(applyContextDeltaToContent("abcde", d)).toBeNull();
  });

  it("rejects a splice whose result misses new_len (corrupt payload)", () => {
    const d = splice({
      start: 0,
      end: 1,
      text: "XY",
      base_len: 5,
      new_len: 999,
    });
    expect(applyContextDeltaToContent("abcde", d)).toBeNull();
  });

  it("rejects an incomplete splice payload", () => {
    const d = splice({ start: 0, end: 1, base_len: 5, new_len: 5 }); // no text
    expect(applyContextDeltaToContent("abcde", d)).toBeNull();
  });

  it("rejects a full form with no content", () => {
    const d: ContextDeltaData = {
      type: "context_delta",
      key: "working_document",
      command: "overwrite",
      delta_kind: "full",
    };
    expect(applyContextDeltaToContent("abcde", d)).toBeNull();
  });
});
