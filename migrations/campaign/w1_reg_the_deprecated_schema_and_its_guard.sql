-- target: branch
--
-- REC-55 · REC-37 · REC-38 — THE DEPRECATED TYPE, THE `deprecated` SCHEMA, THE ONE VERB
-- THAT RETIRES A TABLE BY RENAME, AND THE HIERARCHY COLUMNS RECORDED AS DEPRECATIONS.
--
-- WHY THIS FILE EXISTS AND WHO IS WAITING FOR IT
-- ----------------------------------------------
-- `W7-DEPR-DATA` and `W7-DEPR-PLAT` both carry the entry condition "REC-55's Deprecated
-- type and `deprecated` schema exist (`W1-REG` DONE)". Thirteen source tables retire
-- through them. This file is the mechanism they retire THROUGH: one schema, one guard,
-- one verb, proven here on a disposable probe table whose loss would cost nothing.
--
-- MEASURED FIRST, BECAUSE IT CHANGES THE SHAPE OF THE WORK (branch, 2026-09-18 01:1x):
-- schema `graveyard` DOES NOT EXIST on the rehearsal branch and holds zero tables. DD-062
-- row D plans `ALTER SCHEMA graveyard RENAME TO deprecated` and names thirteen function
-- bodies that carry the word; none of that is reachable here, and inventing a graveyard to
-- rename would be rehearsing a step that cannot be replayed on production. So this file
-- CREATES `deprecated` and leaves production's rename exactly where DD-062 §8.1 puts it —
-- item 5, a live rename across thirteen function bodies, which is chair work of the same
-- class as REL-15's `reference_*` rename (§1's "SIX rows no lane builds"). **Seventeen
-- registry rows on production still point into `graveyard` and every one of them is
-- already typed `deprecated` by this lane's classification file** — the type does not wait
-- for the schema.
--
-- AND THE BOUNDARY GUARD IS NAME-BOUND TO THE OLD WORD. Production and the branch both
-- carry the event trigger `graveyard_outbound_fk_guard`, whose body compares
-- `source_ns.nspname = 'graveyard'` literally: a table retired into `deprecated` is
-- outside it entirely, so the "retired data may not constrain live objects" law would be
-- unenforced for every table this campaign retires. Rather than edit a live event trigger
-- (rule 4), `platform.retire_to_deprecated()` below REFUSES a relation carrying an outbound
-- foreign key into a live schema, with the same law in its own message — so the boundary
-- holds at the only door into `deprecated`. The event trigger's own widening belongs with
-- DD-062's rename, and it is named in this lane's report.
--
-- AND A VERB OF THIS NAME ALREADY EXISTS — WHICH IS WHY THIS ONE HAS ANOTHER NAME.
-- `platform.deprecate_relation(text,text,text,text)` is LIVE on both databases and retires
-- a table a DIFFERENT way: it renames it to `<name>__deprecated` IN ITS OWN SCHEMA, puts a
-- view back at the old name, and hangs `platform.dead_relation_read` / `dead_relation_write`
-- tripwires on it. That is not REC-55, which says a retired table LIVES IN SCHEMA
-- `deprecated`. Rule 4 allows this campaign exactly one replacement of a live body — it is
-- `W2-PRED`'s, it is named, and "a third departure is refused" — so the live verb is left
-- untouched and REC-55's retirement is a NEW object beside it:
-- `platform.retire_to_deprecated()`. Measured 2026-09-18 on the branch: the live verb has
-- ZERO callers in any function body and `platform.deprecated_relations` holds ZERO rows, so
-- nothing is retired through it today and the two do not race. Converging the two names is
-- a cutover step, not a campaign step, and it is in this lane's report for the chair.
--
-- WHAT THE GUARD DOES, AND THE ONE ROLE IT LETS THROUGH
-- -----------------------------------------------------
-- `platform._deprecated_write_guard()` raises on INSERT, UPDATE and DELETE alike. DELETE is
-- included deliberately: a retired table's value is that it still holds what it held, and a
-- cleanup script that empties it has destroyed the only reason not to have dropped it.
-- `service_role` passes, because switch-checklist step 12's retirement and step 8's backfill
-- both run as the server, and a guard that stops the retirement it exists to protect is a
-- guard nobody will keep.
--
-- `platform.retire_to_deprecated(schema, table)` IS THE ONLY WAY IN, and it refuses rather
-- than guesses: it refuses a relation that does not exist, one something still depends on
-- (a view, or a foreign key from another table), one that still points OUT into a live
-- schema, and it is idempotent on a table already retired. Every retirement also writes the
-- live `platform.deprecated_relations` row — old_ref → new_ref — which is the register this
-- platform already had for exactly this and which this campaign does not duplicate.
--
-- REC-37 — KINDS HOLD NO DATA
-- ---------------------------
-- `content_ir.kind_instance` is the kind-instance store. It is NOT renamed by this file:
-- REC-37 says its rows go to zero at switch-checklist step 8 and that the campaign's half
-- is THE WRITE GUARD AND THE TYPE. Renaming a table that still holds its rows would break
-- every reader before the backfill that empties it exists. So it gets the guard where it
-- stands and the Deprecated type, and the row count is asserted UNCHANGED.
--
-- REC-38 — HIERARCHY COLUMNS ARE RECORDED, NEVER DROPPED
-- ------------------------------------------------------
-- REC-38's law reads "hierarchy columns are dropped; a tree is a self-relation of
-- cardinality one". Rule 4 forbids this campaign a single drop, and the brief says the same
-- in as many words: REC-38 lands as a DEPRECATION, never a drop. So every hierarchy column
-- is written into `platform.deprecated_relations` pointing at the self-relation that
-- replaces it, and this file then ASSERTS every one of them still exists.
--
-- **AND THE SET IS DERIVED, NEVER TYPED — with a stated rule, because a column NAME is not
-- a column MEANING.** Measured on the branch 2026-09-18: 96 self-referencing foreign keys
-- exist, and most of them are not trees at all — `supersedes_id`, `forked_from`,
-- `duplicate_of_id`, `canonical_id`, `successor_id` are lineage links, and deprecating them
-- as hierarchy would be a false record. Equally, of the eight `path`/`level`/`depth` columns
-- on self-referencing tables, `web.page.path` is a URL and `hr.corrective_action.level` is a
-- severity. So THE RULE THIS FILE USES:
--   RECORDED — a self-referencing foreign key whose column name contains `parent`
--              (the tree's own edge, read from `pg_constraint`, not from a name census),
--              plus an INTEGER `level`/`depth` column on one of those same tables (the
--              materialized depth of that same tree).
--   NOT RECORDED, PRINTED INSTEAD — every other self-reference, and every TEXT
--              `path`/`level`/`depth` column, each named in a NOTICE as a candidate whose
--              meaning is unverified. `W7-MAP`'s census is where they get a ruling; a
--              deprecation register that carries a guess is worse than one that carries a
--              question.
--
-- REVERSIBLE: `migrations/inverse/w1_reg_the_deprecated_schema_and_its_guard_down.sql`.

set lock_timeout = '5s';
set statement_timeout = '600s';

create schema if not exists deprecated;

comment on schema deprecated is
  'REC-55: retired tables live here. Write-guarded, referenced by nothing, never dropped inside a campaign. A table arrives by platform.retire_to_deprecated(), never by hand and never by DROP. (retired name: graveyard)';

revoke all on schema deprecated from public;
revoke all on schema deprecated from anon;
revoke all on schema deprecated from authenticated;

alter default privileges in schema deprecated revoke all on tables from public;
alter default privileges in schema deprecated revoke all on tables from anon;
alter default privileges in schema deprecated revoke all on tables from authenticated;

-- ---------------------------------------------------------------- the guard
create or replace function platform._deprecated_write_guard()
returns trigger
language plpgsql
as $fn$
begin
  if current_user = 'service_role' or session_user = 'service_role' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  raise exception
    'REC-55: %.% is DEPRECATED and takes no writes. % was refused.',
    tg_table_schema, tg_table_name, tg_op
    using errcode = 'check_violation',
          hint = 'A retired table is kept so that what it held is still there. If this write belongs somewhere, it belongs in whatever replaced this table; if the table is genuinely finished, the switch checklist drops it — a campaign never does.';
end
$fn$;

comment on function platform._deprecated_write_guard() is
  'REC-55: the one write guard every retired table carries. Refuses INSERT, UPDATE and DELETE alike — DELETE included, because a cleanup that empties a retired table destroys the only reason not to have dropped it. service_role passes, because the switch checklist''s backfill and retirement run as the server.';

-- ---------------------------------------------------------------- the one verb
create or replace function platform.retire_to_deprecated(
  p_schema text,
  p_table  text,
  p_new_ref text default null,
  p_reason  text default null
)
returns text
language plpgsql
as $fn$
declare
  v_oid    regclass;
  v_deps   text;
  v_out    text;
  v_token  text;
  v_old    text := format('%s.%s', p_schema, p_table);
begin
  if p_schema = 'deprecated' then
    return format('%I.%I is already retired', p_schema, p_table);
  end if;

  v_oid := to_regclass(format('%I.%I', p_schema, p_table));
  if v_oid is null then
    if to_regclass(format('deprecated.%I', p_table)) is not null then
      return format('deprecated.%I is already retired', p_table);   -- idempotent
    end if;
    raise exception 'REC-55: %.% does not exist, so there is nothing to retire', p_schema, p_table
      using errcode = 'undefined_table';
  end if;

  -- "Nothing may reference it" is a question about the catalog, not about a grep.
  -- Inbound: views and materialized views that read it, and foreign keys from other tables.
  select string_agg(ref, ', ' order by ref) into v_deps
    from (
      select distinct rn.nspname || '.' || rc.relname || ' (view)' as ref
        from pg_depend d
        join pg_rewrite r on r.oid = d.objid and d.classid = 'pg_rewrite'::regclass
        join pg_class rc on rc.oid = r.ev_class
        join pg_namespace rn on rn.oid = rc.relnamespace
       where d.refobjid = v_oid and rc.oid <> v_oid
      union
      select distinct cn.nspname || '.' || cc.relname || ' (' || k.conname || ')' as ref
        from pg_constraint k
        join pg_class cc on cc.oid = k.conrelid
        join pg_namespace cn on cn.oid = cc.relnamespace
       where k.contype = 'f' and k.confrelid = v_oid and k.conrelid <> v_oid
    ) s;
  if v_deps is not null then
    raise exception
      'REC-55: %.% still has something depending on it: %', p_schema, p_table, v_deps
      using errcode = 'dependent_objects_still_exist',
            hint = 'A table with a live reference does not move; it gets a defect. Retire or repoint the dependant first.';
  end if;

  -- Outbound: retired data may not CONSTRAIN live objects. The live event trigger that
  -- says so (`graveyard_outbound_fk_guard`) compares the schema name 'graveyard'
  -- literally and therefore cannot see this schema at all, so the law is enforced here,
  -- at the only door in, rather than left to a name that has not been renamed yet.
  select string_agg(k.conname || ' -> ' || k.confrelid::regclass::text, ', ' order by k.conname)
    into v_out
    from pg_constraint k
    join pg_class fc on fc.oid = k.confrelid
    join pg_namespace fn on fn.oid = fc.relnamespace
   where k.contype = 'f' and k.conrelid = v_oid and fn.nspname <> 'deprecated' and k.confrelid <> v_oid;
  if v_out is not null then
    raise exception
      'REC-55: %.% still points OUT into live schemas: %', p_schema, p_table, v_out
      using errcode = 'dependent_objects_still_exist',
            hint = 'Retired data may not constrain live objects. Drop or deliberately migrate every outbound live foreign key before retiring the relation — the same law platform._graveyard_outbound_fk_guard states for the old schema name.';
  end if;

  execute format('alter table %I.%I set schema deprecated', p_schema, p_table);

  if not exists (select 1 from pg_trigger t
                  where t.tgrelid = to_regclass(format('deprecated.%I', p_table))
                    and not t.tgisinternal
                    and t.tgfoid = 'platform._deprecated_write_guard()'::regprocedure) then
    execute format(
      'create trigger _deprecated_write_guard before insert or update or delete on deprecated.%I '
      'for each row execute function platform._deprecated_write_guard()', p_table);
  end if;

  update platform.entity_types
     set schema_name = 'deprecated',
         is_active   = false,
         type        = 'deprecated',
         type_reason = null,          -- is_active=false DERIVES 'deprecated' (DD-062 §1.2)
         custom_fields_enabled = false,
         notes       = coalesce(notes || ' | ', '') || 'REC-55 retired by platform.retire_to_deprecated: ' || coalesce(p_reason, 'no reason given')
   where schema_name = p_schema and table_name = p_table
     and relation_kind is distinct from 'virtual'
   returning token into v_token;

  insert into platform.deprecated_relations (old_ref, new_ref, archived_as, reason)
  values (v_old,
          coalesce(p_new_ref, 'none recorded'),
          format('deprecated.%s', p_table),
          coalesce(p_reason, 'REC-55: retired by platform.retire_to_deprecated'))
  on conflict (old_ref) do update
    set new_ref     = excluded.new_ref,
        archived_as = excluded.archived_as,
        reason      = excluded.reason;

  return format('deprecated.%I (registry token %s)', p_table, coalesce(v_token, '<unregistered>'));
end
$fn$;

comment on function platform.retire_to_deprecated(text, text, text, text) is
  'REC-55: the ONLY way a table becomes retired. Refuses a relation something still depends on and one that still points out into a live schema, renames it into schema deprecated, attaches the write guard, repoints its registry row to type=deprecated / is_active=false and writes the platform.deprecated_relations row. Idempotent. A table is retired by rename, never by DROP.';

-- ------------------------------------------------- REC-55: the verb, proven on a probe
-- RED then GREEN, on a table created and dropped inside this file, so the proof runs
-- every time the file runs rather than living in somebody's transcript.
do $w1reg$
declare
  v_msg text; v_state text; v_res text; v_n int; v_live text;
begin
  -- A clean probe in this lane's own disposable schema (§4.5: `zz_<lane>_*` needs no lock)
  -- — never in `public`, where `_ddl_guard` refuses a CREATE TABLE outright and
  -- `provision_shape_guard` refuses every other tag that reaches the same effect.
  execute 'drop table if exists deprecated.zz_w1_reg_probe';
  execute 'drop schema if exists zz_w1_reg cascade';
  execute 'create schema zz_w1_reg';
  execute 'create table zz_w1_reg.zz_w1_reg_probe (id uuid primary key default gen_random_uuid(), label text)';

  -- POSITIVE CONTROL: before the guard exists on it, the write SUCCEEDS.
  execute 'insert into zz_w1_reg.zz_w1_reg_probe (label) values (''before'')';
  execute 'select count(*) from zz_w1_reg.zz_w1_reg_probe' into v_n;
  if v_n <> 1 then
    raise exception 'REC-55 positive control: the probe refused a write BEFORE any guard existed (% rows)', v_n;
  end if;

  -- RED 1: a dependant view refuses the retirement.
  execute 'create view zz_w1_reg.zz_w1_reg_probe_v with (security_invoker = true) as select id from zz_w1_reg.zz_w1_reg_probe';
  begin
    perform platform.retire_to_deprecated('zz_w1_reg', 'zz_w1_reg_probe');
    raise exception 'REC-55: a relation with a dependent view was retired anyway';
  exception when dependent_objects_still_exist then
    null;
  end;
  execute 'drop view zz_w1_reg.zz_w1_reg_probe_v';

  -- RED 2: an outbound foreign key into a live schema refuses the retirement.
  --
  -- AND IT IS PROVEN ON A REAL LIVE TABLE, NOT ON THE PROBE, FOR A MEASURED REASON. Giving
  -- the probe an outbound foreign key files a `fk_without_index` row in
  -- `platform.provision_shape_debt`, and `_provision_shape_settled` — a DEFERRED constraint
  -- trigger — resolves `object_ref::regclass` at COMMIT, by which time the probe is dropped:
  -- the whole transaction then dies with 42P01 / 3F000 and deleting the debt row does not
  -- help, because a deferred event fires whether or not its row survives (measured here,
  -- 2026-09-18; reported as a platform defect in this lane's report). The verb refuses
  -- BEFORE it touches anything, so aiming it at a live relation changes nothing at all —
  -- and the relation is CHOSEN BY QUERY, never named, so this proof does not rot when a
  -- table is renamed.
  select n.nspname || '.' || c.relname into v_live
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where c.relkind = 'r' and not c.relispartition
     and n.nspname not in ('pg_catalog','information_schema','auth','storage','realtime',
                           'vault','extensions','cron','net','pgsodium','deprecated','zz_w1_reg')
     and exists (select 1 from pg_constraint k
                  where k.conrelid = c.oid and k.contype = 'f' and k.confrelid <> c.oid)
     and not exists (select 1 from pg_constraint k2 where k2.confrelid = c.oid and k2.conrelid <> c.oid)
     and not exists (select 1 from pg_depend d
                      join pg_rewrite r on r.oid = d.objid and d.classid = 'pg_rewrite'::regclass
                      join pg_class rc on rc.oid = r.ev_class
                     where d.refobjid = c.oid and rc.oid <> c.oid)
   order by 1
   limit 1;
  if v_live is null then
    raise exception 'REC-55: no live relation with an outbound FK and no dependants exists to prove the outbound refusal against';
  end if;
  begin
    perform platform.retire_to_deprecated(split_part(v_live, '.', 1), split_part(v_live, '.', 2));
    raise exception 'REC-55: % still points out into live schemas and was retired anyway', v_live;
  exception when dependent_objects_still_exist then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%points OUT%' then
      raise exception 'REC-55: % was refused, but not for its outbound foreign keys: %', v_live, v_msg;
    end if;
  end;
  if to_regclass(v_live) is null then
    raise exception 'REC-55: the outbound-FK proof MOVED a live relation (%)', v_live;
  end if;

  -- RED 3: a relation that does not exist is refused, never invented.
  begin
    perform platform.retire_to_deprecated('zz_w1_reg', 'zz_w1_reg_no_such_table');
    raise exception 'REC-55: a non-existent relation was "retired"';
  exception when undefined_table then
    null;
  end;

  -- GREEN: it retires, it is idempotent, and the rows survive the move.
  v_res := platform.retire_to_deprecated('zz_w1_reg', 'zz_w1_reg_probe', 'custom.record',
                                       'W1-REG probe: proves the verb every time this file runs');
  if to_regclass('deprecated.zz_w1_reg_probe') is null then
    raise exception 'REC-55: the probe did not arrive in schema deprecated (%)', v_res;
  end if;
  execute 'select count(*) from deprecated.zz_w1_reg_probe' into v_n;
  if v_n <> 1 then
    raise exception 'REC-55: the retirement lost the probe''s row (% rows)', v_n;
  end if;
  if platform.retire_to_deprecated('zz_w1_reg', 'zz_w1_reg_probe') not like '%already retired%' then
    raise exception 'REC-55: the verb is not idempotent on an already-retired relation';
  end if;

  -- GREEN: the guard now refuses the exact write that succeeded above, by check_violation.
  begin
    execute 'insert into deprecated.zz_w1_reg_probe (label) values (''after'')';
    raise exception 'REC-55: a retired table took an INSERT — the write guard is not in force';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%DEPRECATED and takes no writes%' then
      raise exception 'REC-55: the refusal did not come from the write guard: %', v_msg;
    end if;
  end;
  begin
    execute 'delete from deprecated.zz_w1_reg_probe';
    raise exception 'REC-55: a retired table took a DELETE — a cleanup could still empty it';
  exception when check_violation then null;
  end;

  -- and the register carries the row the verb wrote
  select count(*) into v_n from platform.deprecated_relations
   where old_ref = 'zz_w1_reg.zz_w1_reg_probe' and archived_as = 'deprecated.zz_w1_reg_probe';
  if v_n <> 1 then
    raise exception 'REC-55: the retirement wrote no platform.deprecated_relations row';
  end if;

  -- the probe leaves nothing behind
  execute 'drop table deprecated.zz_w1_reg_probe';
  execute 'drop schema if exists zz_w1_reg cascade';
  delete from platform.deprecated_relations where old_ref = 'zz_w1_reg.zz_w1_reg_probe';
  -- AND NEITHER DOES ITS SHAPE DEBT. RED-2's foreign key is unindexed by construction, so
  -- `provision_shape_guard` files a `fk_without_index` debt for it; `_provision_shape_settled`
  -- then resolves `object_ref::regclass` at COMMIT, by which time the probe is dropped, and
  -- the whole transaction dies with 42P01 — measured here 2026-09-18, and reported as a
  -- platform defect in its own right (a debt row for a relation dropped in the same
  -- transaction cannot be settled). This lane clears only its own probe's rows.
  delete from platform.provision_shape_debt where object_ref like 'zz\_w1\_reg.%';

  raise notice 'W1-REG REC-55: platform.retire_to_deprecated() refused a dependant view, an outbound live FK and a missing relation; retired a probe with its row intact; was idempotent; and the write guard then refused INSERT and DELETE with check_violation.';
end
$w1reg$;

-- ------------------------------------------------- REC-37: the kind-instance store
-- Guard and type only. The table keeps its name, its schema and — asserted below — every
-- one of its rows, because REC-37's move is switch-checklist step 8's backfill.
do $w1reg$
begin
  if to_regclass('content_ir.kind_instance') is not null
     and not exists (select 1 from pg_trigger t
                      where t.tgrelid = 'content_ir.kind_instance'::regclass
                        and not t.tgisinternal
                        and t.tgfoid = 'platform._deprecated_write_guard()'::regprocedure) then
    create trigger _deprecated_write_guard
      before insert or update or delete on content_ir.kind_instance
      for each row execute function platform._deprecated_write_guard();
  end if;
end
$w1reg$;

update platform.entity_types
   set type = 'deprecated',
       type_reason = 'REC-37: kinds hold no data. The kind-instance store is DEPRECATED — write-guarded and typed, never dropped inside this campaign; its rows go to zero at switch-checklist step 8. The row stays is_active=true because the table is still READ while the backfill is pending, and a type is not an enforcement word.',
       custom_fields_enabled = false
 where schema_name = 'content_ir' and table_name = 'kind_instance';

insert into platform.deprecated_relations (old_ref, new_ref, archived_as, reason)
values ('content_ir.kind_instance', 'custom.record', null,
        'REC-37: kinds hold no data. Write-guarded and typed Deprecated by W1-REG; the rows move at switch-checklist step 8 and the table is dropped at step 12, never by a campaign.')
on conflict (old_ref) do update
  set new_ref = excluded.new_ref, reason = excluded.reason;

-- ------------------------------------------------- REC-38: the hierarchy columns
-- Recorded, never dropped. The set is derived from pg_constraint by the rule in this
-- file's header; nothing here is typed from a list.
do $w1reg$
declare
  v_recorded int; v_candidates text; v_lost text;
begin
  with tree_edge as (
    select n.nspname as s, c.relname as t, a.attname as col, k.conname
      from pg_constraint k
      join pg_class c on c.oid = k.conrelid
      join pg_namespace n on n.oid = c.relnamespace
      join lateral unnest(k.conkey) u(attnum) on true
      join pg_attribute a on a.attrelid = k.conrelid and a.attnum = u.attnum
     where k.contype = 'f' and k.confrelid = k.conrelid
       and not c.relispartition
       and a.attname like '%parent%'
       and n.nspname not in ('pg_catalog','information_schema','auth','storage','realtime',
                             'vault','extensions','cron','net','pgsodium','graphql',
                             'graphql_public','_analytics','supabase_functions',
                             'supabase_migrations','pgbouncer','deprecated','campaign_watch','corpus')
  ),
  materialized_depth as (
    select n.nspname as s, c.relname as t, a.attname as col, null::text as conname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
     where c.relkind = 'r'
       and a.attname in ('level','depth','hierarchy_level')
       and a.atttypid in ('int2'::regtype, 'int4'::regtype, 'int8'::regtype)
       and exists (select 1 from tree_edge e where e.s = n.nspname and e.t = c.relname)
  ),
  all_cols as (select * from tree_edge union all select * from materialized_depth)
  insert into platform.deprecated_relations (old_ref, new_ref, archived_as, reason)
  select s || '.' || t || '.' || col,
         'custom.record (containment self-relation, cardinality one)',
         null,
         'REC-38 (W1-REG): a hierarchy column. A tree is a self-relation of cardinality one, so this column''s meaning moves to the record store''s own containment edge. RECORDED, NEVER DROPPED — this campaign drops nothing; the column is still here and still authoritative until switch-checklist step 8 moves the data.'
         || coalesce(' Read from the self-referencing foreign key ' || conname || '.', ' Materialized depth of that same tree.')
    from all_cols
  on conflict (old_ref) do nothing;

  get diagnostics v_recorded = row_count;

  -- The candidates this file deliberately does NOT record: a name match is not a meaning.
  select string_agg(ref, ', ' order by ref) into v_candidates
    from (
      select n.nspname || '.' || c.relname || '.' || a.attname as ref
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
       where c.relkind = 'r'
         and a.attname in ('path','materialized_path','tree_path','ancestry','level','depth')
         and a.atttypid not in ('int2'::regtype,'int4'::regtype,'int8'::regtype)
         and n.nspname not in ('pg_catalog','information_schema','auth','storage','realtime',
                               'vault','extensions','cron','net','pgsodium','graphql',
                               'graphql_public','_analytics','supabase_functions',
                               'supabase_migrations','pgbouncer','deprecated','campaign_watch','corpus')
         and exists (select 1 from pg_constraint k where k.conrelid = c.oid and k.contype='f' and k.confrelid = k.conrelid)
    ) s;

  -- NEVER DROPPED: every column just recorded is asserted still present.
  select string_agg(d.old_ref, ', ' order by d.old_ref) into v_lost
    from platform.deprecated_relations d
   where d.reason like 'REC-38 (W1-REG)%'
     and not exists (
       select 1 from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
         join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
        where n.nspname = split_part(d.old_ref, '.', 1)
          and c.relname = split_part(d.old_ref, '.', 2)
          and a.attname = split_part(d.old_ref, '.', 3));
  if v_lost is not null then
    raise exception 'REC-38: a recorded hierarchy column is GONE from the database: %', v_lost
      using hint = 'This campaign records deprecations and drops nothing. A missing column means something else dropped it, or this file recorded a column that never existed.';
  end if;

  raise notice 'W1-REG REC-38: % hierarchy column(s) newly recorded as deprecations in platform.deprecated_relations, % in total, every one of them still present in the database. Candidates deliberately NOT recorded (a name match, meaning unverified — W7-MAP rules on these): %',
    v_recorded,
    (select count(*) from platform.deprecated_relations where reason like 'REC-38 (W1-REG)%'),
    coalesce(v_candidates, 'none');
end
$w1reg$;

-- ---------------------------------------------------------------- the assertions
do $w1reg$
declare
  v_before bigint; v_after bigint; v_state text; v_msg text;
  v_type text; v_guard int;
begin
  if to_regclass('content_ir.kind_instance') is null then
    raise exception 'REC-37: content_ir.kind_instance is absent on this database';
  end if;

  execute 'select count(*) from content_ir.kind_instance' into v_before;

  select count(*) into v_guard from pg_trigger t
   where t.tgrelid = 'content_ir.kind_instance'::regclass
     and not t.tgisinternal
     and t.tgfoid = 'platform._deprecated_write_guard()'::regprocedure;
  if v_guard <> 1 then
    raise exception 'REC-37: the write guard is not on content_ir.kind_instance (found %)', v_guard;
  end if;

  select type into v_type from platform.entity_types
   where schema_name='content_ir' and table_name='kind_instance';
  if v_type is distinct from 'deprecated' then
    raise exception 'REC-37: content_ir.kind_instance reads type % , not deprecated', coalesce(v_type,'<unregistered>');
  end if;

  -- The guard, exercised rather than asserted — and the SQLSTATE is checked, because an
  -- INSERT that fails for a typo would otherwise read as a refusal.
  begin
    execute 'insert into content_ir.kind_instance (id) values (gen_random_uuid())';
    raise exception 'REC-37: an INSERT into the deprecated kind-instance store SUCCEEDED — the guard is not in force';
  exception when check_violation then
    get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
    if v_msg not like '%DEPRECATED and takes no writes%' then
      raise exception 'REC-37: the INSERT was refused by something other than the write guard: %', v_msg;
    end if;
  end;

  execute 'select count(*) from content_ir.kind_instance' into v_after;
  if v_after <> v_before then
    raise exception 'REC-37: the row count moved from % to % — this file must not touch the data', v_before, v_after;
  end if;

  if to_regclass('deprecated.zz_w1_reg_probe') is not null then
    raise exception 'REC-55: the probe table survived this file';
  end if;

  raise notice 'W1-REG REC-55/REC-37: schema deprecated exists; platform.retire_to_deprecated() and the write guard are live; content_ir.kind_instance is typed deprecated, guarded (a planted INSERT was refused with SQLSTATE % from the guard''s own message) and still holds % row(s), unchanged.',
    v_state, v_after;
end
$w1reg$;
