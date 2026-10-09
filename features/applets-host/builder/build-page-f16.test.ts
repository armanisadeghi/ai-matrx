/**
 * Lane F16 (live v0.4.3084, 2026-10-09): closing the floating run window when the run parked on her
 * let the build conversation's instance go — the conversation beside the preview went blank and the
 * question showed nowhere. The window stays (the duplicate card is an open item, not fixed this way).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("F16 the builder's question never disappears", () => {
  it("a run parked on her keeps the run window (closing it blanked the build conversation)", () => {
    const src = readFileSync(join(__dirname, "AppletBuilder.tsx"), "utf8");
    const body = src.match(/const awaitingPerson = \(info[^)]*\) => \{([\s\S]*?)\n  \};/)?.[1] ?? "";
    expect(body).toContain('stepTo("Waiting for your answer")');
    expect(body).not.toMatch(/closeRunWindow\(\)|\.close\(\)/);
  });
});
