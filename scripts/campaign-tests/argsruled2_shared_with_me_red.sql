-- ARGS-RULED-2 — RED TWIN of argsruled2_shared_with_me_green.sql. Inside ONE rolled-back
-- transaction it runs the INVERSE (the cx_conversation filter) and REQUIRES the chat shared by name
-- to be missing from "shared with me" again.

\set suite 'argsruled2_shared_with_me_red.sql'
\set requires 'function:public.get_cx_conversations_shared_with_me|function:public.share_resource_with_user|relation:chat.conversation'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif
begin;
\i migrations/inverse/argsruled2_chats_shared_with_me_are_listed_down.sql

do $$
declare
  c_owner  uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  c_friend uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  v_boss text := current_user;
  v_clinic uuid; v_equine uuid; v_by_name uuid; v_by_org uuid; v_private uuid;
  v_res jsonb; v_ids uuid[]; v_lane uuid[]; v_level text;
begin
  perform set_config('app.actor_system', 'campaign.argsruled2_shared_with_me_red', true);
  insert into iam.organizations (name, slug, abbreviation)
  values ('Willow Creek Veterinary Clinic', 'willow-creek-vet-argsruled2-swmred', 'WCV') returning id into v_clinic;
  insert into iam.organizations (name, slug, abbreviation)
  values ('High Desert Equine Services', 'high-desert-equine-argsruled2-swmred', 'HDE') returning id into v_equine;
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
  values (v_clinic, 'organization', v_clinic, c_owner, 'owner', 'active'),
         (v_equine, 'organization', v_equine, c_friend, 'owner', 'active'),
         (v_equine, 'organization', v_equine, c_owner, 'member', 'active');
  insert into chat.conversation (created_by, title, organization_id, visibility)
  values (c_owner, 'Feline dental chart — resorptive lesions, second opinion', v_clinic, 'personal') returning id into v_by_name;
  insert into chat.conversation (created_by, title, organization_id, visibility)
  values (c_owner, 'Equine referral intake checklist — draft for both practices', v_clinic, 'personal') returning id into v_by_org;
  insert into chat.conversation (created_by, title, organization_id, visibility)
  values (c_owner, 'Controlled substance log reconciliation — October', v_clinic, 'personal') returning id into v_private;

  perform set_config('request.jwt.claims', json_build_object('sub', c_owner::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  v_res := public.share_resource_with_user('conversation', v_by_name, c_friend, 'commenter');
  if (v_res ->> 'success')::boolean is not true then raise exception 'setup: share by name failed: %', v_res; end if;
  v_res := public.share_resource_with_org('conversation', v_by_org, v_equine, 'viewer');
  if (v_res ->> 'success')::boolean is not true then raise exception 'setup: share with organization failed: %', v_res; end if;

  -- 4 · the owner's own conversations are not "shared with me"
  select array_agg(id) into v_ids from public.get_cx_conversations_shared_with_me();
  if v_ids && array[v_by_name, v_by_org, v_private] then
    raise exception '4: the owner sees her own conversations under "shared with me": %', v_ids;
  end if;

  perform set_config('role', v_boss, true);
  perform set_config('request.jwt.claims', json_build_object('sub', c_friend::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select array_agg(id) into v_ids from public.get_cx_conversations_shared_with_me();

  -- ══ RED · on the pre-fix body the chat shared with her by name is not listed ══
  if v_by_name = any(coalesce(v_ids, '{}')) then
    raise exception 'RED: with the inverse applied the chat shared by name IS listed — the green suite proves nothing';
  end if;
  perform set_config('role', v_boss, true);
  raise notice 'argsruled2_shared_with_me_red: on the pre-fix body "shared with me" lists % of the two chats shared with her — the green suite can fail', coalesce(array_length(v_ids,1),0);
end $$;

rollback;
