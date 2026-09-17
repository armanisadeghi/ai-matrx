-- chair-step: dropping W1-TABLE's two projections, its two guards on custom.record and its seven functions is a teardown, never an additive change; it runs from the same bytes on the branch as rule 27's inverse and reaches production only at a terminal, with the campaign stopped
--
-- THE INVERSE of `migrations/campaign/w1_table_table_home_containment.sql` (§4.13: every
-- migration carries its own down-migration in the same commit).
--
-- HEADER-LESS ON PURPOSE. A `DROP` is refused by §6b.2's additive allow-list in every lane;
-- the one route is a header-less chair step, rehearsed on the branch with `--target branch`
-- and confirmed at a terminal anywhere else.
--
-- WHAT IT RESTORES. Before this lane, schema `custom` held `custom.record` (16 partitions)
-- and `custom.record_write(uuid,uuid,jsonb)` and nothing else; `platform.feature_knob` held
-- no `custom/containment_depth_ceiling` row. After this file runs, that is true again.
--
-- 🚨 IT REFUSES IF ANOTHER LANE HAS ALREADY BUILT ON TOP. `LOCK:custom` is handed down a
-- fourteen-hold chain and `W1-INDEX`, `W1-FIELD`, `W1-RULE` and nine more build in this
-- same schema. Dropping `custom.containment_parent` out from under an index expression or a
-- later view would take their work with it and leave the ledger claiming it is still there.
-- So the first statement RAISES, naming what it found, unless every object this file is
-- about to drop has no dependant outside this file's own list.
--
-- IT DOES NOT DELETE THE UP FILE'S LEDGER ROW: a migration may never write
-- `public._schema_migrations` itself, and both runners refuse a file that tries. Rule 27's
-- loop re-applies the up with `--reapply`.

set lock_timeout = '5s';
set statement_timeout = '300s';

-- ── the refusal, before a single drop ──────────────────────────────────────────
-- Anything in schema `custom` that this lane did not create, and that is not W1-STORE's
-- store or its door, means a later lane has landed and this teardown is not safe.
do $guard$
declare
  v_strays text;
begin
  select string_agg(format('%s.%s', n.nspname, p.proname), ', ' order by p.proname)
    into v_strays
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'custom'
     and p.proname not in ('record_write',
                           'table_kernel_id', 'containment_depth_ceiling', 'containment_parent',
                           'containment_chain', 'containment_edges', 'reachable_from',
                           'home_relations', 'tables_at_home', 'table_declare', 'home_add',
                           'relation_own', 'record_reparent',
                           '_containment_guard', '_table_shape_guard');
  if v_strays is not null then
    raise exception 'refusing to tear down W1-TABLE: schema custom holds functions this lane did not create (%)', v_strays
      using hint = 'A later LOCK:custom lane has landed. Run ITS inverse first, or this teardown takes its work with it.';
  end if;

  select string_agg(format('%s.%s', n.nspname, c.relname), ', ' order by c.relname)
    into v_strays
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'custom'
     and c.relkind in ('v', 'm')
     and c.relname not in ('table', 'home');
  if v_strays is not null then
    raise exception 'refusing to tear down W1-TABLE: schema custom holds views this lane did not create (%)', v_strays
      using hint = 'A later LOCK:custom lane has landed. Run ITS inverse first.';
  end if;
end;
$guard$;

-- ── the two projections ────────────────────────────────────────────────────────
drop view if exists custom.home;
drop view if exists custom."table";

-- ── the two guards on custom.record ────────────────────────────────────────────
drop trigger if exists custom_record_table_shape_guard on custom.record;
drop trigger if exists custom_record_containment_guard on custom.record;

-- ── the bodies, dependants first ───────────────────────────────────────────────
drop function if exists custom._table_shape_guard();
drop function if exists custom._containment_guard();
drop function if exists custom.record_reparent(uuid, uuid, uuid);
drop function if exists custom.relation_own(uuid, uuid, uuid);
drop function if exists custom.home_add(uuid, uuid, uuid);
drop function if exists custom.table_declare(uuid, jsonb);
drop function if exists custom.tables_at_home(uuid, uuid[]);
drop function if exists custom.home_relations();
drop function if exists custom.reachable_from(uuid, uuid[]);
drop function if exists custom.containment_edges(uuid);
drop function if exists custom.containment_chain(uuid, uuid);
drop function if exists custom.containment_parent(jsonb);
drop function if exists custom.containment_depth_ceiling(uuid);
drop function if exists custom.table_kernel_id();

-- ── REC-N-4's knob row ─────────────────────────────────────────────────────────
-- Only this lane's key, and only when no organization has overridden it: a DELETE that took
-- somebody's setting with it would be a silent loss, so it refuses and says so instead.
do $knob$
declare
  v_overrides integer;
begin
  select count(*) into v_overrides
    from platform.knob_override
   where feature = 'custom' and key = 'containment_depth_ceiling';
  if v_overrides > 0 then
    raise exception 'refusing to delete custom/containment_depth_ceiling: % organization override(s) point at it', v_overrides
      using hint = 'Remove the overrides through the knob door first; this teardown will not delete a limit somebody set.';
  end if;
  delete from platform.feature_knob
   where feature = 'custom' and key = 'containment_depth_ceiling';
end;
$knob$;
