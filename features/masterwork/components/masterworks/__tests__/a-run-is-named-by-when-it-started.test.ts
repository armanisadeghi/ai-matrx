/**
 * A RUN IS NAMED BY WHEN IT STARTED, NEVER BY AN ID — cold walk 22 (friction).
 *
 * The live panel under "Run it" read "This run · d1b55499". An id fragment
 * means nothing to the person who pressed the button a second ago; the minute
 * she started it does. RED before: `runLabel` did not exist and the box
 * printed `runId.slice(0, 8)`.
 */
import { runLabel } from "../TryMasterworkBox";

const HEX_FRAGMENT = /\b[0-9a-f]{6,}\b/;

describe("the line that says which run is on screen", () => {
  it("a fresh run is named by the minute it started", () => {
    const at = new Date(2026, 8, 22, 18, 20).getTime();
    const line = runLabel("fresh", at);
    expect(line).toMatch(/^This run · started \d{1,2}:20/);
    expect(line).not.toMatch(HEX_FRAGMENT);
  });

  it("a rejoined run says so, with no id", () => {
    expect(runLabel("rejoined", null)).toBe(
      "Rejoined the run you started earlier",
    );
  });

  it("with no start time known it is just 'This run'", () => {
    expect(runLabel("fresh", null)).toBe("This run");
  });
});
