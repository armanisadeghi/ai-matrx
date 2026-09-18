/**
 * THE CHAIR-STEP CONFIRMATION — a chair step runs only when the command NAMES it.
 *
 * A `-- chair-step:` file is non-additive (DROP / REVOKE / DELETE …). It stands in for
 * `-- additive: yes` and `-- guard:` and excuses every non-additive reason, so the one thing it
 * may never be is run BY ACCIDENT — by a sweep, a cron, or a lane that did not mean to.
 *
 * 🚨 OWNER RULING (Arman, 2026-09-18): *"The block is not so that my top agent doesn't do it...
 * the block is to ensure that the little agents (sonnet 5 or gpt luna) don't do it and they go to
 * the bigger models... Opus, Fable / Sol, Astra -- never going to me! I don't do terminals."*
 *
 * Until that day this function refused a non-TTY stdin and made a HUMAN type the filename at a
 * terminal (ATTACK-6 finding 4, 2026-09-15). Agents have no terminal, so every drop on the
 * platform was handed to Arman as a command to run — and an unapplied chair step left in the swept
 * directory halted every unattended release. The accident it guarded against is real; the remedy
 * was aimed at the wrong person. The confirmation is now an ARGUMENT, not a keyboard:
 *
 *   pnpm db:apply migrations/inverse/<file>.sql --confirm-chair-step <file>.sql
 *
 * A sweep never passes that flag, so a sweep can never run one. Nothing here is interactive.
 *
 * It lives in its own module because `scripts/apply-migration.ts` calls `main()` at import time,
 * so nothing can import a function out of it without running the CLI. Same contract,
 * byte-for-byte, as `_confirm_chair_step` in `aidream/db/apply_migrations.py`.
 */

/** The refusal an unnamed chair step gets. Exported so the test asserts the words, not a regex. */
export function chairStepRefusal(filename: string, why: string): string {
  return (
    `\`-- chair-step: ${why}\` was reached without being NAMED.\n` +
    `  A chair step is non-additive (DROP / REVOKE / DELETE …), so no sweep may run it by accident:\n` +
    `  it runs only when the command names it —  --confirm-chair-step ${filename}\n` +
    `  WHO RUNS IT: the senior session that owns the work (Opus, Fable, Sol, Astra). A smaller lane\n` +
    `  (Sonnet, Luna) hands it UP to the session that dispatched it. It is NEVER handed to Arman — he\n` +
    `  does not run commands. An unapplied chair step belongs in a directory no release sweeps\n` +
    `  (matrx-frontend: migrations/inverse/), not in the swept migrations directory.`
  );
}

/**
 * Returns the refusal, or `null` when `filename` is among the names the command passed to
 * `--confirm-chair-step`. Exact basename match. Never reads stdin.
 */
export async function confirmChairStep(
  filename: string,
  why: string,
  confirmedNames: readonly string[],
): Promise<string | null> {
  return confirmedNames.includes(filename) ? null : chairStepRefusal(filename, why);
}
