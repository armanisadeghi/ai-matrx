# `scripts/check-*.ts` guards

Every `scripts/check-*.ts` file is a forcing-function guard: it scans or queries the
real system and fails when it finds a real defect (never a mock or manufactured
fixture) — see `common-docs/policies/` for the forcing-function doctrine.

🚨 **A new guard must pass `pnpm check:guards-drain` before it is committed.** That
guard scans every `scripts/check-*.ts` file and fails on a bare `process.exit(`, a
locally re-grown drain helper, or a call to `exitAfterDrain` that is never imported
from `./lib/exit-after-drain` (DD-232, DD-243). `process.exit(code)` tears the
process down with whatever is still sitting in the stdout pipe buffer — and a pipe
is how the release gates, CI, and every `| tee` / `| grep` / `| tail` read a guard —
so a guard that exits that way can silently deliver only part of its findings while
still exiting with the right code. Exit through `exitAfterDrain(code)` from
`scripts/lib/exit-after-drain.ts` instead; it is a drop-in replacement for
`process.exit(code)` everywhere that call appeared.
