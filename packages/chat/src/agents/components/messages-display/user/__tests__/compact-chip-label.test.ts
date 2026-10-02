/**
 * The compact attachment chip used to print the title's first word, so
 * "Port of Oakland lane · Gate code" read "Port" and "Move 4471 routing" read
 * "Move" (PB-01/02/04 real-test friction, 2026-10-01). These cases fail on the
 * old first-word rule and pass only when the chip keeps both ends.
 */
import { compactChipLabel } from "../compact-chip-label";

describe("compactChipLabel", () => {
  it("keeps a short title whole, extension included", () => {
    expect(compactChipLabel("move-4471.md")).toBe("move-4471.md");
    expect(compactChipLabel("Carrier rate confirmations")).not.toBe("Carrier");
  });

  it("truncates in the middle so the leaf name survives", () => {
    const label = compactChipLabel("Port of Oakland lane · Gate code");
    expect(label.startsWith("Port of")).toBe(true);
    expect(label.endsWith("Gate code")).toBe(true);
    expect(label).toContain("…");
    expect(label.length).toBeLessThanOrEqual(28);
  });

  it("keeps a long file name's extension", () => {
    const label = compactChipLabel("Larchmont Tower Owners Association minutes.pdf");
    expect(label.endsWith(".pdf")).toBe(true);
    expect(label.length).toBeLessThanOrEqual(28);
  });

  it("collapses whitespace", () => {
    expect(compactChipLabel("  Move   4471  ")).toBe("Move 4471");
  });
});
