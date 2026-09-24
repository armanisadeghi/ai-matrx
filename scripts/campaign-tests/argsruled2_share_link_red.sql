-- ARGS-RULED-2 — RED TWIN of argsruled2_share_link_green.sql. Inside ONE rolled-back transaction
-- it runs the INVERSE (the 2026-09-12 rule: a private or confidential token cannot be link-shared)
-- and REQUIRES the owner's own link to be refused again.

\set suite 'argsruled2_share_link_red.sql'
\set requires 'function:public.create_share_link|relation:chat.conversation'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif
begin;
\i migrations/inverse/argsruled2_an_owner_may_share_anything_they_own_by_link_down.sql

do $$
declare
  c_owner  uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  c_friend uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  v_boss text := current_user;
  v_clinic uuid; v_equine uuid; v_conv uuid; v_other uuid; v_quiz uuid;
  v_res jsonb; v_tok text;
begin
  perform set_config('app.actor_system', 'campaign.argsruled2_share_link_red', true);
  insert into iam.organizations (name, slug, abbreviation)
  values ('Willow Creek Veterinary Clinic', 'willow-creek-vet-argsruled2-linkred', 'WCV') returning id into v_clinic;
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
  values (v_clinic, 'organization', v_clinic, c_owner, 'owner', 'active');
  insert into iam.organizations (name, slug, abbreviation)
  values ('High Desert Equine Services', 'high-desert-equine-argsruled2-linkred', 'HDE') returning id into v_equine;
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

  -- ══ RED · under the 2026-09-12 class rule the owner cannot share her own conversation by link ══
  perform set_config('request.jwt.claims', json_build_object('sub', c_owner::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  v_res := public.create_share_link('conversation', v_conv, 'viewer', null, null, 'Second opinion — feline dental');
  if (v_res ->> 'success')::boolean is not false then
    raise exception 'RED: with the inverse applied the owner could STILL mint a link (%) — the green suite proves nothing', v_res;
  end if;
  perform set_config('role', v_boss, true);
  raise notice 'argsruled2_share_link_red: under the pre-ruling class rule the owner is refused (%) — the green suite can fail', v_res ->> 'error';
end $$;

rollback;
