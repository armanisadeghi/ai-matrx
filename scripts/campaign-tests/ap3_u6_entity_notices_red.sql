-- AP-3 U6 — A CHANGE TO A PLATFORM LIST ANNOUNCES ITSELF (red twin).
--
-- THE USE CASE (no fake data): Holloway Creative (owner admin@admin.com, member test@test.com) keeps its
-- 160 client contacts as platform records (`crm.party`, token `party`). The Applets acceptance has both
-- people editing that list at once; each must see the other's change within a second.
--
-- THE DEFECT (before migration ap3_u6_entity_org_notices, 2026-10-06): no trigger on the five Table-API
-- tables announces anything, so an edit by test@test.com through `platform.entity_update` writes NO row
-- to `realtime.messages` on `mx:entity-org:<org>:party`, and no prefix `mx:entity-org` is registered,
-- so even a join is refused as "a topic no schema has claimed".
--
-- This file PASSES only while the defect is present. After the fix it FAILS by design (the green twin,
-- ap3_u6_entity_notices_green.sql, takes over). Ends in ROLLBACK; leaves nothing behind.

\set suite 'ap3_u6_entity_notices_red.sql'
\set requires 'relation:crm.party|row:iam.organization_member:organization_id = \'344cfaa8-2b0c-4971-854a-9694614816f2\' and user_id = \'4060701e-706a-4c76-b3ca-0bbc69fa5a14\''
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif
begin;

do $$
declare
  c_member uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';  -- test@test.com, Holloway member
  c_org    uuid := '344cfaa8-2b0c-4971-854a-9694614816f2';  -- Holloway Creative
  v_boss   text := current_user;
  v_id uuid; v_ver int; v_name text; v_sent int; v_prefix int;
begin
  perform set_config('app.actor_system', 'campaign.ap3_u6_entity_notices_red', true);
  select id, version, display_name into v_id, v_ver, v_name
    from crm.party where organization_id = c_org and deleted_at is null order by id limit 1;
  if v_id is null then raise exception '0: Holloway has no contact to edit'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', c_member::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  perform platform.entity_update('party', v_id, v_ver, jsonb_build_object('display_name', v_name || ' (red)'));
  perform set_config('role', v_boss, true);

  select count(*) into v_sent from realtime.messages m
   where m.topic = 'mx:entity-org:' || c_org || ':party'
     and m.inserted_at >= now();            -- now() is this transaction's start: only this test's rows
  select count(*) into v_prefix from platform.realtime_topic_prefix where prefix = 'mx:entity-org';

  if v_sent <> 0 or v_prefix <> 0 then
    raise exception 'RED NO LONGER HOLDS: % notice(s) on the Holloway party topic, prefix registered=%', v_sent, v_prefix;
  end if;
  raise notice 'ap3_u6_entity_notices_red: an edit to Holloway contact % by test@test.com sent 0 notices; no mx:entity-org prefix', v_id;
end $$;

rollback;
