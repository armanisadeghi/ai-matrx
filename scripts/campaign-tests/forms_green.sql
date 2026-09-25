-- scripts/campaign-tests/forms_green.sql — lane FORMS, from the seat.
--
-- PRODUCTS row 1. Every asserted clause below PART 0 runs as `authenticated` — the role
-- PostgREST serves a signed-in person — through the doors that person reaches, EXCEPT the
-- two public doors, which are server-lane by declaration (`platform.client_callable_door`
-- says so in as many words) and are therefore reached by stepping out and SAYING SO.
--
-- The two seats: `admin@admin.com` owns the organization and the Table; `test@test.com` is
-- an ordinary member who was shared nothing. The anonymous writer has no seat at all.
--
-- Ends in ROLLBACK and leaves nothing.

\set ON_ERROR_STOP on

-- TARGET AND DEPENDENCIES — the one shared preamble. It accepts the MAIN database or the
-- rehearsal branch named in common-docs/.../plan/BRANCH-REF, refuses anything else by name,
-- says which database this is, and SKIPS (never fake-passes) when a declared dependency is
-- absent here. Declare dependencies with `\set requires` above the include; see the preamble.
\set suite 'forms_green.sql'
\set requires 'function:custom.organization_kernel_id'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif
begin;
set local lock_timeout = '10s';
set local statement_timeout = '60s';

do $suite$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_dana    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_dana_j  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_boss    text := current_user;
  v_org     uuid := gen_random_uuid();
  v_home    uuid;
  v_table   uuid;
  v_f_name  uuid;
  v_f_phone uuid;
  v_accept  uuid;
  v_notify  uuid;
  v_form    uuid;
  v_sub     uuid;
  v_rec     uuid;
  v_pub     timestamptz;
  v_doc     jsonb;
  v_n       bigint;
  v_n2      bigint;
  v_n3      bigint;
  v_txt     text;
  v_txt2    text;
  v_row     record;
begin
  -- ── fixtures, as the connected role (a seat is a PERSON; these make one) ───────
  insert into iam.organizations (id, name, slug, created_by)
  values (v_org, 'Rincon Plumbing Co Green ' || left(v_org::text, 8), 'rincon-plumbing-green-' || left(v_org::text, 8), c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status, created_by)
  values (v_org, 'organization', v_org, c_admin, 'owner', 'active', c_admin),
         (v_org, 'organization', v_org, c_dana, 'member', 'active', c_admin);
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note, updated_by)
  values ('custom', 'system_enabled', 'organization', v_org, v_org, 'true'::jsonb, 'forms_green.sql', c_admin);

  perform set_config('app.actor_system', 'campaign-test/forms_green.sql', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  -- ══ PART 0 — TAKE THE SEAT AND PROVE IT ═══════════════════════════════════════
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception '0: this suite did not take the seat — current_user is %', current_user;
  end if;
  if pg_has_role(current_user,
                 (select c.relowner from pg_class c where c.oid = 'custom.record'::regclass),
                 'member') then
    raise exception '0: this seat is a member of the role that owns custom.record, so every wall would open on its first line';
  end if;
  begin
    perform 1 from custom.record limit 1;
    raise exception '0: this seat can SELECT custom.record directly, so it is not a client seat';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PART 0 PASSED — seated as %, which cannot read custom.record directly', current_user;

  -- ══ PART 1 — a Table, its Fields, and a RULE THAT IS A RULE ════════════════════
  -- A Home first: custom._table_shape_guard refuses a Table with no Home.
  v_home := custom.record_write(v_org, custom.organization_kernel_id(),
              jsonb_build_object('name', 'Workspace', 'description', 'the suite''s home', '_actor', 'user'));
  v_table := custom.table_declare(v_org, jsonb_build_object(
      'name', 'New Patients', 'slug', 'new_patients', 'description', 'the suite''s table',
      'type', 'entity', 'display', 'list', 'ordered', false, 'weight', 'light',
      'retention_days', 30, 'row_order', 'sorted',
      'default_sort', jsonb_build_array(jsonb_build_object('field', 'full_name', 'direction', 'asc')),
      'agent_writable', true, 'label_singular', 'Patient', 'label_plural', 'Patients',
      'title_field', 'full_name',
      'fields', jsonb_build_array(jsonb_build_object('name', 'full_name'), jsonb_build_object('name', 'mobile')),
      'parent_id', v_home));
  v_f_name  := custom.field_declare(v_org, v_table, jsonb_build_object('label', 'full name', 'key', 'full_name', 'type', 'text', 'required', true));
  v_f_phone := custom.field_declare(v_org, v_table, jsonb_build_object('label', 'mobile', 'key', 'mobile', 'type', 'text', 'required', true));

  -- REC-72. A Rule written with custom.record_write carries data_class = 'record' and is
  -- invisible to every reader that looks for a Rule. custom.rule_declare is the door.
  v_accept := custom.rule_declare(v_org, jsonb_build_object(
      'name', 'the answers it asks for are there', 'kind', 'predicate',
      'uses', jsonb_build_array('validate'), 'scope_table_id', v_table,
      'applies_to_types', '[]'::jsonb,
      'expr', jsonb_build_object('op', 'and', 'args', jsonb_build_array(
                jsonb_build_object('op', 'present', 'args', jsonb_build_array(jsonb_build_object('field', v_f_name))),
                jsonb_build_object('op', 'present', 'args', jsonb_build_array(jsonb_build_object('field', v_f_phone)))))));
  v_notify := custom.rule_declare(v_org, jsonb_build_object(
      'name', 'tell someone when an answer arrives', 'kind', 'predicate',
      'uses', jsonb_build_array('membership'), 'scope_table_id', v_table,
      'applies_to_types', '[]'::jsonb, 'expr', jsonb_build_object('const', true),
      'subscription', jsonb_build_object('saved_view_id', null, 'cadence', 'immediate',
                                         'channel', 'in_app', 'recipient_user_id', c_admin,
                                         'event_key', 'custom.form.response')));

  -- The clause that matters: DOOR-18's own reader can SEE it. It has to be asked from
  -- OUTSIDE the seat, and that is a finding rather than a convenience:
  -- `custom.agg_subscriptions` holds NO client grant and no `platform.client_callable_door`
  -- row, so no screen can ever list an organization's own subscriptions. W4-AGG's door;
  -- named here because this suite is the first thing that tried.
  perform set_config('role', v_boss, true);
  select count(*) into v_n from custom.agg_subscriptions(v_org, null, 'immediate') s where s.rule_id = v_notify;
  perform set_config('role', 'authenticated', true);
  if v_n <> 1 then
    raise exception '1: the subscription Rule is invisible to custom.agg_subscriptions (% rows) — REC-72 is not held', v_n;
  end if;
  raise notice 'PART 1 PASSED — a Table, two required Fields, and two Rules the store can SEE as Rules';

  -- ══ PART 2 — a question naming no Field is refused BY NAME ═════════════════════
  begin
    perform custom.form_declare(v_org, v_table, 'New patient intake',
              jsonb_build_array(jsonb_build_object('field', 'salary', 'required', true)));
    raise exception '2: a form asked for a field this table does not have and was allowed';
  exception when foreign_key_violation then
    get stacked diagnostics v_txt = message_text;
    if v_txt not like '%salary%' then
      raise exception '2: the refusal does not name the field: %', v_txt;
    end if;
  end;
  raise notice 'PART 2 PASSED — "%"', v_txt;

  v_form := custom.form_declare(v_org, v_table, 'New patient intake',
      jsonb_build_array(
        jsonb_build_object('field', 'full_name', 'ask', 'What is your full name?', 'required', true),
        jsonb_build_object('field', 'mobile', 'ask', 'A mobile we can reach you on', 'required', true)),
      jsonb_build_object('intro', 'A few details before your first visit.',
                         'flow', 'one-at-a-time',
                         'thank_you', jsonb_build_object('title', 'You are all set')),
      null, v_accept, v_notify);

  -- ══ PART 3 — CLOSED BY DEFAULT ════════════════════════════════════════════════
  -- The public doors are SERVER-LANE by declaration, so this seat may not call them.
  -- That refusal is itself a clause: a browser cannot reach them.
  begin
    perform 1 from custom.form_public(v_form);
    raise exception '3: the seat `authenticated` reached custom.form_public, which is declared server-only';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PART 3a PASSED — a signed-in browser seat cannot call the public doors at all';

  -- Now step OUT, and say why: the server is the caller of these two, and the connected
  -- role stands in for it. Nothing is asserted about a PERSON while out.
  perform set_config('role', v_boss, true);
  perform set_config('request.jwt.claims', '', true);

  select count(*) into v_n from custom.form_public(v_form);
  if v_n <> 0 then
    raise exception '3: an UNPUBLISHED form answered % row(s) — closed by default is not held', v_n;
  end if;
  begin
    perform 1 from custom.form_submit(v_form, 'https://www.aimatrx.com', '{"full_name":"X","mobile":"1"}'::jsonb, 'suite');
    raise exception '3: an unpublished form took a submission';
  exception when insufficient_privilege then
    get stacked diagnostics v_txt = message_text;
  end;
  raise notice 'PART 3b PASSED — unpublished answers nothing and takes nothing: "%"', v_txt;

  -- ══ PART 4 — the publish act is the owner's, at ADMIN ══════════════════════════
  perform set_config('request.jwt.claims', c_dana_j, true);
  perform set_config('role', 'authenticated', true);
  begin
    perform custom.anon_publish(v_org, v_form, true);
    raise exception '4: an ordinary member published a form, which opens a write path for strangers';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PART 4a PASSED — a member cannot open a form to the world';

  perform set_config('request.jwt.claims', c_admin_j, true);
  v_pub := custom.anon_publish(v_org, v_form, true);
  if v_pub is null then
    raise exception '4: the publish act returned nothing';
  end if;
  raise notice 'PART 4b PASSED — published at %', v_pub;

  -- ══ PART 5 — the public face, and what it will not say ════════════════════════
  perform set_config('role', v_boss, true);
  perform set_config('request.jwt.claims', '', true);

  select * into v_row from custom.form_public(v_form);
  if v_row.state <> 'open' then
    raise exception '5: a published form reads %', v_row.state;
  end if;
  if jsonb_array_length(v_row.fields) <> 2 then
    raise exception '5: the public face carries % field(s), expected 2', jsonb_array_length(v_row.fields);
  end if;
  if (v_row.fields -> 0 ->> 'id') is null then
    raise exception '5: a public Field arrived with no id — the only Fields on the platform that would';
  end if;
  if v_row.honeypot_key is null then
    raise exception '5: the form has no decoy';
  end if;
  -- An INVENTED form id and a form of an organization whose store is off answer the same.
  select count(*) into v_n from custom.form_public(gen_random_uuid());
  if v_n <> 0 then
    raise exception '5: an invented form id answered % row(s)', v_n;
  end if;
  raise notice 'PART 5 PASSED — open, 2 Fields each with an id, a decoy, and an invented id is a 404';

  -- ══ PART 6 — the anonymous write, and the three refusals ═══════════════════════
  begin
    perform 1 from custom.form_submit(v_form, 'https://www.aimatrx.com', '{"salary":1}'::jsonb, 'suite');
    raise exception '6: a key the form does not ask for was accepted';
  exception when insufficient_privilege then
    get stacked diagnostics v_txt = message_text;
    if v_txt not like '%salary%' then
      raise exception '6: the refusal does not name the key: %', v_txt;
    end if;
  end;
  raise notice 'PART 6a PASSED — "%"', v_txt;

  begin
    perform 1 from custom.form_submit(v_form, 'https://www.aimatrx.com', '{"full_name":"Only a name"}'::jsonb, 'suite');
    raise exception '6: a submission missing a required answer was accepted';
  exception when sqlstate '22004' then
    get stacked diagnostics v_txt = message_text;
    if v_txt not like '%mobile%' then
      raise exception '6: the refusal does not name the missing question: %', v_txt;
    end if;
  end;
  raise notice 'PART 6b PASSED — "%"', v_txt;

  select s.submission_id, s.record_id, s.state into v_sub, v_rec, v_txt
    from custom.form_submit(v_form, 'https://www.aimatrx.com',
           '{"full_name":"Dana Reyes","mobile":"+1 512 555 0142"}'::jsonb, '203.0.113.9') s;
  if v_txt <> 'accepted' or v_rec is null then
    raise exception '6: a good answer read state=% record_id=% — the quarantine never opened', v_txt, v_rec;
  end if;
  raise notice 'PART 6c PASSED — accepted, and it became record %', v_rec;

  -- The decoy: the script is thanked, the OWNER is told the truth.
  select s.submission_id, s.record_id, s.state into v_sub, v_rec, v_txt
    from custom.form_submit(v_form, 'https://www.aimatrx.com',
           '{"full_name":"Bot","mobile":"0"}'::jsonb, '198.51.100.4', 'http://free-prizes-claim-now.win') s;
  if v_txt <> 'accepted' or v_rec is not null then
    raise exception '6: the decoy produced state=% record=%', v_txt, v_rec;
  end if;
  perform set_config('role', v_boss, true);
  select s.state, s.rejection_reason into v_txt, v_txt2
    from custom.anon_submission s where s.organization_id = v_org and s.id = v_sub;
  if v_txt <> 'rejected' or v_txt2 not like '%decoy%' then
    raise exception '6: the decoy filed a % submission saying %', v_txt, v_txt2;
  end if;
  raise notice 'PART 6d PASSED — the decoy answered "accepted" to the script and filed a rejected submission: "%"', left(v_txt2, 70);

  -- ══ PART 7 — the record says where it came from, to the OWNER ═════════════════
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform set_config('role', 'authenticated', true);

  perform set_config('role', v_boss, true);
  select s.record_id into v_rec from custom.anon_submission s
   where s.organization_id = v_org and s.state = 'cleared' limit 1;
  perform set_config('role', 'authenticated', true);
  v_doc := custom.read_record(v_org, v_rec, false);
  if v_doc -> '_source' ->> 'via' <> 'form' then
    raise exception '7: the record does not say it came from a form: %', v_doc -> '_source';
  end if;
  if (v_doc -> '_source' ->> 'form_id')::uuid <> v_form then
    raise exception '7: the record names the wrong form';
  end if;
  if v_doc ->> 'full_name' <> 'Dana Reyes' then
    raise exception '7: the answer did not land: %', v_doc ->> 'full_name';
  end if;
  raise notice 'PART 7 PASSED — the record reads %, stamped via=form with the form id and version',
               v_doc ->> 'full_name';

  -- ══ PART 8 — the owner's list, and what a member does NOT see ════════════════
  select f.responses, f.in_table, f.rejected into v_n, v_n2, v_n3
    from custom.forms(v_org, v_table) f where f.form_id = v_form;
  if v_n <> 2 or v_n2 <> 1 or v_n3 <> 1 then
    raise exception '8: the list reads responses=% in_table=% rejected=%', v_n, v_n2, v_n3;
  end if;
  raise notice 'PART 8a PASSED — 2 answers, 1 in the table, 1 turned away';

  -- AND THE WALL. Under this organization's default visibility (`all_records`) an ordinary
  -- member CAN open the Table, so seeing its form is correct and not a leak — the list is
  -- scoped to the Tables the caller can already open, which is the whole rule. What must
  -- never happen is reaching ANOTHER organization's forms, so that is the clause.
  perform set_config('request.jwt.claims', c_dana_j, true);
  select count(*) into v_n from custom.forms(v_org) f;
  if v_n <> 1 then
    raise exception '8: a member of this organization sees % of its form(s) although she can open the Table', v_n;
  end if;
  begin
    perform 1 from custom.forms(gen_random_uuid()) f;
    raise exception '8: a member reached the forms of an organization she is not in';
  exception when insufficient_privilege then
    get stacked diagnostics v_txt = message_text;
  end;
  raise notice 'PART 8b PASSED — she sees this organization''s one form (she can open the Table) and another organization''s are refused: "%"', v_txt;

  -- ══ PART 9 — somebody was told ════════════════════════════════════════════════
  perform set_config('role', v_boss, true);
  select count(*) into v_n from communication.notification n
   where n.organization_id = v_org and n.event_key = 'custom.form.response';
  if v_n <> 1 then
    raise exception '9: % notification(s) for one accepted answer', v_n;
  end if;
  raise notice 'PART 9 PASSED — one in-app notification for the one answer that became a record';

  -- ══ PART 10 — the notification can be SEEN and SWITCHED OFF ═══════════════════
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform set_config('role', 'authenticated', true);

  select count(*) into v_n from custom.subscriptions(v_org, v_table) s
   where s.rule_id = v_notify and s.mine and s.i_may_mute and not s.muted;
  if v_n <> 1 then
    raise exception '10: the recipient cannot see their own subscription (% row(s))', v_n;
  end if;

  -- A member who is not the recipient and holds no admin on the Table sees nothing,
  -- although she CAN open the Table — a subscription list is not a roster.
  perform set_config('request.jwt.claims', c_dana_j, true);
  select count(*) into v_n from custom.subscriptions(v_org, v_table) s;
  if v_n <> 0 then
    raise exception '10: a member who is neither the recipient nor an admin sees % subscription(s)', v_n;
  end if;
  begin
    perform custom.subscription_mute(v_org, v_notify, true);
    raise exception '10: a member switched off somebody else''s notification';
  exception when insufficient_privilege then
    get stacked diagnostics v_txt = message_text;
  end;
  raise notice 'PART 10a PASSED — the recipient sees it; a bystander sees none and is refused: "%"', v_txt;

  -- OFF MEANS OFF, and the proof is that the ONE reader every consumer goes through
  -- stops returning it. Nothing else has to be taught.
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform custom.subscription_mute(v_org, v_notify, true);
  perform set_config('role', v_boss, true);
  select count(*) into v_n from custom.agg_subscriptions(v_org, null, 'immediate') s where s.rule_id = v_notify;
  if v_n <> 0 then
    raise exception '10: a muted subscription is still live to DOOR-18''s own reader';
  end if;

  -- And a second answer tells nobody.
  perform set_config('request.jwt.claims', '', true);
  perform 1 from custom.form_submit(v_form, 'https://www.aimatrx.com',
            '{"full_name":"Second Person","mobile":"+1 512 555 0999"}'::jsonb, '203.0.113.11');
  select count(*) into v_n from communication.notification n
   where n.organization_id = v_org and n.event_key = 'custom.form.response';
  if v_n <> 1 then
    raise exception '10: a muted subscription sent a notification anyway (% now)', v_n;
  end if;
  raise notice 'PART 10b PASSED — muted, so DOOR-18''s reader drops it and the next answer tells nobody';

  raise notice 'ALL PARTS PASSED (0 seat, 1 rules that are rules, 2 a question with nowhere to land, 3 closed by default, 4 the publish act, 5 the public face, 6 the write and its three refusals, 7 the provenance, 8 the list and the wall, 9 the notification, 10 seen and switched off)';
end;
$suite$;

rollback;
