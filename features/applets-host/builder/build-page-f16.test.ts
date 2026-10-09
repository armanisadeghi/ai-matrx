/**
 * Lane F16 (W5 walk, 2026-10-09): the builder's question shows in ONE place. The build conversation
 * beside the preview renders the ask's card; the floating run window drew the same card a second time
 * (titled "Done"), so a run parked on her closes that window.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("F16 the builder's question shows once", () => {
  it("a run parked on her closes the floating run window", () => {
    const src = readFileSync(join(__dirname, "AppletBuilder.tsx"), "utf8");
    const body = src.match(/const awaitingPerson = \(info[^)]*\) => \{([\s\S]*?)\n  \};/)?.[1] ?? "";
    expect(body).toContain('stepTo("Waiting for your answer")');
    expect(body).toContain("closeRunWindow()");
  });
});
