-- scripts/campaign-tests/doorsgreen_green.sql — lane DOORS-GREEN, from the seat.
--
-- THE USE CASE, named before a single value is typed (OWNER LAW 2026-09-21).
-- Greenline Landscaping Crew: a landscape maintenance and install crew that tracks
-- recurring client properties, crew members, equipment and scheduled jobs with pricing so
-- the owner can route trucks and bill accurately. The template is the shared one,
-- `scripts/campaign-tests/use-cases/greenline-landscaping-crew.json`, and this suite uses
-- its `jobs` Table verbatim — `job_number`, `client`, `crew_lead`, `service_type`,
-- `scheduled_date`, `status`, `price` — with its own job rows. THE REAL ACT: Marisol, who
-- owns Greenline, wants a capture sheet her crew fills on a phone at the property —
-- what was done on this job, and a photo — so the truck's work lands on the job row
-- without anyone going back to the office. Declaring that sheet is `custom.capture_sheet_declare`.
--
-- WHAT IT PROVES, and it is one door:
--   PART 0  the seat is `authenticated` and cannot read custom.record directly
--   PART 1  Greenline's Jobs table and its real rows, built through the doors
--   PART 2  THE DEFECT — Dev, who owns Rincon Plumbing and holds nothing in Greenline,
--           probes a sheet id and learns whether it is a published form. Red before the fix.
--   PART 3  a crew member shared Jobs at VIEWER is refused, by a sentence
--   PART 4  a crew member shared Jobs at EDITOR is refused too — declaring a sheet is a
--           structural act on the Table, the same admin rung `custom.form_declare` and
--           `custom.field_declare` ask, and this door now asks it in its own body
--   PART 5  Marisol, who holds admin, declares the sheet and it works
--
-- Ends in ROLLBACK and leaves nothing.

\set ON_ERROR_STOP on
begin;
set local lock_timeout = '10s';
set local statement_timeout = '60s';

do $suite$
declare
  -- admin@admin.com is Marisol, who owns Greenline. test@test.com is Dev Okonkwo, a crew
  -- lead Marisol hires mid-suite; until PART 3 he holds nothing in Greenline at all.
  c_marisol   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_dev       constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  c_marisol_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_dev_j     constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_org       uuid := gen_random_uuid();
  v_other     uuid := gen_random_uuid();
  v_yard      uuid;
  v_jobs      uuid;
  v_sheet     uuid;
  v_probe     uuid;
  v_txt       text;
  v_hint      text;
  v_leaked    boolean;
  v_fired     boolean;
  v_row       record;
begin
  -- ── fixtures, as the connected role (a seat is a PERSON; these make one) ───────
  insert into iam.organizations (id, name, slug, created_by)
  values (v_org, 'Greenline Landscaping Crew ' || left(v_org::text, 8),
          'greenline-landscaping-' || left(v_org::text, 8), c_marisol),
         (v_other, 'Rincon Plumbing Co ' || left(v_other::text, 8),
          'rincon-plumbing-' || left(v_other::text, 8), c_dev);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status, created_by)
  -- Dev is NOT a member of Greenline yet. He owns Rincon Plumbing, a different company
  -- entirely, and that is what makes PART 2 a real stranger probe. Marisol hires him into
  -- the crew between PART 2 and PART 3.
  values (v_org,   'organization', v_org,   c_marisol, 'owner', 'active', c_marisol),
         (v_other, 'organization', v_other, c_dev,     'owner', 'active', c_dev);
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note, updated_by)
  values ('custom', 'system_enabled', 'organization', v_org,   v_org,   'true'::jsonb, 'doorsgreen_green.sql', c_marisol),
         ('custom', 'system_enabled', 'organization', v_other, v_other, 'true'::jsonb, 'doorsgreen_green.sql', c_dev);

  perform set_config('app.actor_system', 'campaign-test/doorsgreen_green.sql', true);
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

  -- ══ PART 1 — GREENLINE'S JOBS TABLE, THE SHARED TEMPLATE'S OWN SHAPE ══════════
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
  raise notice 'PART 1 PASSED — Greenline Jobs carries job_number/client/crew_lead/service_type/scheduled_date/status/price and three routed jobs';

  -- ══ PART 2 — THE DEFECT: A STRANGER MAY NOT PROBE GREENLINE'S FORMS ═══════════
  -- Marisol makes a PUBLIC form on Jobs (the quote-request page on Greenline's website).
  -- Dev owns a different company entirely and holds nothing in Greenline. Before the fix,
  -- custom.capture_sheet_declare read custom.anon_form as the DEFINER before it delegated,
  -- so passing that form's id back told Dev, in two distinguishable answers, that it is a
  -- published form in someone else's organization. That is the whole red.
  v_probe := custom.form_declare(v_org, v_jobs, 'Request a quote',
               jsonb_build_array(jsonb_build_object('field', 'client', 'ask', 'Your name', 'required', true)));
  perform custom.anon_publish(v_org, v_probe);

  perform set_config('request.jwt.claims', c_dev_j, true);
  v_leaked := false;
  begin
    perform custom.capture_sheet_declare(v_org, v_jobs, 'Crew sheet',
              jsonb_build_array(jsonb_build_object('field', 'status', 'ask', 'What is the status?')),
              '{}'::jsonb, v_probe);
    raise exception '2: a stranger DECLARED a capture sheet in Greenline';
  exception
    when sqlstate '23514' then
      -- the published-form sentence: he learned the id is a live public form here.
      v_leaked := true;
      get stacked diagnostics v_txt = message_text;
    when insufficient_privilege then
      get stacked diagnostics v_txt = message_text;
  end;
  if v_leaked then
    raise exception '2: THE DEFECT — a person who belongs to no part of Greenline was told "%", which is Greenline''s business, not his', v_txt;
  end if;
  raise notice 'PART 2 PASSED — the stranger is refused at the wall, not told about the form: "%"', v_txt;

  -- ══ PART 3 — A CREW MEMBER AT VIEWER IS REFUSED, IN WORDS ═════════════════════
  -- Marisol hires Dev onto the crew and shares Jobs with him at viewer.
  perform set_config('request.jwt.claims', c_marisol_j, true);
  perform set_config('role', 'postgres', true);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status, created_by)
  values (v_org, 'organization', v_org, c_dev, 'member', 'active', c_marisol);
  perform set_config('role', 'authenticated', true);
  perform custom.share_grant(v_org, v_jobs, 'person', c_dev, 'viewer'::public.permission_level);
  perform set_config('request.jwt.claims', c_dev_j, true);
  v_fired := false;
  begin
    perform custom.capture_sheet_declare(v_org, v_jobs, 'Crew sheet — what got done',
              jsonb_build_array(jsonb_build_object('field', 'status', 'ask', 'What is the status now?', 'required', true)));
  exception when insufficient_privilege then
    v_fired := true; get stacked diagnostics v_txt = message_text;
  end;
  if not v_fired then
    raise exception '3: a crew member shared Jobs at viewer declared a capture sheet';
  end if;
  raise notice 'PART 3 PASSED — viewer refused: "%"', v_txt;

  -- ══ PART 4 — AND AT EDITOR TOO: DECLARING A SHEET IS A STRUCTURAL ACT ═════════
  -- Editor is the rung that lets Dev FILL the sheet. Deciding what the sheet asks for
  -- changes what the whole crew may write into Jobs, so it is admin — the same rung
  -- custom.form_declare and custom.field_declare ask. Asking less here and more at publish
  -- would let a crew lead assemble the sheet and only check who opens it.
  perform set_config('request.jwt.claims', c_marisol_j, true);
  perform custom.share_grant(v_org, v_jobs, 'person', c_dev, 'editor'::public.permission_level);
  perform set_config('request.jwt.claims', c_dev_j, true);
  v_fired := false;
  begin
    perform custom.capture_sheet_declare(v_org, v_jobs, 'Crew sheet — what got done',
              jsonb_build_array(jsonb_build_object('field', 'status', 'ask', 'What is the status now?', 'required', true)));
  exception when insufficient_privilege then
    v_fired := true;
    get stacked diagnostics v_txt = message_text, v_hint = pg_exception_hint;
  end;
  if not v_fired then
    raise exception '4: a crew lead at editor declared a capture sheet, which is an admin act on the Table';
  end if;
  -- The ladder names the rung he is missing, and it has to be `admin` — the same rung
  -- custom.form_declare asks one line later. If this ever reads `editor`, the door has
  -- drifted below its siblings and a crew lead can rewrite what the whole crew captures.
  if v_hint not like '%needs the admin level%' then
    raise exception '4: the crew lead is not told he needs admin: "%"', v_hint;
  end if;
  raise notice 'PART 4 PASSED — editor refused: "%" / "%"', v_txt, v_hint;

  -- ══ PART 5 — MARISOL, WHO HOLDS ADMIN, DECLARES THE SHEET AND IT WORKS ════════
  perform set_config('request.jwt.claims', c_marisol_j, true);
  v_sheet := custom.capture_sheet_declare(v_org, v_jobs, 'Crew sheet — what got done',
               jsonb_build_array(
                 jsonb_build_object('field', 'status',       'ask', 'What is the status now?', 'required', true),
                 jsonb_build_object('field', 'service_type', 'ask', 'What did you actually do?')));
  if v_sheet is null then
    raise exception '5: the owner declared a capture sheet and got nothing back';
  end if;
  select state, may_capture into v_row from custom.capture_open(v_org, v_sheet);
  if v_row.state is null then
    raise exception '5: the sheet Marisol just declared cannot be opened';
  end if;
  if v_row.may_capture then
    raise exception '5: a sheet nobody opened says the crew may capture';
  end if;
  raise notice 'PART 5 PASSED — the sheet exists, closed until it is opened (state "%")', v_row.state;

  raise notice '=== ALL PARTS PASSED ===';
end;
$suite$;

rollback;
