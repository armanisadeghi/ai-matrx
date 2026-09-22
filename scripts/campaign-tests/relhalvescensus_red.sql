-- LANE STORE-TXN-4 — THE RED TWIN OF THE LIVE CENSUS. Every arm ends in ROLLBACK.
--
-- WHAT A RED TWIN IS FOR HERE. `relhalvescensus_green.sql` says "zero halves disagree". On a
-- database where the census function returned an empty set for ANY reason — a rewritten body, a
-- `where false`, a join that lost a direction — it would say exactly the same thing, in the same
-- words, for ever. This file plants ONE half of a relation in each direction and passes only
-- when the census NAMES it. It is the proof that the green suite's zero is a finding and not a
-- silence.
--
-- 🚨 IT ALSO SWITCHES THE DEFERRED GUARD'S OWN WORK OFF FOR ONE TRANSACTION — not by disabling
-- anything, which would take ACCESS EXCLUSIVE on custom.record and freeze the store, but by
-- letting the guard fire and CATCHING its refusal. The census is read INSIDE the transaction,
-- before the rollback, which is the only place a planted half exists.
--
-- THE USE CASE is whatever this database already runs on: both arms find their subject by
-- asking for a live relation, so nothing is planted that a business would not recognise and the
-- file does not rot when the campaign's use-case data is rebuilt.
--
--   1  A VALUE WITH NO EDGE is seen. The edge-writing statement triggers are what would
--      normally write it, so the plant removes the association the same statement created —
--      leaving exactly the shape 13 records carried on the main database this morning.
--   2  AN EDGE WITH NO VALUE is seen. An association naming its field, pointing at a record the
--      document does not name — the shape 18 associations carried, which nobody had censused.
--
-- RUN IT:  psql "$DSN" -f scripts/campaign-tests/relhalvescensus_red.sql

\set ON_ERROR_STOP on
\timing off

\set suite 'relhalvescensus_red.sql'
\set requires 'function:custom.relation_halves_disagreements'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

\echo ''
\echo '── 1 · a VALUE with no edge is NAMED by the census ────────────────────────────────────'

begin;
do $$
declare
  v_org uuid; v_rec uuid; v_role text; v_target uuid;
  v_seen int; v_dir text; v_remedy text;
begin
  perform set_config('app.actor_system', 'campaign-tests.relhalvescensus_red', true);

  -- The subject: a live relation that AGREES right now, so this arm creates the disagreement
  -- rather than finding one (which would make it a second green suite).
  select a.organization_id, a.source_id, a.role, a.target_id
    into v_org, v_rec, v_role, v_target
    from platform.associations a
   where a.relation_field_id is not null and a.deleted_at is null
     and a.source_type = 'record' and a.target_type = 'record'
     and exists (select 1 from custom.record r
                  where r.organization_id = a.organization_id and r.id = a.source_id
                    and r.deleted_at is null and r.data_class = 'record'
                    and exists (select 1 from custom.record_relation_edges(
                                         r.organization_id, r.id, r.table_id,
                                         r.data_class, r.data, r.deleted_at) e
                                 where e.target_id = a.target_id and e.edge_role = a.role))
   limit 1;
  if v_rec is null then
    raise exception 'SKIP-AS-FAILURE: no live, agreeing relation on this database, so arm 1 could prove nothing here.';
  end if;

  -- TAKE THE EDGE AWAY AND LEAVE THE VALUE — a value with nothing indexing it.
  update platform.associations
     set deleted_at = now()
   where organization_id = v_org and source_type = 'record' and source_id = v_rec
     and target_type = 'record' and target_id = v_target and role = v_role
     and deleted_at is null;

  select count(*), min(d.direction), min(d.remedy)
    into v_seen, v_dir, v_remedy
    from custom.relation_halves_disagreements(v_org, v_rec) d
   where d.field_key = v_role and d.target_id = v_target;

  if v_seen <> 1 or v_dir <> 'value_without_edge' then
    raise exception
      'ARM 1 FAILED: a value was left with no association beside it and the census returned % row(s) '
      '(direction %). The green suite''s zero would therefore be a silence, not a finding.',
      v_seen, coalesce(v_dir, '(none)');
  end if;
  if v_remedy <> 'write_the_edge' then
    raise exception 'ARM 1 FAILED: the census saw it but proposes %, and the repairable remedy for a '
                    'value whose target is a live record is write_the_edge.', v_remedy;
  end if;
  raise notice 'ARM 1 RED — the census NAMES the planted half: record % · relation % → % · % (%)',
               v_rec, v_role, v_target, v_dir, v_remedy;
end $$;
rollback;

\echo ''
\echo '── 2 · an EDGE with no value is NAMED by the census ───────────────────────────────────'

begin;
do $$
declare
  v_org uuid; v_rec uuid; v_role text; v_fid uuid; v_ttable uuid; v_stranger uuid;
  v_seen int; v_dir text; v_remedy text;
begin
  perform set_config('app.actor_system', 'campaign-tests.relhalvescensus_red', true);

  -- A record whose relation cell is EMPTY, and a real record of the table that field points at:
  -- an association can then be planted that the document says nothing about.
  select r.organization_id, r.id, coalesce(nullif(f.data ->> 'key', ''), f.data ->> 'name'), f.id,
         nullif(f.data ->> 'relation_target', '')::uuid
    into v_org, v_rec, v_role, v_fid, v_ttable
    from custom.record r
    join custom.record f
      on f.table_id = custom.field_kernel_id()
     and f.organization_id = r.organization_id
     and f.data ->> 'type' = 'relation'
     and f.deleted_at is null
     and nullif(f.data ->> 'entity_definition_id', '')::uuid = r.table_id
   where r.data_class = 'record' and r.deleted_at is null
     and (r.data ->> coalesce(nullif(f.data ->> 'key', ''), f.data ->> 'name')) is null
     and nullif(f.data ->> 'relation_target', '') is not null
   limit 1;

  select r.id into v_stranger
    from custom.record r
   where r.organization_id = v_org and r.table_id = v_ttable
     and r.data_class = 'record' and r.deleted_at is null
   limit 1;
  if v_rec is null or v_stranger is null then
    raise exception 'SKIP-AS-FAILURE: no empty relation cell with a real target beside it, so arm 2 could prove nothing here.';
  end if;

  insert into platform.associations
    (source_type, source_id, target_type, target_id, role, organization_id, relation_field_id)
  values ('record', v_rec, 'record', v_stranger, v_role, v_org, v_fid);

  select count(*), min(d.direction), min(d.remedy)
    into v_seen, v_dir, v_remedy
    from custom.relation_halves_disagreements(v_org, v_rec) d
   where d.field_key = v_role and d.target_id = v_stranger;

  if v_seen <> 1 or v_dir <> 'edge_without_value' then
    raise exception
      'ARM 2 FAILED: an association was planted for a value the record does not hold and the census '
      'returned % row(s) (direction %). This is the direction STORE-TXN-3''s row never counted and '
      'that carried 18 of the 32 halves — a census blind to it is worse than none.',
      v_seen, coalesce(v_dir, '(none)');
  end if;
  if v_remedy <> 'write_the_value' then
    raise exception 'ARM 2 FAILED: the census saw it but proposes %, not write_the_value.', v_remedy;
  end if;
  raise notice 'ARM 2 RED — the census NAMES the planted edge: record % · relation % → % · % (%)',
               v_rec, v_role, v_stranger, v_dir, v_remedy;
end $$;
rollback;

\echo ''
\echo 'relhalvescensus_red: both planted halves were NAMED by the census. Nothing was committed.'
