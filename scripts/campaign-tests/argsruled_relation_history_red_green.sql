-- LANE ARGS-RULED — platform.relation_history's SKIPPED BRANCH, measured RED then GREEN in ONE
-- rolled-back transaction on the MAIN database.
--
-- THE DEFECT. relation_history resolved the edge's source record and asked
-- custom.assert_client_may_open on it — only `if v_source is not null`. An association whose
-- source_type is not `record` (platform.associations is the platform's one association table and
-- carries other kinds) left v_source null, the ladder was never asked, and the body returned that
-- association's whole version history to any member of the organization.
--
-- THE FIXTURE IS A REAL ONE. Rincon Plumbing Co, a family plumbing company in Ventura County,
-- tags a page about backflow-preventer testing against a topic on their own site — a `web_page` →
-- `seo_map_topic` edge, which is the commonest non-record shape on this platform. Editing the tag
-- gives it a second version. Dana (test@test.com) is a member of Rincon and was shared nothing.
--
-- HOW THE RED IS TAKEN. The pre-ARGS-RULED body is put back with CREATE OR REPLACE INSIDE this
-- transaction, which is rolled back, so the deferred door_body_must_decide trigger fires at a
-- COMMIT that never arrives and nothing is left behind. The two answers differ by that one branch
-- and nothing else.
--
-- RUN IT:  binlocal/p.sh -f scripts/campaign-tests/argsruled_relation_history_red_green.sql
-- MEASURED 2026-09-21: BEFORE 2 version(s), AFTER 0.


-- TARGET AND DEPENDENCIES — the one shared preamble. It accepts the MAIN database or the
-- rehearsal branch named in common-docs/.../plan/BRANCH-REF, refuses anything else by name,
-- says which database this is, and SKIPS (never fake-passes) when a declared dependency is
-- absent here. Declare dependencies with `\set requires` above the include; see the preamble.
\set suite 'argsruled_relation_history_red_green.sql'
\set requires 'row:iam.organizations:id in (\'235a6add-e8b5-43f9-883e-9dd0389c1759\',\'6069a466-1445-42df-a64e-cf37ecdc1b99\')'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif
begin;

-- ── THE RECORD-STORE SWITCH, BORROWED (SUITES-TIDY 2026-09-22) ──────────────────────────────
-- The fixture below needs `history.row_versions` to carry versions of the association it makes,
-- and the capture trigger on platform.associations is gated
-- `WHEN (platform.relations_are_on(new.organization_id))` — which reads this organization's
-- record-store switch. That switch is OFF for Rincon, correctly: the store is opt-in per
-- organization (STORE-OFF / FIX-11A). So the fixture made no history rows and the suite
-- reported "nothing to measure". The switch is borrowed inside this transaction only and goes
-- with the ROLLBACK at the foot of the file; the platform default is untouched.
-- Rincon Plumbing Co
\set store_org '6069a466-1445-42df-a64e-cf37ecdc1b99'
\i scripts/campaign-tests/_borrow_store_switch.sql

set local lock_timeout = '15s';
set local statement_timeout = '120s';
do $t$
declare
  c_dana text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_org  uuid := '6069a466-1445-42df-a64e-cf37ecdc1b99';   -- Rincon Plumbing Co
  v_boss text := current_user;
  v_assoc uuid;
  v_hist  integer;
  v_seen  integer;
begin
  perform set_config('app.actor_system','campaign-test/argsruled_relation_history', true);
  -- FIXTURE as the connected role: one NON-RECORD association in Rincon, and a second version
  -- of it so history.row_versions carries more than the insert. Rincon's dispatcher tagged a
  -- web page about backflow-preventer testing against a topic on their own site.
  insert into platform.associations
    (source_type, source_id, target_type, target_id, organization_id, role, origin)
  values ('web_page', extensions.gen_random_uuid(), 'seo_map_topic', extensions.gen_random_uuid(),
          v_org, 'covers', 'campaign')
  returning id into v_assoc;
  update platform.associations set role = 'intent' where id = v_assoc;

  select count(*) into v_hist from history.row_versions v
   where v.entity_type='agent_surface_binding' and v.row_id=v_assoc and v.organization_id=v_org;
  raise notice 'fixture: association % has % history version(s)', v_assoc, v_hist;
  if v_hist = 0 then raise exception 'fixture made no history rows — nothing to measure'; end if;

  -- TAKE THE SEAT.
  perform set_config('request.jwt.claims', c_dana, true);
  perform set_config('role','authenticated', true);
  if current_user <> 'authenticated' then raise exception 'no seat'; end if;
  if pg_has_role(current_user,(select c.relowner from pg_class c where c.oid='custom.record'::regclass),'member')
    then raise exception 'this seat owns custom.record'; end if;

  -- GREEN, the body that is live now.
  select count(*) into v_seen from platform.relation_history(v_org, v_assoc);
  raise notice 'AFTER  (live body): relation_history returned % row(s)', v_seen;
  if v_seen <> 0 then raise exception 'GREEN FAILED: the fixed body still answered % rows', v_seen; end if;

  -- RED, the body as it stood before ARGS-RULED, put back INSIDE this rolled-back transaction.
  perform set_config('role', v_boss, true);
  create or replace function platform.relation_history(p_organization_id uuid, p_association_id uuid)
   returns table(version integer, operation text, at_time timestamptz, actor_id uuid, role text, target_type text, target_id uuid)
   language plpgsql stable security definer set search_path to 'pg_catalog'
  as $b$
  declare v_source uuid;
  begin
    perform platform.assert_relations_door(p_organization_id);
    perform custom.assert_client_may_reach(p_organization_id, 'platform.relation_history');
    select a.source_id into v_source from platform.associations a
     where a.id = p_association_id and a.organization_id = p_organization_id and a.source_type = 'record'
     limit 1;
    if v_source is not null then
      perform custom.assert_client_may_open(p_organization_id, v_source, 'platform.relation_history',
                                            'viewer'::public.permission_level, 'record');
    end if;
    return query
      select v.version, v.operation, v.occurred_at, v.actor_id,
             v.row_data ->> 'role', v.row_data ->> 'target_type',
             nullif(v.row_data ->> 'target_id','')::uuid
        from history.row_versions v
       where v.entity_type = 'agent_surface_binding' and v.row_id = p_association_id
         and v.organization_id = p_organization_id
       order by v.version, v.occurred_at;
  end $b$;
  perform set_config('role','authenticated', true);

  select count(*) into v_seen from platform.relation_history(v_org, v_assoc);
  raise notice 'BEFORE (pre-ARGS-RULED body): relation_history returned % row(s) — the ladder was never asked', v_seen;
  if v_seen = 0 then raise exception 'RED FAILED: the old body answered nothing, so there is no defect to have closed'; end if;
  raise notice 'MEASURED: % version(s) of an association nobody decided about, now 0.', v_seen;
end $t$;
rollback;
