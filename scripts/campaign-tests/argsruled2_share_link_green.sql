-- ARGS-RULED-2 — AN OWNER MAY SHARE THEIR OWN CONVERSATION AND QUIZ BY LINK (Arman, 2026-09-23).
--
-- THE USE CASE (no fake test data): Dr. Maya Okafor-Reyes' vet tech at Willow Creek Veterinary
-- Clinic, a three-vet small-animal practice in Bend, Oregon, talked through a hard feline dental
-- chart with the assistant and wants a second opinion from a colleague at High Desert Equine
-- Services, a separate practice across town she is not a member of. She sends a link — exactly
-- what ChatGPT's shared-conversation link does. The same tech built a rabies-protocol quiz she
-- wants the same colleague to try.
--
-- THE SEATS: test@test.com (the tech, the OWNER), admin@admin.com (the colleague, a member of
-- High Desert Equine only), and the anonymous seat a link is opened from. Ends in ROLLBACK.
--
-- 1 · the owner mints a link for her own PRIVATE conversation and her own CONFIDENTIAL quiz;
-- 2 · the link resolves for somebody who is not signed in;
-- 3 · the colleague, holding only the link, copies the conversation into her own practice;
-- 4 · the owner can copy her own conversation (the fork door is not shut for everybody any more);
-- 5 · the walls hold: a person who is NOT the owner cannot mint a link, and a stranger with no
--     link still gets the one not_available answer for a private conversation.
--
-- RED TWIN: argsruled2_share_link_red.sql runs the inverse (the 2026-09-12 class rule) and
-- requires clause 1 to be refused again.

\set suite 'argsruled2_share_link_green.sql'
\set requires 'function:public.create_share_link|function:public.resolve_share_token|function:public.fork_shared_conversation|relation:chat.conversation|relation:education.quiz_sessions'
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
  v_clinic uuid; v_equine uuid; v_conv uuid; v_other uuid; v_quiz uuid;
  v_res jsonb; v_tok text;
begin
  perform set_config('app.actor_system', 'campaign.argsruled2_share_link_suite', true);
  insert into iam.organizations (name, slug, abbreviation)
  values ('Willow Creek Veterinary Clinic', 'willow-creek-vet-argsruled2-link', 'WCV') returning id into v_clinic;
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
  values (v_clinic, 'organization', v_clinic, c_owner, 'owner', 'active');
  insert into iam.organizations (name, slug, abbreviation)
  values ('High Desert Equine Services', 'high-desert-equine-argsruled2-link', 'HDE') returning id into v_equine;
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
  values (v_equine, 'organization', v_equine, c_friend, 'owner', 'active');

  insert into chat.conversation (created_by, title, organization_id, visibility)
  values (c_owner, 'Feline dental chart — resorptive lesions on 307 and 407, second opinion wanted', v_clinic, 'personal')
  returning id into v_conv;
  insert into chat.conversation (created_by, title, organization_id, visibility)
  values (c_owner, 'Controlled substance log reconciliation — October', v_clinic, 'personal')
  returning id into v_other;
  insert into education.quiz_sessions (title, state, organization_id, created_by, updated_by, visibility)
  values ('Rabies vaccination protocol — Oregon rules', '{}'::jsonb, v_clinic, c_owner, c_owner, 'personal')
  returning id into v_quiz;

  -- ══ 1 · the owner mints a link for her own conversation and her own quiz ══
  perform set_config('request.jwt.claims', json_build_object('sub', c_owner::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  v_res := public.create_share_link('conversation', v_conv, 'viewer', null, null, 'Second opinion — feline dental');
  if (v_res ->> 'success')::boolean is not true then
    raise exception '1: the owner could not share her own conversation by link: %', v_res;
  end if;
  v_tok := v_res ->> 'token';
  v_res := public.create_share_link('quiz_session', v_quiz, 'viewer', null, null, 'Rabies protocol quiz');
  if (v_res ->> 'success')::boolean is not true then
    raise exception '1: the owner could not share her own quiz by link: %', v_res;
  end if;

  -- ══ 2 · the link resolves for somebody who is not signed in ══
  perform set_config('role', v_boss, true);
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('role', 'anon', true);
  v_res := public.resolve_share_token(v_tok);
  if (v_res ->> 'success')::boolean is not true then
    raise exception '2: the conversation link did not resolve for an anonymous reader: %', v_res;
  end if;

  -- ══ 3 · the colleague, holding only the link, copies it into her own practice ══
  perform set_config('role', v_boss, true);
  perform set_config('request.jwt.claims', json_build_object('sub', c_friend::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  v_res := public.fork_shared_conversation(v_conv, v_equine, v_tok);
  if (v_res ->> 'success')::boolean is not true then
    raise exception '3: the colleague could not copy the shared conversation with its link: %', v_res;
  end if;

  -- ══ 5a · a person who is not the owner cannot mint a link ══
  v_res := public.create_share_link('conversation', v_conv, 'viewer', null, null, 'not mine to share');
  if (v_res ->> 'success')::boolean is not false or v_res ->> 'error' not like '%Only the owner%' then
    raise exception '5: somebody who is not the owner minted a link, or was refused for the wrong reason: %', v_res;
  end if;

  -- ══ 5b · a stranger with no link still gets not_available for a private conversation ══
  v_res := public.fork_shared_conversation(v_other, v_equine, null);
  if v_res ->> 'code' is distinct from 'not_available' then
    raise exception '5: a stranger with no link copied, or was told something about, a private conversation: %', v_res;
  end if;

  -- ══ 4 · the owner can copy her own conversation ══
  perform set_config('role', v_boss, true);
  perform set_config('request.jwt.claims', json_build_object('sub', c_owner::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  v_res := public.fork_shared_conversation(v_conv, v_clinic, null);
  if (v_res ->> 'success')::boolean is not true then
    raise exception '4: the owner could not copy her own conversation: %', v_res;
  end if;

  perform set_config('role', v_boss, true);
  raise notice 'argsruled2_share_link_green: 6 clauses passed — an owner shares a private conversation and a confidential quiz by link, it resolves anonymously, a colleague copies it, and the owner and non-owner walls hold';
end $$;

rollback;
