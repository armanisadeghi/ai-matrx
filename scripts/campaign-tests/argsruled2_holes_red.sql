-- ARGS-RULED-2 — RED TWIN of argsruled2_holes_green.sql.
--
-- Inside ONE rolled-back transaction it runs the two INVERSE files (the pre-fix bodies of
-- public.cat_write and custom.hub_changed_by), builds the same Willow Creek Veterinary Clinic /
-- High Desert Equine Services world, takes the same vet tech's seat, and REQUIRES both holes
-- to come back: a stranger's real category answers 42501 while an invented uuid answers NULL,
-- and the hub describes the DEA log the tech may not open. If either does not reappear, the
-- green suite could not have failed and this twin says so. Ends in ROLLBACK.

\set suite 'argsruled2_holes_red.sql'
\set requires 'function:public.cat_write|function:custom.hub_changed_by|function:custom.read_record|relation:platform.categories|relation:custom.record|relation:platform.knob_override'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif
begin;
\i migrations/inverse/argsruled2_a_stranger_cannot_learn_a_category_exists_down.sql
\i migrations/inverse/argsruled2_the_hub_describes_only_what_you_may_open_down.sql

do $$
declare
  c_tech   uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com: a vet tech, plain member
  c_mgr    uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com: practice manager, owner
  v_boss   text := current_user;
  v_clinic uuid; v_equine uuid;
  v_dea    uuid; v_intake uuid;
  v_far_cat uuid; v_own_cat uuid; v_seen_cat uuid;
  v_foreign jsonb; v_invented jsonb; v_res jsonb; v_n int; v_state text; v_msg text;
begin
  perform set_config('app.actor_system', 'campaign.argsruled2_holes_red', true);

  -- ── THE FIXTURE, AS THE SERVER ──
  insert into iam.organizations (name, slug, abbreviation)
  values ('Willow Creek Veterinary Clinic', 'willow-creek-vet-argsruled2red', 'WCV') returning id into v_clinic;
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
  values (v_clinic, 'organization', v_clinic, c_mgr,  'owner',  'active'),
         (v_clinic, 'organization', v_clinic, c_tech, 'member', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value)
  values ('custom', 'member_default_visibility', 'organization', v_clinic, v_clinic, '"shared_only"'::jsonb);

  insert into iam.organizations (name, slug, abbreviation)
  values ('High Desert Equine Services', 'high-desert-equine-argsruled2red', 'HDE') returning id into v_equine;
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
  values (v_equine, 'organization', v_equine, c_mgr, 'owner', 'active');

  -- the practice manager's private DEA log, and the tech's own intake sheet
  insert into custom.record (organization_id, data_class, data, created_by, updated_by)
  values (v_clinic, 'table', jsonb_build_object('name', 'Controlled Substance Log (DEA Schedule II–V)'), c_mgr, c_mgr)
  returning id into v_dea;
  insert into custom.record (organization_id, data_class, data, created_by, updated_by)
  values (v_clinic, 'table', jsonb_build_object('name', 'Canine Dental Intake'), c_tech, c_tech)
  returning id into v_intake;

  insert into platform.categories (organization_id, dimension, name, slug, created_by, updated_by, visibility)
  values (v_equine, 'feedback', 'Lameness follow-up', 'lameness-follow-up-argsruled2red', c_mgr, c_mgr, 'internal')
  returning id into v_far_cat;
  -- a partner category published to everybody: the tech may SEE it, not change it
  insert into platform.categories (organization_id, dimension, name, slug, created_by, updated_by, visibility)
  values (v_equine, 'feedback', 'Referral received', 'referral-received-argsruled2red', c_mgr, c_mgr, 'public')
  returning id into v_seen_cat;
  insert into platform.categories (organization_id, dimension, name, slug, created_by, updated_by)
  values (v_clinic, 'feedback', 'Vaccination reminder', 'vaccination-reminder-argsruled2red', c_tech, c_tech)
  returning id into v_own_cat;

  -- ── 0 · TAKE THE SEAT AND PROVE IT ──
  perform set_config('request.jwt.claims', json_build_object('sub', c_tech::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' or auth.uid() <> c_tech then
    raise exception '0: the suite is not in the vet tech''s seat (current_user %, uid %)', current_user, auth.uid();
  end if;
  if iam.has_org_access(v_equine) then
    raise exception '0: the vet tech is a member of High Desert Equine, so no clause below could tell a stranger from a member';
  end if;
  if public.is_platform_admin() then
    raise exception '0: the seat is a platform admin — cat_write''s platform-admin arm would hide the hole this suite tests';
  end if;
  begin
    perform custom.read_record(v_clinic, v_dea);
    raise exception '0: the tech can open the DEA log through custom.read_record, so clause 2 would test nothing';
  exception when insufficient_privilege then null;
  end;

  -- ══ RED 1 · the OLD cat_write tells the stranger's real category from an invented id ══
  begin
    v_foreign := public.cat_write('feedback', v_far_cat, v_clinic, 'Renamed from the clinic');
    v_state := 'returned';
  exception when others then
    v_state := sqlstate; v_msg := sqlerrm;
  end;
  v_invented := public.cat_write('feedback', gen_random_uuid(), v_clinic, 'Renamed from the clinic');
  if v_state <> '42501' or v_invented is not null then
    raise exception 'RED 1: with the pre-fix body back, the oracle did NOT reappear (foreign %, invented %) — the green clause proves nothing', v_state, v_invented;
  end if;

  -- ══ RED 2 · the OLD hub describes the DEA log the tech may not open ══
  select count(*) into v_n from custom.hub_changed_by(v_clinic, 'structure', array[v_dea]);
  if v_n <> 1 then
    raise exception 'RED 2: with the pre-fix body back, the hub did NOT describe the private Table (% rows) — the green clause proves nothing', v_n;
  end if;

  perform set_config('role', v_boss, true);
  raise notice 'argsruled2_holes_red: both holes reappear on the pre-fix bodies (42501 vs NULL; 1 private row described) — the green suite can fail';
end $$;

rollback;
