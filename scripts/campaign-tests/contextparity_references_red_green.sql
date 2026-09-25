-- LANE CONTEXT-PARITY — A REFERENCE REACHES THE AGENT AS THE REFERENCE THE CURRENT SYSTEM HANDS.
--
-- THE USE CASE. Castellano & Reyes, LLP keeps each workers' compensation matter as a scope; a
-- matter names its client ("Pinnacle Logistics") and its practice area ("Workers' Compensation –
-- Defense") as references to other scopes. The current context system hands the agent each as a
-- ```matrx reference fence; the record-store copy keeps them as relations. An agent answering
-- "who is the client on Reyes v. Pinnacle Logistics?" must be handed the same reference on both
-- systems — not a bare id with no kind on one of them. AI Matrx's Features keep `included_apps` as
-- one picklist fence in a list item; the agent must be handed the fence, not a list wrapping it.
--
-- WHAT MAKES IT FAIL (RED on the body before
-- contextparity_a_reference_reaches_the_agent_as_the_reference_the_current_system_hands.sql):
--   T1 a relation to a copied scope comes back as the bare id;
--   T2 a many-relation to copied scopes comes back as a list of ids;
--   T3 an entity reference [{id, token, label}] comes back as that list;
--   T4 a list Field holding one picklist fence comes back as a list of one;
-- and it must stay: T5 a relation to a record that is NOT a copied scope is the store's own value;
-- T6 a list Field with two plain words stays a list; T7 plain text is unchanged.
--
-- Read-only: every call is to the pure door `custom.agent_context_value` on documents built here;
-- the copied scopes it names are read from the clone's own copy. Rolled back.

\set ON_ERROR_STOP on
\timing off
\set suite 'contextparity_references_red_green.sql'
\set requires 'function:custom.agent_context_value'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local lock_timeout = '10s';
set local statement_timeout = '60s';

do $$
declare
  s1 uuid; s2 uuid; org uuid; plain uuid;
  v jsonb; want text; fails text[] := '{}';
  fence text := E'```matrx\n{\n    "kind": "reference",\n    "type": "picklist_item",\n    "items": [\n        {\n            "label": "AI Dream Server",\n            "item_id": "2aace9c7-81d8-499b-9cf9-17c7f963a8ae",\n            "list_id": "7426c07f-6562-47b3-94dd-06f206dfdb6c"\n        }\n    ],\n    "matrx_version": 1\n}\n```';
begin
  select r.id, r.organization_id into s1, org from custom.record r
   where r.data_class = 'record' and r.metadata -> 'moved_from' ->> 'table' = 'context.scopes'
   order by r.id limit 1;
  select r.id into s2 from custom.record r
   where r.data_class = 'record' and r.metadata -> 'moved_from' ->> 'table' = 'context.scopes' and r.id <> s1
   order by r.id limit 1;
  select r.id into plain from custom.record r
   where r.data_class = 'record' and r.metadata -> 'moved_from' is null
   order by r.id limit 1;
  if s1 is null or s2 is null or plain is null then
    raise exception 'SETUP: the clone holds no copied scopes to reference';
  end if;

  -- T1
  v := custom.agent_context_value(jsonb_build_object('client', s1::text), 'client', 'relation', org, gen_random_uuid(), 0) -> 'value';
  want := E'```matrx\n' || jsonb_pretty(jsonb_build_object('kind','reference','type','scope','items',jsonb_build_array(jsonb_build_object('id', s1::text)),'matrx_version',1)) || E'\n```';
  if v is distinct from to_jsonb(want) then fails := fails || format('T1 RED: a relation to copied scope %s was handed %s, not the scope fence', s1, v); end if;
  -- T2
  v := custom.agent_context_value(jsonb_build_object('team', jsonb_build_array(s1::text, s2::text)), 'team', 'relation', org, gen_random_uuid(), 0) -> 'value';
  if jsonb_typeof(v) <> 'string' or (v #>> '{}') not like E'```matrx\n%"type": "scope"%' || s2::text || '%' then
    fails := fails || format('T2 RED: a many-relation to two copied scopes was handed %s', v); end if;
  -- T3
  v := custom.agent_context_value(jsonb_build_object('notes', jsonb_build_array(jsonb_build_object('id', s1::text, 'token', 'note', 'label', 'Meeting notes'))), 'notes', 'entity_reference', org, gen_random_uuid(), 0) -> 'value';
  if jsonb_typeof(v) <> 'string' or (v #>> '{}') not like E'```matrx\n%"type": "note"%"label": "Meeting notes"%' then
    fails := fails || format('T3 RED: an entity reference to a note was handed %s', v); end if;
  -- T4
  v := custom.agent_context_value(jsonb_build_object('included_apps', jsonb_build_array(fence)), 'included_apps', 'text', org, gen_random_uuid(), 0) -> 'value';
  if v is distinct from to_jsonb(fence) then fails := fails || format('T4 RED: one picklist fence in a list Field was handed %s', left(v::text, 60)); end if;
  -- T5
  v := custom.agent_context_value(jsonb_build_object('owner', plain::text), 'owner', 'relation', org, gen_random_uuid(), 0) -> 'value';
  if v is distinct from to_jsonb(plain::text) then fails := fails || format('T5 RED: a relation to a native record was rewritten to %s', v); end if;
  -- T6
  v := custom.agent_context_value(jsonb_build_object('tags', '["intake","billing"]'::jsonb), 'tags', 'text', org, gen_random_uuid(), 0) -> 'value';
  if v is distinct from '["intake","billing"]'::jsonb then fails := fails || format('T6 RED: a list of two words became %s', v); end if;
  -- T7
  v := custom.agent_context_value(jsonb_build_object('industry', 'Retail Pharmacy'), 'industry', 'text', org, gen_random_uuid(), 0) -> 'value';
  if v is distinct from '"Retail Pharmacy"'::jsonb then fails := fails || format('T7 RED: plain text became %s', v); end if;

  if cardinality(fails) > 0 then
    raise exception E'%', array_to_string(fails, E'\n');
  end if;
  raise notice 'GREEN T1-T7: a reference reaches the agent as the reference the current system hands';
end $$;

rollback;
