# ONE-HOME wave 4 — SOAK clock — apply order

Not before **2026-10-03 20:38Z (13:38 PT)**. Patches were built in scratch clones and nothing was applied to a shared tree. Each patch was rebased onto the HEAD shown below.

| Patch | Checked against HEAD | `git apply --check` |
|---|---|---|
| `matrx-frontend-soak.patch` (97 files, +601 −9,830) | `d57790d19c8f9d157ac8d4a6ae1e8b0c9b516734` | Applies on a fresh clone. On the shared working tree it fails at `features/unified-data/table-page/UnifiedTable.tsx`, because a peer has an uncommitted edit there. Apply after that edit is committed, then re-check. |
| `aidream-soak.patch` (80 files, +189 −9,340) | `9ddd6386a84c3222ed5937f0946d4db42d430e5b` | Applies on a fresh clone and on the shared tree. |
| `matrx-local-soak.patch` (5 files, +55 −138) | `9c4cf6a0bb52a3a7578c34fb1acbb91916cb45a8` | Applies on a fresh clone and on the shared tree. |
| `matrx-frontend-soak-after-db.patch` (1 file: baseline `db_doors` emptied) | stacks on the frontend patch | Applies on top of `matrx-frontend-soak.patch`. |
| `db-soak.sql` + `db-soak-inverse.sql` | production bodies re-read at 13:2xZ (76 of 76 md5 identical) | **CLONE PROOF OWED** for 4-LAST and the inverse round-trip. |

HEADs move about every 30 minutes. If a check fails at apply time, rebase the hunk; never force it.

## Order

1. **DB section 0 only** (additive): `platform.cutover_press_history(integer)` and its door row. It can go any time. The new admin page `/administration/database/switch-presses` reads it and shows the door's refusal until it exists.
2. **aidream patch.** Commit by pathspec. Publish **@ai-matrx/records-ui** before any consumer bumps: `publish-gate.ts` was internal and not exported, so no consumer breaks. The `matrx-records` Python package loses `matrx_records.switch` and `movers.{move,user_tables,attributes,removals,claim,copy_again}`; grep showed no importer left in the five repos.
3. **matrx-local patch.**
4. **frontend patch.** It removes every frontend caller of `final_switch_*`, `unified_data_ramp_*` and `table_copy_evaluation_state`, plus the safety-net press suites.
5. **DB main transaction** (`db-soak.sql` sections 1–3, 5–8; one transaction, `lock_timeout 3s`). Run it in the chair's window with Arman, after step 4 is deployed. First: re-run the clone proof once the roll-up says "clone quiet".
6. **Right after step 5:** apply `matrx-frontend-soak-after-db.patch`. Then regenerate the generated DB type files in both repos, `knobDatabaseConsumers.generated.ts`, aidream records `store.generated.ts` and `scripts/t13_row_column_db_baseline.json`. Run `pnpm check:old-system-unreachable:db` and the safety-net `cutover.state`. Both should be green.
7. **4-LAST** (switch-back trigger drop): only in the 01:00–04:00 PT window, announced. On the clone, DROP TRIGGER took ACCESS EXCLUSIVE locks on `auth.*`.
8. **LATER (commented in the SQL):** `custom.store_is_open`. Its callers include matrx-extend and the frontend `unifiedDataCampaign*`, both still live. Then `data_tables.older_tables_moved`, the `*_unarchive` helpers and the copy fences, which go with CTX.

## Guards after the patches

- aidream `tests/test_older_tables_never_return.py`: `ALLOWED` drops from 8 entries to 1, the ruled keep `user_data/picklists_queries.py`.
- frontend `check:old-system-unreachable` baseline: 18 entries removed. 62 remain: KIND-RECORDS 17, NOT-OLDER 3, CONTEXT-DAY 2, CUTOVER-CENSUS 38, and SHARING-REGISTRY 2 (relabelled; this is an access ruling). SCOPES-WEB-REVERT already left main with the scopes flip.
- Pre-existing red on main, not from this patch: `aidream:apps/shared/records/src/core/landingOutcomes.ts content_ir.kind_instance` (aidream commit 28e8929e93, owner KIND-RECORDS).
