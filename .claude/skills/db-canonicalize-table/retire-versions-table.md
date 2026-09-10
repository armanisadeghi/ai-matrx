# db-canonicalize-table — retire a bespoke `*_versions` table

## 📼 Recipe — retire a bespoke `*_versions` table → canonical `history.row_versions` (verified live on `code_file`, 2026-07-06)

The move that MUST happen for any entity carrying a per-entity `*_versions` table. Data is preserved, in one pass. Steps in order:

1. **Look first.** `SELECT min/max(<ts>), count(*), count(*) FILTER (WHERE change_note IS NOT NULL)` on the bespoke table. Row count decides whether to migrate or drop (ask if unsure); the date range decides partitions.
2. **Partitions.** `history.row_versions` is **monthly RANGE-partitioned** (`row_versions_YYYY_MM`). Confirm a partition exists for EVERY month in the data's range, or the backfill INSERT fails "no partition." (code_file's data was 2026-04, partition existed — no action.)
3. **Backfill** — one INSERT, idempotent, preserving per-version metadata under reserved `_*` keys (the canonical store has no native change-note column — see CRACK below):
   ```sql
   INSERT INTO history.row_versions (entity_type,row_id,organization_id,version,operation,row_data,actor_id,occurred_at)
   SELECT '<token>', v.<fk_id>, v.organization_id, v.version_number,
          CASE WHEN v.version_number=1 THEN 'INSERT' ELSE 'UPDATE' END,
          jsonb_strip_nulls(jsonb_build_object(
            'id',v.<fk_id>, 'name',v.name, 'content',v.content, 'language',v.language,   -- the versioned content columns
            '_change_note',v.change_note, '_change_source',v.change_source, '_legacy_version_id',v.id)),
          v.created_by, v.<changed_at>
   FROM <schema>.<versions_table> v
   WHERE NOT EXISTS (SELECT 1 FROM history.row_versions r WHERE r.entity_type='<token>' AND r.row_id=v.<fk_id> AND r.version=v.version_number);
   ```
   Then assert `count(history WHERE entity_type='<token>') >= count(bespoke)`.
4. **Turn on capture:** `UPDATE platform.entity_types SET is_versioned=true WHERE token='<token>';` + `CREATE TRIGGER _history AFTER INSERT OR UPDATE OR DELETE ON <schema>.<table> FOR EACH ROW EXECUTE FUNCTION platform._version_capture('<token>');`
5. **Kill the old capture path.** The bespoke snapshot trigger FUNCTIONS may exist but **not be attached** — check `pg_trigger` before assuming; `DROP FUNCTION … CASCADE` the orphans so they don't dangle-reference the graveyarded table.
6. **Repoint the shared legacy version RPCs' `<token>` branch → `history.row_versions`.** `get_version_history`/`get_version_snapshot`/`promote_version`/`purge_old_versions` are ONE function each, hardcoded-switched across ~8 entity types. `CREATE OR REPLACE` each, changing ONLY your entity's branch, **every other branch verbatim** (`restore_version`→`promote_version` and `get_version_diff`→`get_version_snapshot` come along free). Mappings: `name`→`row_data->>'name'`, `change_note`→`row_data->>'_change_note'`, `changed_at`→`occurred_at`, `version_number`→`version`, `purge`→`RETURN public.version_prune('<token>',id,keep)`. **`version_id uuid` return with no uuid in history → synthesize `md5(entity_type||row_id::text||version::text)::uuid`.**
7. **Graveyard + deregister:** `ALTER TABLE <schema>.<versions_table> SET SCHEMA graveyard;` → `DELETE FROM platform.entity_relationships WHERE child_type='<versions_token>';` → `DELETE FROM platform.entity_types WHERE token='<versions_token>';` → `INSERT INTO platform.deprecated_relations`.
8. **`SELECT audit.refresh();` THEN certify.** Certify reads a cached snapshot — it lies until you refresh.
9. **Cross-repo, same pass:** `db/generate.py` (**it does NOT delete the orphan manager file for the removed table — `rm db/managers/<schema>/<versions_table>.py` by hand**) → `pnpm db-types` + `pnpm gen:entity-types` → the FE version UI keeps working UNCHANGED if it goes through the RPCs (it does). `type-check` both → commit → **push**.

**Gotchas that bit (now solved for you):** partition-not-found on backfill (step 2) · bespoke triggers registered-but-unattached (step 5) · `version_id` bigint↔uuid mismatch (step 6) · certify reading a stale snapshot (step 8) · `generate.py` leaving an orphan manager `.py` whose broken `import` fails at load (step 9).

**🔴 Two live CRACKS in the canonical version system (flag + fix deliberately, cross-entity):**
- **No per-version change-note.** `history.row_versions` snapshots the row + operation + actor + time — it has NO field for a user "why did this change" note, which every bespoke `*_versions` table had. Existing notes are preserved in `row_data._change_note` (above), but FUTURE versions won't capture one until `platform._version_capture` is extended to read `current_setting('app.change_note',true)` into `row_data._change_note`. That touches the shared trigger for ALL entities → a deliberate decision, not a silent edit.
- **Two parallel version systems.** The canonical `version_*` RPCs exist, but the FE still calls the legacy `get_version_*`/`promote_version` switch-functions, which are decaying (their `prompt*`/`note` branches already point at retired tables). Retiring them wholesale = migrate every entity onto `history.row_versions` + move the FE to `version_*`. Until then, repointing per-entity branches (step 6) is the correct incremental move.
