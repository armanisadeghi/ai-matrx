/**
 * A WORD ESTIMATE SAYS IT IS ONE — cold walk 23 (friction), the class.
 *
 * "420 words" for 447: the Masterwork record printed characters ÷ 5.5 as if it
 * were a count. The record now counts real words; the sites that only have a
 * character count keep the estimate and must SAY so — a "~" on the number or
 * "Estimated" in the label, within a few lines of the arithmetic. This scans
 * every source file, so a new `/ 5.5` with neither fails here.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const REPO_ROOT = join(__dirname, "..", "..", "..", "..", "..");
const ROOTS = ["app", "components", "features", "../aidream/apps/shared/chat/src", "lib", "hooks", "utils"];
const WINDOW = 12;

function* sourceFiles(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const path = join(dir, name);
    const st = statSync(path);
    if (st.isDirectory()) yield* sourceFiles(path);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) yield path;
  }
}

/** Lines that turn characters into words by ÷ 5.5 with no estimate marker nearby. */
export function unmarkedWordEstimates(source: string): number[] {
  const lines = source.split("\n");
  const out: number[] = [];
  lines.forEach((line, i) => {
    const code = line.trim();
    if (code.startsWith("//") || code.startsWith("*") || code.startsWith("/*")) return;
    if (!/\/\s*5\.5\b/.test(code)) return;
    const near = lines
      .slice(Math.max(0, i - WINDOW), i + WINDOW + 1)
      .join("\n");
    if (!/~|estimat/i.test(near)) out.push(i + 1);
  });
  return out;
}

describe("a characters ÷ 5.5 word number is always marked as an estimate", () => {
  it("the detector catches the walk-23 shape and passes a marked one", () => {
    expect(
      unmarkedWordEstimates(
        "function wordCount(chars: number) {\n  const words = Math.round(chars / 5.5);\n  return `${words} words`;\n}",
      ),
    ).toEqual([2]);
    expect(
      unmarkedWordEstimates(
        "const words = Math.round(chars / 5.5);\nreturn `~${words} words`;",
      ),
    ).toEqual([]);
  });

  it("no source file prints one unmarked", () => {
    const offenders: string[] = [];
    for (const root of ROOTS) {
      let dir: string;
      try {
        dir = join(REPO_ROOT, root);
        statSync(dir);
      } catch {
        continue;
      }
      for (const file of sourceFiles(dir)) {
        for (const line of unmarkedWordEstimates(readFileSync(file, "utf8"))) {
          offenders.push(`${relative(REPO_ROOT, file)}:${line}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
