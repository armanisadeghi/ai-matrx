-- LANE ROUTE-RESOLVER — ONE ADDRESS, /o/<id>, THAT OPENS ANY ID THE PLATFORM MINTS.
--
-- THE USE CASE (_gridprim_clinic.sql): Marisol Vega (test@test.com) runs the front desk at Cedar
-- Ridge Veterinary Clinic; Dr. Ana Whitfield (admin@admin.com) is the practice manager. Marisol's
-- links arrive from everywhere: her approval inbox (a visit record), her Monday digest (a
-- subscription rule), an agent's answer (the Appointments table, a dashboard, the intake form),
-- her own older "Boarding kennel log", and a share email from Bend Animal Emergency & Referral
-- Hospital — an organization she is NOT a member of — that gave her its Referrals table. Every
-- name here is synthesized.
--
-- WHAT MAKES IT FAIL:
--   A  a store Table, a record, a dashboard, a digest or a form that does not open on its own
--      screen, stamped with ITS organization
--   B  the hospital's shared table opening as anything but the hospital's (the active
--      organization deciding) — or not opening at all because she is not a member
--   C  an older dataset that does not open the older screen, or a moved table (same id, older
--      copy archived) that does not open the new one; ?side= answering a side that is not there
--   D  a stranger, or Marisol on Ana's personal log, learning ANYTHING — the answer for "not
--      yours" must be byte-identical to the answer for an id that was never minted
--   E  a signed-out caller answered; a side word that is neither new nor old accepted
-- RED before openbyid_one_address_opens_any_id.sql (the door does not exist), GREEN after.

\set ON_ERROR_STOP on
\timing off
\set suite 'openbyid_green.sql'
\set requires 'function:custom.table_declare|function:custom.dashboard_declare|function:custom.subscription_declare|relation:custom.anon_form'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local lock_timeout = '10s';
set local statement_timeout = '180s';
\i scripts/campaign-tests/_gridprim_clinic.sql

do $t$
declare
  c_admin      constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_dana       constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  c_admin_j    constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_dana_j     constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  c_stranger_j constant text := '{"sub":"000eaa28-cf5d-402a-8f01-5e2c24191323","role":"authenticated"}';
  v_org uuid; v_appts uuid; v_home uuid; v_r3 uuid;
  v_kennel uuid; v_drugs uuid; v_moved uuid; v_form uuid; v_dash uuid; v_view uuid; v_digest uuid;
  v_er uuid; v_er_home uuid; v_referrals uuid;
  v_a jsonb; v_b jsonb; v_never jsonb;
  v_msg text;
begin
  if to_regprocedure('platform.resolve_id(uuid,text)') is null then
    raise exception 'RED: platform.resolve_id(uuid, text) does not exist — there is no one door an id can be opened through, so every producer of a link still has to guess the screen and the organization';
  end if;

  select v into v_org from gp where k = 'org'; select v into v_appts from gp where k = 'appts';
  select v into v_home from gp where k = 'home'; select v into v_r3 from gp where k = 'r3';

  -- ── FIXTURE, as the store's owner (asserts nothing) ─────────────────────────────────────────
  perform set_config('request.jwt.claims', c_dana_j, true);
  insert into workbench.udt_datasets (table_name, description, user_id, organization_id, created_by, visibility)
  values ('Boarding kennel log', 'Who is boarding, which run, feeding notes', c_dana, v_org, c_dana, 'personal')
  returning id into v_kennel;
  perform set_config('request.jwt.claims', c_admin_j, true);
  insert into workbench.udt_datasets (table_name, description, user_id, organization_id, created_by, visibility)
  values ('Controlled substances log', 'DEA schedule II–V dispensing, Dr. Whitfield only', c_admin, v_org, c_admin, 'personal')
  returning id into v_drugs;

  -- Marisol's vaccine-reminder list was MOVED last night: the store Table and her archived older copy
  -- share one id, exactly as the mover leaves them.
  v_moved := custom.table_declare(v_org, jsonb_build_object(
    'name', 'Vaccine reminders', 'slug', 'vaccine_reminders', 'type', 'entity',
    'label_singular', 'Reminder', 'label_plural', 'Vaccine reminders',
    'title_field', 'patient', 'display', 'list', 'weight', 'light',
    'ordered', true, 'row_order', 'sorted', 'agent_writable', true, 'retention_days', 3650,
    'default_sort', jsonb_build_array(jsonb_build_object('field', 'patient', 'direction', 'asc')),
    'parent_id', v_home::text,
    'fields', jsonb_build_array(jsonb_build_object('name', 'patient'))));
  insert into workbench.udt_datasets (id, table_name, description, user_id, organization_id, created_by, visibility, deleted_at)
  values (v_moved, 'Vaccine reminders', 'Moved to the record store', c_dana, v_org, c_dana, 'personal', now());

  insert into custom.anon_form (organization_id, table_id, slug, title, exposed_field_keys, required_field_keys,
                                rate_limit_per_window, rate_limit_window)
  values (v_org, v_appts, 'new-patient-intake', 'New patient intake',
          '["patient","species","owner_phone"]'::jsonb, '["patient"]'::jsonb, 20, interval '1 hour')
  returning id into v_form;

  v_dash := custom.dashboard_declare(v_org, v_appts, 'Tuesday day sheet',
    jsonb_build_array(jsonb_build_object('title', 'Visits', 'kind', 'number', 'span', 3)),
    jsonb_build_object('question', 'How many visits today?'));

  perform set_config('request.jwt.claims', c_dana_j, true);
  v_view := custom.view_declare(v_org, v_appts,
              jsonb_build_object('name', 'No-shows', 'filters', jsonb_build_object('visit_status', 'No-show')));
  v_digest := custom.subscription_declare(v_org, v_appts, jsonb_build_object(
      'name', 'Monday no-show summary', 'saved_view_id', v_view, 'cadence', 'weekly',
      'schedule', 'monday 08:00', 'channel', 'in_app'));

  -- The emergency hospital across town: Ana owns it, Marisol is NOT a member, and it shares its
  -- Referrals table with her (the grant is the admission — custom.portal_admits arm 2).
  perform set_config('request.jwt.claims', c_admin_j, true);
  v_er := gen_random_uuid();
  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_er, 'Bend Animal Emergency & Referral ' || substr(v_er::text, 1, 8),
          'bend-animal-er-' || substr(v_er::text, 1, 8), 'BAE', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
  values (v_er, 'organization', v_er, c_admin, 'owner', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note) values
    ('custom', 'system_enabled',             'organization', v_er, v_er, 'true'::jsonb, 'openbyid fixture'),
    ('custom', 'external_principal_enabled', 'organization', v_er, v_er, 'true'::jsonb, 'openbyid fixture: the hospital shares with referring clinics');
  insert into custom.record (organization_id, table_id, data)
  values (v_er, null, jsonb_build_object('name', 'Home')) returning id into v_er_home;
  v_referrals := custom.table_declare(v_er, jsonb_build_object(
    'name', 'Referrals', 'slug', 'referrals', 'type', 'entity',
    'label_singular', 'Referral', 'label_plural', 'Referrals',
    'title_field', 'patient', 'display', 'list', 'weight', 'light',
    'ordered', true, 'row_order', 'sorted', 'agent_writable', true, 'retention_days', 3650,
    'default_sort', jsonb_build_array(jsonb_build_object('field', 'patient', 'direction', 'asc')),
    'parent_id', v_er_home::text,
    'fields', jsonb_build_array(jsonb_build_object('name', 'patient'))));
  insert into iam.permissions (resource_type, resource_id, granted_to_user_id, permission_level, status, created_by)
  values ('record', v_referrals, c_dana, 'viewer', 'active', c_admin);

  -- ── THE SEAT ─────────────────────────────────────────────────────────────────────────────
  perform set_config('role', 'authenticated', true);
  if current_user is distinct from 'authenticated' then raise exception '0: not seated'; end if;

  -- ══ A — the record store's own objects, each on its own screen, in ITS organization ══════
  perform set_config('request.jwt.claims', c_dana_j, true);
  v_a := platform.resolve_id(v_appts);
  if v_a ->> 'state' <> 'opens' or v_a ->> 'kind' <> 'table'
     or v_a ->> 'path' <> '/data-v2/' || v_appts || '?org=' || v_org then
    raise exception 'A1: Appointments did not open on /data-v2 in the clinic: %', v_a;
  end if;
  v_a := platform.resolve_id(v_r3);
  if v_a ->> 'kind' <> 'record' or v_a ->> 'path' <> '/data-v2/' || v_appts || '?record=' || v_r3 || '&org=' || v_org then
    raise exception 'A2: Moose''s visit did not open inside Appointments: %', v_a;
  end if;
  v_a := platform.resolve_id(v_dash);
  if v_a ->> 'kind' <> 'dashboard' or v_a ->> 'path' <> '/data-v2/' || v_appts || '?dashboard=' || v_dash || '&org=' || v_org then
    raise exception 'A3: the day-sheet dashboard did not open on its table: %', v_a;
  end if;
  v_a := platform.resolve_id(v_digest);
  if v_a ->> 'kind' <> 'digest' or v_a ->> 'path' <> '/data-v2/' || v_appts || '?rail=notifications&item=' || v_digest || '&org=' || v_org then
    raise exception 'A4: the Monday no-show digest did not open in the notifications rail: %', v_a;
  end if;
  v_a := platform.resolve_id(v_form);
  if v_a ->> 'kind' <> 'form' or v_a ->> 'path' <> '/data-v2/' || v_appts || '?rail=forms&item=' || v_form || '&org=' || v_org then
    raise exception 'A5: the intake form did not open in the forms rail: %', v_a;
  end if;
  raise notice 'A PASS — Appointments, Moose''s visit, the day-sheet dashboard, the no-show digest and the intake form each open on their own screen, stamped with the clinic';

  -- ══ B — the hospital's shared table opens as the HOSPITAL's, for a non-member ═══════════════
  v_a := platform.resolve_id(v_referrals);
  if v_a ->> 'state' <> 'opens' or (v_a ->> 'organization_id')::uuid is distinct from v_er
     or v_a ->> 'path' <> '/data-v2/' || v_referrals || '?org=' || v_er then
    raise exception 'B1: the hospital''s Referrals did not open as the hospital''s for Marisol: %', v_a;
  end if;
  raise notice 'B PASS — Bend Animal Emergency''s Referrals, shared with Marisol, opens in the hospital (she is not a member and nothing asked which organization she had selected)';

  -- ══ C — two sides of a table, no redirect between systems ══════════════════════════════════
  v_a := platform.resolve_id(v_kennel);
  if v_a ->> 'kind' <> 'older_table' or v_a ->> 'path' <> '/data/' || v_kennel || '?org=' || v_org
     or v_a -> 'sides' <> '{"old": true, "new": false}'::jsonb then
    raise exception 'C1: her older kennel log did not open the older screen: %', v_a;
  end if;
  v_a := platform.resolve_id(v_moved);
  if v_a ->> 'kind' <> 'table' or v_a ->> 'path' <> '/data-v2/' || v_moved || '?org=' || v_org
     or v_a -> 'sides' <> '{"old": true, "new": true}'::jsonb then
    raise exception 'C2: the moved vaccine list did not open its live, new side: %', v_a;
  end if;
  v_a := platform.resolve_id(v_moved, 'old');
  if v_a ->> 'state' <> 'opens' or v_a ->> 'path' <> '/data/' || v_moved || '?org=' || v_org then
    raise exception 'C3: side=old did not open the archived older copy to compare: %', v_a;
  end if;
  v_a := platform.resolve_id(v_kennel, 'new');
  if v_a ->> 'state' <> 'no_such_side' or v_a -> 'sides' <> '{"old": true, "new": false}'::jsonb then
    raise exception 'C4: side=new on a table with no new side was not refused in words: %', v_a;
  end if;
  v_a := platform.resolve_id(v_appts, 'OLD');
  if v_a ->> 'state' <> 'no_such_side' then
    raise exception 'C5: side=old on a store-born table was not refused in words: %', v_a;
  end if;
  raise notice 'C PASS — the kennel log opens /data, the moved vaccine list opens /data-v2 and side=old opens its archived copy; a side that is not there says so';

  -- ══ D — nothing leaks ═════════════════════════════════════════════════════════════════════
  v_never := platform.resolve_id(gen_random_uuid());
  if v_never ->> 'state' <> 'not_yours' then raise exception 'D0: an id nobody minted: %', v_never; end if;
  v_a := platform.resolve_id(v_drugs);
  if v_a is distinct from v_never then
    raise exception 'D1: Marisol learned something about Dr. Whitfield''s personal controlled-substances log: %', v_a;
  end if;
  perform set_config('request.jwt.claims', c_admin_j, true);
  v_b := platform.resolve_id(v_drugs);
  if v_b ->> 'kind' <> 'older_table' then raise exception 'D2: Dr. Whitfield cannot open her own log: %', v_b; end if;
  perform set_config('request.jwt.claims', c_stranger_j, true);
  foreach v_msg in array array[v_appts, v_r3, v_dash, v_digest, v_form, v_kennel, v_moved, v_referrals]::text[] loop
    v_a := platform.resolve_id(v_msg::uuid);
    if v_a is distinct from v_never then
      raise exception 'D3: a stranger learned something about %: %', v_msg, v_a;
    end if;
  end loop;
  begin
    v_a := platform.resolve_id(v_appts, 'new');
    if v_a is distinct from v_never then raise exception 'D4: a stranger''s side=new said %', v_a; end if;
  end;
  raise notice 'D PASS — for a stranger, and for Marisol on Dr. Whitfield''s personal log, every answer is byte-identical to the answer for an id nobody ever minted';

  -- ══ E — signed out, and a side word nobody knows ══════════════════════════════════════════
  perform set_config('request.jwt.claims', '', true);
  v_a := platform.resolve_id(v_appts);
  if v_a is distinct from v_never then raise exception 'E1: a signed-out caller was answered: %', v_a; end if;
  perform set_config('request.jwt.claims', c_dana_j, true);
  begin
    perform platform.resolve_id(v_appts, 'sideways');
    raise exception 'E2: side=sideways was accepted';
  exception when invalid_parameter_value then
    get stacked diagnostics v_msg = message_text;
    raise notice 'E PASS — signed out gets the not-yours sentence; side=sideways is refused: %', v_msg;
  end;

  raise notice 'OPENBYID GREEN — every part passed.';
end $t$;
rollback;
