-- FTS-4 — A TAG LANDS IN platform.tag AND NOWHERE ELSE, measured RED then GREEN
-- (migrations/campaign/fts4_a..c_*.sql; Arman 2026-10-02: tags are not scopes, not custom data).
--
-- THE USE CASE (rolled back, nothing survives): test@test.com, a member of Cedar Ridge Physical Therapy, writes a
-- note "Medicare cap 2025 — plan of care review" and files it under "post-op knee follow-up" (the tag door), then
-- the note's tags column gets "medicare cap 2025" (the column trigger), then the tag door restates the note's tags.
-- THE BREAK THIS CATCHES: a tag door that goes back to the scopes — it makes a context.scopes row instead of a
-- platform.tag row, or files the edge on `scope` — so the Knowledge Hub's tag list (which reads platform.tag) never
-- shows it. RED is planted in the suite: platform.tag_scope_id replaced by a body that inserts a scope.
-- WHAT MUST HOLD:
--   T1 file_under_tag answers a platform.tag id of the note's organization, a live `note -> tag` edge exists
--   T2 no context.scopes row was made for it (the organization's scope count did not move)
--   T3 the tags column files the tag the same way (a tag row + a tag edge, no scope)
--   T4 context_tags_set refuses an invented id and a scope id in one plain sentence, 42501, nothing saved
--   T5 context_tags_set with the real tag ids answers ok and exactly those tags stay on the note
\set ON_ERROR_STOP on
\timing off
\set suite 'fts4_a_a_tag_edit_lands_in_the_tag_table_red_green.sql'
\set expect 'clone'
\set requires 'relation:platform.tag|function:platform.file_under_tag|function:platform.tag_scope_id|function:custom.context_tags_set|relation:workbench.notes'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local lock_timeout = '10s';
set local statement_timeout = '120s';

create temp table fts4_fx (k text primary key, v uuid) on commit drop;
insert into fts4_fx values
  ('test_uid', '4060701e-706a-4c76-b3ca-0bbc69fa5a14'),
  ('cedar',    '0a54df90-eab8-4d07-ab29-81a45fb41e04'),
  ('invented', '9e1c4b7a-3f52-4d18-a6b0-7c2e5d9f1a83'),
  ('note',     gen_random_uuid());

do $fx$
declare f jsonb := (select jsonb_object_agg(k, v) from fts4_fx);
begin
  if not exists (select 1 from iam.organization_member om where om.user_id = (f->>'test_uid')::uuid and om.organization_id = (f->>'cedar')::uuid) then
    raise exception 'fts4: precondition — test@test.com is not a member of Cedar Ridge on this copy';
  end if;
  perform set_config('app.actor_system', 'campaign-suite fts4', true);
  insert into workbench.notes (id, label, organization_id, created_by)
  values ((f->>'note')::uuid, 'Medicare cap 2025 — plan of care review', (f->>'cedar')::uuid, (f->>'test_uid')::uuid);
end
$fx$;

create or replace function pg_temp.fts4_run() returns text[] language plpgsql as $run$
declare
  f jsonb := (select jsonb_object_agg(k, v) from fts4_fx);
  v_fails text[] := '{}';
  v_org uuid := (f->>'cedar')::uuid;
  v_note uuid := (f->>'note')::uuid;
  v_uid uuid := (f->>'test_uid')::uuid;
  v_scopes_before bigint; v_tag uuid; v_tag2 uuid; v_state text; v_msg text; v_out jsonb; v_scope uuid;
begin
  select count(*) into v_scopes_before from context.scopes s where s.organization_id = v_org;
  begin
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    v_tag := platform.file_under_tag('note', v_note, 'post-op knee follow-up');
    perform set_config('role', 'none', true);
    if not exists (select 1 from platform.tag t where t.id = v_tag and t.organization_id = v_org and t.deleted_at is null)
       or not exists (select 1 from platform.associations a where a.source_type = 'note' and a.source_id = v_note
                       and a.target_type = 'tag' and a.target_id = v_tag and a.deleted_at is null) then
      v_fails := v_fails || 'T1 the door did not make a platform.tag row and a note -> tag edge';
    end if;
    if (select count(*) from context.scopes s where s.organization_id = v_org) <> v_scopes_before then
      v_fails := v_fails || 'T2 the door made a context.scopes row';
    end if;
    -- T3: the column
    update workbench.notes set tags = array['medicare cap 2025'] where id = v_note;
    select t.id into v_tag2 from platform.tag t where t.organization_id = v_org and t.slug = 'medicare-cap-2025' and t.deleted_at is null;
    if v_tag2 is null or not exists (select 1 from platform.associations a where a.source_type = 'note' and a.source_id = v_note
                                      and a.target_type = 'tag' and a.target_id = v_tag2 and a.deleted_at is null) then
      v_fails := v_fails || 'T3 the tags column did not file a platform.tag';
    end if;
    if (select count(*) from context.scopes s where s.organization_id = v_org) <> v_scopes_before then
      v_fails := v_fails || 'T3 the tags column made a context.scopes row';
    end if;
    -- T4: refusals (an invented id, a scope id)
    select s.id into v_scope from context.scopes s where s.organization_id = v_org and s.deleted_at is null limit 1;
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    begin
      v_out := custom.context_tags_set('note', v_note, array[v_tag, (f->>'invented')::uuid]);
      v_fails := v_fails || 'T4 an invented id was accepted';
    exception when others then
      get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
      if v_state <> '42501' or v_msg <> 'One of those is not a tag you can use. Nothing was saved.' then
        v_fails := v_fails || format('T4 invented id refused as %s: %s', v_state, v_msg);
      end if;
    end;
    if v_scope is not null then
      begin
        v_out := custom.context_tags_set('note', v_note, array[v_tag, v_scope]);
        v_fails := v_fails || 'T4 a scope id was accepted as a tag';
      exception when others then
        get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
        if v_state <> '42501' then v_fails := v_fails || format('T4 scope id refused as %s: %s', v_state, v_msg); end if;
      end;
    end if;
    -- T5: a real restate
    v_out := custom.context_tags_set('note', v_note, array[v_tag, v_tag2]);
    perform set_config('role', 'none', true);
    if (v_out ->> 'ok') is distinct from 'true'
       or (select count(*) from platform.associations a where a.source_type = 'note' and a.source_id = v_note
              and a.target_type = 'tag' and a.deleted_at is null) <> 2 then
      v_fails := v_fails || 'T5 the restated set is not exactly the two tags';
    end if;
  exception when others then
    perform set_config('role', 'none', true);
    get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
    v_fails := v_fails || format('RAISED %s: %s', v_state, v_msg);
  end;
  return v_fails;
end
$run$;

-- RED: the planted break — a tag door that makes a SCOPE (as the old body did).
do $red$
declare v_new text := pg_get_functiondef('platform.tag_scope_id(uuid,text,uuid)'::regprocedure);
begin
  perform set_config('fts4.green_body', v_new, true);
end
$red$;
create or replace function platform.tag_scope_id(p_org uuid, p_name text, p_actor uuid)
 returns uuid language plpgsql security definer set search_path to 'pg_catalog', 'public' as $b$
declare v_id uuid; v_type uuid;
begin
  select st.id into v_type from context.scope_types st where st.organization_id = p_org and st.deleted_at is null limit 1;
  insert into context.scopes (organization_id, scope_type_id, name, slug, created_by)
  values (p_org, v_type, btrim(p_name), 'planted-' || md5(p_name), p_actor) returning id into v_id;
  return v_id;
end $b$;
select case when cardinality(pg_temp.fts4_run()) > 0 then 'RED ok — the planted break is caught: ' || array_to_string(pg_temp.fts4_run(), ' | ')
            else 'RED FAILED — the planted break was NOT caught' end as red;
-- the same rows were left by the red run inside this transaction: reset them.
update workbench.notes set tags = '{}' where id = (select v from fts4_fx where k = 'note');
delete from platform.associations where source_type = 'note' and source_id = (select v from fts4_fx where k = 'note');

-- GREEN: the real body back.
do $green$ begin execute current_setting('fts4.green_body'); end $green$;
select case when cardinality(pg_temp.fts4_run()) = 0 then 'GREEN ok — a tag lands in platform.tag and nowhere else'
            else 'GREEN FAILED: ' || array_to_string(pg_temp.fts4_run(), ' | ') end as green;
rollback;
