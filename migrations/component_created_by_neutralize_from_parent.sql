-- ============================================================================
-- THE COMPONENT OWNERSHIP LAW — arm 2: NEUTRALIZE `created_by`
-- canon: common-docs/systems/platform/db-rules/FEATURE.md §6d-1
--        ("Neutralize, don't force auth.uid()")
-- D182 follow-up 1.  Live project: brsgrqvjdzwihsvnfqkf.
--
-- WHY
-- ---
-- Since `iam.apply_rls` v3 no component policy references `created_by`, and a
-- BLOCKING release gate (`public.component_created_by_report()`) holds that at
-- zero.  The column therefore grants nothing.  But `platform._stamp_actor`
-- still writes `auth.uid()` into it on INSERT, so on a component the column
-- NAMES THE WRONG OWNER to any code that reads it: on a component the actor and
-- the owner come apart, and the owner is the PARENT.
--
-- The ruling is NOT "force auth.uid()" (that is the ENTITY fix and re-asserts
-- independent ownership on a row that has none) and NOT "drop the column"
-- (server writers still send the field — a bare drop of a NOT NULL column
-- surfaces as 23502 in production; see D182's note).  While the column exists,
-- its value must be DERIVED FROM THE PARENT's `created_by`, and re-derived if
-- the row is ever reparented.
--
-- ORDERING — WHY THE TRIGGER IS NAMED `zzz_…`
-- -------------------------------------------
-- BEFORE triggers fire in ALPHABETICAL name order per event (db-rules §10).
-- `_stamp_actor` runs `NEW.created_by := coalesce(NEW.created_by, uid)`, so the
-- neutralizer must run AFTER it to overwrite the actor stamp — and also after a
-- writer that supplied `created_by` explicitly, which `_stamp_actor`'s coalesce
-- deliberately preserves.  Live stamp-trigger names on the target tables are
-- `_stamp_actor` (140), `trg_stamp_actor` (4) and
-- `coding_session_entry_stamp_actor` (1); a `zzz_` prefix sorts after all three
-- ('z' > 't' > 'c' > '_').  This is the LEAST INVASIVE correct mechanism: the
-- alternative — teaching `_stamp_actor` to skip `created_by` on component
-- tables — edits one shared function that 279 triggers depend on, and would
-- leave the column NULL rather than correct on any component that has no
-- neutralizer attached.  Naming wins.
--
-- The neutralizer is a BEFORE trigger, so `_version_capture` (AFTER) records the
-- DERIVED value, and `history.row_versions` continues to record the real ACTOR
-- independently — provenance is not lost, exactly as §6d-1 argues.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. The trigger function
-- ---------------------------------------------------------------------------
-- TG_ARGV is (parent_schema, parent_table, fk_column) TRIPLES, in the order the
-- composition edges are declared in `platform.entity_relationships`.  A
-- multi-parent component derives from the FIRST NON-NULL parent FK.
create or replace function platform.component_created_by_from_parent()
returns trigger
language plpgsql
set search_path = ''
as $fn$
declare
  v_n      int := array_length(TG_ARGV, 1);
  i        int := 0;
  v_ps     text;
  v_pt     text;
  v_fk     text;
  v_fkval  uuid;
  v_owner  uuid;
  v_found  boolean := false;
begin
  if v_n is null or v_n < 3 or v_n % 3 <> 0 then
    raise exception
      'component_created_by_from_parent on %.%: TG_ARGV must be (schema,table,fk) triples, got %',
      TG_TABLE_SCHEMA, TG_TABLE_NAME, coalesce(v_n, 0);
  end if;

  while i < v_n loop
    v_ps := TG_ARGV[i];
    v_pt := TG_ARGV[i + 1];
    v_fk := TG_ARGV[i + 2];

    v_fkval := null;
    execute format('select ($1).%I', v_fk) into v_fkval using NEW;

    if v_fkval is not null then
      execute format('select created_by from %I.%I where id = $1', v_ps, v_pt)
        into v_owner using v_fkval;
      v_found := true;
      exit;                       -- first non-null parent FK wins
    end if;

    i := i + 3;
  end loop;

  -- No parent to derive from (every declared parent FK is NULL).  Leave the
  -- value as-is rather than inventing one — a parent-less component row is its
  -- own defect class (db-rules §10, "A NULL FK can never match an IN") and this
  -- trigger is not the place to mask it.
  if not v_found then
    return NEW;
  end if;

  -- The parent itself is ownerless.  NULL is the CORRECT derived value, but on a
  -- NOT NULL `created_by` writing it is a 23502 that would break live inserts,
  -- so there we leave the stale value rather than take the table down.  The
  -- end-state for those columns is the rename/drop cleanup, not a hard failure.
  if v_owner is null and NEW.created_by is not null then
    if exists (
      select 1
      from pg_attribute a
      where a.attrelid = TG_RELID
        and a.attname  = 'created_by'
        and a.attnotnull
    ) then
      return NEW;
    end if;
  end if;

  NEW.created_by := v_owner;
  return NEW;
end
$fn$;

comment on function platform.component_created_by_from_parent() is
  'THE COMPONENT OWNERSHIP LAW (db-rules §6d-1): derives a component row''s created_by '
  'from its composition parent''s created_by on INSERT and on reparent. TG_ARGV is '
  '(parent_schema, parent_table, fk_column) triples; first non-null parent FK wins. '
  'Named zzz_component_created_by on every table so it fires AFTER platform._stamp_actor '
  '(alphabetical BEFORE-trigger order, db-rules §10) and overwrites the actor stamp.';

-- ---------------------------------------------------------------------------
-- 2. Attach across every active rls_variant='component' table carrying created_by
-- ---------------------------------------------------------------------------
-- Generated from the registry, not from a hand-kept list, so a newly registered
-- component is covered by re-running this file.  Existing attachments are
-- detected by tgfoid (the function), never by name alone (db-rules §10: a
-- name-only guard matches a same-named trigger on ANY table).
-- A deliberate, bounded lock wait: 167 ACCESS EXCLUSIVE trigger-creation locks in
-- one transaction must fail fast rather than queue behind live traffic (db-rules §10).
set local lock_timeout = '5s';

do $attach$
declare
  r            record;
  v_args       text;
  v_updcols    text;
  v_attached   int := 0;
  v_refreshed  int := 0;
  v_skipped_v  int := 0;
begin
  for r in
    with comp as (
      select et.token, et.schema_name, et.table_name,
             to_regclass(format('%I.%I', et.schema_name, et.table_name)) as oid
      from platform.entity_types et
      where et.rls_variant = 'component'
        and et.is_active
    ),
    cb as (
      select c.*
      from comp c
      join pg_attribute a
        on a.attrelid = c.oid
       and a.attname  = 'created_by'
       and a.attnum   > 0
       and not a.attisdropped
      where c.oid is not null
    )
    select cb.oid,
           cb.schema_name,
           cb.table_name,
           (select pc.relkind from pg_class pc where pc.oid = cb.oid) as relkind,
           array_agg(pet.schema_name  order by er.parent_type, er.fk_column) as ps,
           array_agg(pet.table_name   order by er.parent_type, er.fk_column) as pt,
           array_agg(er.fk_column     order by er.parent_type, er.fk_column) as fk
    from cb
    join platform.entity_relationships er
      on er.child_type = cb.token
     and er.kind = 'composition'
    join platform.entity_types pet
      on pet.token = er.parent_type
     and pet.is_active
    -- Only edges whose parent actually resolves and carries the columns we read.
    where to_regclass(format('%I.%I', pet.schema_name, pet.table_name)) is not null
      and exists (select 1 from pg_attribute a
                  where a.attrelid = to_regclass(format('%I.%I', pet.schema_name, pet.table_name))
                    and a.attname = 'created_by' and a.attnum > 0 and not a.attisdropped)
      and exists (select 1 from pg_attribute a
                  where a.attrelid = to_regclass(format('%I.%I', pet.schema_name, pet.table_name))
                    and a.attname = 'id' and a.attnum > 0 and not a.attisdropped)
      and exists (select 1 from pg_attribute a
                  where a.attrelid = cb.oid
                    and a.attname = er.fk_column and a.attnum > 0 and not a.attisdropped)
    group by cb.oid, cb.schema_name, cb.table_name
    order by cb.schema_name, cb.table_name
  loop
    -- A registered component that is a VIEW cannot carry a row trigger.
    if r.relkind <> 'r' then
      v_skipped_v := v_skipped_v + 1;
      raise notice 'SKIP %.% — relkind % is not an ordinary table', r.schema_name, r.table_name, r.relkind;
      continue;
    end if;

    select string_agg(format('%L, %L, %L', r.ps[i], r.pt[i], r.fk[i]), ', ' order by i)
      into v_args
      from generate_subscripts(r.fk, 1) as i;

    select string_agg(distinct quote_ident(c), ', ')
      into v_updcols
      from unnest(r.fk) as c;

    if exists (
      select 1 from pg_trigger t
      where t.tgrelid = r.oid
        and not t.tgisinternal
        and t.tgfoid = 'platform.component_created_by_from_parent()'::regprocedure
    ) then
      v_refreshed := v_refreshed + 1;
    else
      v_attached := v_attached + 1;
    end if;

    -- Drop-then-create so a re-run re-points stale TG_ARGV after a reparenting
    -- edge is added or removed in the registry.
    execute format('drop trigger if exists zzz_component_created_by on %I.%I',
                   r.schema_name, r.table_name);
    execute format(
      'create trigger zzz_component_created_by
         before insert or update of %s on %I.%I
         for each row execute function platform.component_created_by_from_parent(%s)',
      v_updcols, r.schema_name, r.table_name, v_args);
  end loop;

  raise notice 'zzz_component_created_by: % newly attached, % refreshed, % skipped (non-table)',
    v_attached, v_refreshed, v_skipped_v;
end
$attach$;
