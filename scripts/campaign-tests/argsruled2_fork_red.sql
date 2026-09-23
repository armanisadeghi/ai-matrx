-- ARGS-RULED-2 — RED TWIN of argsruled2_fork_green.sql. Inside ONE rolled-back transaction it
-- runs the INVERSE (the pre-fix fork_shared_*(uuid,uuid,text) bodies), builds the same Willow
-- Creek Veterinary Clinic / High Desert Equine Services world from the same vet tech's seat,
-- and REQUIRES every door to answer a real private id differently from an invented one again.

\set suite 'argsruled2_fork_red.sql'
\set requires 'function:public.fork_shared_conversation|function:public.fork_shared_flashcard_set|function:public.fork_shared_quiz|relation:education.fc_set|relation:education.quiz_sessions|relation:chat.conversation'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif
begin;
\i migrations/inverse/argsruled2_a_private_id_answers_as_an_invented_one_down.sql

do $$
declare
  c_tech   uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  c_equine uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com, High Desert's owner
  v_boss   text := current_user;
  v_clinic uuid; v_equine uuid;
  v_pub_set uuid; v_priv_set uuid; v_priv_quiz uuid; v_priv_conv uuid;
  v_real jsonb; v_inv jsonb; v_null jsonb; v_res jsonb; v_copy_org uuid;
  r record;
begin
  perform set_config('app.actor_system', 'campaign.argsruled2_fork_red', true);

  insert into iam.organizations (name, slug, abbreviation)
  values ('Willow Creek Veterinary Clinic', 'willow-creek-vet-argsruled2-forkred', 'WCV') returning id into v_clinic;
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
  values (v_clinic, 'organization', v_clinic, c_tech, 'owner', 'active');
  insert into iam.organizations (name, slug, abbreviation)
  values ('High Desert Equine Services', 'high-desert-equine-argsruled2-forkred', 'HDE') returning id into v_equine;
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
  values (v_equine, 'organization', v_equine, c_equine, 'owner', 'active');

  insert into education.fc_set (organization_id, created_by, updated_by, name, description, topic, visibility)
  values (v_equine, c_equine, c_equine, 'Equine dental formulae',
          'Triadan numbering and eruption ages for the equine dental arcade.', 'Dentistry', 'public')
  returning id into v_pub_set;
  insert into education.fc_set (organization_id, created_by, updated_by, name, topic, visibility)
  values (v_equine, c_equine, c_equine, 'Controlled drug schedule drill', 'Pharmacology', 'personal')
  returning id into v_priv_set;
  insert into education.quiz_sessions (title, state, organization_id, created_by, updated_by, visibility)
  values ('Board exam mock — pharmacology', '{}'::jsonb, v_equine, c_equine, c_equine, 'personal')
  returning id into v_priv_quiz;
  insert into chat.conversation (created_by, title, organization_id, visibility)
  values (c_equine, 'Staff pay review — Q4', v_equine, 'personal')
  returning id into v_priv_conv;

  perform set_config('request.jwt.claims', json_build_object('sub', c_tech::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' or auth.uid() <> c_tech then
    raise exception '0: not in the tech''s seat (current_user %, uid %)', current_user, auth.uid();
  end if;
  if iam.has_org_access(v_equine) or public.is_platform_admin() then
    raise exception '0: the seat can reach High Desert Equine or is a platform admin — nothing below could tell a stranger from an insider';
  end if;

  -- ══ RED · on the pre-fix bodies every door tells a private id from an invented one ══
  for r in select * from (values
      ('fork_shared_conversation', v_priv_conv),
      ('fork_shared_flashcard_set', v_priv_set),
      ('fork_shared_quiz',          v_priv_quiz)) t(fn, private_id)
  loop
    execute format('select public.%I($1, $2, null)', r.fn) into v_real using r.private_id, v_clinic;
    execute format('select public.%I($1, $2, null)', r.fn) into v_inv  using gen_random_uuid(), v_clinic;
    if v_real is not distinct from v_inv then
      raise exception 'RED: with the pre-fix body of % back, a private id and an invented one answered alike (%) — the green suite proves nothing', r.fn, v_real;
    end if;
  end loop;
  perform set_config('role', v_boss, true);
  raise notice 'argsruled2_fork_red: on the pre-fix bodies all 3 doors answer a private id and an invented id differently — the green suite can fail';
end $$;

rollback;
