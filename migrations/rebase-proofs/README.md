# `migrations/rebase-proofs/` — the clone proofs a ledger rebase reads

One JSON per **exact file body**, named `<sha256 of the .sql bytes>.json`, written by
`pnpm db:apply --ledger-rebase <file> --target clone` and read by the same command at
`--target production`. The rule and the reason: `scripts/lib/ledger-rebase.ts` (lane
LEDGER-REBASE, chair ruling 2026-09-22); aidream keeps its own under
`db/migrations/rebase-proofs/`, same shape.

A proof exists only when the file's committed bytes were run on the dev clone in a rolled-back
transaction and changed **zero objects** (the full inventory: function bodies, views, policies,
indexes, ACLs, tables, columns, constraints, triggers) and wrote **zero rows**. It is what lets a
production ledger row whose original bytes are lost move onto the bytes we have.

**Bound to the bytes** (one changed character and it stops answering), **sealed** (`proof_sha256`
is the hash of its own contents; a hand edit is refused), **bound to the ledger** (it records the
checksum the row held when it was taken) and **short-lived** (believed for 36 hours). Checked in so
the chair's machine finds it. Deleting one is safe; it costs a clone run.
