# docs/db_rebuild — index

Canonical-DB rebuild / cutover docs. **Read the live set first.**

## Live (source of truth)
- **`official/`** — the owner's lane, authoritative:
  - `db-rulebook.md` — paradigm + rules + standing decisions (read first).
  - `db-status.md` — what's done / what remains (the only backlog).
  - `db-changelog-for-team.md` — outward log of shipped DB changes.
  - `app-cutover-done.md` — FE/app cutover done-log.
- **`CUTOVER_HANDOFF.md`** — cross-repo execution state, the repeatable playbook, hard-won gotchas. The "step in cold" doc.

## Live supporting docs (kept — not in official/, but current/referenced)
- `CHANGEOVER_PROGRESS.md` — live Wave-3 base-retrofit tracker + decisions log (used by the `db-table-retrofit` skill).
- `db-core-standards-and-automation.md` — the implemented base-column / RLS / versioning / trigger / cron spec ("the standard").
- `db-canonical-rls.md` — the ONE RLS mechanism (`iam.apply_rls` v2 + `iam.has_access`); + `db-canonical-rls-sweep-todo.md` (open per-table sweep) + `CANONICAL_RLS_LANE.md` (active lane fence).
- `db-canonical-access-model.md` — what access *means* (the registries + resolution order); referenced by `scopesService.ts`.
- `ctx-association-architecture.md` — the association / context model decisions (trimmed to decisions/invariants).
- `canonical-cutover-plan.md` — ctx junction-table cutover execution state (referenced by scopes FEATURE).
- `canonical-sharing-unification.md` — sharing-token unification w/ the access model (referenced by sharing FEATURE).
- `03-app-agent-cutover-instructions.md` — app-agent cld_/cx_/wf_ cutover spec (referenced by sharing/files FEATUREs + migrations).
- `compat-view-drop-repoint-list.md` — aidream consumers to repoint before dropping `file_*`/`ctx_war_room_*` compat views.
- `db-staging-and-cutover-plan.md` — governs the remaining destructive waves (PITR gate, move-to-graveyard, branch rehearsal).
- `warroom-canonical.md` — War Room canonical cutover (the first feature ported onto the substrate) + layered-fetch design.
- `_TO_FOLD_INTO_OFFICIAL.md` — nuggets to fold into `official/` (owner action), then delete.

## Archived / deleted (2026-06-26 consolidation)
Removed as fully captured by the live set above (rulebook's own doc-index marks most as archived):
- `01-db-canonical-backlog.md` (db-status is the only backlog), `02-db-changelog-for-team.md` (older copy of official changelog; its unique `apply_rls v2` §0 → fold-list), `README-ctx-association.md` (pointer/index), `_original-concept.md` + `db-base-standards-review-and-integration.md` (founding draft + its review — implemented form is `db-core-standards-and-automation.md`), `HANDOFF.md` (superseded by `CUTOVER_HANDOFF.md`; rename rule → fold-list), `db-handover-notes.md` (live-state in db-status/CUTOVER_HANDOFF; file-category standard → `warroom-canonical.md`), `db-first-cut-execution-plan.md` (historical non-destructive-foundation log), `db-generic-shared-tables-and-migration.md` (generic-table migration guide — done; state in `canonical-cutover-plan.md`), `db-rls-safety-fields-categorization.md` (RLS in `db-canonical-rls.md`, safety in `db-staging-and-cutover-plan.md`).
- Merged into `warroom-canonical.md`: `warroom-thread-integration-and-standards.md` + `breaking/war-room-cutover-handoff.md`.
