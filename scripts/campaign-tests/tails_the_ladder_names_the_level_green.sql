-- scripts/campaign-tests/tails_the_ladder_names_the_level_green.sql — lane TAILS, from the seat.
--
-- THE USE CASE, named before a value is typed (OWNER LAW 2026-09-21).
-- Greenline Landscaping Crew: a landscape maintenance and install crew that tracks client
-- properties, crew members, equipment and scheduled jobs with pricing so the owner can
-- route trucks and bill accurately. The shared template is
-- `scripts/campaign-tests/use-cases/greenline-landscaping-crew.json` and this suite uses
-- its `jobs` Table verbatim — job_number, client, crew_lead, service_type, scheduled_date,
-- status, price — with its own routed jobs.
--
-- THE REAL ACT. Marisol owns Greenline. Dev Okonkwo is her crew lead. He opens Jobs on his
-- phone every morning, he writes into it all day, and when he tries to add a column to it
-- the store told him:
--
--     "You do not have access to this table, so custom.field_declare may not write to it."
--
-- which is false, and he can see it is false, because the table is open in front of him.
-- The rung he was actually missing — admin — appeared only in the hint. This suite is
-- about the SENTENCE, at all three rungs, on the ONE shared refusal
-- (`custom.assert_client_may_change`) that every structural door in the store speaks with.
--
--   PART 0  the seat is `authenticated` and cannot read custom.record directly
--   PART 1  Greenline's Jobs table and its real rows, through the doors
--   PART 2  A STRANGER holds nothing, and is told he has no access — unchanged, still true
--   PART 3  VIEWER: "You hold the viewer level on this table, and custom.field_declare needs the admin level."
--   PART 4  EDITOR: "You hold the editor level on this table, …" — the rung he holds, named
--   PART 5  ADMIN: no refusal at all; Marisol declares the column and it lands
--
-- RED TWIN: `tails_the_ladder_names_the_level_red.sql` puts the pre-fix body back inside a
-- rolled-back transaction and proves PARTs 3 and 4 flip to the old sentence.
--
-- Ends in ROLLBACK and leaves nothing.

\set ON_ERROR_STOP on
begin;
set local lock_timeout = '30s';
set local statement_timeout = '600s';

do $suite$
declare
  c_marisol   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_dev       constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  c_marisol_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_dev_j     constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_org       uuid := gen_random_uuid();
  v_other     uuid := gen_random_uuid();
  v_yard      uuid;
  v_jobs      uuid;
  v_field     uuid;
  v_txt       text;
  v_hint      text;
  v_fired     boolean;
begin
  insert into iam.organizations (id, name, slug, created_by)
  values (v_org, 'Greenline Landscaping Crew ' || left(v_org::text, 8),
          'greenline-landscaping-' || left(v_org::text, 8), c_marisol),
         (v_other, 'Rincon Plumbing Co ' || left(v_other::text, 8),
          'rincon-plumbing-' || left(v_other::text, 8), c_dev);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status, created_by)
  values (v_org,   'organization', v_org,   c_marisol, 'owner', 'active', c_marisol),
         (v_other, 'organization', v_other, c_dev,     'owner', 'active', c_dev);
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note, updated_by)
  values ('custom', 'system_enabled', 'organization', v_org,   v_org,   'true'::jsonb, 'tails_ladder', c_marisol),
         ('custom', 'system_enabled', 'organization', v_other, v_other, 'true'::jsonb, 'tails_ladder', c_dev);

  perform set_config('app.actor_system', 'campaign-test/tails_the_ladder_names_the_level_green.sql', true);
  perform set_config('request.jwt.claims', c_marisol_j, true);

  -- ══ PART 0 — TAKE THE SEAT AND PROVE IT ═══════════════════════════════════════
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception '0: this suite did not take the seat — current_user is %', current_user;
  end if;
  begin
    perform 1 from custom.record limit 1;
    raise exception '0: this seat can SELECT custom.record directly, so it is not a client seat';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PART 0 PASSED — seated as %, which cannot read custom.record directly', current_user;

  -- ══ PART 1 — GREENLINE'S JOBS TABLE ═══════════════════════════════════════════
  v_yard := custom.record_write(v_org, custom.organization_kernel_id(),
              jsonb_build_object('name', 'Greenline Yard', 'description', 'the shop on Fescue Lane', '_actor', 'user'));
  v_jobs := custom.table_declare(v_org, jsonb_build_object(
      'name', 'Jobs', 'slug', 'jobs', 'description', 'one row per scheduled job, priced and routed',
      'type', 'entity', 'display', 'list', 'ordered', false, 'weight', 'light',
      'retention_days', 365, 'row_order', 'sorted',
      'default_sort', jsonb_build_array(jsonb_build_object('field', 'scheduled_date', 'direction', 'asc')),
      'agent_writable', true, 'label_singular', 'Job', 'label_plural', 'Jobs',
      'title_field', 'job_number',
      'fields', jsonb_build_array(jsonb_build_object('name', 'job_number')),
      'parent_id', v_yard));
  perform custom.field_declare(v_org, v_jobs, jsonb_build_object('label', 'Job Number',     'key', 'job_number',     'type', 'text', 'required', true));
  perform custom.field_declare(v_org, v_jobs, jsonb_build_object('label', 'Client',         'key', 'client',         'type', 'text'));
  perform custom.field_declare(v_org, v_jobs, jsonb_build_object('label', 'Crew Lead',      'key', 'crew_lead',      'type', 'text'));
  perform custom.field_declare(v_org, v_jobs, jsonb_build_object('label', 'Service Type',   'key', 'service_type',   'type', 'text'));
  perform custom.field_declare(v_org, v_jobs, jsonb_build_object('label', 'Scheduled Date', 'key', 'scheduled_date', 'type', 'datetime'));
  perform custom.field_declare(v_org, v_jobs, jsonb_build_object('label', 'Status',         'key', 'status',         'type', 'text'));
  perform custom.field_declare(v_org, v_jobs, jsonb_build_object('label', 'Price',          'key', 'price',          'type', 'currency'));
  perform custom.record_write(v_org, v_jobs, jsonb_build_object(
    'job_number', 'GL-1043', 'client', 'Angela Corwin', 'crew_lead', 'Dev Okonkwo',
    'service_type', 'Weekly Mow', 'scheduled_date', '2026-09-22', 'status', 'Scheduled', 'price', 85, '_actor', 'user'));
  perform custom.record_write(v_org, v_jobs, jsonb_build_object(
    'job_number', 'GL-1044', 'client', 'Thomas Ekwueme', 'crew_lead', 'Dev Okonkwo',
    'service_type', 'Hedge Trim', 'scheduled_date', '2026-09-22', 'status', 'Scheduled', 'price', 240, '_actor', 'user'));
  perform custom.record_write(v_org, v_jobs, jsonb_build_object(
    'job_number', 'GL-1045', 'client', 'Rachel Gable', 'crew_lead', 'Dev Okonkwo',
    'service_type', 'Mulch Install', 'scheduled_date', '2026-09-23', 'status', 'Quoted', 'price', 1120, '_actor', 'user'));
  raise notice 'PART 1 PASSED — Greenline Jobs carries its seven columns and three routed jobs';

  -- ══ PART 2 — A STRANGER HOLDS NOTHING, AND IS TOLD SO ═════════════════════════
  -- Dev owns Rincon Plumbing and is not in Greenline at all yet. "You do not have access
  -- to this table" is TRUE of him, and this part exists so the fix cannot quietly turn a
  -- true sentence into a different one.
  perform set_config('request.jwt.claims', c_dev_j, true);
  v_fired := false;
  begin
    perform custom.field_declare(v_org, v_jobs, jsonb_build_object('label', 'Gate Code', 'key', 'gate_code', 'type', 'text'));
  exception when others then
    v_fired := true; get stacked diagnostics v_txt = message_text;
  end;
  if not v_fired then
    raise exception '2: a person with nothing in Greenline added a column to Jobs';
  end if;
  raise notice 'PART 2 PASSED — the stranger is refused: "%"', v_txt;

  -- Marisol hires Dev onto the crew.
  perform set_config('request.jwt.claims', c_marisol_j, true);
  perform set_config('role', 'postgres', true);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status, created_by)
  values (v_org, 'organization', v_org, c_dev, 'member', 'active', c_marisol);
  perform set_config('role', 'authenticated', true);

  -- ══ PART 3 — VIEWER: THE SENTENCE NAMES THE RUNG HE HOLDS ═════════════════════
  perform custom.share_grant(v_org, v_jobs, 'person', c_dev, 'viewer'::public.permission_level);
  perform set_config('request.jwt.claims', c_dev_j, true);
  v_fired := false;
  begin
    perform custom.field_declare(v_org, v_jobs, jsonb_build_object('label', 'Gate Code', 'key', 'gate_code', 'type', 'text'));
  exception when insufficient_privilege then
    v_fired := true; get stacked diagnostics v_txt = message_text, v_hint = pg_exception_hint;
  end;
  if not v_fired then
    raise exception '3: a viewer of Jobs added a column to it';
  end if;
  if v_txt like '%do not have access to this table%' then
    raise exception '3: THE DEFECT — a viewer who can open this table is told he has no access to it: "%"', v_txt;
  end if;
  if v_txt not like '%You hold the viewer level on this table%' then
    raise exception '3: the refusal does not name the level he holds: "%"', v_txt;
  end if;
  if v_txt not like '%needs the admin level%' then
    raise exception '3: the refusal does not name the level it needs: "%"', v_txt;
  end if;
  raise notice 'PART 3 PASSED — viewer: "%"', v_txt;

  -- ══ PART 4 — EDITOR: THE SAME, ONE RUNG UP ════════════════════════════════════
  -- This is the exact person DOORS-GREEN named: he writes rows in this table all day and
  -- was told he has no access to it.
  perform set_config('request.jwt.claims', c_marisol_j, true);
  perform custom.share_grant(v_org, v_jobs, 'person', c_dev, 'editor'::public.permission_level);
  perform set_config('request.jwt.claims', c_dev_j, true);
  v_fired := false;
  begin
    perform custom.field_declare(v_org, v_jobs, jsonb_build_object('label', 'Gate Code', 'key', 'gate_code', 'type', 'text'));
  exception when insufficient_privilege then
    v_fired := true; get stacked diagnostics v_txt = message_text, v_hint = pg_exception_hint;
  end;
  if not v_fired then
    raise exception '4: an editor of Jobs added a column to it, which is an admin act';
  end if;
  if v_txt like '%do not have access to this table%' then
    raise exception '4: THE DEFECT — an editor who writes into this table daily is told he has no access to it: "%"', v_txt;
  end if;
  if v_txt not like '%You hold the editor level on this table%' then
    raise exception '4: the refusal does not name the level he holds: "%"', v_txt;
  end if;
  if v_txt not like '%needs the admin level%' then
    raise exception '4: the refusal does not name the level it needs: "%"', v_txt;
  end if;
  if v_hint not like '%viewer < commenter < editor < admin%' then
    raise exception '4: the hint no longer shows the ladder: "%"', v_hint;
  end if;
  raise notice 'PART 4 PASSED — editor: "%" / hint: "%"', v_txt, v_hint;

  -- ══ PART 5 — ADMIN: NO REFUSAL AT ALL ═════════════════════════════════════════
  perform set_config('request.jwt.claims', c_marisol_j, true);
  perform custom.share_grant(v_org, v_jobs, 'person', c_dev, 'admin'::public.permission_level);
  perform set_config('request.jwt.claims', c_dev_j, true);
  v_field := custom.field_declare(v_org, v_jobs, jsonb_build_object('label', 'Gate Code', 'key', 'gate_code', 'type', 'text'));
  if v_field is null then
    raise exception '5: an admin of Jobs declared a column and got nothing back';
  end if;
  raise notice 'PART 5 PASSED — at admin the same call lands, and the column exists';

  raise notice '=== ALL PARTS PASSED ===';
end;
$suite$;

rollback;
