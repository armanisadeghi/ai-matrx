-- ARGS-RULED-2 — TWO ACCESS HOLES THE PER-ARGUMENT READING FOUND, CLOSED, FROM A MEMBER'S SEAT.
--
-- THE USE CASE THIS SUITE NAMES (no fake test data): Willow Creek Veterinary Clinic, a
-- three-vet small-animal practice in Bend, Oregon. Its practice manager keeps the
-- controlled-substance log as a Table only she and the medical director are shared on, and the
-- clinic's data store is set to "members see only what is shared with them" because a
-- veterinary technician must not browse the DEA log. High Desert Equine Services, a
-- large-animal referral partner across town, is a separate tenant: it tags its own feedback
-- with a "Lameness follow-up" category the clinic's staff must never learn exists.
--
-- THE SEAT: `authenticated` carrying test@test.com — a plain MEMBER of Willow Creek and NOT a
-- platform admin. (admin@admin.com is a platform admin; `cat_write`'s platform-admin arm lets
-- that seat through, so the category hole is invisible from it. Measured, 2026-09-22.)
-- The practice manager is admin@admin.com, the organization's owner.
--
-- 1 · public.cat_write, UPDATE arm: another organization's real category and an invented uuid
--     must answer IDENTICALLY (both NULL). Before: 42501 "not yours to change" vs NULL.
-- 2 · custom.hub_changed_by, structure arm: a Table the member may not open (custom.read_record
--     refuses her) is not described — no timestamp, no editor's name. Before: 1 row.
-- 3 · the controls: the member still gets her OWN structure described, a category she may see
--     but not edit is still refused by name, and her own category still updates.
--
-- RED TWIN: argsruled2_holes_red.sql puts the pre-fix bodies back inside its own rolled-back
-- transaction and requires both holes to reappear. Ends in ROLLBACK; leaves nothing behind.

\set suite 'argsruled2_holes_green.sql'
\set requires 'function:public.cat_write|function:custom.hub_changed_by|function:custom.read_record|relation:platform.categories|relation:custom.record|relation:platform.knob_override'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif
begin;

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
  perform set_config('app.actor_system', 'campaign.argsruled2_holes_suite', true);

  -- ── THE FIXTURE, AS THE SERVER ──
  insert into iam.organizations (name, slug, abbreviation)
  values ('Willow Creek Veterinary Clinic', 'willow-creek-vet-argsruled2', 'WCV') returning id into v_clinic;
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
  values (v_clinic, 'organization', v_clinic, c_mgr,  'owner',  'active'),
         (v_clinic, 'organization', v_clinic, c_tech, 'member', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value)
  values ('custom', 'member_default_visibility', 'organization', v_clinic, v_clinic, '"shared_only"'::jsonb);

  insert into iam.organizations (name, slug, abbreviation)
  values ('High Desert Equine Services', 'high-desert-equine-argsruled2', 'HDE') returning id into v_equine;
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
  values (v_equine, 'feedback', 'Lameness follow-up', 'lameness-follow-up-argsruled2', c_mgr, c_mgr, 'internal')
  returning id into v_far_cat;
  -- a partner category published to everybody: the tech may SEE it, not change it
  insert into platform.categories (organization_id, dimension, name, slug, created_by, updated_by, visibility)
  values (v_equine, 'feedback', 'Referral received', 'referral-received-argsruled2', c_mgr, c_mgr, 'public')
  returning id into v_seen_cat;
  insert into platform.categories (organization_id, dimension, name, slug, created_by, updated_by)
  values (v_clinic, 'feedback', 'Vaccination reminder', 'vaccination-reminder-argsruled2', c_tech, c_tech)
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

  -- ══ 1 · A STRANGER'S CATEGORY AND AN INVENTED ID ANSWER ALIKE ══════════════════════════
  begin
    v_foreign := public.cat_write('feedback', v_far_cat, v_clinic, 'Renamed from the clinic');
    v_state := 'returned';
  exception when others then
    v_state := sqlstate; v_msg := sqlerrm;
  end;
  v_invented := public.cat_write('feedback', gen_random_uuid(), v_clinic, 'Renamed from the clinic');
  if v_state <> 'returned' or v_foreign is distinct from v_invented then
    raise exception '1: EXISTENCE ORACLE — High Desert Equine''s real category answered % % %, an invented uuid answered %',
      v_state, coalesce(v_msg, ''), coalesce(v_foreign::text, 'null'), coalesce(v_invented::text, 'null');
  end if;
  perform set_config('role', v_boss, true);
  if (select name from platform.categories where id = v_far_cat) <> 'Lameness follow-up' then
    raise exception '1: the stranger''s call CHANGED another organization''s category';
  end if;
  perform set_config('role', 'authenticated', true);

  -- ══ 2 · THE HUB DOES NOT DESCRIBE A TABLE THE MEMBER MAY NOT OPEN ════════════════════════
  select count(*) into v_n from custom.hub_changed_by(v_clinic, 'structure', array[v_dea]);
  if v_n <> 0 then
    raise exception '2: custom.hub_changed_by told the vet tech when the DEA log last changed and who changed it (% row) — custom.read_record refuses her that Table', v_n;
  end if;

  -- ══ 3 · THE CONTROLS ═════════════════════════════════════════════════════════════════════
  select count(*) into v_n from custom.hub_changed_by(v_clinic, 'structure', array[v_intake]);
  if v_n <> 1 then
    raise exception '3a: the tech''s OWN intake Table is no longer described by the hub (% rows)', v_n;
  end if;
  begin
    perform public.cat_write('feedback', v_seen_cat, v_clinic, 'Renamed from the clinic');
    raise exception '3b: a published partner category the tech may SEE was changed by her';
  exception when insufficient_privilege then
    if sqlerrm not like '%not yours to change%' then
      raise exception '3b: a category she may see was refused with the wrong sentence: %', sqlerrm;
    end if;
  end;
  v_res := public.cat_write('feedback', v_own_cat, v_clinic, 'Vaccination reminder (60-day)');
  if v_res ->> 'name' is distinct from 'Vaccination reminder (60-day)' then
    raise exception '3c: the tech could not rename her own clinic''s category: %', v_res;
  end if;

  perform set_config('role', v_boss, true);
  raise notice 'argsruled2_holes_green: 6 clauses passed — a stranger''s category answers as an invented id, and the hub describes only what the member may open';
end $$;

rollback;
