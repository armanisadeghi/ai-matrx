-- ARGS-RULED-2 — "CHATS SHARED WITH ME" LISTS THE CHATS SHARED WITH ME.
--
-- THE USE CASE (no fake test data): a vet tech at Willow Creek Veterinary Clinic (Bend, Oregon)
-- shares one conversation with a colleague at High Desert Equine Services by name, and another with
-- High Desert's whole practice. The colleague opens her chat sidebar's "Shared with me" section
-- (`/api/cx-chat/shared` → public.get_cx_conversations_shared_with_me) and must see both.
--
-- MEASURED 2026-09-24: the function filtered `resource_type = 'cx_conversation'`, a token the
-- sharing doors stopped writing when the table moved to chat.conversation — every share is written
-- as 'conversation' — so it returned NOTHING for everybody. It also never looked at organization
-- shares at all.
--
-- THE SEATS: test@test.com shares (the owner); admin@admin.com reads (the colleague). ROLLBACK.
--
-- 1 · a conversation shared with the colleague BY NAME is listed, with her level;
-- 2 · a conversation shared with her ORGANIZATION is listed;
-- 3 · a conversation nobody shared with her is not;
-- 4 · the owner does not see her own conversations in her "shared with me";
-- 5 · the list agrees with the canonical shared lane (public.cvx_list_scoped('shared')).
--
-- RED TWIN: argsruled2_shared_with_me_red.sql runs the inverse and requires clause 1 to fail.

\set suite 'argsruled2_shared_with_me_green.sql'
\set requires 'function:public.get_cx_conversations_shared_with_me|function:public.share_resource_with_user|function:public.share_resource_with_org|relation:chat.conversation'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif
begin;

do $$
declare
  c_owner  uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  c_friend uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  v_boss text := current_user;
  v_clinic uuid; v_equine uuid; v_by_name uuid; v_by_org uuid; v_private uuid;
  v_res jsonb; v_ids uuid[]; v_lane uuid[]; v_level text;
begin
  perform set_config('app.actor_system', 'campaign.argsruled2_shared_with_me_suite', true);
  insert into iam.organizations (name, slug, abbreviation)
  values ('Willow Creek Veterinary Clinic', 'willow-creek-vet-argsruled2-swm', 'WCV') returning id into v_clinic;
  insert into iam.organizations (name, slug, abbreviation)
  values ('High Desert Equine Services', 'high-desert-equine-argsruled2-swm', 'HDE') returning id into v_equine;
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

  -- 1 · by name, with her level
  if not (v_by_name = any(coalesce(v_ids, '{}'))) then
    raise exception '1: the conversation shared with her BY NAME is not in her "shared with me" (got %)', v_ids;
  end if;
  select permission_level into v_level from public.get_cx_conversations_shared_with_me() where id = v_by_name;
  if v_level is distinct from 'commenter' then
    raise exception '1: it is listed at level % — it was shared at commenter', v_level;
  end if;
  -- 2 · with her organization
  if not (v_by_org = any(v_ids)) then
    raise exception '2: the conversation shared with her ORGANIZATION is not in her "shared with me" (got %)', v_ids;
  end if;
  -- 3 · not shared
  if v_private = any(v_ids) then
    raise exception '3: a conversation nobody shared with her is listed';
  end if;
  -- 5 · the canonical shared lane agrees
  select array_agg(x.id) into v_lane from public.cvx_list_scoped('shared', p_limit => 200) x
   where x.id in (v_by_name, v_by_org, v_private);
  if not (v_lane @> array[v_by_name, v_by_org] and array[v_by_name, v_by_org] @> v_lane) then
    raise exception '5: the canonical shared lane says % for these three; this list says %', v_lane, v_ids;
  end if;

  perform set_config('role', v_boss, true);
  raise notice 'argsruled2_shared_with_me_green: 5 clauses passed — a chat shared by name and one shared with her organization are listed, the rest are not, and the list agrees with the shared lane';
end $$;

rollback;
