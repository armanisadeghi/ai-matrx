-- ============================================================================
-- THE COMPONENT OWNERSHIP LAW — arm 2b: BACKFILL the existing rows
-- canon: common-docs/systems/platform/db-rules/FEATURE.md §6d-1
-- Companion to component_created_by_neutralize_from_parent.sql (the trigger).
-- Live project: brsgrqvjdzwihsvnfqkf.
--
-- The trigger only governs rows written from now on.  This re-derives every row
-- already in the table so `created_by` stops naming the wrong owner.
--
-- MEASURED BEFORE (2026-08-21, live): 497,090 rows disagreed with their parent
-- across 72 of 169 active component tables carrying created_by.  Largest:
-- web.link_edge 221,444 · scheduler.sch_run 124,018 · web.analysis_result
-- 117,293 · web.crawl_url 41,288 · research.rs_source 8,860 · workflow.node_events
-- 8,263 · research.rs_media 7,495 · web.finding 5,660 · chat.request 4,961.
-- AFTER: 27,816 — all of them scheduler.sch_run, see the SKIP note below.
--
-- THREE THINGS THIS FILE MUST GET RIGHT
-- ------------------------------------
-- 1. DERIVATION MUST MATCH THE TRIGGER EXACTLY.  The trigger walks the declared
--    composition edges and EXITS at the first NON-NULL parent FK.  That is a
--    CASE chain on the FK, NOT a coalesce over the resulting values — coalesce
--    would fall through to a later parent when an earlier parent's own
--    created_by is NULL, which the trigger never does.  A backfill that
--    disagreed with the trigger would simply re-drift on the next write.
--
-- 2. IT MUST ITERATE TO A FIXED POINT.  A component's parent is very often
--    itself a component (web.link_edge -> web.page -> web.site).  Correcting a
--    parent re-drifts every child already corrected — measured: one pass left
--    298,623 rows still wrong, including web.crawl_url which had ZERO drift
--    before its parents were fixed.  Passes repeat until a pass changes nothing.
--
-- 3. IT RUNS UNDER session_replication_role='replica'.  This is a mechanical
--    ownership correction, not a domain event.  With triggers live it would fire
--    run-lifecycle emitters, realtime broadcasts and SMS notify queues across
--    ~500k rows that did not semantically change, bump `updated_at` platform-wide,
--    and bulk-write ~500k history.row_versions rows.  Replica mode also skips
--    constraint triggers, so FK integrity is re-verified at the end of this file.
-- ============================================================================

set local lock_timeout = '10s';

do $backfill$
declare
  r          record;
  v_case     text;
  v_anyfk    text;
  v_where    text;
  v_sql      text;
  v_skip     text;
  v_n        bigint;
  v_tbl      bigint;
  v_pass_tot bigint;
  v_grand    bigint := 0;
  v_pass     int;
  BATCH      constant int := 25000;
  MAX_PASSES constant int := 12;
begin
  -- A plain SET LOCAL, not set_config(): Supabase grants the postgres role SET on
  -- this parameter, but set_config() is superuser-only (42501 otherwise).
  execute $$set local session_replication_role = 'replica'$$;

  for v_pass in 1..MAX_PASSES loop
    v_pass_tot := 0;

    for r in
      with comp as (
        select et.token, et.schema_name, et.table_name,
               to_regclass(format('%I.%I', et.schema_name, et.table_name)) as oid
        from platform.entity_types et
        where et.rls_variant = 'component' and et.is_active
      ),
      cb as (
        select c.*,
               (select a.attnotnull from pg_attribute a
                 where a.attrelid = c.oid and a.attname = 'created_by') as cb_notnull
        from comp c
        join pg_attribute a
          on a.attrelid = c.oid and a.attname = 'created_by'
         and a.attnum > 0 and not a.attisdropped
        join pg_class pc on pc.oid = c.oid and pc.relkind = 'r'   -- views cannot be updated here
        where c.oid is not null
      )
      select cb.schema_name, cb.table_name, cb.cb_notnull,
             array_agg(pet.schema_name order by er.parent_type, er.fk_column) as ps,
             array_agg(pet.table_name  order by er.parent_type, er.fk_column) as pt,
             array_agg(er.fk_column    order by er.parent_type, er.fk_column) as fk
      from cb
      join platform.entity_relationships er
        on er.child_type = cb.token and er.kind = 'composition'
      join platform.entity_types pet
        on pet.token = er.parent_type and pet.is_active
      where to_regclass(format('%I.%I', pet.schema_name, pet.table_name)) is not null
        and exists (select 1 from pg_attribute a
                    where a.attrelid = to_regclass(format('%I.%I', pet.schema_name, pet.table_name))
                      and a.attname = 'created_by' and a.attnum > 0 and not a.attisdropped)
        and exists (select 1 from pg_attribute a
                    where a.attrelid = cb.oid
                      and a.attname = er.fk_column and a.attnum > 0 and not a.attisdropped)
      group by cb.schema_name, cb.table_name, cb.cb_notnull, cb.oid
      order by cb.schema_name, cb.table_name
    loop
      select 'case ' || string_agg(
               format('when c.%I is not null then (select p.created_by from %I.%I p where p.id = c.%I)',
                      r.fk[i], r.ps[i], r.pt[i], r.fk[i]), ' ' order by i) || ' end',
             string_agg(format('c.%I is not null', r.fk[i]), ' or ' order by i)
        into v_case, v_anyfk
        from generate_subscripts(r.fk, 1) as i;

      v_where := format('(%s) and c.created_by is distinct from %s', v_anyfk, v_case);

      -- A NOT NULL created_by cannot take a NULL derived value (23502); the
      -- trigger leaves those rows alone, so the backfill must too.
      if r.cb_notnull then
        v_where := v_where || format(' and %s is not null', v_case);
      end if;

      -- Rows a PRE-EXISTING defect makes un-updatable by ANYONE. Excluded so one
      -- grandfathered constraint cannot block the other 168 tables.
      -- scheduler.sch_run_claim_protocol_by_claimed_at_chk is NOT VALID: 48,493
      -- legacy rows violate it and Postgres re-checks it on ANY update of the row.
      -- 27,816 of them also carry the wrong created_by and stay wrong until that
      -- defect is adjudicated. See FOUND_DEFECTS.
      v_skip := case when r.schema_name = 'scheduler' and r.table_name = 'sch_run'
                     then ' and not (c.claimed_at is not null'
                          || ' and (c.metadata->>''claim_protocol'') is distinct from ''2'')'
                     else '' end;

      v_sql := format(
        'with b as (select c.ctid from %I.%I c where %s%s limit %s) '
        'update %I.%I c set created_by = %s from b where c.ctid = b.ctid',
        r.schema_name, r.table_name, v_where, v_skip, BATCH,
        r.schema_name, r.table_name, v_case);

      v_tbl := 0;
      loop
        execute v_sql;
        get diagnostics v_n = row_count;
        v_tbl := v_tbl + v_n;
        exit when v_n < BATCH;
      end loop;

      if v_tbl > 0 then
        raise notice 'pass % % rows  %.%', v_pass, v_tbl, r.schema_name, r.table_name;
      end if;
      v_pass_tot := v_pass_tot + v_tbl;
    end loop;

    v_grand := v_grand + v_pass_tot;
    raise notice '== pass %: % rows ==', v_pass, v_pass_tot;
    exit when v_pass_tot = 0;
  end loop;

  execute $$set local session_replication_role = 'origin'$$;
  raise notice 'component created_by backfill: % rows re-derived', v_grand;
end
$backfill$;

-- ---------------------------------------------------------------------------
-- Integrity re-check — replica mode skipped constraint triggers, so prove the
-- FK the backfill could have broken is still satisfied.
-- ---------------------------------------------------------------------------
do $fkcheck$
declare
  r      record;
  v_bad  bigint;
  v_tot  bigint := 0;
begin
  for r in
    select cb.schema_name, cb.table_name
    from (
      select et.schema_name, et.table_name,
             to_regclass(format('%I.%I', et.schema_name, et.table_name)) as oid
      from platform.entity_types et
      where et.rls_variant = 'component' and et.is_active
    ) cb
    join pg_attribute a
      on a.attrelid = cb.oid and a.attname = 'created_by'
     and a.attnum > 0 and not a.attisdropped
    join pg_class pc on pc.oid = cb.oid and pc.relkind = 'r'
    where cb.oid is not null
  loop
    execute format(
      'select count(*) from %I.%I c where c.created_by is not null'
      ' and not exists (select 1 from auth.users u where u.id = c.created_by)',
      r.schema_name, r.table_name) into v_bad;
    if v_bad > 0 then
      raise notice 'DANGLING created_by: % rows in %.%', v_bad, r.schema_name, r.table_name;
      v_tot := v_tot + v_bad;
    end if;
  end loop;

  -- 21 files.file_versions rows are EXPECTED and are not caused by this backfill:
  -- their parent files.files already carries created_by values for 5 deleted users
  -- under a NOT VALID FK whose declared ON DELETE SET NULL can never fire, because
  -- files.files.created_by is NOT NULL. The child now mirrors the parent, which is
  -- exactly what §6d-1 requires. Filed as a separate defect; do NOT "fix" it here
  -- by desynchronising the child from its parent.
  if v_tot > 21 then
    raise exception 'component created_by backfill left % dangling auth.users references (expected <= 21)', v_tot;
  end if;
  raise notice 'FK re-check ok: % dangling created_by reference(s) (<= 21 grandfathered)', v_tot;
end
$fkcheck$;
