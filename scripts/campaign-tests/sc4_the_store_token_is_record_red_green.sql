-- LANE SC-4 — ONE STORE TOKEN: a conversation is "about" a Record under `record`, and nothing new
-- may write the retired `custom_record`. Measured RED then GREEN on the dev clone.
--
-- THE USE CASE. Priya Raman (admin@admin.com, a Harborline Software owner on the SC-3' fixture)
-- opens a coding chat, "Dispatch board reconnect bug — repro and fix", and points it at the
-- Harborline Dispatch record (custom.conversation_scope_bind, AGT-N-9). The binding must be the
-- store's own token, `record`; the database must refuse a new live `custom_record` edge whoever
-- writes it; and because Harborline Dispatch is a copied scope, the binding must re-arm the
-- follow exactly as a tag does. Everything is written inside this transaction and rolled back.
--
-- WHAT MAKES IT FAIL (RED before sc4_a_conversation_is_about_a_record_under_the_store_token.sql):
--   T1  binding writes ONE live conversation -> record edge, role record_scope, and no
--       conversation -> custom_record edge
--   T2  custom.conversation_scope answers bound, readable, that record
--   T3  a direct live conversation -> custom_record insert (even as the store owner) is refused
--       23514 by name; a tombstoned legacy one is still accepted
--   T4  the binding re-armed one follow row for Harborline (dedupe context.follow:associations:<id>)
--   T5  the same conversation also tagged to the scope in the current screens: the tag copy counts
--       the binding as the same edge — one live store edge, no context_tag beside it
--   T6  unbinding tombstones the binding (never deletes it) and conversation_scope answers unbound

\set ON_ERROR_STOP on
\timing off
\set suite 'sc4_the_store_token_is_record_red_green.sql'
\set requires 'function:custom.conversation_scope_bind|function:custom.context_tag_copy'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local lock_timeout = '10s';
set local statement_timeout = '180s';

do $t$
declare
  c_admin constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  v_org uuid; v_rec uuid; v_conv uuid; v_edge uuid;
  v_n int; v_m int; v_ans jsonb; v_state text; v_msg text; v_rep jsonb;
begin
  select s.organization_id, s.id into v_org, v_rec
    from context.scopes s join iam.organizations o on o.id = s.organization_id
   where o.name = 'Harborline Software' and s.name = 'Harborline Dispatch' and s.deleted_at is null
   limit 1;
  if v_rec is null or not exists (select 1 from custom.record r where r.organization_id = v_org and r.id = v_rec) then
    raise exception 'FIXTURE MISSING: Harborline Dispatch and its copy Record are not on this database';
  end if;
  perform set_config('app.actor_system', 'campaign-test/sc4-store-token', true);
  insert into chat.conversation (organization_id, title, created_by)
  values (v_org, 'Dispatch board reconnect bug — repro and fix', c_admin) returning id into v_conv;

  -- Priya points the chat at the record, as herself.
  perform set_config('request.jwt.claims', json_build_object('sub', c_admin, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  perform custom.conversation_scope_bind(v_org, v_conv, v_rec);
  v_ans := custom.conversation_scope(v_org, v_conv);
  perform set_config('role', 'none', true);

  -- ══ T1 ══
  select count(*) filter (where target_type = 'record'), count(*) filter (where target_type = 'custom_record')
    into v_n, v_m
    from platform.associations
   where source_type = 'conversation' and source_id = v_conv and role = 'record_scope' and deleted_at is null;
  if v_n <> 1 or v_m <> 0 then
    raise exception 'T1 RED: binding the chat wrote % edge(s) under record and % under custom_record — the retired token is still written', v_n, v_m;
  end if;
  select id into v_edge from platform.associations
   where source_type = 'conversation' and source_id = v_conv and target_type = 'record' and role = 'record_scope';

  -- ══ T2 ══
  if coalesce((v_ans ->> 'bound')::boolean, false) is not true or v_ans ->> 'record_id' is distinct from v_rec::text then
    raise exception 'T2: conversation_scope does not see the binding: %', v_ans;
  end if;

  -- ══ T3 ══
  begin
    insert into platform.associations (source_type, source_id, target_type, target_id, role, organization_id, created_by)
    values ('conversation', v_conv, 'custom_record', v_rec, 'legacy_probe', v_org, c_admin);
    v_state := 'passed';
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
  end;
  if v_state is distinct from '23514' or v_msg not like '%retired token custom_record%' then
    raise exception 'T3 RED: a new live conversation -> custom_record edge was not refused (%, %)', v_state, v_msg;
  end if;
  insert into platform.associations (source_type, source_id, target_type, target_id, role, organization_id, created_by, deleted_at)
  values ('conversation', v_conv, 'custom_record', v_rec, 'legacy_tombstone', v_org, c_admin, now());

  -- ══ T4 ══
  select count(*) into v_n from custom.io_outbox
   where organization_id = v_org and event_key = 'context.follow'
     and dedupe_key = 'context.follow:associations:' || v_edge::text and consumed_at is null;
  if v_n <> 1 then
    raise exception 'T4 RED: binding the chat to a copied scope left % follow row(s), not 1 — the copy never reconsiders the tag', v_n;
  end if;

  -- ══ T5 ══
  perform set_config('role', 'authenticated', true);
  perform public.set_entity_scopes('conversation', v_conv, array[v_rec]);
  perform set_config('role', 'none', true);
  v_rep := custom.context_tag_copy(v_org);
  select count(*) into v_n from platform.associations
   where source_type = 'conversation' and source_id = v_conv and target_type in ('record', 'custom_record')
     and target_id = v_rec and deleted_at is null;
  if v_n <> 1 then
    raise exception 'T5: the tagged and bound chat has % live store edges to the record, not 1 (report %)', v_n, v_rep;
  end if;

  -- ══ T6 ══
  perform set_config('role', 'authenticated', true);
  perform custom.conversation_scope_unbind(v_org, v_conv);
  v_ans := custom.conversation_scope(v_org, v_conv);
  perform set_config('role', 'none', true);
  if not exists (select 1 from platform.associations where id = v_edge and deleted_at is not null) then
    raise exception 'T6: unbinding did not tombstone the binding (it is live or gone)';
  end if;
  if coalesce((v_ans ->> 'bound')::boolean, true) then
    raise exception 'T6: after unbinding, conversation_scope still answers %', v_ans;
  end if;

  raise notice 'GREEN T1 T2 T3 T4 T5 T6 — a conversation is about a Record under `record`, custom_record is refused, the follow hears the binding';
end
$t$;

rollback;
