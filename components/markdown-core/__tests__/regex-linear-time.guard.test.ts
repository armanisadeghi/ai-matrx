/**
 * LINEAR-TIME GUARD for the chat render hot path (kind-never-raw round 11,
 * F1/F2). Each adversarial ~100 KB input must finish under its budget; the
 * cases run in a child process so a catastrophic-backtracking hang FAILS (the
 * child is killed at the timeout and the cases it never reported fail) instead
 * of freezing the suite. Proven failing on the pre-round-11 code: the `[`
 * heuristic was cubic (2 000 spaces → 2.8 s), the escaped forms and the
 * numbering scan quadratic, the kind scanner quadratic per broken region.
 *
 * Budgets are generous for a loaded machine (linear code measures single-digit
 * ms here); the old code misses them by orders of magnitude.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { REGEX_LINEAR_TIME_CASES } from "./regex-linear-time.cases";

const ROOT = path.resolve(__dirname, "../../..");
const BUDGET_MS = 150;
const CHILD_TIMEOUT_MS = 150_000;

jest.setTimeout(CHILD_TIMEOUT_MS + 30_000);

let results: Map<string, number> | null = null;
let failure = "";
function run(): Map<string, number> {
  if (results) return results;
  const child = spawnSync(
    path.join(ROOT, "node_modules/.bin/tsx"),
    [path.join(__dirname, "regex-linear-time.runner.ts")],
    { cwd: ROOT, encoding: "utf8", timeout: CHILD_TIMEOUT_MS, maxBuffer: 1 << 20 },
  );
  results = new Map();
  for (const line of (child.stdout ?? "").split("\n")) {
    if (!line.startsWith("{")) continue;
    const row = JSON.parse(line) as { name: string; ms: number };
    results.set(row.name, row.ms);
  }
  if (child.error || child.status !== 0) {
    failure = `runner ${child.error ? String(child.error) : `exit ${child.status} ${child.signal ?? ""}`}: ${(child.stderr ?? "").slice(0, 2000)}`;
  }
  return results;
}

describe("render hot path — linear time on adversarial input (child process, hang = fail)", () => {
  it.each(REGEX_LINEAR_TIME_CASES.map((c) => [c.name]))("%s finishes under the budget", (name) => {
    const ms = run().get(name);
    if (ms === undefined) throw new Error(`${name} never finished (hang or crash). ${failure}`);
    expect(ms).toBeLessThan(BUDGET_MS);
  });
});
