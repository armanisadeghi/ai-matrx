# ONE-HOME pending work (parked 2026-10-03, weekly usage limit)

NOT APPLIED. Kept here so it survives the session. The lane's state and order live in
common-docs `projects/data-doctrine-adoption/v6/PROGRESS-ONE-HOME.md` (RESUME HERE).

- `soak/` — SOAK-clock removal of the old switch machinery. Code patches (frontend, aidream, matrx-local)
  may apply any time after 2026-10-03 20:38Z: `git apply --check`, then apply, typecheck, guards, commit by
  pathspec. `db-soak.sql` (+ inverse) is destructive: the chair runs it with Arman, after a clone proof.
  Order: `soak/apply-order.md`.
- `dd065/` — legacy owner columns, batch 1 (expand + contract SQL, extension + aidream ORM patches).
  Clone-proven 2026-10-02. Column changes: the chair's window with Arman.
