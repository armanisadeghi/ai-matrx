import { KIND_KEY } from "@ai-matrx/content-ir";
import { registerBlockPrinter, type BlockPrinter } from "@ai-matrx/print/core";
import { kindDispatchPrinter, objectHtml, readKindValue, renderKindValueHtml } from "../kindValuePrinter";
import { STRUCTURED_PRINTERS } from "../structuredTypePrinters";

function freezeDeep<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freezeDeep);
    Object.freeze(value);
  }
  return value;
}

describe("print-only marker reduction", () => {
  it("hides marker fields in generic print HTML without changing root or nested values", () => {
    const value = freezeDeep({
      __kind: "print_marker_fixture",
      title: "Trip plan",
      detail: { __kind: "print_detail_fixture", destination: "Kyoto" },
      stops: [{ __kind: "print_stop_fixture", city: "Osaka" }],
    });
    const before = JSON.stringify(value);
    const html = renderKindValueHtml(value, null, "Trip");
    expect(html).toContain("Kyoto");
    expect(html).toContain("Osaka");
    expect(html).not.toContain(KIND_KEY);
    expect(html).not.toContain("print_detail_fixture");
    expect(html).not.toContain("print_stop_fixture");
    expect(readKindValue(value)).toBe(value);
    expect(JSON.stringify(value)).toBe(before);
  });

  it("preserves nested markers when the depth limit prints a plain-text fallback", () => {
    const value = freezeDeep({ __kind: "print_deep_fixture", detail: { __kind: "print_leaf_fixture", city: "Kyoto" } });
    const before = JSON.stringify(value);
    const html = objectHtml(value, null, 8, { root: null });
    expect(html).toContain("Kyoto");
    expect(html).not.toContain("print_deep_fixture");
    expect(html).not.toContain("print_leaf_fixture");
    expect(JSON.stringify(value)).toBe(before);
  });

  it("passes the original marked value to its registered printer on both dispatch paths", async () => {
    const value = freezeDeep({ __kind: "print_dispatch_fixture", title: "Trip" });
    const print = jest.fn((_data: unknown) => undefined);
    const toPrintHtml = jest.fn((_data: unknown) => ({ html: "<p>Trip</p>" }));
    const printer: BlockPrinter = { label: "Print", variants: [], print, toPrintHtml };
    const unregister = registerBlockPrinter(value.__kind, printer);
    try {
      kindDispatchPrinter.print(value);
      await kindDispatchPrinter.toPrintHtml?.(value, { type: "json", raw: "" });
      expect(print.mock.calls[0][0]).toBe(value);
      expect(toPrintHtml.mock.calls[0][0]).toBe(value);
      expect(value.__kind).toBe("print_dispatch_fixture");
    } finally {
      unregister();
    }
  });

  it("omits markers from table headers and nested cells without changing table data", async () => {
    const rows = freezeDeep([
      { __kind: "print_row_fixture", city: "Kyoto", detail: { __kind: "print_cell_fixture", nights: 3 } },
    ]);
    const before = JSON.stringify(rows);
    const printer = STRUCTURED_PRINTERS.find(({ type }) => type === "table")?.printer;
    const output = await printer?.toPrintHtml?.(rows, { type: "table", raw: "" });
    expect(output).toHaveProperty("html");
    if (!output || !("html" in output)) throw new Error("Expected table print HTML");
    expect(output.html).toContain("Kyoto");
    expect(output.html).toContain("nights: 3");
    expect(output.html).not.toContain(KIND_KEY);
    expect(output.html).not.toContain("print_row_fixture");
    expect(output.html).not.toContain("print_cell_fixture");
    expect(JSON.stringify(rows)).toBe(before);
  });

  it("preserves markers in research details while printing their readable fields", async () => {
    const value = freezeDeep({
      __kind: "research_report", title: "Travel research", overview: "A short overview",
      sections: [{ title: "Findings", content: "Kyoto" }],
      methodology: { __kind: "print_method_fixture", approach: "Interviews" },
    });
    const before = JSON.stringify(value);
    const printer = STRUCTURED_PRINTERS.find(({ type }) => type === "research")?.printer;
    const output = await printer?.toPrintHtml?.(value, { type: "research", raw: "" });
    if (!output || !("html" in output)) throw new Error("Expected research print HTML");
    expect(output.html).toContain("Interviews");
    expect(output.html).not.toContain("print_method_fixture");
    expect(output.html).not.toContain(KIND_KEY);
    expect(JSON.stringify(value)).toBe(before);
  });
});
