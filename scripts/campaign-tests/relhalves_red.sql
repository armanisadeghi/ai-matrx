-- LANE OLD-TABLES-1 — W0's REL-11 CORRECTION, THE RED TWIN. Every arm ends in ROLLBACK.
--
-- WHAT A RED TWIN IS FOR. `relhalves_green.sql` proves the guard is installed and that correct
-- writes still commit — neither of which proves the guard REFUSES anything. This file plants
-- each half of a relation ALONE and passes only when the transaction is refused. Run against a
-- database where `custom._relation_halves_agree()` is NOT installed, every arm below fails,
-- which is what makes it a twin rather than a second green suite.
--
-- THE USE CASE is the same one: Greenline Landscaping Crew's Jobs, each pointing at the Client
-- it is for through a `client` relation field. The subject is found by asking the database for
-- a live relation edge, so the suite does not rot when the use-case data is rebuilt.
--
-- THE THREE WAYS THE TWO HALVES CAN DISAGREE, AND ALL THREE ARE REFUSED
--
--   1  THE VALUE LANDS ALONE. The store's own AFTER-STATEMENT triggers
--      (`zz_w2a_relation_association_s_i` / `_s_u`) are what write the edge. Disable them —
--      which is exactly what a restore, a bulk load under `session_replication_role = replica`,
--      or a lane "just turning a trigger off for a minute" does — and the document keeps the
--      id while nothing indexes it. REFUSED at COMMIT, naming the record and the field.
--   2  THE EDGE LANDS ALONE. An association naming a field, pointing at a record the document
--      does not name. That is an index entry for something nobody wrote. REFUSED.
--   3  THE EDGE IS TAKEN AWAY WHILE THE VALUE STANDS. Soft-deleting the edge of a cell that
--      still holds the id leaves a value the index cannot find. REFUSED.
--
-- Arm 1 is the one that matters most, because it is the only one an ordinary operator reaches
-- by accident.
--
-- RUN IT:  psql "$DSN" -f scripts/campaign-tests/relhalves_red.sql

\set ON_ERROR_STOP on
\timing off

\i scripts/campaign-tests/_preamble.sql

\echo ''
\echo '── 1 · the VALUE lands alone — the edge triggers are off ──────────────────────────────'
\echo '     (this arm is the only one that takes ACCESS EXCLUSIVE on custom.record, because'
\echo '      switching a trigger off is what it reproduces. It REFUSES to run on the MAIN'
\echo '      database for exactly that reason and says so — the clone and the branch are where'
\echo '      a lock that freezes the unified store for a transaction belongs.)'

begin;
do $$
declare
  v_org uuid; v_job uuid; v_role text; v_target uuid; v_ttable uuid; v_msg text; v_code text;
begin
  if current_setting('server_version_num')::int > 0
     and (select count(*) from pg_extension where extname = 'pg_net') > 0 then
    raise exception
      'ARM 1 REFUSED TO RUN: this is the MAIN database (pg_net present). Switching '
      '`zz_w2a_relation_association_s_*` off takes ACCESS EXCLUSIVE on custom.record and its '
      'sixteen partitions for the length of this transaction, which freezes every reader and '
      'writer of the unified store. Run this twin on the dev clone or the rehearsal branch.';
  end if;

  -- The subject: a record with an EMPTY relation cell, so arm 1 can FILL it rather than take
  -- an edge away. Taking the edge away would trip the OTHER half of the guard first (that is
  -- arm 3's job) and this arm would prove the wrong sentence.
  select r.organization_id, r.id, f.data->>'key', nullif(f.data->>'relation_target','')::uuid
    into v_org, v_job, v_role, v_ttable
    from custom.record r
    join custom.record f
      on f.table_id = custom.field_kernel_id()
     and f.organization_id = r.organization_id
     and f.data->>'type' = 'relation'
     and f.deleted_at is null
     and nullif(f.data->>'entity_definition_id','')::uuid = r.table_id
   where r.data_class = 'record' and r.deleted_at is null
     and (r.data ->> (f.data->>'key')) is null
     and nullif(f.data->>'relation_target','') is not null
     and exists (select 1 from custom.record t
                  where t.organization_id = r.organization_id
                    and t.table_id = nullif(f.data->>'relation_target','')::uuid
                    and t.data_class = 'record' and t.deleted_at is null)
   limit 1;
  if v_job is null then
    raise exception 'SKIP-AS-FAILURE: no record with an empty relation cell, so this arm proves nothing here.';
  end if;

  -- The far end must be a real record of the table the field points at, or the store's own
  -- `Customer points at something that is not there` guard refuses first and this arm proves
  -- that guard instead of this one.
  select r.id into v_target
    from custom.record r
   where r.organization_id = v_org and r.table_id = v_ttable
     and r.data_class = 'record' and r.deleted_at is null
   limit 1;

  begin
    -- Switch off the two triggers that would have written the edge — a restore, a bulk load,
    -- or a lane "just turning a trigger off for a minute". Then write the value.
    alter table custom.record disable trigger zz_w2a_relation_association_s_i;
    alter table custom.record disable trigger zz_w2a_relation_association_s_u;

    update custom.record
       set data = data || jsonb_build_object(v_role, v_target::text)
     where organization_id = v_org and id = v_job;

    set constraints all immediate;   -- force the deferred guard here rather than at COMMIT

    raise exception 'ARM 1 FAILED: the value landed with no association beside it and NOTHING REFUSED IT. The two halves of a relation can drift apart in this database.';
  exception when others then
    get stacked diagnostics v_msg = message_text, v_code = returned_sqlstate;
    if v_msg like 'ARM 1 FAILED%' then raise; end if;
    if v_code <> '23514' or v_msg not like '%VALUE with no association%' then
      raise exception 'ARM 1 FAILED: refused, but not by this guard — % %', v_code, v_msg;
    end if;
    raise notice 'ARM 1 RED — refused (%): %', v_code, v_msg;
  end;
end $$;
rollback;

\echo ''
\echo '── 2 · the EDGE lands alone — an index entry for a value nobody wrote ─────────────────'

begin;
do $$
declare
  v_org uuid; v_job uuid; v_role text; v_fid uuid; v_stranger uuid; v_ttable uuid; v_msg text; v_code text;
begin
  -- THE EDGE ALONE, without tripping any other guard on the way in: a record whose relation
  -- cell is EMPTY, and a real record of the table that field points at. The store's target-type
  -- guard and its cardinality guard both have nothing to say about this edge — only the
  -- halves-agree guard does, because the document holds no value for it.
  select r.organization_id, r.id, f.data->>'key', f.id,
         nullif(f.data->>'relation_target','')::uuid
    into v_org, v_job, v_role, v_fid, v_ttable
    from custom.record r
    join custom.record f
      on f.table_id = custom.field_kernel_id()
     and f.organization_id = r.organization_id
     and f.data->>'type' = 'relation'
     and f.deleted_at is null
     and nullif(f.data->>'entity_definition_id','')::uuid = r.table_id
   where r.data_class = 'record' and r.deleted_at is null
     and (r.data ->> (f.data->>'key')) is null
     and nullif(f.data->>'relation_target','') is not null
   limit 1;

  select r.id into v_stranger
    from custom.record r
   where r.organization_id = v_org and r.table_id = v_ttable
     and r.data_class = 'record' and r.deleted_at is null
   limit 1;
  if v_job is null or v_stranger is null then
    raise exception 'SKIP-AS-FAILURE: no subject for arm 2 in this database.';
  end if;

  begin
    -- Provenance: a direct write to platform.associations must name the system doing it.
    perform set_config('app.actor_system', 'campaign-tests.relhalves_red', true);

    insert into platform.associations
      (source_type, source_id, target_type, target_id, role, organization_id, relation_field_id)
    values ('record', v_job, 'record', v_stranger, v_role, v_org, v_fid);

    set constraints all immediate;

    raise exception 'ARM 2 FAILED: an association landed for a value the record does not hold and NOTHING REFUSED IT.';
  exception when others then
    get stacked diagnostics v_msg = message_text, v_code = returned_sqlstate;
    if v_msg like 'ARM 2 FAILED%' then raise; end if;
    if v_code <> '23514' or v_msg not like '%ASSOCIATION landed with no value%' then
      raise exception 'ARM 2 FAILED: refused, but not by this guard — % %', v_code, v_msg;
    end if;
    raise notice 'ARM 2 RED — refused (%): %', v_code, v_msg;
  end;
end $$;
rollback;

\echo ''
\echo '── 3 · the EDGE is taken away while the VALUE still names the record ──────────────────'

begin;
do $$
declare
  v_org uuid; v_job uuid; v_role text; v_target uuid; v_msg text; v_code text;
begin
  select a.organization_id, a.source_id, a.role, a.target_id
    into v_org, v_job, v_role, v_target
    from platform.associations a
   where a.relation_field_id is not null and a.deleted_at is null
     and a.source_type = 'record' and a.target_type = 'record'
     and exists (select 1 from custom.record r
                  where r.organization_id = a.organization_id and r.id = a.source_id
                    and r.deleted_at is null and r.data_class = 'record'
                    and r.data ->> a.role = a.target_id::text)
   limit 1;
  if v_job is null then
    raise exception 'SKIP-AS-FAILURE: no subject for arm 3 in this database.';
  end if;

  begin
    perform set_config('app.actor_system', 'campaign-tests.relhalves_red', true);

    update platform.associations
       set deleted_at = now()
     where source_type = 'record' and source_id = v_job
       and target_type = 'record' and target_id = v_target and role = v_role;

    set constraints all immediate;

    raise exception 'ARM 3 FAILED: the edge was taken away while the value still named the record and NOTHING REFUSED IT.';
  exception when others then
    get stacked diagnostics v_msg = message_text, v_code = returned_sqlstate;
    if v_msg like 'ARM 3 FAILED%' then raise; end if;
    if v_code <> '23514' or v_msg not like '%removed while its VALUE still names%' then
      raise exception 'ARM 3 FAILED: refused, but not by this guard — % %', v_code, v_msg;
    end if;
    raise notice 'ARM 3 RED — refused (%): %', v_code, v_msg;
  end;
end $$;
rollback;

\echo ''
\echo 'relhalves_red: all three arms REFUSED. Nothing was committed.'
