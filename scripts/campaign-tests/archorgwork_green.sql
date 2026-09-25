-- LANE ARCHIVED-ORG-WORK — THE GREEN SUITE. Archiving an ORGANIZATION withdraws the work waiting in
-- it (approvals, assignments, signature requests) with the reason and the archiver, history kept,
-- and one archive event listing what it took; the inbox, the counts door and the reminders never
-- list it; restoring the organization brings back only what is still live. One transaction, ends
-- in ROLLBACK.
--
-- THE REAL USE CASE (owner law 2026-09-21, no fake test data):
--   Harborview Mobile Mechanic ran a second van, "Eastside", as its own organization. On Friday
--   2 October 2026 the owner (admin@admin.com) sells the Eastside van and archives that
--   organization. Still waiting on the lead technician (test@test.com): the owner's request to
--   raise the Tanaka brake job to the parts quote, her request to change the Ruiz alternator
--   job's labour hours, and a new "Tire pressure after service" column on Service jobs; two
--   follow-up calls assigned to the technician; and a repair authorization sent to a customer to
--   sign. Before this lane all of it stayed "waiting" in an organization nobody can open. In
--   November the owner reopens Eastside for the winter; the Ruiz job had been archived in the
--   meantime (the customer went elsewhere), so its approval and its follow-up call stay
--   withdrawn, and everything else comes back exactly as it was. Every business, vehicle,
--   person and date is synthesized; nobody in it is real.
--
-- RUN IT (clone):
--   psql "<clone DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/archorgwork_green.sql
--
-- ITS RED: before the migration it fails at PART 0 (the organization doors carry nothing); with PART 0 skipped
-- (`-v skip0=1`) it fails at 2a — the archived organization's inbox still lists the waiting asks.
--
-- THE SEATS. Every asserted door runs as `authenticated` with a person's own claims:
--   lead technician  test@test.com   (member; the table is shared to her; she approves; assigned)
--   owner            admin@admin.com (owner; builds, files, archives, restores)
-- Out of the seat (asserting nothing while out): the organization, memberships, knob and Home;
-- the signature request row (its own suite, esign_green, proves how one is made); archiving the
-- Ruiz job while the organization is archived (no member can reach it then); and the store-side
-- reads that check what the archive wrote.

\set ON_ERROR_STOP on
\timing off

\set suite 'archorgwork_green.sql'
\set requires 'grant:authenticated:custom.work_inbox|grant:authenticated:custom.inbox_counts|grant:authenticated:iam.organization_archive|grant:authenticated:iam.organization_restore'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif
\if :{?skip0}
\else
\set skip0 0
\endif

begin;
select set_config('archorgwork.skip0', :'skip0', true);

do $t$
declare
  c_admin    constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_tech     constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  c_admin_j  constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_tech_j   constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_org      uuid := gen_random_uuid();
  v_name     text;
  v_home     uuid;
  v_jobs     uuid;
  v_calls    uuid;
  v_tanaka   uuid;
  v_ruiz     uuid;
  v_a_tanaka uuid;
  v_a_ruiz   uuid;
  v_a_col    uuid;
  v_w_tanaka uuid;
  v_w_ruiz   uuid;
  v_sign     uuid := gen_random_uuid();
  v_all      uuid[];
  v_out      jsonb;
  v_ev       history.migration_log%rowtype;
  v_n        integer;
  v_d        jsonb;
  v_person   text;
begin
  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 0 — BOTH ORGANIZATION DOORS CALL THE TWO HALVES, AND NO CLIENT CAN CALL THEM.
  -- ════════════════════════════════════════════════════════════════════════════
  if current_setting('archorgwork.skip0') <> '1' then
    if (select prosrc from pg_proc where oid = 'iam.organization_archive(uuid, text, text)'::regprocedure) !~ 'custom\._organization_work_withdraw'
       or (select prosrc from pg_proc where oid = 'iam.organization_restore(uuid, text)'::regprocedure) !~ 'custom\._organization_work_return' then
      raise exception '0a: archiving an organization withdraws nothing — iam.organization_archive / organization_restore do not carry its work';
    end if;
    if to_regprocedure('custom._organization_work_withdraw(uuid, uuid)') is null
       or to_regprocedure('custom._organization_work_return(uuid, uuid)') is null then
      raise exception '0b: the archive half or the restore half is missing';
    end if;
    if has_function_privilege('authenticated', 'custom._organization_work_withdraw(uuid, uuid)', 'execute')
       or has_function_privilege('authenticated', 'custom._organization_work_return(uuid, uuid)', 'execute')
       or has_function_privilege('anon', 'custom._organization_work_withdraw(uuid, uuid)', 'execute') then
      raise exception '0c: a client can call the internal archive/restore halves';
    end if;
    raise notice 'PART 0 PASSED — both organization doors carry its work through two internal halves.';
  end if;

  -- ── the organization (out of the seat; asserts nothing) ──────────────────────
  perform set_config('app.actor_system', 'campaign-test/archorgwork_green', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  v_name := 'Harborview Mobile Mechanic Eastside ' || substr(v_org::text, 1, 8);
  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, v_name, 'harborview-east-' || substr(v_org::text, 1, 8), 'HME', c_admin);  -- matrx-real-data:allow HME is Harborview Mobile (mechanic) Eastside's own initials
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org, 'organization', v_org, c_admin, 'owner',  'active'),
    (v_org, 'organization', v_org, c_tech,  'member', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note) values
    ('custom','system_enabled','organization', v_org, v_org, 'true'::jsonb, 'archorgwork_green');
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name', 'Eastside van')) returning id into v_home;

  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception '0d: this suite did not take the seat — current_user is %', current_user;
  end if;

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 1 — FRIDAY MORNING: three asks, two call-backs, all waiting on the technician.
  -- ════════════════════════════════════════════════════════════════════════════
  v_jobs := custom.table_declare(v_org, jsonb_build_object(
    'name','Service jobs','slug','service_jobs_' || substr(v_org::text, 1, 8),'type','entity',
    'label_singular','Job','label_plural','Jobs','title_field','vehicle','display','page',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,'on_delete','cascade',
    'fields', jsonb_build_array(jsonb_build_object('name','vehicle'), jsonb_build_object('name','job'),
                                jsonb_build_object('name','quote'), jsonb_build_object('name','labour_hours')),
    'parent_id', v_home::text));
  perform custom.field_declare(v_org, v_jobs, jsonb_build_object('key','vehicle','label','Vehicle','plain','text','sort',10));
  perform custom.field_declare(v_org, v_jobs, jsonb_build_object('key','job','label','Job','plain','text','sort',20));
  perform custom.field_declare(v_org, v_jobs, jsonb_build_object('key','quote','label','Quote','plain','number','sort',30));
  perform custom.field_declare(v_org, v_jobs, jsonb_build_object('key','labour_hours','label','Labour hours','plain','number','sort',40));
  perform custom.share_grant(v_org, v_jobs, 'person', c_tech, 'editor'::public.permission_level);

  v_calls := custom.table_declare(v_org, jsonb_build_object(
    'name','Follow-up calls','slug','followups_' || substr(v_org::text, 1, 8),'type','entity',
    'label_singular','Call','label_plural','Calls','title_field','subject','display','page',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,'on_delete','cascade',
    'fields', jsonb_build_array(jsonb_build_object('name','subject')),
    'parent_id', v_home::text));
  perform custom.field_declare(v_org, v_calls, jsonb_build_object('key','subject','label','Subject','plain','text','sort',10));
  perform custom.share_grant(v_org, v_calls, 'person', c_tech, 'editor'::public.permission_level);
  perform custom.work_take_assignment(v_org, v_calls);   -- Assignee, Due date, Status

  v_tanaka := custom.record_write(v_org, v_jobs, jsonb_build_object(
    'vehicle','2017 Toyota Tacoma (Tanaka)','job','Front brake pads and rotors','quote',480,'labour_hours',2));
  v_ruiz := custom.record_write(v_org, v_jobs, jsonb_build_object(
    'vehicle','2012 Honda Civic (Ruiz)','job','Alternator replacement','quote',610,'labour_hours',3));
  v_a_tanaka := ((custom.work_approval_request(v_org, v_tanaka,
      jsonb_build_object('kind','record_patch','patch', jsonb_build_object('quote', 535)),
      'Parts house quote came in higher for the rotors', c_tech, 'person', null)) ->> 'approval_id')::uuid;
  v_a_ruiz := ((custom.work_approval_request(v_org, v_ruiz,
      jsonb_build_object('kind','record_patch','patch', jsonb_build_object('labour_hours', 4)),
      'Seized belt tensioner adds an hour', c_tech, 'person', null)) ->> 'approval_id')::uuid;
  v_a_col := ((custom.work_approval_request(v_org, v_jobs,
      jsonb_build_object('kind','field_add','field', jsonb_build_object('key','tire_pressure_after','label','Tire pressure after service','plain','text')),
      'Fleet customers want the tire pressures we leave them at', c_tech, 'person', null)) ->> 'approval_id')::uuid;
  v_w_tanaka := custom.record_write(v_org, v_calls, jsonb_build_object('subject','Tanaka: confirm Tuesday pickup at the jobsite'));
  perform custom.work_assign(v_org, v_w_tanaka, c_tech, now() + interval '3 days', false);
  v_w_ruiz := custom.record_write(v_org, v_calls, jsonb_build_object('subject','Ruiz: call back about the alternator core charge'));
  perform custom.work_assign(v_org, v_w_ruiz, c_tech, now() + interval '3 days', false);
  v_all := array[v_a_tanaka, v_a_ruiz, v_a_col, v_w_tanaka, v_w_ruiz];

  -- the repair authorization sent to Mr. Tanaka (out of the seat: esign_green proves the maker)
  perform set_config('role', 'postgres', true);
  insert into custom.record (organization_id, id, table_id, data_class, data)
  values (v_org, v_sign, null, 'sign_request', jsonb_build_object(
    'record_id', v_tanaka::text, 'table_id', v_jobs::text, 'field_key', 'customer_signature',
    'signer_name', 'Kenji Tanaka', 'signer_email', 'kenji.tanaka@harborview-customers.test',
    'document_title', 'Repair authorization: front brakes', 'sent_at', now(),
    'expires_at', now() + interval '14 days', 'token_hash', encode(sha256('archorgwork'::bytea), 'hex'),
    'bad_attempts', 0, 'reminder_count', 0));
  perform set_config('role', 'authenticated', true);

  perform set_config('request.jwt.claims', c_tech_j, true);
  select count(*) into v_n from custom.work_inbox(v_org, 200, 0, false) w where w.item_id = any(v_all);
  if v_n <> 5 then
    raise exception '1a: the technician should have all five waiting before the archive and has %', v_n;
  end if;
  select c.waiting into v_n from custom.inbox_counts(v_org) c;
  if v_n <> 5 then
    raise exception '1b: the counts door says % waiting for the technician, the inbox lists 5', v_n;
  end if;
  raise notice 'PART 1 PASSED — five waiting on the technician; the counts door agrees.';

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 2 — THE OWNER ARCHIVES EASTSIDE. Nothing in it is listed or counted any more.
  -- ════════════════════════════════════════════════════════════════════════════
  perform set_config('request.jwt.claims', c_admin_j, true);
  v_out := iam.organization_archive(v_org, v_name, 'Eastside van sold');
  if not coalesce((v_out ->> 'changed')::boolean, false) then
    raise exception '2-: the organization did not archive: %', v_out;
  end if;

  perform set_config('request.jwt.claims', c_tech_j, true);
  select count(*) into v_n from custom.work_inbox(v_org, 200, 0, false) w;
  if v_n <> 0 then
    raise exception '2a: % item(s) are still listed as waiting in an ARCHIVED organization — the technician could approve a change nobody can open', v_n;
  end if;
  select count(*) into v_n from custom.work_inbox(v_org, 200, 0, true) w;
  if v_n <> 0 then
    raise exception '2b: the archived organization''s inbox still lists % item(s) among the decided', v_n;
  end if;
  select coalesce(sum(c.waiting + c.snoozed), 0) into v_n from custom.inbox_counts(v_org) c;
  if v_n <> 0 then
    raise exception '2c: the counts door still counts % for an archived organization', v_n;
  end if;
  if exists (select 1 from custom.inbox_counts() c where c.organization_id = v_org) then
    raise exception '2d: the badge''s every-organization count lists the archived organization';
  end if;
  raise notice 'PART 2 PASSED — the archived organization lists and counts nothing for the technician.';

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 3 — WHAT THE ARCHIVE WROTE: withdrawn with the reason and the archiver, history kept,
  -- one event listing what it took. (store-side reads, out of the seat)
  -- ════════════════════════════════════════════════════════════════════════════
  perform set_config('role', 'postgres', true);
  for v_d in select r.data from custom.record r where r.organization_id = v_org and r.id in (v_a_tanaka, v_a_ruiz, v_a_col) loop
    if v_d ->> 'state' <> 'withdrawn' or v_d ->> 'withdrawn_by' <> c_admin::text
       or v_d ->> 'withdrawn_with' <> 'organization'
       or v_d ->> 'withdrawn_reason' not like v_name || ' was archived on %Reason given: Eastside van sold.'
       or nullif(v_d ->> 'decided_at', '') is null then
      raise exception '3a: an approval was not withdrawn with the reason and the archiver: %', v_d;
    end if;
  end loop;
  select count(*) into v_n from custom.record r
   where r.organization_id = v_org and r.id in (v_w_tanaka, v_w_ruiz) and nullif(r.data ->> 'assignee', '') is null;
  if v_n <> 2 then
    raise exception '3b: % of the two follow-up calls were unassigned', v_n;
  end if;
  select r.data into v_d from custom.record r where r.organization_id = v_org and r.id = v_sign;
  if custom.sign_request_state(v_d) <> 'invalidated' or v_d ->> 'invalidated_with' <> 'organization'
     or v_d ->> 'invalidation_reason' not like v_name || ' was archived on %' then
    raise exception '3c: the repair authorization still works after the organization was archived: %', v_d;
  end if;
  select * into v_ev from history.migration_log l
   where l.organization_id = v_org and l.target_kind = 'organization' and l.verb = 'archive';
  if v_ev.id is null or v_ev.applied_by is distinct from c_admin or v_ev.undone_at is not null
     or jsonb_array_length(v_ev.inverse #> '{took,approvals}') <> 3
     or jsonb_array_length(v_ev.inverse #> '{took,assignments}') <> 2
     or jsonb_array_length(v_ev.inverse #> '{took,sign_requests}') <> 1 then
    raise exception '3d: the archive event does not list what it took: %', row_to_json(v_ev);
  end if;
  select pr.id::text into v_person from custom.record pr
   where pr.organization_id = v_org and pr.table_id = custom.person_kernel_id() and pr.data ->> 'user_id' = c_tech::text;
  if not (v_ev.inverse #> '{took,assignments}') @> jsonb_build_array(jsonb_build_array(v_w_ruiz, v_person)) then
    raise exception '3e: the event does not remember who the Ruiz call was assigned to: %', v_ev.inverse -> 'took';
  end if;
  if not exists (select 1 from history.row_versions h
                  where h.entity_type = 'custom.record' and h.organization_id = v_org and h.row_id = v_a_tanaka
                    and h.migration_id = v_ev.id and h.operation_name = 'archive of organization'
                    and h.row_data -> 'data' ->> 'withdrawn_reason' like v_name || '%') then
    raise exception '3f: the approval''s history has no version pointing at the archive event';
  end if;
  -- the reminders never reach it (the tick runs as the store owner, as pg_cron runs it)
  v_out := custom.inbox_remind_tick();
  if exists (select 1 from communication.notification n where n.organization_id = v_org) then
    raise exception '3g: a reminder was sent about work in an archived organization';
  end if;
  raise notice 'PART 3 PASSED — "%"', v_ev.note;

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 4 — WHILE EASTSIDE IS ARCHIVED THE RUIZ JOB IS ARCHIVED (the customer went elsewhere).
  -- ════════════════════════════════════════════════════════════════════════════
  update custom.record r set deleted_at = now() where r.organization_id = v_org and r.id in (v_ruiz, v_w_ruiz);
  perform set_config('role', 'authenticated', true);

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 5 — NOVEMBER: THE OWNER REOPENS EASTSIDE. What is still live comes back; Ruiz does not.
  -- ════════════════════════════════════════════════════════════════════════════
  perform set_config('request.jwt.claims', c_admin_j, true);
  v_out := iam.organization_restore(v_org, v_name);
  if not coalesce((v_out ->> 'changed')::boolean, false) then
    raise exception '5-: the organization did not restore: %', v_out;
  end if;

  perform set_config('request.jwt.claims', c_tech_j, true);
  select count(*) into v_n from custom.work_inbox(v_org, 200, 0, false) w
   where w.item_id in (v_a_tanaka, v_a_col, v_w_tanaka) and w.actionable;
  if v_n <> 3 then
    raise exception '5a: % of the three live items came back to the technician''s inbox', v_n;
  end if;
  if exists (select 1 from custom.work_inbox(v_org, 200, 0, false) w where w.item_id in (v_a_ruiz, v_w_ruiz)) then
    raise exception '5b: work about the archived Ruiz job came back as waiting';
  end if;
  select c.waiting into v_n from custom.inbox_counts(v_org) c;
  if v_n <> 3 then
    raise exception '5c: the counts door says % waiting after the restore, the inbox lists 3', v_n;
  end if;
  if not exists (select 1 from custom.work_inbox(v_org, 200, 0, true) w
                  where w.item_id = v_a_ruiz and w.state = 'withdrawn' and w.outcome like 'Withdrawn.%') then
    raise exception '5d: the Ruiz approval does not stay withdrawn with its reason in the decided view';
  end if;

  perform set_config('role', 'postgres', true);
  select r.data into v_d from custom.record r where r.organization_id = v_org and r.id = v_a_tanaka;
  if v_d ->> 'state' <> 'pending' or v_d ? 'withdrawn_reason' or v_d ? 'withdrawn_with' or v_d ? 'decided_at' then
    raise exception '5e: the Tanaka approval did not come back clean: %', v_d;
  end if;
  select r.data into v_d from custom.record r where r.organization_id = v_org and r.id = v_sign;
  if custom.sign_request_state(v_d) <> 'sent' then
    raise exception '5f: the repair authorization did not work again after the restore: %', custom.sign_request_state(v_d);
  end if;
  select * into v_ev from history.migration_log l where l.id = v_ev.id;
  if v_ev.undone_at is null or v_ev.undone_by is distinct from c_admin
     or jsonb_array_length(coalesce(v_ev.inverse -> 'left', '[]'::jsonb)) <> 2 then
    raise exception '5g: the archive event was not closed by the restore, or does not say what stayed behind: %', row_to_json(v_ev);
  end if;
  perform set_config('role', 'authenticated', true);
  raise notice 'PART 5 PASSED — three came back, the Ruiz approval and call stayed withdrawn: %', v_ev.inverse -> 'left';

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 6 — ARCHIVED AGAIN, RESTORED AGAIN: the second round trip is its own event.
  -- ════════════════════════════════════════════════════════════════════════════
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform iam.organization_archive(v_org, v_name, null);
  perform iam.organization_restore(v_org, v_name);
  perform set_config('request.jwt.claims', c_tech_j, true);
  select count(*) into v_n from custom.work_inbox(v_org, 200, 0, false) w where w.item_id in (v_a_tanaka, v_a_col, v_w_tanaka);
  if v_n <> 3 then
    raise exception '6a: after a second archive and restore % of the three are back', v_n;
  end if;
  perform set_config('role', 'postgres', true);
  select count(*) into v_n from history.migration_log l
   where l.organization_id = v_org and l.target_kind = 'organization' and l.verb = 'archive' and l.undone_at is not null;
  if v_n <> 2 then
    raise exception '6b: two round trips should leave two closed events, found %', v_n;
  end if;
  perform set_config('role', 'authenticated', true);
  raise notice 'PART 6 PASSED — a second round trip is its own event, and brings the same three back.';

  raise notice 'ALL PARTS PASSED (archorgwork_green)';
end
$t$;

rollback;
