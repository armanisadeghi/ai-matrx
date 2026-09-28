/**
 * GUARD — a docked panel's body lets a filling child fill it (verifier,
 * 2026-09-28: "the side drawer never showed the tutor's answer").
 *
 * The AI Tutor drawer (MatrxDynamicPanelHost → EducationTutorClient) sent the
 * message and the transcript WAS in the DOM, but the body wrapper was a plain
 * block with a fixed height: the chat's `flex-1 min-h-0` did nothing, the
 * column shrank to the composer's height, and the transcript region measured
 * 447x0. Measured live before and after (0px → 638px). jsdom computes no
 * layout, so this pins the shape that makes it possible: the body is a flex
 * column (children still stack and scroll exactly as a block's would).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(join(__dirname, "..", "MatrxDynamicPanel.tsx"), "utf8");

describe("MatrxDynamicPanel body", () => {
  it("is a flex column, so a chat body's flex-1 fills the panel", () => {
    const body = src.slice(src.indexOf("data-panel-body"), src.indexOf("data-panel-body") + 200);
    expect(src).toContain("data-panel-body");
    expect(body).toMatch(/"flex flex-col overflow-auto/);
  });
});
