-- scripts/campaign-tests/uichamp_s7_green.sql — lane S7-PRIME, from the seats.
--
-- UI-CHAMPIONS-PLAN rev 2, rows 34 (prefill by link), 35 (partial save and resume) and 40
-- (redirect after submit). The real use case: Ridgeline Physical Therapy's new-patient intake.
-- A referring clinic's link fills in which clinic sent the patient; the question that only
-- matters for a referral is asked because of it; the patient stops half-way on her phone and
-- finishes that evening on her laptop from the link the page gave her; the thank-you screen
-- sends her to the clinic's own booking page, and nowhere else.
--
-- THE SEATS.
--   · owner  — admin@admin.com, Dr. Ana Whitfield, practice manager: declares and publishes.
--   · member — test@test.com, Marisol Vega, front desk: a member of the practice.
--   · stranger — test@test.com again, seated against ANOTHER organization she is not in.
--   · anon   — the server lane (`service_role`), which is how a person with no account reaches
--              these doors: the public page is server-rendered and the doors are declared
--              server_only. A browser seat (`authenticated`) reaching them is itself a failure.
--
-- RED: on a database without lane S7-PRIME's file this suite dies at PART 0 (the doors do not
-- exist); without the grant chair step it dies at PART 4 (permission denied for function form_draft_save).
--
-- Ends in ROLLBACK and leaves nothing.

\set ON_ERROR_STOP on

\set suite 'uichamp_s7_green.sql'
\set requires 'function:custom.organization_kernel_id|function:custom.form_public_asks'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif
begin;
set local lock_timeout = '10s';
set local statement_timeout = '120s';

do $suite$
declare
  c_admin    constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_marisol  constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  c_admin_j  constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_mar_j    constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  c_origin   constant text := 'https://forms.aimatrx.com';
  v_boss     text := current_user;
  v_org      uuid := gen_random_uuid();
  v_other    uuid := gen_random_uuid();
  v_home     uuid;
  v_table    uuid;
  v_f_clinic uuid;
  v_form     uuid;
  v_form2    uuid;
  v_row      record;
  v_secret   text;
  v_secret2  text;
  v_txt      text;
  v_txt2     text;
  v_n        bigint;
  v_n2       bigint;
  v_i        integer;
  v_doc      jsonb;
  v_q        jsonb;
begin
  -- ══ PART 0 — the doors exist, and a browser seat cannot reach them ══════════════════════
  if to_regprocedure('custom.form_draft_save(uuid,jsonb,text,text,text)') is null
     or to_regprocedure('custom.form_draft_read(uuid,text)') is null then
    raise exception '0 RED: custom.form_draft_save / custom.form_draft_read do not exist here — lane S7-PRIME''s file is not applied';
  end if;
  if has_function_privilege('anon', 'custom.form_draft_save(uuid,jsonb,text,text,text)', 'execute')
     or has_function_privilege('authenticated', 'custom.form_draft_save(uuid,jsonb,text,text,text)', 'execute')
     or has_function_privilege('anon', 'custom.form_draft_read(uuid,text)', 'execute')
     or has_function_privilege('authenticated', 'custom.form_draft_read(uuid,text)', 'execute') then
    raise exception '0: a browser role holds EXECUTE on a server_only saved-place door';
  end if;
  raise notice 'PART 0 PASSED — both doors exist; anon and authenticated hold nothing on them';

  -- ══ PART 1 — the practice, its intake Table, and the form ══════════════════════════════
  insert into iam.organizations (id, name, slug, created_by, website)
  values (v_org, 'Ridgeline Physical Therapy S7 ' || left(v_org::text, 8),
          'ridgeline-pt-s7-' || left(v_org::text, 8), c_admin, 'https://www.ridgeline-pt.test/'),
         (v_other, 'Harbor Point Plumbing S7 ' || left(v_other::text, 8),
          'harbor-point-s7-' || left(v_other::text, 8), c_admin, null);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status, created_by)
  values (v_org, 'organization', v_org, c_admin, 'owner', 'active', c_admin),
         (v_org, 'organization', v_org, c_marisol, 'member', 'active', c_admin),
         (v_other, 'organization', v_other, c_admin, 'owner', 'active', c_admin);
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note, updated_by)
  values ('custom', 'system_enabled', 'organization', v_org, v_org, 'true'::jsonb, 'uichamp_s7_green.sql', c_admin),
         ('custom', 'system_enabled', 'organization', v_other, v_other, 'true'::jsonb, 'uichamp_s7_green.sql', c_admin);

  perform set_config('app.actor_system', 'campaign-test/uichamp_s7_green.sql', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception '1: the suite did not take the owner''s seat — current_user is %', current_user;
  end if;

  v_home := custom.record_write(v_org, custom.organization_kernel_id(),
              jsonb_build_object('name', 'Front desk', 'description', 'Ridgeline''s intake', '_actor', 'user'));
  v_table := custom.table_declare(v_org, jsonb_build_object(
      'name', 'New patient intake', 'slug', 'new_patient_intake', 'description', 'Every new patient, from the intake form.',
      'type', 'entity', 'display', 'list', 'ordered', false, 'weight', 'light',
      'retention_days', 30, 'row_order', 'sorted',
      'default_sort', jsonb_build_array(jsonb_build_object('field', 'full_name', 'direction', 'asc')),
      'agent_writable', true, 'label_singular', 'Patient', 'label_plural', 'Patients',
      'title_field', 'full_name',
      'fields', jsonb_build_array(jsonb_build_object('name', 'full_name'), jsonb_build_object('name', 'phone'),
                                  jsonb_build_object('name', 'referring_clinic'), jsonb_build_object('name', 'imaging_sent'),
                                  jsonb_build_object('name', 'goals')),
      'parent_id', v_home));
  perform custom.field_declare(v_org, v_table, jsonb_build_object('label', 'Full name', 'key', 'full_name', 'type', 'text', 'required', true));
  perform custom.field_declare(v_org, v_table, jsonb_build_object('label', 'Mobile phone', 'key', 'phone', 'type', 'text', 'required', true));
  v_f_clinic := custom.field_declare(v_org, v_table, jsonb_build_object('label', 'Referring clinic', 'key', 'referring_clinic', 'type', 'text'));
  perform custom.field_declare(v_org, v_table, jsonb_build_object('label', 'Did they send imaging?', 'key', 'imaging_sent', 'type', 'text'));
  perform custom.field_declare(v_org, v_table, jsonb_build_object('label', 'What would you like to get back to?', 'key', 'goals', 'type', 'text'));

  v_q := jsonb_build_array(
    jsonb_build_object('field', 'referring_clinic', 'ask', 'Which clinic referred you?'),
    jsonb_build_object('field', 'imaging_sent', 'ask', 'Did your referring clinic send any X-rays or MRI?',
                       'showIf', jsonb_build_object('op', 'present', 'args', jsonb_build_array(jsonb_build_object('field', v_f_clinic)))),
    jsonb_build_object('field', 'full_name', 'ask', 'Your full name', 'required', true),
    jsonb_build_object('field', 'phone', 'ask', 'Best number to reach you', 'required', true),
    jsonb_build_object('field', 'goals', 'ask', 'What would you like to get back to?'));

  -- ══ PART 2 — the redirect: the organization's own sites, and nothing else ══════════════
  -- Positive control first: a secure page on a subdomain of the practice's own website.
  v_form := custom.form_declare(v_org, v_table, 'New patient intake', v_q,
      jsonb_build_object('flow', 'one-at-a-time',
        'thank_you', jsonb_build_object('title', 'You are all set',
                                        'body', 'Next, book your first visit — it takes a minute.',
                                        'redirect_url', ' https://book.ridgeline-pt.test/first-visit ')));
  select presentation #>> '{thank_you,redirect_url}' into v_txt from custom.forms(v_org, v_table) where form_id = v_form;
  if v_txt is distinct from 'https://book.ridgeline-pt.test/first-visit' then
    raise exception '2: the redirect was not kept (trimmed) on the practice''s own subdomain: %', v_txt;
  end if;

  -- Four addresses a stranger must never be sent to. Each is refused BY NAME, 22023.
  foreach v_txt in array array[
      'http://book.ridgeline-pt.test/first-visit',          -- not secure
      'https://ridgeline-pt.test.phish.example/login',      -- the practice's name as a subdomain of someone else
      'https://evil-ridgeline-pt.test/',                    -- a suffix, not a subdomain
      'https://ridgeline-pt.test@phish.example/'] loop      -- a user name in front of someone else's host
    begin
      perform custom.form_declare(v_org, v_table, 'New patient intake', v_q,
          jsonb_build_object('thank_you', jsonb_build_object('title', 'x', 'redirect_url', v_txt)), null, null, null, v_form);
      raise exception '2: the form was allowed to send people to %', v_txt;
    exception when sqlstate '22023' then
      get stacked diagnostics v_txt2 = message_text;
      if v_txt2 not like '%own sites%' and v_txt2 not like '%https://%' then
        raise exception '2: the refusal for % does not say what is allowed: %', v_txt, v_txt2;
      end if;
    end;
  end loop;
  raise notice 'PART 2a PASSED — the practice''s own subdomain is kept; http, a look-alike subdomain, a suffix and a user-name trick are refused: "%"', v_txt2;

  -- The organization's own list widens it (a booking vendor), and ONLY for this organization.
  perform set_config('role', v_boss, true);
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note, updated_by)
  values ('custom', 'form_redirect_domains', 'organization', v_org, v_org, '["Bookings.JaneApp.test"]'::jsonb, 'uichamp_s7_green.sql', c_admin);
  if custom.form_redirect_refusal(v_org, 'https://ridgeline.bookings.janeapp.test/') is not null
     or custom.form_redirect_refusal(v_other, 'https://ridgeline.bookings.janeapp.test/') is null then
    raise exception '2: custom/form_redirect_domains did not widen exactly one organization';
  end if;
  -- An organization with no website and no list has nowhere to send anyone, and says so.
  v_txt := custom.form_redirect_refusal(v_other, 'https://harborpoint.test/');
  if v_txt not like '%has none yet%' then
    raise exception '2: an organization with no sites did not say so: %', v_txt;
  end if;

  -- The public face hands the redirect out only while its site is still on the list.
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform set_config('role', 'authenticated', true);
  perform custom.form_declare(v_org, v_table, 'New patient intake', v_q,
      jsonb_build_object('flow', 'one-at-a-time',
        'thank_you', jsonb_build_object('title', 'You are all set',
                                        'body', 'Next, book your first visit — it takes a minute.',
                                        'redirect_url', 'https://ridgeline.bookings.janeapp.test/first-visit')),
      null, null, null, v_form);
  perform custom.anon_publish(v_org, v_form, true);
  perform set_config('role', 'service_role', true);
  perform set_config('request.jwt.claims', '', true);
  select * into v_row from custom.form_public(v_form);
  if v_row.presentation #>> '{thank_you,redirect_url}' is distinct from 'https://ridgeline.bookings.janeapp.test/first-visit' then
    raise exception '2: the public face did not carry the redirect while its site is on the list: %', v_row.presentation -> 'thank_you';
  end if;
  perform set_config('role', v_boss, true);
  delete from platform.knob_override
   where feature = 'custom' and key = 'form_redirect_domains' and organization_id = v_org;
  perform set_config('role', 'service_role', true);
  select * into v_row from custom.form_public(v_form);
  if v_row.presentation #>> '{thank_you,redirect_url}' is not null
     or v_row.presentation #>> '{thank_you,body}' is distinct from 'Next, book your first visit — it takes a minute.' then
    raise exception '2: the public face still hands out a redirect whose site left the list, or lost the message: %', v_row.presentation -> 'thank_you';
  end if;
  raise notice 'PART 2b PASSED — the organization''s list widens only itself; a site taken off the list stops being handed out and the message stays';

  -- Put the practice's own booking page back for the rest of the suite.
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform set_config('role', 'authenticated', true);
  perform custom.form_declare(v_org, v_table, 'New patient intake', v_q,
      jsonb_build_object('flow', 'one-at-a-time',
        'thank_you', jsonb_build_object('title', 'You are all set',
                                        'body', 'Next, book your first visit — it takes a minute.',
                                        'redirect_url', 'https://book.ridgeline-pt.test/first-visit')),
      null, null, null, v_form);
  -- A second published form of the same practice: a key for one never opens the other.
  v_form2 := custom.form_declare(v_org, v_table, 'Returning patient check-in',
      jsonb_build_array(jsonb_build_object('field', 'full_name', 'required', true)));
  perform custom.anon_publish(v_org, v_form2, true);

  -- ══ PART 3 — prefill by link travels the SAME asks door, so branching follows ══════════
  perform set_config('role', 'service_role', true);
  perform set_config('request.jwt.claims', '', true);
  select a.asked into strict v_txt from custom.form_public_asks(v_form, '{}'::jsonb) a where a.field_key = 'imaging_sent';
  select a.asked into strict v_txt2 from custom.form_public_asks(v_form, '{"referring_clinic":"Harbor Sports Medicine"}'::jsonb) a where a.field_key = 'imaging_sent';
  if v_txt::boolean or not v_txt2::boolean then
    raise exception '3: the referral question did not follow the prefilled clinic (without %, with %)', v_txt, v_txt2;
  end if;
  raise notice 'PART 3 PASSED — no clinic: the imaging question is not asked; a link naming Harbor Sports Medicine: it is';

  -- ══ PART 4 — keep my place (anon, through the server lane) ════════════════════════════
  select * into v_row from custom.form_draft_save(v_form,
      '{"referring_clinic":"Harbor Sports Medicine","imaging_sent":"Yes, an MRI","full_name":"Leilani Okafor"}'::jsonb,
      null, '203.0.113.40', c_origin);
  v_secret := v_row.draft_secret;
  if v_row.state <> 'saved' or v_secret is null or length(v_secret) < 30 then
    raise exception '4: a first save read state=% secret length=%', v_row.state, length(v_secret);
  end if;
  if v_row.expires_at < now() + interval '29 days' or v_row.expires_at > now() + interval '31 days' then
    raise exception '4: a saved place is kept until %, not custom/form_draft_days (30) after the save', v_row.expires_at;
  end if;
  perform set_config('role', v_boss, true);
  select count(*) into v_n from custom.anon_form_draft d
   where d.organization_id = v_org and d.secret_hash = v_secret;  -- the secret itself is never stored
  select count(*) into v_n2 from custom.anon_form_draft d
   where d.organization_id = v_org and d.secret_hash = encode(extensions.digest(v_secret, 'sha256'), 'hex');
  if v_n <> 0 or v_n2 <> 1 then
    raise exception '4: the secret is stored in the clear (%) or its hash is missing (%)', v_n, v_n2;
  end if;
  perform set_config('role', 'service_role', true);

  -- A key the form does not ask for is refused BY NAME, exactly as sending refuses it.
  begin
    perform 1 from custom.form_draft_save(v_form, '{"insurance_member_id":"X"}'::jsonb, v_secret, '203.0.113.40', c_origin);
    raise exception '4: a saved place took a key the form does not ask for';
  exception when insufficient_privilege then
    get stacked diagnostics v_txt = message_text;
    if v_txt not like '%insurance_member_id%' then raise exception '4: the refusal does not name the key: %', v_txt; end if;
  end;
  raise notice 'PART 4 PASSED — saved, kept 30 days, the key answered once and only its hash stored; a foreign key refused: "%"', v_txt;

  -- ══ PART 5 — a saved place is NEVER a submission ═════════════════════════════════════
  perform set_config('role', v_boss, true);
  select count(*) into v_n from custom.anon_submission s where s.organization_id = v_org;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  select f.responses into v_n2 from custom.forms(v_org, v_table) f where f.form_id = v_form;
  select count(*) + v_n2 into v_n2 from custom.anon_submissions(v_org, v_table) s;
  if v_n <> 0 or v_n2 <> 0 then
    raise exception '5: an unfinished answer shows up as a submission (% rows, the owner counts %)', v_n, v_n2;
  end if;
  raise notice 'PART 5 PASSED — the owner''s responses, held and list all read zero with a saved place open';

  -- ══ PART 6 — where was I (the second device), and the keys that open nothing ══════════
  perform set_config('role', 'service_role', true);
  perform set_config('request.jwt.claims', '', true);
  select * into v_row from custom.form_draft_read(v_form, v_secret);
  if v_row.state <> 'found' or v_row.answers ->> 'full_name' <> 'Leilani Okafor'
     or v_row.answers ->> 'referring_clinic' <> 'Harbor Sports Medicine' then
    raise exception '6: the second device read state=% answers=%', v_row.state, v_row.answers;
  end if;
  select * into v_row from custom.form_draft_read(v_form, v_secret || 'x');
  if v_row.state <> 'not_found' or v_row.answers is not null then
    raise exception '6: a tampered key read state=% answers=%', v_row.state, v_row.answers;
  end if;
  select * into v_row from custom.form_draft_read(v_form2, v_secret);
  if v_row.state <> 'not_found' or v_row.answers is not null then
    raise exception '6: one form''s key opened another form (state=%)', v_row.state;
  end if;
  select count(*) into v_n from custom.form_draft_read(gen_random_uuid(), v_secret);
  if v_n <> 0 then
    raise exception '6: an invented form id answered % row(s)', v_n;
  end if;
  raise notice 'PART 6 PASSED — the second device reads her answers; a tampered key and another form''s key read not_found; an invented form is silence';

  -- ══ PART 7 — she goes on answering; the same place is rewritten ════════════════════════
  select * into v_row from custom.form_draft_save(v_form,
      '{"referring_clinic":"Harbor Sports Medicine","imaging_sent":"Yes, an MRI","full_name":"Leilani Okafor","phone":"+1 808 555 0161"}'::jsonb,
      v_secret, '198.51.100.7', c_origin);
  if v_row.state <> 'saved' or v_row.draft_secret <> v_secret then
    raise exception '7: a second save read state=% (secret kept: %)', v_row.state, v_row.draft_secret = v_secret;
  end if;
  perform set_config('role', v_boss, true);
  select d.saves, d.answers ->> 'phone' into v_n, v_txt from custom.anon_form_draft d
   where d.organization_id = v_org and d.secret_hash = encode(extensions.digest(v_secret, 'sha256'), 'hex');
  select count(*) into v_n2 from custom.anon_form_draft d where d.organization_id = v_org;
  if v_n <> 2 or v_txt <> '+1 808 555 0161' or v_n2 <> 1 then
    raise exception '7: saves=% phone=% places=% — a save made a second place or lost the answer', v_n, v_txt, v_n2;
  end if;
  raise notice 'PART 7 PASSED — one saved place, saved twice, the phone number added';

  -- ══ PART 8 — the knobs decide: how long, how large, how often ═════════════════════════
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note, updated_by)
  values ('custom', 'form_draft_days', 'organization', v_org, v_org, '7'::jsonb, 'uichamp_s7_green.sql', c_admin),
         ('custom', 'form_draft_max_bytes', 'organization', v_org, v_org, '1024'::jsonb, 'uichamp_s7_green.sql', c_admin),
         ('custom', 'form_draft_saves_per_hour', 'organization', v_org, v_org, '10'::jsonb, 'uichamp_s7_green.sql', c_admin);
  perform set_config('role', 'service_role', true);
  select * into v_row from custom.form_draft_save(v_form2, '{"full_name":"Theo Brandt"}'::jsonb, null, '203.0.113.41', c_origin);
  v_secret2 := v_row.draft_secret;
  if v_row.expires_at > now() + interval '8 days' or v_row.expires_at < now() + interval '6 days' then
    raise exception '8: an organization that keeps saved places 7 days got one kept until %', v_row.expires_at;
  end if;
  begin
    perform 1 from custom.form_draft_save(v_form2, jsonb_build_object('full_name', repeat('a', 2000)), v_secret2, '203.0.113.41', c_origin);
    raise exception '8: a saved place took 2 KB past its 1 KB ceiling';
  exception when sqlstate '54000' then
    get stacked diagnostics v_txt = message_text;
  end;
  -- 1 save so far; 9 more fill the hour; the 11th is skipped and SAYS so, keeping what was saved.
  for v_i in 1..9 loop
    select * into v_row from custom.form_draft_save(v_form2, jsonb_build_object('full_name', 'Theo Brandt ' || v_i), v_secret2, '203.0.113.41', c_origin);
    if v_row.state <> 'saved' then raise exception '8: save % of 10 read %', v_i + 1, v_row.state; end if;
  end loop;
  select * into v_row from custom.form_draft_save(v_form2, '{"full_name":"Theo Brandt 10"}'::jsonb, v_secret2, '203.0.113.41', c_origin);
  select d.answers ->> 'full_name' into v_txt2 from custom.form_draft_read(v_form2, v_secret2) d;
  if v_row.state <> 'too_many' or v_txt2 <> 'Theo Brandt 9' then
    raise exception '8: the 11th save in an hour read % and the place holds %', v_row.state, v_txt2;
  end if;
  raise notice 'PART 8 PASSED — 7 days when the practice says 7; 2 KB refused at a 1 KB ceiling ("%"); the 11th save in an hour skipped, the 10th kept', v_txt;

  -- ══ PART 9 — expired is gone, in words; a save after it starts a new place ═════════════
  perform set_config('role', v_boss, true);
  update custom.anon_form_draft d set expires_at = now() - interval '1 minute', saved_at = now() - interval '8 days'
   where d.organization_id = v_org and d.secret_hash = encode(extensions.digest(v_secret2, 'sha256'), 'hex');
  perform set_config('role', 'service_role', true);
  select * into v_row from custom.form_draft_read(v_form2, v_secret2);
  if v_row.state <> 'expired' or v_row.answers is not null or v_row.message not like '%gone%' then
    raise exception '9: an expired place read state=% answers=% message=%', v_row.state, v_row.answers, v_row.message;
  end if;
  select * into v_row from custom.form_draft_save(v_form2, '{"full_name":"Theo Brandt"}'::jsonb, v_secret2, '203.0.113.41', c_origin);
  if v_row.state <> 'saved' or v_row.draft_secret = v_secret2 or v_row.message not like '%expired%' then
    raise exception '9: a save on an expired place read state=% new secret=% message=%', v_row.state, v_row.draft_secret <> v_secret2, v_row.message;
  end if;
  raise notice 'PART 9 PASSED — "%" / a save after it is a new place: "%"', left((select message from custom.form_draft_read(v_form2, v_secret2)), 60), v_row.message;
  v_secret2 := v_row.draft_secret;

  -- ══ PART 10 — sending uses the place up, in the same transaction ══════════════════════
  select s.state, s.record_id into v_txt, v_doc
    from (select state, to_jsonb(record_id) as record_id
            from custom.form_submit(v_form, c_origin,
                   '{"referring_clinic":"Harbor Sports Medicine","imaging_sent":"Yes, an MRI","full_name":"Leilani Okafor","phone":"+1 808 555 0161","goals":"Running my first 10K since the knee surgery"}'::jsonb,
                   '198.51.100.7', null, v_secret)) s;
  if v_txt <> 'accepted' or v_doc = 'null'::jsonb then
    raise exception '10: sending the finished form read state=% record=%', v_txt, v_doc;
  end if;
  select * into v_row from custom.form_draft_read(v_form, v_secret);
  if v_row.state <> 'submitted' or v_row.answers is not null then
    raise exception '10: after sending, the saved place read state=% answers=%', v_row.state, v_row.answers;
  end if;
  select * into v_row from custom.form_draft_save(v_form, '{"full_name":"again"}'::jsonb, v_secret, '198.51.100.7', c_origin);
  if v_row.state <> 'submitted' then
    raise exception '10: a sent place took another save (state=%)', v_row.state;
  end if;
  perform set_config('role', v_boss, true);
  select d.answers, d.submission_id is not null into v_doc, v_txt from custom.anon_form_draft d
   where d.organization_id = v_org and d.secret_hash = encode(extensions.digest(v_secret, 'sha256'), 'hex');
  if v_doc <> '{}'::jsonb or not v_txt::boolean then
    raise exception '10: the sent place kept a second copy of her answers (%) or does not name its submission', v_doc;
  end if;
  -- The same key again is the idempotency key: a double-click writes nothing twice.
  perform set_config('role', 'service_role', true);
  select s.message into v_txt from custom.form_submit(v_form, c_origin,
         '{"full_name":"Leilani Okafor","phone":"+1 808 555 0161"}'::jsonb, '198.51.100.7', null, v_secret) s;
  perform set_config('role', v_boss, true);
  select count(*) into v_n from custom.anon_submission s where s.organization_id = v_org and s.form_id = v_form;
  if v_n <> 1 or v_txt not like '%already arrived%' then
    raise exception '10: a second send with the same key made % submission(s): %', v_n, v_txt;
  end if;
  raise notice 'PART 10 PASSED — accepted into the Table; the place reads submitted, holds no copy, names its submission; a double send wrote one';

  -- ══ PART 11 — closed and switched off ═══════════════════════════════════════════════
  perform set_config('role', 'service_role', true);
  select * into v_row from custom.form_draft_save(v_form, '{"full_name":"Kai Mendoza"}'::jsonb, null, '203.0.113.42', c_origin);
  v_secret := v_row.draft_secret;
  perform set_config('role', v_boss, true);
  update custom.anon_form set closed_at = now() where organization_id = v_org and id = v_form;
  perform set_config('role', 'service_role', true);
  select * into v_row from custom.form_draft_read(v_form, v_secret);
  if v_row.state <> 'closed' or v_row.answers is not null then
    raise exception '11: a closed form''s place read state=%', v_row.state;
  end if;
  select * into v_row from custom.form_draft_save(v_form, '{"full_name":"Kai Mendoza"}'::jsonb, v_secret, '203.0.113.42', c_origin);
  if v_row.state <> 'closed' then
    raise exception '11: a closed form saved answers (state=%)', v_row.state;
  end if;
  select count(*) into v_n from custom.form_draft_read(v_form2, v_secret2) d where d.state = 'found';
  if v_n <> 1 then
    raise exception '11: positive control — the returning-patient place did not read found while the store is on';
  end if;
  perform set_config('role', v_boss, true);
  update platform.knob_override set value = 'false'::jsonb
   where feature = 'custom' and key = 'system_enabled' and organization_id = v_org;
  perform set_config('role', 'service_role', true);
  select count(*) into v_n from custom.form_draft_read(v_form2, v_secret2);
  if v_n <> 0 then
    raise exception '11: a store that is switched off answered a saved-place read';
  end if;
  raise notice 'PART 11 PASSED — closed says closed on read and on save; a switched-off store is silence';
  perform set_config('role', v_boss, true);
  update platform.knob_override set value = 'true'::jsonb
   where feature = 'custom' and key = 'system_enabled' and organization_id = v_org;

  -- ══ PART 12 — the member and the stranger ═══════════════════════════════════════════
  -- The front desk may not change what strangers are sent to: declaring a form is an admin act.
  perform set_config('request.jwt.claims', c_mar_j, true);
  perform set_config('role', 'authenticated', true);
  begin
    perform custom.form_declare(v_org, v_table, 'New patient intake', v_q,
        jsonb_build_object('thank_you', jsonb_build_object('title', 'x', 'redirect_url', 'https://book.ridgeline-pt.test/')),
        null, null, null, v_form2);
    raise exception '12: a member re-declared the practice''s form';
  exception when insufficient_privilege then
    get stacked diagnostics v_txt = message_text;
  end;
  -- And neither she nor anybody signed in reaches the saved-place doors at all.
  begin
    perform 1 from custom.form_draft_read(v_form2, 'anything');
    raise exception '12: a signed-in seat reached custom.form_draft_read';
  exception when insufficient_privilege then null;
  end;
  -- The stranger: an organization she is not in.
  begin
    perform custom.form_declare(v_other, v_table, 'Not hers', v_q);
    raise exception '12: a stranger declared a form in an organization she is not in';
  exception when insufficient_privilege then
    get stacked diagnostics v_txt2 = message_text;
  end;
  raise notice 'PART 12 PASSED — the member is refused ("%"), a signed-in seat cannot reach the saved place, the stranger is refused ("%")', v_txt, v_txt2;

  raise notice 'ALL PARTS PASSED (0 doors and grants, 1 the practice, 2 redirect to its own sites only, 3 prefill branches through the asks door, 4 keep my place, 5 never a submission, 6 the second device, 7 the same place rewritten, 8 the knobs decide, 9 expired is gone in words, 10 sending uses it up, 11 closed and off, 12 member and stranger)';
end;
$suite$;

rollback;
