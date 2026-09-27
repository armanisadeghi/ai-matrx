/**
 * THE ROOT CRASH SCREEN SAYS WHAT HAPPENED AND WHAT TO DO (page-pass shared
 * defects, 2026-09-27).
 *
 * `app/global-error.tsx` catches every crash that no nearer `error.tsx`
 * catches — a failed or slow sign-in landed people there. It read "This feature
 * is still under development", "We really need Arman to get his act
 * together!" and offered a "Fire Arman" vote with a fake terminal "locating
 * close relatives". A stranger reads this screen; it names no person, jokes
 * about nothing, and gives the remedy.
 *
 * PROVEN FAILING BEFORE PASSING: against the pre-fix file every forbidden
 * phrase below is present and the "refresh" remedy sentence is absent.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const source = readFileSync(
  path.join(__dirname, "..", "global-error.tsx"),
  "utf8",
);
// Only what renders: drop comments so the file may still explain its history.
const rendered = source
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
  .replace(/^\s*\/\/.*$/gm, "");

describe("app/global-error.tsx", () => {
  it.each([
    /Arman/,
    /act together/i,
    /under development/i,
    /\bvote\b/i,
    /Fire\b/,
    /close relatives/i,
  ])("never renders %s", (phrase) => {
    expect(rendered).not.toMatch(phrase);
  });

  it("says what happened and what to do", () => {
    expect(rendered).toContain("This page stopped working");
    expect(rendered).toMatch(/refresh to try again/i);
    expect(rendered).toContain("Refresh page");
    expect(rendered).toContain("Go home");
  });
});
