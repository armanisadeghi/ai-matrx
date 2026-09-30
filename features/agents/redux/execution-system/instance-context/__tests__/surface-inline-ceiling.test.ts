import { withSurfaceInlineCeiling } from "../instance-context.selectors";
import type { InstanceContextEntry } from "@/features/agents/types/instance.types";

jest.mock("@/features/surfaces/manifests/registry", () => ({
  getManifest: (name: string) =>
    name === "matrx-user/demo"
      ? {
          values: [
            { name: "record", description: "The note", inlineUpTo: 10000 },
            { name: "plain", description: "No ceiling" },
          ],
        }
      : undefined,
}));

const entry = (key: string, value: unknown, slotMatched = false): InstanceContextEntry => ({
  key,
  value,
  slotMatched,
  type: "json",
  label: key,
});

describe("withSurfaceInlineCeiling", () => {
  it("wraps a declared value in the envelope the server reads, with its ceiling", () => {
    expect(withSurfaceInlineCeiling(entry("record", { a: 1 }), { a: 1 }, "matrx-user/demo")).toEqual({
      content: { a: 1 },
      type: "json",
      label: "record",
      description: "The note",
      max_inline_chars: 10000,
    });
  });

  it("adds the ceiling to an existing envelope without replacing it", () => {
    const wire = { content: "x", type: "text", label: "record" };
    expect(withSurfaceInlineCeiling(entry("record", "x"), wire, "matrx-user/demo")).toEqual({
      ...wire,
      max_inline_chars: 10000,
    });
  });

  it("wraps a record that merely has a content field instead of mistaking it for an envelope", () => {
    const record = { id: "g1", title: "Cells", content: "# Cells" };
    expect(withSurfaceInlineCeiling(entry("record", record), record, "matrx-user/demo")).toEqual({
      content: record,
      type: "json",
      label: "record",
      description: "The note",
      max_inline_chars: 10000,
    });
  });

  it("leaves undeclared values, agent-slot values and surface-less runs untouched", () => {
    expect(withSurfaceInlineCeiling(entry("plain", [1]), [1], "matrx-user/demo")).toEqual([1]);
    expect(withSurfaceInlineCeiling(entry("record", [1], true), [1], "matrx-user/demo")).toEqual([1]);
    expect(withSurfaceInlineCeiling(entry("record", [1]), [1], null)).toEqual([1]);
  });
});

describe("the person's pointer is always shown in full (Arman, 2026-09-30)", () => {
  it("a long selection is inlined up to 10,000 characters on any page, and says the person is pointing at it", () => {
    const sel = "x".repeat(4_000);
    const wire = withSurfaceInlineCeiling(entry("selection", sel), sel, "matrx-user/demo") as Record<string, unknown>;
    expect(wire.max_inline_chars).toBe(10_000);
    expect(String(wire.description)).toMatch(/pointing you at it/);
  });

  it("text before and after the selection ride along in full too", () => {
    for (const key of ["text_before", "text_after"]) {
      const wire = withSurfaceInlineCeiling(entry(key, "abc"), "abc", "matrx-user/demo") as Record<string, unknown>;
      expect(wire.max_inline_chars).toBe(2_500);
    }
  });

  it("holds with no page at all (Custom Agent, Send to another agent)", () => {
    const wire = withSurfaceInlineCeiling(entry("selection", "hi"), "hi", null) as Record<string, unknown>;
    expect(wire.max_inline_chars).toBe(10_000);
  });

  it("a launch with no page shows its whole content up to 6,000; a page keeps its own rule for content", () => {
    const pageless = withSurfaceInlineCeiling(entry("content", "doc"), "doc", null) as Record<string, unknown>;
    expect(pageless.max_inline_chars).toBe(6_000);
    expect(withSurfaceInlineCeiling(entry("content", "doc"), "doc", "matrx-user/demo")).toBe("doc");
  });

  it("an agent slot that claimed the selection keeps its own ceiling", () => {
    expect(withSurfaceInlineCeiling(entry("selection", "hi", true), "hi", null)).toBe("hi");
  });
});
