// 🚨 ONE PREDICATE for "an open question" — the static half.
//
// Twin: aidream `services/distillation/tests/test_coherence.py`
// `test_no_surface_re_derives_what_an_open_question_is`.
//
// On 2026-09-12 the Rulebook page header counted `state === "open"` straight
// off the metadata while the panel one line below also required the rules to
// still resolve. A repair had removed those rules, so the Expert read "4
// questions only you can settle are still open." above a panel with nothing in
// it. A count and a list answering the same question with two predicates is the
// screen lying — so only `coherence/types.ts` is allowed to say what open means.

import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..");
const OWNER = join("coherence", "types.ts");
const RAW_OPEN = /\.state\s*===\s*"open"|state:\s*"open"\s*\)/;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [full] : [];
  });
}

describe("what counts as an open question", () => {
  it("is decided in exactly one file", () => {
    const offenders = walk(ROOT)
      .filter((file) => !file.endsWith(OWNER))
      .filter((file) => {
        const text = readFileSync(file, "utf8");
        return /tension/i.test(text) && RAW_OPEN.test(text);
      })
      .map((file) => file.slice(ROOT.length + 1));
    expect(offenders).toEqual([]);
  });
});
