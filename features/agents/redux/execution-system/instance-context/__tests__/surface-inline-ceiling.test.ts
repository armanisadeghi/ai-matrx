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
