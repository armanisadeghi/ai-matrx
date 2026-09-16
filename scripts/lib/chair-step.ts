/**
 * THE CHAIR-STEP CONFIRMATION — extracted from `scripts/apply-migration.ts` so it can be
 * DRIVEN, not just read (ATTACK-8 §8.1).
 *
 * ATTACK-7's most dangerous finding was that `-- chair-step:` was an owner-awake step in
 * one runner and a `print` in the other — the one both release trains execute. The fix is
 * correct in both languages and had NO test in either: `grep isatty|isTTY` over
 * `db/tests/` and `scripts/__tests__/` returned nothing, and `--judge-only`, which is what
 * the conformance corpus drives, stops at the verdict and never reaches this function. The
 * instance was fixed; the class was not, and the next edit to either function would have
 * reddened nothing.
 *
 * `scripts/__tests__/chair-step-confirmation.test.ts` now drives this through a REAL pty
 * (`script(1)`), and `aidream/db/tests/test_chair_step_confirmation.py` drives its Python
 * twin through `pty.openpty()`. It lives in its own module because
 * `scripts/apply-migration.ts` calls `main()` at import time, so nothing can import a
 * function out of it without running the CLI.
 *
 * Byte-for-byte the same contract as `_confirm_chair_step` in
 * `aidream/db/apply_migrations.py`.
 */
import { createInterface } from "node:readline";

const C = process.stdout.isTTY
  ? { bold: "\u001b[1m", reset: "\u001b[0m" }
  : { bold: "", reset: "" };

/**
 * `-- chair-step:` IS A CHAIR STEP (ATTACK-6 finding 4).
 *
 * 🚨 It stands in for `-- additive: yes` AND `-- guard:` and excuses every non-additive
 * reason, and what it did in exchange was `console.log`. Rule 9 ("nothing irreversible
 * on production, in any lane, ever") and §4.9 ("refused by both, in every lane, with no
 * exception") were therefore false of one comment line — on a path two unattended
 * 30-minute crons run. "With the owner awake" now means what it says: a non-TTY stdin
 * is refused outright, and a TTY must TYPE the filename back.
 */
export async function confirmChairStep(filename: string, why: string): Promise<string | null> {
  if (!process.stdin.isTTY) {
    return (
      `\`-- chair-step: ${why}\` reached --target production from a process with NO TERMINAL.\n` +
      `  A chair step is an owner-awake step: it stands in for \`-- additive: yes\` and\n` +
      `  \`-- guard:\` and excuses every non-additive reason, so the one thing it may never be\n` +
      `  is unattended. Both release trains run exactly like this, on a 30-minute cron.\n` +
      `  Run it by hand, from a terminal, and type the filename when it asks.`
    );
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await new Promise<string>((res) =>
      rl.question(
        `${C.bold}Type the filename to run this chair step against PRODUCTION${C.reset} ` +
          `(${filename}), or anything else to abort: `,
        (a) => res(a.trim()),
      ),
    );
    if (answer !== filename)
      return `chair step NOT confirmed — you typed ${JSON.stringify(answer)}, not ${filename}. Nothing ran.`;
    return null;
  } finally {
    rl.close();
  }
}
