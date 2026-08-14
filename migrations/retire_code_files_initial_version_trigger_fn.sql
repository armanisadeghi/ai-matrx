-- retire_code_files_initial_version_trigger_fn.sql
--
-- Retires public.trg_code_files_set_initial_version() — the pre-canonical
-- "version := 1 on INSERT" trigger function for the code-files VFS. Its trigger
-- was DROPPED on purpose during canonicalization and its job is now done by the
-- canonical platform trigger family plus a column default. SET SCHEMA
-- retirement, not a DROP: the body survives in `graveyard`.
--
-- ── THE HUNT (unfinished-work-alarm policy, step 1) ─────────────────────────
-- Body is exactly:  BEGIN NEW.version := 1; RETURN NEW; END;
-- It belonged to the old public.code_files table, one member of the 8-entity
-- "snapshot-on-write" trigger family documented in
-- docs/concepts/full-sync-boardcast-storage/durable-records-contract.md
-- (`set_initial_version` BEFORE INSERT + `create_v1_snapshot` AFTER INSERT +
-- `snapshot_version` BEFORE UPDATE). That whole family is superseded by the
-- generic platform version system over history.row_versions (db-rules §7), and
-- its siblings were retired the same way — see aidream
-- db/migrations/0081_drop_legacy.sql, which drops trg_tools_set_initial_version
-- and trg_tool_ui_comp_set_initial_version together with their functions.
--
-- ── IT WAS DETACHED DELIBERATELY, NOT DROPPED BY ACCIDENT ───────────────────
-- migrations/code_cluster_canonicalize_and_move.sql:23 does exactly this:
--     DROP TRIGGER IF EXISTS trg_code_files_set_initial_version ON public.code_files;
-- as part of moving public.code_files → code.code_files and onto the canonical
-- base entity. That migration detached the trigger and left the function body
-- behind; this migration finishes the retirement it started.
--
-- ── THE SUCCESSOR IS PROVEN LIVE, NOT ASSUMED ──────────────────────────────
-- Verified against the live DB (project txzxabzwovsujtloxrus):
--   * code.code_files.version is `integer NOT NULL DEFAULT 1` — the initial
--     value this function used to force is now the column's own default, which
--     no trigger can forget and no INSERT path can bypass.
--   * code.code_files carries the canonical trigger set, including
--     `_touch_row  BEFORE INSERT OR UPDATE ... EXECUTE FUNCTION platform._touch_row()`,
--     which stamps updated_at and increments `version` on every UPDATE, plus
--     `_history ... platform._version_capture('code_file')` for the snapshots
--     the old family hand-rolled.
--   * data proof: 29 rows, ZERO null version, versions ranging 2..15 — the
--     canonical increment is demonstrably running, not merely installed.
-- Re-attaching the old function would now be a REGRESSION: it forces version=1
-- unconditionally on INSERT, clobbering any caller-supplied value, and it
-- duplicates a column default for no benefit.
-- Related: features/code-editor/FEATURE.md (agent-fs VFS over code.code_files).
--
-- Idempotent. Safe to re-run.

do $retire$
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'trg_code_files_set_initial_version'
  ) then
    if exists (
      select 1 from pg_trigger t
      where t.tgfoid = 'public.trg_code_files_set_initial_version()'::regprocedure
        and not t.tgisinternal
    ) then
      raise exception 'trg_code_files_set_initial_version() is attached to a table — it is live, do not retire it.';
    end if;

    if exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname not in ('pg_catalog','information_schema','graveyard')
        and p.prokind = 'f'
        and p.oid <> 'public.trg_code_files_set_initial_version()'::regprocedure
        and p.prolang in (select oid from pg_language where lanname in ('plpgsql','sql'))
        and pg_get_functiondef(p.oid) ~* '\mtrg_code_files_set_initial_version\M'
    ) then
      raise exception 'trg_code_files_set_initial_version now has an in-DB dependent — re-verify before retiring.';
    end if;

    alter function public.trg_code_files_set_initial_version() set schema graveyard;
    raise notice 'Retired public.trg_code_files_set_initial_version() to graveyard.';
  else
    raise notice 'Nothing to retire — trg_code_files_set_initial_version() already moved.';
  end if;
end $retire$;

insert into platform.deprecated_relations (old_ref, new_ref, archived_as, reason)
values (
  'public.trg_code_files_set_initial_version()',
  'code.code_files.version DEFAULT 1 + platform._touch_row() + platform._version_capture(''code_file'')',
  'graveyard.trg_code_files_set_initial_version()',
  'Pre-canonical "NEW.version := 1 on INSERT" helper for public.code_files. Its trigger was dropped on purpose by code_cluster_canonicalize_and_move.sql:23 during the move to code.code_files; sibling members of the same 8-entity snapshot-on-write family were retired by aidream 0081_drop_legacy.sql. Superseded live: version is NOT NULL DEFAULT 1 and platform._touch_row increments it on UPDATE (29 rows, 0 null version, range 2..15). Re-attaching would clobber caller-supplied version values.'
)
on conflict (old_ref) do update
  set new_ref = excluded.new_ref, archived_as = excluded.archived_as, reason = excluded.reason;

-- Post-conditions: gone from public, present in graveyard, and the successor
-- machinery this retirement leans on is verifiably still in place.
do $assert$
declare v_public int; v_grave int; v_default text; v_touch int; v_nulls int;
begin
  select count(*) into v_public from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'trg_code_files_set_initial_version';
  if v_public <> 0 then
    raise exception 'trg_code_files_set_initial_version still lives in public — retirement did not take.';
  end if;

  select count(*) into v_grave from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'graveyard' and p.proname = 'trg_code_files_set_initial_version';
  if v_grave <> 1 then
    raise exception 'Expected 1 retired trg_code_files_set_initial_version in graveyard, found % — body lost, not retired.', v_grave;
  end if;

  select column_default into v_default from information_schema.columns
  where table_schema = 'code' and table_name = 'code_files' and column_name = 'version';
  if v_default is distinct from '1' then
    raise exception 'code.code_files.version default is % — the replacement for this trigger is NOT in place.', coalesce(v_default,'<null>');
  end if;

  select count(*) into v_touch from pg_trigger t
  where t.tgrelid = 'code.code_files'::regclass and not t.tgisinternal
    and t.tgfoid = 'platform._touch_row()'::regprocedure;
  if v_touch < 1 then
    raise exception 'code.code_files has no platform._touch_row trigger — version/updated_at would be frozen.';
  end if;

  select count(*) into v_nulls from code.code_files where version is null;
  if v_nulls <> 0 then
    raise exception '% code.code_files rows have a null version — the canonical path is NOT covering inserts.', v_nulls;
  end if;
end $assert$;
