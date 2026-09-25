/**
 * FORCING FUNCTION: indentation that belongs to a nested list survives the
 * prose preparation, so markdown still sees the nesting.
 *
 * The break (verifier F2, 2026-09-25): the indent-preserving pass turned
 * leading spaces into non-breaking spaces unless the line began with a list
 * marker — but `( +)` backtracked. On `   - If the alarm fails…` it matched
 * TWO spaces, the lookahead then saw ` -` (a space, not a marker) and let the
 * line through, so the bullet under a numbered step became literal
 * "   - …" text on every level (server, static, client).
 *
 * Use case: a recycling company's forklift safety checklist — numbered
 * steps with bullets under them, at 2, 3 and 4 spaces, plus an ordered
 * list under a bullet.
 */
import { preprocessProse } from "@/components/rich-content/prose/prose-prepare";

const NBSP = " ";

const CHECKLIST = [
  "1. Walk around the forklift.",
  "2. Test the horn and backup alarm.",
  "   - If the alarm fails, tag the truck out of service.",
  "  - Log it on the shift sheet.",
  "    - Tell the supervisor before the next shift.",
  "- Tires",
  "   1. Check tread depth.",
  "   2) Check for cuts.",
].join("\n");

describe("prose preparation keeps nested list indentation", () => {
  it.each(CHECKLIST.split("\n").filter((l) => /^ +/.test(l)))(
    "keeps real leading spaces on %j",
    (line) => {
      const out = preprocessProse(CHECKLIST).split("\n");
      const kept = out.find((l) => l.trimStart() === line.trimStart());
      expect(kept).toBeDefined();
      expect(kept).toBe(line);
      expect(kept).not.toContain(NBSP);
    },
  );

  it("still preserves indentation of an indented non-list line (the pass's purpose)", () => {
    const out = preprocessProse("Address:\n   12 Harbor Road");
    expect(out).toContain(`${NBSP.repeat(6)}12 Harbor Road`);
  });
});
