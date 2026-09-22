# `migrations/measurements/` — the hash-bound measurements the runner reads

One JSON per **exact file body**, named `<sha256 of the .sql bytes>.json`, written by
`pnpm db:rehearse <file> --target clone` (add `--measure-only` for the measure pass alone) and
read by `pnpm db:apply`.

Today it backs exactly one thing: the `-- policy-ddl: one-table` exemption (chair ruling
2026-09-22). The census made every policy migration window-class, because policy DDL freezes the
23-relation `supautils.policy_grants` set until COMMIT. POLICY-LOCK's midday allowance survives
that — **as an exemption the runner proves, never a switch a file asserts.** A file declaring
`-- policy-ddl: one-table` runs at production outside the 1–4 AM window only when the runner can
prove, itself, that (a) every policy statement names the same one table and the file is
policy-only, and (b) a record HERE, for these exact bytes, measured first-policy-DDL → end of
transaction under 200 ms on the dev clone.

**These files are checked in**, because the runner on another machine must find the measurement.
**They are bound to the bytes**: change one character of the migration and the record stops
answering for it, and the runner refuses naming the missing proof — a measurement of an earlier
draft is a measurement of a different file. Deleting a record is safe; it costs a rehearsal.

Proof: `pnpm check:migration-window-class:self-test` arms RED-6 through GREEN-6.
