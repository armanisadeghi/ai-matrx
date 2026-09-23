-- ARGS-RULED-2 — THE THREE fork_shared_* DOORS CANNOT TELL AN INVENTED ID FROM A PRIVATE ONE.
--
-- THE USE CASE THIS SUITE NAMES (no fake test data): Willow Creek Veterinary Clinic, a
-- three-vet small-animal practice in Bend, Oregon, trains its technicians for the VTNE
-- (Veterinary Technician National Exam). High Desert Equine Services, a large-animal practice
-- across town, publishes its "Equine dental formulae" flashcard set to everyone — and keeps its
-- own "Controlled drug schedule drill" set, its "Board exam mock — pharmacology" quiz and its
-- "Staff pay review" conversation private. A Willow Creek tech copying study material into her
-- own clinic must be able to copy the published set, and must learn NOTHING about which private
-- ids of High Desert's are real.
--
-- THE SEAT: `authenticated` carrying test@test.com — a member of Willow Creek, not a member of
-- High Desert Equine, not a platform admin. Ends in ROLLBACK.
--
-- 1 · for each door, a real private id and an invented uuid answer BYTE-IDENTICALLY
--     (one sentence, code 'not_available', success false), and so does a NULL id.
-- 2 · the answer echoes no id and carries no field off the row.
-- 3 · the control: the published flashcard set still copies into Willow Creek.
-- 4 · the earlier refusal is unchanged: an organization she is not in is still refused by name.
--
-- RED TWIN: argsruled2_fork_red.sql runs the inverse (pre-fix bodies) in its own rolled-back
-- transaction and requires the two answers to DIFFER again.

\set suite 'argsruled2_fork_green.sql'
\set requires 'function:public.fork_shared_conversation|function:public.fork_shared_flashcard_set|function:public.fork_shared_quiz|relation:education.fc_set|relation:education.quiz_sessions|relation:chat.conversation'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif
begin;

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
  perform set_config('app.actor_system', 'campaign.argsruled2_fork_suite', true);

  insert into iam.organizations (name, slug, abbreviation)
  values ('Willow Creek Veterinary Clinic', 'willow-creek-vet-argsruled2-fork', 'WCV') returning id into v_clinic;
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
  values (v_clinic, 'organization', v_clinic, c_tech, 'owner', 'active');
  insert into iam.organizations (name, slug, abbreviation)
  values ('High Desert Equine Services', 'high-desert-equine-argsruled2-fork', 'HDE') returning id into v_equine;
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

  -- ══ 1 + 2 · private and invented answer alike, for all three doors ══
  for r in select * from (values
      ('fork_shared_conversation', v_priv_conv),
      ('fork_shared_flashcard_set', v_priv_set),
      ('fork_shared_quiz',          v_priv_quiz)) t(fn, private_id)
  loop
    execute format('select public.%I($1, $2, null)', r.fn) into v_real using r.private_id, v_clinic;
    execute format('select public.%I($1, $2, null)', r.fn) into v_inv  using gen_random_uuid(), v_clinic;
    execute format('select public.%I($1, $2, null)', r.fn) into v_null using null::uuid, v_clinic;
    if v_real is distinct from v_inv or v_inv is distinct from v_null then
      raise exception '1: % is an EXISTENCE ORACLE — a real private id answers %, an invented one %, a null one %',
        r.fn, v_real, v_inv, v_null;
    end if;
    if (v_real ->> 'success')::boolean is not false or v_real ->> 'code' is distinct from 'not_available' then
      raise exception '1: % refused with the wrong shape: %', r.fn, v_real;
    end if;
    if v_real::text like '%' || r.private_id::text || '%'
       or exists (select 1 from jsonb_object_keys(v_real) k where k not in ('success', 'error', 'code')) then
      raise exception '2: % refusal carries more than the sentence: %', r.fn, v_real;
    end if;
  end loop;

  -- ══ 3 · the control: the published set still copies into Willow Creek ══
  v_res := public.fork_shared_flashcard_set(v_pub_set, v_clinic);
  if (v_res ->> 'success')::boolean is not true then
    raise exception '3: the tech could not copy High Desert''s published dental set: %', v_res;
  end if;
  select organization_id into v_copy_org from education.fc_set where id = (v_res ->> 'set_id')::uuid;
  if v_copy_org is distinct from v_clinic then
    raise exception '3: the copy landed in % — the tech asked for Willow Creek (%)', v_copy_org, v_clinic;
  end if;

  -- ══ 4 · the organization wall still names itself ══
  v_res := public.fork_shared_flashcard_set(v_pub_set, v_equine);
  if v_res ->> 'error' not like '%not a member%' then
    raise exception '4: copying into an organization she is not in was not refused by name: %', v_res;
  end if;

  perform set_config('role', v_boss, true);
  raise notice 'argsruled2_fork_green: 4 clauses passed on 3 doors — a private id, an invented id and a null id answer byte-identically; the published set still copies';
end $$;

rollback;
