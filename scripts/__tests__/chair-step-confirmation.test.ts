/**
 * ATTACK-8 §8.1 — THE CHAIR-STEP CONTRACT GETS A FORCING FUNCTION.
 *
 * `-- chair-step:` stands in for `-- additive: yes` AND `-- guard:` and excuses every
 * non-additive reason, so the one thing it may never be is unattended. ATTACK-7 found it
 * was a `print` statement in the runner both release trains execute. The fix is correct in
 * both languages and had NO test in either — `grep isatty|isTTY` over `db/tests/` and
 * `scripts/__tests__/` returned nothing — and the conformance corpus cannot reach it,
 * because `--judge-only` stops at the verdict and never opens a terminal. So the instance
 * was fixed and the class was not: the next edit to either function reddened nothing.
 *
 * THESE TESTS DRIVE A REAL PTY. `process.stdin.isTTY` is a property of the PROCESS, so a
 * mock proves nothing about the branch that matters: the harness runs in a process with an
 * actual terminal on its stdin, opened by `pty.openpty()`. The Python twin,
 * `aidream/db/tests/test_chair_step_confirmation.py`, drives `_confirm_chair_step` through
 * the same primitive and asserts the same three outcomes.
 *
 * RED, proven 2026-09-16 against a mutated copy in a scratch directory: with the `isTTY`
 * guard removed the no-terminal case returns null — the unattended apply ATTACK-7 found.
 * Accept any answer and the third test fails; accept a prefix and the second does.
 *
 * If python3 is absent this suite FAILS as UNMEASURED. It never skips: "the chair step is
 * confirmed at a terminal" is exactly the claim nobody may make without measuring it.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "..", "..");
const HARNESS = resolve(__dirname, "fixtures", "chair-step-harness.ts");
const FILE = "custom_entity_types_detail_variant_down.sql";
const WHY = "§8.9 step 3a, the one production undo";

/**
 * A REAL TERMINAL, via `pty.openpty()` in a two-dozen-line Python driver.
 *
 * `script(1)` is the obvious tool and cannot be used from a test runner: on macOS it calls
 * `tcgetattr` on its OWN stdin, which is a pipe under Jest, and dies with
 * "Operation not supported on socket" before the command ever starts. `pty.openpty()` is
 * the same primitive without that requirement, and python3 is on every machine this repo
 * runs on. Absent = UNMEASURED, never skipped.
 */
const PTY_RUN = resolve(__dirname, "fixtures", "pty-run.py");

function python3Exists(): boolean {
  const probe = spawnSync("sh", ["-c", "command -v python3"], { encoding: "utf8" });
  return probe.status === 0 && probe.stdout.trim().length > 0;
}

function resultOf(output: string): string | null {
  const line = output.split("\n").find((l) => l.startsWith("RESULT "));
  if (!line) throw new Error(`the harness printed no RESULT line. Got:\n${output}`);
  return JSON.parse(line.slice("RESULT ".length)) as string | null;
}

/** Run the harness on a REAL pty, typing `answer` at its prompt. */
function inATerminal(answer: string): string | null {
  const res = spawnSync(
    "python3",
    [PTY_RUN, answer, "--", "npx", "tsx", HARNESS, FILE, WHY],
    { cwd: ROOT, encoding: "utf8", timeout: 180_000 },
  );
  return resultOf(`${res.stdout ?? ""}${res.stderr ?? ""}`);
}

describe("the chair-step confirmation, driven through a real pty", () => {
  it("has a harness and a pty driver to run it on — otherwise this suite is UNMEASURED", () => {
    expect(existsSync(HARNESS)).toBe(true);
    expect(existsSync(PTY_RUN)).toBe(true);
    expect(python3Exists()).toBe(true);
  });

  it("REFUSES a process with no terminal — the shape both release crons have", () => {
    const out = execFileSync("npx", ["tsx", HARNESS, FILE, WHY], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 120_000,
    });
    const result = resultOf(out);
    expect(result).not.toBeNull();
    expect(result).toContain("NO TERMINAL");
    expect(result).toContain(WHY);
    expect(result).toContain("Run it by hand, from a terminal");
  });

  it("REFUSES at a terminal when the filename is not typed back exactly", () => {
    const result = inATerminal(FILE.slice(0, -4));
    expect(result).not.toBeNull();
    expect(result).toContain("chair step NOT confirmed");
    expect(result).toContain("Nothing ran.");
  });

  it("CONFIRMS at a terminal when the filename is typed back exactly", () => {
    expect(inATerminal(FILE)).toBeNull();
  });
});
