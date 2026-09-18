// lib/contract/__tests__/mapListRows-census.test.ts
//
// THE REPO-LEVEL GUARD for the "one bad row blanks the whole list" class.
//
// 🚨 THE DEFECT THIS CLOSES. `features/source-library/contract.ts`'s Jobs
// lane went blank on ONE unreadable job because its list reader did a plain
// `arr(...).map(parseJobRow)` — a single bad row's thrown `ContractError`
// propagated out of the whole `.map()` and took every sibling job down with
// it (commit 509e2bffb5). The fix was `mapListRows` in `lib/contract/narrow.ts`:
// it catches each row's error individually, drops only that row, and returns
// `{ rows, problems }` so a screen can show one honest line per unreadable
// row while every row that DID read stays visible.
//
// The census that found the fix found a sibling the same day:
// `features/exports/contract.ts` had the identical `.map(parse…)` shape three
// times over (adapters, items, recipients) and a fourth in `top_correspondents`
// — all fixed in the same change this test guards.
//
// 🚨 WHY A STATIC SCAN, NOT JUST BEHAVIOURAL TESTS PER FILE. A behavioural
// test proves ONE call site is safe today; it says nothing about the next
// list reader someone adds tomorrow in a fifth contract.ts. This test reads
// every `contract.ts` under `features/**` and every reader in `lib/contract/`
// itself and fails the build the moment any of them narrows a LIST of rows
// with a raw `.map()` again, instead of `mapListRows`. It cannot fix a new
// violation — only `mapListRows` (or a documented, deliberate exception) can
// — but it makes the regression impossible to ship silently.
//
// WHAT IT DOES NOT CATCH. A `.map()` whose callback does not call a `parse…`
// function (formatting, key extraction, `strList`-style scalar coercion) is
// not this class of bug and is not flagged — this guard is scoped to ROW
// narrowing, the same scope `mapListRows`'s own doc comment declares.

import { readFileSync } from "node:fs";
import { globSync } from "node:fs";
import path from "node:path";

// `node:fs` only grew `globSync` in newer Node — fall back to a tiny manual
// walk so this guard runs on whatever Node this repo's CI actually has.
function findContractFiles(root: string): string[] {
  const found: string[] = [];
  function walk(dir: string) {
    let entries: string[];
    try {
      entries = require("node:fs").readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry === "node_modules" || entry === ".next" || entry.startsWith(".")) continue;
      const full = path.join(dir, entry);
      const stat = require("node:fs").statSync(full);
      if (stat.isDirectory()) {
        walk(full);
      } else if (entry === "contract.ts") {
        found.push(full);
      }
    }
  }
  walk(root);
  return found;
}

// A `.map(` whose arrow-function body calls a `parseSomething(` — the exact
// shape of every violation this class produced. It deliberately does NOT
// match `mapListRows(arr(...), (entry, index) => parseX(...))`, because that
// call has no `.map(` token at all: the second argument is passed directly,
// not chained off `.map`.
const RAW_ROW_MAP = /\.map\(\s*\([^)]*\)\s*=>\s*[\s\S]{0,120}?\bparse[A-Z]\w*\(/g;

describe("every list-of-rows reader under features/**/contract.ts uses mapListRows", () => {
  const repoRoot = path.resolve(__dirname, "..", "..", "..");
  const contractFiles = [
    ...findContractFiles(path.join(repoRoot, "features")),
    ...findContractFiles(path.join(repoRoot, "lib", "contract")),
  ];

  // The census must find something to be worth running — a repo reorg that
  // moves every contract.ts elsewhere should fail this guard loudly, not pass
  // it by vacuously checking zero files.
  it("found at least one contract.ts to census", () => {
    expect(contractFiles.length).toBeGreaterThan(0);
  });

  it.each(contractFiles.map((f) => [path.relative(repoRoot, f), f] as const))(
    "%s narrows every list of rows with mapListRows, never a raw .map(parse…)",
    (_label, file) => {
      const source = readFileSync(file, "utf8");
      const matches = [...source.matchAll(RAW_ROW_MAP)].map((m) => m[0]);
      if (matches.length > 0) {
        throw new Error(
          `${path.relative(repoRoot, file)} narrows a list of rows with a raw ` +
            `.map(parse…) instead of mapListRows() (lib/contract/narrow.ts). ` +
            `One unreadable row in this list will blank every sibling row — the ` +
            `class fixed in commit 509e2bffb5 and again for features/exports on ` +
            `2026-09-18. Offending snippet(s):\n` +
            matches.map((m) => `  ${m.replace(/\s+/g, " ")}`).join("\n"),
        );
      }
    },
  );
});
