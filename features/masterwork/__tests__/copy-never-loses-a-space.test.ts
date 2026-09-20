// features/masterwork/__tests__/copy-never-loses-a-space.test.ts
//
// THE CLASS this guard closes (cold walk 12, D12). Quick Build's confirmation
// promised, verbatim on screen:
//
//     "2. The Masterwork checks the work against all 10rules and fixes
//      violations."
//
// Nobody typed "10rules". The source read
//
//     ...against all{" "}
//     {approvedCount}
//     rules and fixes violations.
//
// and JSX text semantics do the rest: a text node's leading whitespace up to
// and including its first newline is DISCARDED. So the gap the author sees
// between `{approvedCount}` and `rules` does not exist at runtime, and a
// sentence that reads fine in the editor renders as a typo to the Expert. The
// author who wrote the leading `{" "}` clearly knew the rule — they simply
// lost the trailing one, which is exactly why this cannot be left to care.
//
// The rule enforced here: inside features/masterwork, a JSX expression alone
// on its line may not be followed by a line that starts a WORD, unless the
// expression itself ends in a space (a literal ending " ") or renders an
// element rather than text.
//
// Scoped to `features/masterwork` because that is the feature this walk
// censused. It is a general JSX fact, not a masterwork one — widening it to
// the whole app is a separate, larger sweep.

import { readFileSync } from "node:fs";
import path from "node:path";
import { sync as globSync } from "glob";

const FEATURE_ROOT = path.join(process.cwd(), "features/masterwork");

/** A string/template literal in the expression that already ends in a space. */
const ENDS_WITH_SPACED_LITERAL = /(?:"[^"]* "|'[^']* '|`[^`]* `)/;

export interface LostSpace {
  file: string;
  line: number;
  expression: string;
  followedBy: string;
}

/** Every place a JSX expression's trailing space is silently eaten. */
export function findLostSpaces(files: string[]): LostSpace[] {
  const found: LostSpace[] = [];
  for (const file of files) {
    const lines = readFileSync(file, "utf8").split("\n");
    for (let i = 0; i < lines.length - 1; i++) {
      const expr = lines[i].trim();
      // A JSX expression container alone on its line.
      if (!expr.startsWith("{") || !expr.endsWith("}")) continue;
      if (expr === '{" "}' || expr.endsWith('{" "}')) continue;
      // An element (or an element-or-null) is not text; its gap is layout's
      // job (flex gap / margin), not the string's.
      if (expr.includes("<")) continue;
      // The author already put the space inside the value.
      if (ENDS_WITH_SPACED_LITERAL.test(expr)) continue;

      const next = lines[i + 1].trim();
      if (!next || !/^[A-Za-z0-9]/.test(next)) continue;
      // A word-initial continuation that is really more code, not JSX text.
      if (/^(?:const|let|return|import|export|function|if|else)\b/.test(next)) {
        continue;
      }
      found.push({
        file: path.relative(process.cwd(), file),
        line: i + 1,
        expression: expr,
        followedBy: next,
      });
    }
  }
  return found;
}

describe("Masterwork copy never loses a space at an expression boundary", () => {
  const files = globSync("**/*.tsx", {
    cwd: FEATURE_ROOT,
    absolute: true,
    ignore: ["**/*.test.tsx", "**/__tests__/**"],
  });

  it("censuses a real body of files (the glob has not silently gone empty)", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it("finds no sentence that would render as 'all 10rules'", () => {
    const lost = findLostSpaces(files);
    const report = lost
      .map(
        (l) =>
          `${l.file}:${l.line}\n    ${l.expression}\n    ${l.followedBy}\n` +
          `    → renders with NO space between them. Put the value and the ` +
          `word on one line, or end the line with {" "}.`,
      )
      .join("\n");
    expect(report).toBe("");
  });

  it("recognises the exact shape it exists to catch (self-test)", () => {
    const fixture = path.join(
      __dirname,
      "fixtures",
      "lost-space-fixture.tsx.txt",
    );
    const lost = findLostSpaces([fixture]);
    expect(lost).toHaveLength(1);
    expect(lost[0].expression).toBe("{approvedCount}");
    expect(lost[0].followedBy).toBe("rules and fixes violations.");
  });
});
