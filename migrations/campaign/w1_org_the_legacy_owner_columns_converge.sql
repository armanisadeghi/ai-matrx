-- target: branch,production
-- additive: yes
-- guard: custom/entity_types_guard
--
-- W1-ORG — REC-63: THE LEGACY OWNER, VISIBILITY, DELETE AND ORGANIZATION COLUMNS CONVERGE.
--
-- THE LAW
-- -------
-- REC-63: "`is_public`, `user_id`/`owner_id` used as owner, `is_deleted` and `org_id` converge
-- on `visibility`, `created_by`, `deleted_at` and `organization_id`, and the certifier's own
-- `legacy_owner_col` WARN list is the work list — a token leaves it only by conversion, never
-- by exemption."
--
-- WHAT THIS FILE IS, AND WHAT IT DELIBERATELY IS NOT
-- --------------------------------------------------
-- REC-63 is the largest row in this lane and every single conversion in it is a RENAME or a
-- TYPE CHANGE on a live table that live app code reads — which is the one thing the owner's
-- 2026-09-18 ruling still stops for ("dropping or renaming a table, column, function or policy
-- that EXISTING app code uses"). So this file does not convert anything. It builds the two
-- things the conversion wave cannot run without, both additive, both live-safe:
--
--   1. `iam.legacy_column_worklist()` — THE WORK LIST, computed from the catalogue and the
--      certifier's own rule, never from a document. One row per (schema, table, legacy column)
--      with the canonical name it converges on, the certifier variant that decides whether it
--      is even a violation, and the exact statement that converges it. REC-63 says the
--      certifier's WARN list IS the work list; this makes that literally true and queryable.
--   2. `iam.converge_legacy_column(p_schema, p_table, p_column)` — THE ONE VERB. It reads its
--      own work list, refuses anything the list does not name, refuses the two conversions that
--      are not renames (`is_public` → `visibility` and `is_deleted` → `deleted_at` change the
--      TYPE and lose information if done blind) and RETURNS the statement rather than executing
--      it when `p_execute` is false, so the wave can be reviewed before it is run.
--
-- THE FIVE LEGACY NAMES AND WHAT EACH CONVERGES ON, FROM `iam.verify_canonical` ITSELF
-- ------------------------------------------------------------------------------------
--   org_id      -> organization_id   (certifier check `legacy_org_id`,     FAIL, always wrong)
--   user_id     -> created_by        (check `legacy_owner_col`, WARN — and PASS-REQUIRED on the
--   owner_id    -> created_by         `personal` variant, where `user_id` IS the access owner,
--   author_id   -> created_by         so a blind rename there BREAKS the table's access lane)
--   creator_id  -> created_by
--   is_public   -> visibility        (check `legacy_is_public`,  WARN, boolean -> enum)
--   is_deleted  -> deleted_at        (check `legacy_is_deleted`, WARN, boolean -> timestamptz)
--
-- 🚨 THE TRAP THIS VERB EXISTS TO STOP, WHICH A SWEEP WOULD HAVE WALKED INTO
-- ---------------------------------------------------------------------------
-- On the `personal` variant `iam.verify_canonical` FAILS a table that has NO `user_id`: there
-- the column is not legacy debt, it is the access owner the RLS lane reads. A regex sweep over
-- "tables with a user_id column" would have renamed exactly those and taken their access with
-- it. The work list therefore carries `variant` and marks those rows `keep`, and the verb
-- refuses them by name.
--
-- REVERSIBLE: `migrations/inverse/w1_org_the_legacy_owner_columns_converge_down.sql`.

set lock_timeout = '5s';

create function iam.legacy_column_worklist()
returns table(
  schema_name text,
  table_name  text,
  token       text,
  variant     text,
  legacy_column    text,
  canonical_column text,
  disposition text,
  statement   text)
language sql
stable
set search_path to 'pg_catalog'
as $function$
  with registered as (
    select et.schema_name, et.table_name, et.token,
           coalesce(nullif(et.rls_variant, ''), 'standard') as variant
      from platform.entity_types et
     where et.is_active
       and et.schema_name is not null
       and et.table_name is not null
       and to_regclass(format('%I.%I', et.schema_name, et.table_name)) is not null
  ),
  legacy(legacy_column, canonical_column, kind) as (
    values ('org_id',     'organization_id', 'rename'),
           ('user_id',    'created_by',      'rename'),
           ('owner_id',   'created_by',      'rename'),
           ('author_id',  'created_by',      'rename'),
           ('creator_id', 'created_by',      'rename'),
           ('is_public',  'visibility',      'retype'),
           ('is_deleted', 'deleted_at',      'retype')
  )
  select r.schema_name, r.table_name, r.token, r.variant,
         l.legacy_column, l.canonical_column,
         case
           -- THE TRAP: on the `personal` variant user_id is the access owner, not debt.
           when l.legacy_column = 'user_id' and r.variant = 'personal' then 'keep'
           -- A rename into a name the table already carries is a MERGE, never a rename.
           when l.kind = 'rename' and exists (
                  select 1 from information_schema.columns c2
                   where c2.table_schema = r.schema_name and c2.table_name = r.table_name
                     and c2.column_name = l.canonical_column)
             then 'merge'
           when l.kind = 'retype' then 'retype'
           else 'rename'
         end,
         case
           when l.legacy_column = 'user_id' and r.variant = 'personal' then
             '-- keep: the personal variant''s access lane reads user_id; iam.verify_canonical FAILS this table without it'
           when l.kind = 'rename' and exists (
                  select 1 from information_schema.columns c2
                   where c2.table_schema = r.schema_name and c2.table_name = r.table_name
                     and c2.column_name = l.canonical_column)
             then format('-- merge: %I.%I already carries %I; move the values deliberately, then drop %I',
                         r.schema_name, r.table_name, l.canonical_column, l.legacy_column)
           when l.legacy_column = 'is_public' then
             format('-- retype: update %I.%I set visibility = case when is_public then ''public''::platform.visibility else visibility end; then drop is_public',
                    r.schema_name, r.table_name)
           when l.legacy_column = 'is_deleted' then
             format('-- retype: update %I.%I set deleted_at = coalesce(deleted_at, now()) where is_deleted; then drop is_deleted',
                    r.schema_name, r.table_name)
           else format('alter table %I.%I rename column %I to %I;',
                       r.schema_name, r.table_name, l.legacy_column, l.canonical_column)
         end
    from registered r
    join legacy l on true
   where exists (
           select 1 from information_schema.columns c
            where c.table_schema = r.schema_name
              and c.table_name   = r.table_name
              and c.column_name  = l.legacy_column)
   order by 1, 2, 5;
$function$;

comment on function iam.legacy_column_worklist() is
  'REC-63''s work list, computed rather than remembered: every active entity token whose live table still carries org_id, user_id, owner_id, author_id, creator_id, is_public or is_deleted, with the canonical column it converges on and the exact statement that gets it there. disposition is rename (safe), merge (the canonical column already exists - move the values first), retype (boolean to enum or timestamp - information is lost if done blind) or keep (the personal variant''s user_id IS its access owner; renaming it breaks the table''s RLS lane and iam.verify_canonical FAILS the table without it). A token leaves this list by conversion, never by exemption - there is no exemption column.';

create function iam.converge_legacy_column(
  p_schema  text,
  p_table   text,
  p_column  text,
  p_execute boolean default false)
returns text
language plpgsql
set search_path to 'pg_catalog'
as $function$
declare
  v_row record;
begin
  select * into v_row
    from iam.legacy_column_worklist() w
   where w.schema_name = p_schema and w.table_name = p_table and w.legacy_column = p_column;

  if not found then
    raise exception 'REC-63: %.% has no legacy column named %', p_schema, p_table, p_column
      using errcode = 'check_violation',
            hint = 'The only conversions this verb performs are the ones iam.legacy_column_worklist() names. If you believe this one belongs there, the fix is the work list''s rule, never an argument to this function.';
  end if;

  if v_row.disposition = 'keep' then
    raise exception 'REC-63: %.%.% is the personal variant''s access owner, not legacy debt', p_schema, p_table, p_column
      using errcode = 'check_violation',
            hint = 'iam.verify_canonical FAILS a personal-variant table that has NO user_id: there the column is what the RLS lane reads. Renaming it would take the table''s access with it. This is the one row in the work list that is never converted.';
  end if;

  if v_row.disposition in ('merge', 'retype') then
    raise exception 'REC-63: %.%.% needs a deliberate data move, not a rename (%)', p_schema, p_table, p_column, v_row.disposition
      using errcode = 'check_violation',
            hint = v_row.statement || '  -- run that as its own reviewed migration; this verb performs renames only, because a rename cannot lose a value and the other two can.';
  end if;

  if not p_execute then
    return v_row.statement;
  end if;

  -- THE GUARD IS ON THE EXECUTING HALF, WHICH IS THE ONLY HALF THAT CHANGES ANYTHING. The two
  -- reading halves (the work list, and this verb with p_execute false) answer identically
  -- whatever the knob says, because a census that lies when a switch is off is worse than no
  -- census. `custom/entity_types_guard` resolves FALSE on both databases today, so on the live
  -- database this verb can be READ from and cannot rename anything.
  if not coalesce(
       (platform.knob_resolve('custom', 'entity_types_guard', null) #>> '{}')::boolean, false) then
    raise exception 'REC-63: the conversion wave is switched off'
      using errcode = 'check_violation',
            hint = 'iam.converge_legacy_column renames a column that live app code may read, so it runs only while custom/entity_types_guard resolves true. Read the statement it would run by calling it with p_execute => false, which always works.';
  end if;

  execute v_row.statement;
  return format('converged %I.%I.%I -> %I', p_schema, p_table, p_column, v_row.canonical_column);
end;
$function$;

comment on function iam.converge_legacy_column(text,text,text,boolean) is
  'REC-63''s ONE conversion verb. It converts only what iam.legacy_column_worklist() names, performs renames only, and refuses - by name, with the remedy - the personal variant''s user_id, a rename into a column that already exists, and the two boolean-to-typed conversions that can lose information. p_execute defaults to FALSE and it then RETURNS the statement instead of running it, so a wave is reviewed before it runs. Every conversion it makes is a rename of a column live app code may read, so it is run deliberately, table by table, never swept.';
