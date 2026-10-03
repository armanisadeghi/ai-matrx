# ONE-HOME wave 4 · SOAK · DATABASE — evidence

Written 2026-10-03 ~01:00–01:40 PT. Production read only through `q.mjs` (matrx_reader, session pooler, read-only).
Code census on the owner's snapshots in `repos/` (matrx-frontend 8e7e133228 **with the frontend SOAK patch staged** —
the final-switch and ramp screens/route already show as deleted there; aidream 621b9a6d0a; matrx-local 64b2d0087a) and
the matrx-extend shared checkout 9ea39d8c (read-only). Search: ripgrep `-w`, excluding `*.sql`, `*.md`, node_modules.
Raw outputs kept beside this file: `dropsigs.txt`, `drop_hits_summary.txt`, `tomb_hits.txt`, `soak_hits.txt`,
`edges.txt`, `doors.json`, `md5_prod.txt`, `md5_clone.txt`, `dryrun.out`.

## Counts

| | Count |
|---|---|
| Functions dropped, main transaction | 65 (40 public tombstones, 17 final-switch machinery, `final_switch_acting`, 6 ramp overloads, `table_copy_evaluation_state`) |
| Functions dropped, separate last transaction (4-LAST) | 1 (`workbench._moved_older_table_restores_with_switch_back`) + its trigger |
| Functions replaced (gate removed) | 10 |
| Functions added | 1 (`platform.cutover_press_history(integer)`) + its door row |
| Door rows deleted with their functions | 39 (`platform.client_callable_door`) |
| Seams retired | 5 |
| Knobs archived | 1 (`custom.data_home_shell`) |

## §0 Press-history door (owner request)

Exact signature: `platform.cutover_press_history(p_limit integer default 500) returns table (id uuid, seam_key text,
organization_id uuid, direction text, outcome text, refusal text, says text, pressed_by uuid, pressed_at timestamptz,
note text)`, ordered `pressed_at desc, id`, limit clamped 1..5000. SECURITY DEFINER, `set search_path = ''`, STABLE.
Refuses with 42501 and "Only a platform administrator, in the admin app, can read the switch press history." unless
`public.is_platform_admin()`. That function exists on production (SECURITY DEFINER). It requires
`platform.admin_lane_open()` plus a `public.current_user_is_admin` row, so the call must come from the admin app's
lane. `public.is_admin()` is the other admin check: same lane, `admin.admins` row. EXECUTE goes to `authenticated`
only (public, anon and service_role are revoked). Clone ACL after the apply:
`{postgres=X/postgres,authenticated=X/postgres}`. The door row in `platform.client_callable_door` is declared before
the grant. Without it, `ddl_guard[definer_client_grant_revoked]` revoked the grant in the first dry run.

## §1 Public tombstone doors (40)

Census query: `pg_proc` in schema `public` where `prosrc ilike '%older tables moved%'` gives 40 rows. Each body matches
the whole-body regex `^\s*begin\s*(--…\n)*raise exception 'The older tables moved[^;]*;\s*end;\s*$'`, so each body
is only the refusal. Of the 40, 19 had EXECUTE to `authenticated`. Every one is listed in `dropsigs.txt`.

- **pg_depend:** no dependents.
- **Other bodies that name them:** `platform._final_switch_old_write_doors` (dropped here) and
  `custom.autonumber_backfill` / `custom.table_decorate` (comments only). `platform._t13_allowlist` names them inside a
  string array; that list only shrinks and a stale entry is harmless. `workbench._switched_org_makes_nothing_older`
  and `platform._pick_list_born_in_store` name them in message and hint strings. `public._d31_impl_update_user_table_config`
  names them in hint text. `public.udt_dataset_rows_validate_trigger` really calls `udt_validate_row`, but that
  trigger is **disabled** (`tgenabled = 'D'`) on `deprecated.udt_dataset_rows`. Every trigger on the deprecated tables
  is disabled except `_0_graveyard_takes_no_writes`. The trigger function stays, with the graveyard decision.
- **Code:** no runtime caller in any of the four repos. What remains is guards
  (`scripts/check-old-system-unreachable.ts` + `old-system-unreachable/baseline.json`,
  `aidream/tests/test_older_tables_never_return.py`, `the-table-surface-writes-only-through-the-seam.test.ts`,
  `list-rpc-reads-never-truncate.test.ts`), generated types, comments (aidream records `grid.ts`, `doors.ts`,
  `table-style.ts`, `validation.ts`, `gridColors.tsx`; frontend `check-impl-doors.ts`, `check-branch-schema-drift.ts`),
  and old walk scripts that expect the refusal (`campaign-tests/fix15_*`, `valref_*`,
  `refusal_the_csv_wizard_*`, `grid-port-walk.mjs`, `cutover-census/census.ts` + `integrations.ts`).
  `update_field_metadata` hits in aidream are the Vault's own Python function of the same name, not the door.
- **Stay:** `get_structured_list_for_selection` (store body, not a tombstone), `list_udt_dataset_templates` (CTX), and
  the helpers and triggers still attached to deprecated tables (`udt_log_row_version`,
  `udt_dataset_rows_validate_trigger`, `inherit_table_security_on_insert`, `cascade_table_security_settings`,
  `_d31_impl_*`, `get_user_list_with_items`, `get_user_lists_summary`, `update_user_list`, `udt_validate_cell_rules`,
  `udt_cast_jsonb_value`, `udt_dataset_row_versions_trim*`).
- **pg_cron:** job 13 `udt_dataset_row_versions_trim_weekly` is inactive and calls a function that is not a
  tombstone. It is not touched.

## §2 Final-switch machinery

Method: build a call graph from `prosrc` (every function body scanned for each candidate name, `edges.txt`), then
re-check the final drop set against **comment-stripped** bodies (`regexp_replace(prosrc,'--[^\n]*','','g')`) of every
function outside the set. After section 1 removes the gates, the only remaining mentions are these:

- `final_switch_undo` appears in `platform.cutover_seams` and `platform._final_switch_undo_retired` only as the seam-key
  string `'final_switch_undo'`.
- `create_user_list`, `get_user_tables`, `udt_list_example_tables` and `update_user_table_config` appear in strings
  (see §1).
- `udt_validate_row` is called by the disabled trigger (see §1).

pg_depend for the drop set returns one row, the 4-LAST trigger.

**Dropped (17):** `final_switch_press(text,jsonb)` and `final_switch_undo(text,boolean)` (**both** owned doors named
in the frontend guard baseline are dropped), `final_switch_readiness()`, `final_switch_retire_undo(text)`,
`final_switch_state()`, `final_switch_adopt_orphan_lists(uuid)`,
`final_switch_copy_again_record(uuid,text,uuid,boolean,jsonb)`, `_final_switch_readiness()`,
`_final_switch_copy_again_state()`, `_final_switch_orphan_lists()`, `_final_switch_old_write_doors()`,
`_final_switch_person_refusal()`, `_final_switch_record(…)`, `_final_switch_scopes(text,uuid,text,uuid[])`,
`_final_switch_scopes_code()`, `_final_switch_undo_retired_says(cutover_seam_press)` and
`cutover_carry_removals(uuid,uuid[])`. `cutover_carry_removals` is named only in comments: `cutover_copy_differences`
line 223 and `_cutover_seam_readiness` line 93.

**Kept, because a staying function really calls them:**

| Function | Staying caller (real call) |
|---|---|
| `_final_switch_undo_retired` | `cutover_seam_press` line 61, `cutover_seams` (the IF expression is planned for every seam) |
| `_final_switch_platform_org`, `_final_switch_last`, `_final_switch_is_on` | `_final_switch_undo_retired`; `older_tables_switched`; the triggers below |
| `_final_switch_holds_every_organization` | trigger on `platform.cutover_seam_press` (stays) |
| `_final_switch_keeps_no_owner_lists_archived` | trigger on `deprecated.udt_structured_lists` (graveyard decision) |
| `_cutover_carry_back` | `cutover_seam_press` line 133, `_cutover_seam_reverse_readiness` line 23 |
| `_cutover_copy_resync` | `_cutover_seam_apply` line 57 |
| `cutover_copy_differences`, `cutover_difference_sentence`, `cutover_older_removals` (→ `cutover_older_removal_rows`), `cutover_tables_copied` (→ `cutover_older_row_changed_since`), `cutover_scope_*`, `cutover_store_writer_scope_parity` | `_cutover_seam_readiness` lines 124/137/95/39 |
| `cutover_evaluation_carry` | aidream `matrx_records/movers/base.py:1014,1074` (code) |
| `older_tables_switched`, `table_lives_in`, `_older_table_moved_by_switch` | deprecated trigger `_switched_org_makes_nothing_older`; `custom.where_tables_live` / CTX fence; `trash_list` / `org_trash_list` |

The census row "`cutover_carry_*`, `cutover_copy_differences`: SOAK" is therefore only partly true. `cutover_carry_removals`
goes. `_cutover_carry_back` and `cutover_copy_differences` stay until `cutover_seam_press` and `_cutover_seam_readiness`
lose their `older_tables` branches. Those are CTX functions, and rebasing them is outside this brief.

**Hazard noticed, not acted on.** `platform._final_switch_holds_every_organization` is a BEFORE trigger on
`cutover_seam_press`. It refuses (55000) any `done` press of a per-organization seam unless
`app.final_switch_step = 'on'`, and `_final_switch_is_on()` is true today. Only `final_switch_press` and
`final_switch_undo` ever set that marker. So **every per-organization done press of `agent_context` or
`scopes_screens` is refused today**, and still will be after this file. That includes
`cutover_seam_press_everyone` for the scopes flip, and the refusal message points to an Undo that no longer exists.
The last `scopes_screens` press was 2026-09-29, so nobody has hit it since the switch. The scopes lane (CTX) needs this
before it flips.

## §3 Gate removal (10 walls) and `final_switch_acting()`

`final_switch_acting()` = `current_setting('app.final_switch_step') = 'on' and admin_lane_open() and is_admin()`. The
only setters of `app.final_switch_step` are `final_switch_press` and `final_switch_undo` (prosrc scan), so outside
their run it is FALSE. That FALSE path is the normal path. In each wall the `if platform.final_switch_acting() then …
end if;` block and its PRESS-FENCE comment are removed. In `custom._record_rule_uses`,
`if v_me is not null and not platform.final_switch_acting()` becomes `if v_me is not null`.

`ungate.py` produced the bodies from production's `pg_get_functiondef` of 2026-10-03. Its diff check shows only
removed lines, plus the one changed line in `_record_rule_uses`.

Walls: `custom._field_write_door`, `custom._record_rule_uses`, `custom.assert_client_may_change`,
`custom.assert_client_may_open`, `custom.assert_client_may_reach`, `custom.assert_may_know_table`,
`custom.assert_store_door`, `iam._guard_governance_columns`, `iam._guard_private_grant_owner_only`, and
`platform._context_tag_copy_fence` (a CTX fence: it stays, only its gate goes). `custom._workdoors_approval_guard`
names it only in a comment and is not touched. After the apply, the clone dry run counts 0 bodies that still call it.

## §4 Switch-back restore

The trigger `_moved_older_table_restores_with_switch_back` sits on `deprecated.udt_datasets` (disabled) and calls
`workbench._moved_older_table_restores_with_switch_back()`. The only other mention is a comment in
`_moved_older_table_takes_no_writes`. It has no door row.

**Moved to its own last transaction (4-LAST).** On the clone, `DROP TRIGGER` requested **ACCESS EXCLUSIVE on
`auth.users` and on every `auth.*` table** (`refresh_tokens`, `sessions`, `identities`, `mfa_*`, `sso_*`, …) and timed
out behind ordinary readers. The same thing happens for a trigger on a brand-new **temp** table, so it is platform-wide
DDL behaviour, not something about this trigger. `ALTER TABLE … DISABLE TRIGGER` took no auth locks. I could not find
which hook takes the locks: none of the event-trigger bodies lock `auth`.

That is a sign-in lock. Run 4-LAST in the 01:00–04:00 PT window with its 2s `lock_timeout`, announced to Arman. The
general hazard (any DROP TRIGGER locks sign-in) should go to the chair.

The `*_unarchive` helpers live in `workbench` and **stay**. `platform._cutover_seam_apply` (CTX) calls both in its
older_tables `p_to = 'old'` branch (lines 122/127). After the seam retirement that branch can no longer run
(`cutover_seam_press` returns `unknown_switch` for a retired seam), but the call is still in a staying body.
`workbench.udt_dataset_archive` only names `udt_dataset_unarchive` in a hint.

## §5 Copy fences

`custom._older_table_copy_refusal(uuid)` and `custom._older_table_copy_verdict(uuid)` both `return null`. **Both stay.**
The CTX trigger `custom._context_copy_fence` (on `custom.record` and its 16 partitions) calls
`_older_table_copy_refusal` on line 39 and `custom._copy_evaluation_note` on line 41, and `_copy_evaluation_note` calls
`_older_table_copy_verdict` on line 15. They go with the context fence.

`custom.table_copy_evaluation_state(uuid)` is dropped. Its only DB mention is the `_t13_allowlist` string. In code it
appears in aidream records `store.generated.ts` (regenerate), `check-no-custom-store-code.ts`, `integrations.ts`, and
the t13 baseline JSON. The table page menu caller is gone in the patched snapshot.

## §6 `custom.store_is_open` — LATER (commented 9a)

It has 60 DB callers (`edges.txt`), among them `iam.has_access_for_base`, `iam.entity_read_expr`,
`iam.member_lane_confers`, `custom.assert_store_door`, every booking/form/portal/sign door, `history.*`,
`platform.unified_data_store_on` / `_state`, and `cutover_seam_press_everyone`.

Code callers after the patch:

- **matrx-extend:** `src/lib/records/store.ts`, `src/lib/tools/handlers/records.ts` (not in the server lane's list).
- **aidream:** records `core/client.ts`, `core/doors.ts`, `ports.ts`, records-ui `publish-gate.ts`, and
  `matrx_records/server/gateway.py`, `agent/tool.py`.
- **matrx-local:** `records_sync/client.py`, `engine.py`.
- **matrx-frontend:** `lib/knobs/unifiedDataCampaign.register.ts`, `scripts/check-store-doors-decide.ts`,
  `store-off/proof.sh`.
- **Indirectly:** `unifiedDataCampaign.ts` calls `platform.unified_data_store_on`, which reads it.

Not dropped.

## §7 Seams

`platform.cutover_seam.retired_at` (timestamptz, null = live) is the retire mechanism. **Yes: `platform.cutover_seams(org)`
omits retired seams.** Its loop is `for s in select * from platform.cutover_seam where retired_at is null`. After the
clone apply it returned `["agent_context","scopes_screens","saved_views"]`.

`cutover_seam_press`, `cutover_seam_press_everyone`, `_cutover_seam_readiness`, `cutover_census_record` and
`cutover_seam_measure_record` all look seams up with `retired_at is null`. A press or census row for a retired seam is
therefore refused as unknown. `cutover-census/census.ts --record` for `older_tables` / `data_screen` would now be
refused.

`_final_switch_undo_retired()` joins `retired_at is null`, so it returns nothing once `final_switch_undo` is retired.
Its only remaining callers use it in branches for retired seams (`cutover_seams` skips them; `cutover_seam_press`
refuses unknown first).

Retired: `final_switch`, `final_switch_copy_again`, `final_switch_undo`, `older_tables`, `data_screen`. Press rows
(2,338) and measure rows are untouched.

## §8 Knobs and the sharing registry

- **`custom.data_home_shell`** (value true, default false, no overrides). `platform.knob_live_readers`' pair and dotted
  patterns find no reader (the reader role cannot execute that function, so I ran the same regex by hand). Frontend
  code mentions it only in comments, and `store.generated.ts` (aidream) lists it, so regenerate that. It is archived
  by a direct `UPDATE` of `archived_at`, `archived_reason` and `archived_by`, the same columns `platform.knob_archive`
  writes. `knob_archive` refuses unless `public.is_admin()`, which is false for the owner session the chair applies
  with. `knob_resolve` has no archived branch, so any straggling reader still gets the value.
- **`data_tables.older_tables_moved`** (true, 21 organization overrides) is **not retired**. Readers:
  `custom.store_is_open` (POST-PRESS-SENTENCES: this knob is what keeps the store open for moved organizations),
  `platform._cutover_seam_apply`, and `final_switch_press` (dropped). Archiving it before 9a could close the store.
  `knob_archive` would refuse it anyway (live readers).
- **Sharing registry (owner ruling: report only, nothing written).**

| resource_type | table_name | schema_name (registry) | is_active | Grants in `iam.permissions` | Grant ids are store table ids? |
|---|---|---|---|---|---|
| `dataset` | `udt_datasets` | `workbench` (the table now lives in `deprecated`) | true | 10 active (9 user editor grants on `c1aabdc0-4d94-42d4-9ddc-91b68ef9c0a7`, 1 org editor grant `granted_via = availability` on `26712b2d-6e61-4c0d-9137-52e1e807d757`) | **Yes**: all 10 `resource_id`s are `custom.record` rows with `data_class = 'table'` |
| `structured_list` | `udt_structured_lists` | `workbench` | true | 0 | none |

  Each of the 10 `dataset` grants has a matching active `record` grant: same `resource_id`, same grantee, level ≥, no
  expiry. Archiving them would lose nobody's access. Nothing outside the cutover family reads `dataset` grants
  (`cutover_carry_back`, `cutover_copy_differences`, `cutover_older_removal_rows`, `workbench.udt_dataset_access`).
  The tokens themselves are live in code: the org tables page uses resourceType `"dataset"`, and `ListCard.tsx` /
  `StructuredListManagerV2Window.tsx` use `"structured_list"`. `permissions_validate_resource_type` also refuses any
  insert or update of a grant whose type is not an active registry row. Re-pointing the rows at the store is an access
  decision.

## Clone dry run

Clone `ajrnyxwasqbmxdmzvfdy` (CLONE-REF; quarantine checked: 0 active cron jobs, no pg_net). The connection user is
`postgres.<clone ref>`, asserted in `clone.mjs`.

- **Activity check before running:** about 8 non-idle sessions from other lanes (rehearsals, suites), none heavy and
  none touching my objects. I killed nothing of anyone else's. I killed only my own two stuck psql processes, which
  were waiting on the pooler.
- **Bodies:** all 76 touched functions have identical `md5(pg_get_functiondef)` on the clone and on production
  (`md5_prod.txt` = `md5_clone.txt`), as do the seam and knob rows.
- **Run:** the main transaction (sections 0–3, 5–8) ran in `begin … set constraints all immediate … rollback`, so the
  deferred COMMIT checks fired: `door_body_must_decide` and `_provision_shape_settled` / `door_orphaned`. Every
  statement succeeded. psql exited 0, then ROLLBACK. Statement tally: 1 BEGIN, 4 SET, 10 CREATE OR REPLACE + 1 CREATE
  FUNCTION + 1 COMMENT, 1 REVOKE, 1 INSERT, 1 GRANT, 65 DROP FUNCTION, 1 DELETE, 2 UPDATE, SET CONSTRAINTS, ROLLBACK.
- **Post-checks inside the transaction:**
  - 5 seams retired; `data_home_shell` archived; `older_tables_moved` not archived.
  - 0 public tombstones left; 0 bodies still calling `final_switch_acting`; 0 orphaned door rows; press-history door
    row present.
  - `cutover_seams` returns the three live seams.
  - `cutover_press_history(5)` called by a non-admin is refused with 42501.
- **First two runs failed, both fixed:**
  1. The door grant was revoked by the definer guard. Fixed by declaring the door before the grant.
  2. `DROP TRIGGER` hit `lock timeout`, which led to the auth-lock finding in §4. Fixed by moving it to 4-LAST.
- **4-LAST was not dry-run successfully.** The DROP TRIGGER times out behind clone readers of `auth.users`. Its drop
  of the function cannot fail on dependencies other than the trigger: pg_depend has one row.
- **Inverse:** round-trip (main + inverse in one transaction, rollback) — see "Round-trip" below.

## Apply order (for apply-order.md)

1. **Before the file:** the frontend SOAK patch lands and deploys. It removes the final-switch and ramp admin screens,
   `/api/admin/unified-data-ramp`, `finalSwitch*.ts`, and the safety-net press suites (`b_switch_chain`,
   `b_old_reads_after_press`, `b_store_off_after_press`, plus `b_cutover_state.py` and
   `plants/b-old-door-stays-open.mjs` if not already). The frontend switch-press history list should call
   `platform.cutover_press_history` only after section 0 is live. Section 0 is safe to apply on its own, any time.
2. **Apply** `db-soak.sql` main transaction (sections 0–3, 5–8).
3. **Same day, after the apply:**
   - regenerate `knobDatabaseConsumers.generated.ts` (`pnpm generate:knob-database-consumers`; its check fails until
     then);
   - shrink `scripts/old-system-unreachable/baseline.json` (drops `final_switch_press` / `undo` and the tombstones);
   - regenerate `scripts/ground-standing-trigger-census.json` (after 4-LAST) and aidream records `store.generated.ts`;
   - shrink `aidream/scripts/t13_row_column_db_baseline.json`;
   - update `cutover-census/integrations.ts` / `census.ts`;
   - check the old campaign walks `fix15_*`, `valref_*`, `refusal_the_csv_wizard_*`, `orphanchoices_*`,
     `grid-port-walk.mjs`: they now get 404/42883 instead of the P0001 refusal.
4. **4-LAST** (switch-back trigger drop) in the 01:00–04:00 PT window only, announced, because of the auth.* lock.
5. **LATER:** 9a `store_is_open` (after every caller collapses, matrx-extend included), then 9b
   `older_tables_moved`, 9c the unarchive helpers, and 9d the copy fences. 9c and 9d go with CTX.

## What I left out, and why

- The deprecated tables and `_0_graveyard_takes_no_writes`, plus every trigger function attached to them: graveyard
  decision.
- Every CTX object, including the `cutover_seam*` family and the helpers it really calls (§2), the context fences, and
  the press and measure rows.
- `custom.store_is_open`, `older_tables_moved`, `udt_*_unarchive`, the table copy fences: still called (§4–§6).
- The sharing registry rows and grants: owner ruling (§8).
- `unified_data_store_on` / `_state` / `_set`, `may_operate_unified_data_ramp`, `assert_may_operate_unified_data_ramp`:
  still called.
- `platform._t13_allowlist` stale entries: harmless, and the list only shrinks.
