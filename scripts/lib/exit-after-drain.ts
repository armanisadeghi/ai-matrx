/**
 * THE ONE EXIT PATH FOR EVERY `scripts/check-*.ts` GUARD.  (DD-232)
 *
 * WHY THIS EXISTS — measured, not theorised
 * ----------------------------------------
 * `process.exit(code)` tears the process down with whatever is still sitting in
 * the stdout pipe buffer, and stdout **to a pipe** is asynchronous in Node. A
 * pipe is how a release gate, a CI step, a log collector and every `| tee`,
 * `| grep` and `| tail` read a guard. So a guard that exits this way can print
 * its findings and have most of them never arrive — while still exiting 1, so
 * nothing looks wrong.
 *
 * Three measurements, all on this repository:
 *
 *  - **B-110, 2026-09-14** — `check:anon-write-surface | grep FAIL` returned ONE
 *    line; the same command redirected to a file returned THREE.
 *  - **B-120, 2026-09-14** — `check:staff-door` wrote 10 residue rows through
 *    `| sed` and all of them straight to a file. For a guard whose whole design
 *    is "a NAMED set, not a budget number", the names were the output being lost.
 *  - **B-122, 2026-09-14** — a guard shape emitting 4,000 findings wrote 4,000
 *    lines to a file and **810** through a pipe whose reader was busy for one
 *    second. 3,190 findings vanished; the exit code was still 1.
 *
 * V-97 could not reproduce a truncation on ten of today's guards, because they
 * all emit less than the 64 KB pipe buffer and a fast reader keeps up. That is
 * the whole hazard: the class is silent until a guard's findings list grows or
 * the reader stalls, and then it eats exactly the output that mattered.
 *
 * HOW IT IS FIXED
 * ---------------
 * Two independent belts, because either one alone has a hole:
 *
 *  1. **Blocking stdio, installed when this module is imported.** Every write to
 *     stdout/stderr completes before the next statement runs, so there is never
 *     anything left to lose — including output written long before the exit call
 *     and output written by code that never reaches `exitAfterDrain`.
 *  2. **A drain at the exit itself.** `exitAfterDrain(code)` flushes both streams
 *     and only then calls `process.exit`.
 *
 * `exitAfterDrain` is SYNCHRONOUS and returns `never`, so it substitutes for
 * `process.exit(code)` anywhere the old call appeared — inside a `never`-returning
 * helper, at the tail of a `main().then(...)`, in a `catch`, in `process.exit(main())`.
 *
 * 🚨 **Never call `process.exit()` directly from a `scripts/check-*.ts` file.**
 * `pnpm check:guards-drain` fails the release gates on a bare call.
 */

type MaybeBlocking = { setBlocking?: (blocking: boolean) => void };

let installed = false;

/**
 * Make stdout and stderr synchronous so no write can be left in a pipe buffer.
 *
 * Idempotent and total: a stream that is already synchronous (a file or a TTY on
 * POSIX) has no `_handle.setBlocking` and needs nothing; a pipe is a `net.Socket`
 * over a libuv `Pipe`, which does. Failure here is never fatal — the drain in
 * `exitAfterDrain` is the second belt — but it is never silent either: it is
 * reported on stderr with the remedy, per "nothing fails silently".
 */
export function installBlockingStdio(): void {
  if (installed) return;
  installed = true;
  for (const [name, stream] of [
    ["stdout", process.stdout],
    ["stderr", process.stderr],
  ] as const) {
    try {
      const handle = (stream as unknown as { _handle?: MaybeBlocking })._handle;
      if (handle && typeof handle.setBlocking === "function") handle.setBlocking(true);
    } catch (e) {
      process.stderr.write(
        `[check] WARNING: could not make ${name} blocking (${(e as Error).message}). ` +
          `Findings may be lost if this guard's output is piped to a slow reader; ` +
          `redirect to a file instead of a pipe to read the complete report.\n`,
      );
    }
  }
}

installBlockingStdio();

/**
 * Flush stdout and stderr, then exit with `code`. The drop-in replacement for
 * `process.exit(code)` in every `scripts/check-*.ts`.
 */
export function exitAfterDrain(code: number): never {
  installBlockingStdio();
  try {
    // Writing an empty chunk forces the stream to push anything queued ahead of
    // it; with the handle blocking this returns only once the bytes are gone.
    process.stdout.write("");
    process.stderr.write("");
  } catch {
    // A closed sink (the reader hung up, e.g. `| head -1`) is not a guard defect.
  }
  process.exit(code);
}

export default exitAfterDrain;
