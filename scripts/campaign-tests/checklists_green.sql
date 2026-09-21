-- LANE CHECKLISTS — THE GREEN SUITE. PRODUCTS.md row 13, *"Every new hire gets these twelve
-- steps."* An admin describes an onboarding checklist once; a new hire record arriving starts a
-- run on its own; the steps land in TWO people's work with real dates; a step refuses to be
-- ticked while the step it waits for is open, and says so in words a person would use; the last
-- step closes the run. On the MAIN database, in one transaction that ends in ROLLBACK.
--
-- RUN IT:
--   PSQL="$(node node_modules/tsx/dist/cli.mjs scripts/lib/psql-path.ts --print)"
--   "$PSQL" "<the main database DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/checklists_green.sql
--
-- ITS RED TWIN is `scripts/campaign-tests/checklists_red.sql`.
--
-- THE SEAT. Every asserted clause runs as `authenticated`, the role PostgREST gives a signed-in
-- person, through doors that person reaches. The fixture (the organization, the two
-- memberships, the knobs, the Home record) is written before the seat is taken and asserts
-- nothing.
--
-- WHAT MAKES IT FAIL — the production change, named, one per part:
--   1  let `custom.checklist_declare` store a checklist whose step waits for a step that comes
--      after it → a run of it could never finish, and nobody would be told until it did not.
--   2  drop `zz_ckl_watch` → "every new hire gets these twelve steps" becomes "every new hire
--      gets these twelve steps if somebody remembers", which is the whole product.
--   3  drop the `custom.work_assign` call from the instantiation → twelve rows nobody owns and
--      nobody can open, in nobody's inbox.
--   4  drop the due offsets → twelve undated rows the inbox files under `undated` forever.
--   5  drop `zz_ckl_step_guard` → step 12 can be ticked on the first morning through
--      `custom.work_set_state`, with `custom.checklist_step_complete` still politely refusing
--      beside it. A safe path beside an unsafe one is not a rule.
--   6  stop checking `requires` → a checklist closes with nothing in it.
--   7  drop the run-closing arm of `zz_ckl_watch` → a finished checklist stays open forever.
--
-- A SECOND INPUT WITH A DIFFERENT EXPECTED VALUE IN EVERY PART: PART 1 pairs the refused
-- checklist with the one that stores; PART 3 pairs the step that IS in a person's work with the
-- one that is in the other person's; PART 5 pairs the refused early tick with the one that
-- lands in order; PART 6 pairs the refusal for missing evidence with the same call carrying it;
-- PART 8 pairs what `test@test.com` may finish with what she may not.

\set ON_ERROR_STOP on
\timing off

begin;
set local lock_timeout = '120s';
set local statement_timeout = '180s';

do $t$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_dana    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_dana_j  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_org     uuid := gen_random_uuid();
  v_name    text;
  v_home    uuid;
  v_people  uuid;
  v_hire    uuid;
  v_spec    jsonb;
  v_res     jsonb;
  v_tpl     uuid;
  v_run     uuid;
  v_steps   uuid;
  v_contract uuid;
  v_laptop  uuid;
  v_desk    uuid;
  v_welcome uuid;
  v_caught  text;
  v_code    text;
  v_n       integer;
  v_txt     text;
  v_row     record;
  v_boss    text := current_user;
  v_done    uuid;
  v_state   uuid;
begin
  if (select system_identifier from pg_control_system()) <> 7642734024280108049 then
    raise exception 'checklists_green.sql runs on the MAIN database only, and this is %',
      (select system_identifier from pg_control_system());
  end if;

  perform set_config('app.actor_system', 'campaign-test/checklists_green', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  v_name := 'ZZ CHECKLISTS Green ' || substr(v_org::text, 1, 8);
  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, v_name, 'zz-checklists-' || substr(v_org::text, 1, 8), 'ZCK', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org, 'organization', v_org, c_admin, 'owner',  'active'),
    (v_org, 'organization', v_org, c_dana,  'member', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note) values
    ('custom','system_enabled','organization', v_org, v_org, 'true'::jsonb, 'checklists_green'),
    -- SHARES DELIBERATELY. Under the shipped default every member already opens every record,
    -- so "the assignment gave her access" would be true before anybody gave her anything.
    ('custom','member_default_visibility','organization', v_org, v_org, '"shared_only"'::jsonb, 'checklists_green');

  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name', 'Home')) returning id into v_home;

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 0 — TAKE THE SEAT AND PROVE IT.
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
  raise notice '0 PASS — seated as %, and it cannot read custom.record directly.', current_user;

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 1 — A CHECKLIST IS JUDGED WHOLE, BEFORE IT IS STORED.
  v_people := custom.table_declare(v_org, jsonb_build_object(
    'name', 'People', 'slug', 'people', 'type', 'entity',
    'label_singular', 'Person', 'label_plural', 'People',
    'title_field', 'name', 'display', 'list', 'weight', 'light',
    'ordered', true, 'row_order', 'sorted', 'agent_writable', true,
    'retention_days', 3650,
    'default_sort', jsonb_build_array(jsonb_build_object('field', 'name', 'direction', 'asc')),
    'parent_id', v_home::text,
    'fields', jsonb_build_array(jsonb_build_object('name', 'name'),
                                jsonb_build_object('name', 'start_date'))));
  perform custom.field_declare(v_org, v_people, jsonb_build_object(
    'key', 'name', 'label', 'Name', 'type', 'text', 'sort', 10, 'required', true));
  perform custom.field_declare(v_org, v_people, jsonb_build_object(
    'key', 'start_date', 'label', 'Start date', 'type', 'text', 'sort', 20));

  -- 1a — a step that waits for a step BELOW it. Refused, and the refusal says why that rule
  --      exists rather than quoting a rule number.
  begin
    perform custom.checklist_declare(v_org, jsonb_build_object(
      'name', 'Backwards', 'about_table_id', v_people::text,
      'steps', jsonb_build_array(
        jsonb_build_object('ref', 'first', 'title', 'First', 'depends_on', jsonb_build_array('second')),
        jsonb_build_object('ref', 'second', 'title', 'Second'))));
    raise exception '1a: a checklist whose first step waits for its second was stored';
  exception when check_violation then
    get stacked diagnostics v_caught = message_text;
    if v_caught not like '%waits for second%' or v_caught not like '%above it%' then
      raise exception '1a: refused, but not in words a person would use: %', v_caught;
    end if;
  end;
  raise notice '1a PASS — %', v_caught;

  -- 1b — a step given to a role nobody is named for at all.
  begin
    perform custom.checklist_declare(v_org, jsonb_build_object(
      'name', 'Nameless', 'about_table_id', v_people::text,
      'steps', jsonb_build_array(
        jsonb_build_object('ref', 'a', 'title', 'A', 'role', 'legal'))));
    raise exception '1b: a checklist naming a role it never declares was stored';
  exception when check_violation then
    get stacked diagnostics v_caught = message_text;
    if v_caught not like '%legal%' or v_caught not like '%never says who that is%' then
      raise exception '1b: refused, but not usefully: %', v_caught;
    end if;
  end;
  raise notice '1b PASS — %', v_caught;

  -- 1c — the one that stores. Twelve steps is the product's own sentence; four carry every
  --      rule the twelve would (two roles, two offsets, two dependencies, two requirements).
  v_spec := jsonb_build_object(
    'name', 'New hire onboarding',
    'about_table_id', v_people::text,
    'roles', jsonb_build_array(
      jsonb_build_object('role', 'hr', 'label', 'HR',  'user_id', c_admin::text),
      jsonb_build_object('role', 'it', 'label', 'IT',  'user_id', c_dana::text)),
    'trigger', jsonb_build_object('kind', 'record_created', 'table_id', v_people::text),
    'steps', jsonb_build_array(
      jsonb_build_object('ref', 'contract', 'title', 'Send the contract', 'role', 'hr',
                         'due_days', 0,
                         'requires', jsonb_build_object('kind', 'note')),
      jsonb_build_object('ref', 'laptop', 'title', 'Order the laptop', 'role', 'it',
                         'due_days', 2, 'depends_on', jsonb_build_array('contract'),
                         'requires', jsonb_build_object('kind', 'answer', 'key', 'serial_number',
                                                        'label', 'Serial number')),
      jsonb_build_object('ref', 'desk', 'title', 'Set up the desk', 'role', 'it',
                         'due_days', 3, 'depends_on', jsonb_build_array('laptop')),
      jsonb_build_object('ref', 'welcome', 'title', 'Send the welcome email', 'role', 'hr',
                         'due_days', 1)));
  if custom.checklist_refusal(v_spec) is not null then
    raise exception '1c: the checklist the product describes is refused: %', custom.checklist_refusal(v_spec);
  end if;
  v_res := custom.checklist_declare(v_org, v_spec);
  v_tpl := (v_res ->> 'template_id')::uuid;
  if (v_res ->> 'steps')::integer <> 4 or (v_res ->> 'roles')::integer <> 2 then
    raise exception '1c: stored, but as % steps and % roles', v_res ->> 'steps', v_res ->> 'roles';
  end if;
  if v_res ->> 'message' not like '%starts on its own whenever a new record arrives%' then
    raise exception '1c: it does not say what starts it: %', v_res ->> 'message';
  end if;
  raise notice '1c PASS — %', v_res ->> 'message';

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 2 — A NEW HIRE ARRIVES AND THE RUN STARTS ON ITS OWN. Nobody pressed anything.
  select count(*) into v_n from custom.checklist_runs(v_org, v_people, null, true, 100);
  if v_n <> 0 then
    raise exception '2: there were already % runs before the hire existed', v_n;
  end if;

  v_hire := custom.record_write(v_org, v_people, jsonb_build_object(
    'name', 'Priya Raman', 'start_date', '2026-10-05'));

  select count(*) into v_n from custom.checklist_runs(v_org, v_people, null, true, 100);
  if v_n <> 1 then
    raise exception '2: a new hire arrived and % run(s) started', v_n;
  end if;
  select r.run_id, r.name, r.step_count, r.done, r.origin, r.about
    into v_row
    from custom.checklist_runs(v_org, v_people, v_hire, true, 100) r;
  v_run := v_row.run_id;
  if v_row.step_count <> 4 or v_row.done <> 0 or v_row.origin <> 'record_created' then
    raise exception '2: the run is % of % done, started by %', v_row.done, v_row.step_count, v_row.origin;
  end if;
  if v_row.about <> 'Priya Raman' then
    raise exception '2: the run does not know who it is about: %', v_row.about;
  end if;
  raise notice '2 PASS — "%" started by itself: % steps, % done, about %.',
    v_row.name, v_row.step_count, v_row.done, v_row.about;

  -- 2b — the SAME record written again does not get onboarded twice.
  perform custom.record_update(v_org, v_hire, jsonb_build_object('start_date', '2026-10-06'), null);
  select count(*) into v_n from custom.checklist_runs(v_org, v_people, v_hire, true, 100);
  if v_n <> 1 then
    raise exception '2b: editing the hire produced % runs', v_n;
  end if;
  raise notice '2b PASS — editing the record did not start a second run.';

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 3 — TWO PEOPLE, REAL DATES, REAL OWNERS.
  for v_row in select * from custom.checklist_run(v_org, v_run) order by step_order loop
    if v_row.ref = 'contract' then v_contract := v_row.step_id; end if;
    if v_row.ref = 'laptop'   then v_laptop   := v_row.step_id; end if;
    if v_row.ref = 'desk'     then v_desk     := v_row.step_id; end if;
    if v_row.ref = 'welcome'  then v_welcome  := v_row.step_id; end if;
    if v_row.assignee_user_id is null then
      raise exception '3: step "%" landed with nobody on it', v_row.title;
    end if;
    if v_row.due_on is null then
      raise exception '3: step "%" landed with no date', v_row.title;
    end if;
    raise notice '3    % · % · due % · %', v_row.step_order, v_row.title,
      to_char(v_row.due_on, 'YYYY-MM-DD'), v_row.assignee_name;
  end loop;

  select count(*) into v_n from custom.checklist_run(v_org, v_run) r where r.assignee_user_id = c_admin;
  if v_n <> 2 then raise exception '3: admin@admin.com holds % of the four steps', v_n; end if;
  select count(*) into v_n from custom.checklist_run(v_org, v_run) r where r.assignee_user_id = c_dana;
  if v_n <> 2 then raise exception '3: test@test.com holds % of the four steps', v_n; end if;

  -- The dates come from the offsets, not from a default: day 0, day 2, day 3, day 1.
  select count(*) into v_n
    from custom.checklist_run(v_org, v_run) r
   where date_trunc('day', r.due_on) = date_trunc('day', now())
         + (case r.ref when 'contract' then 0 when 'laptop' then 2
                       when 'desk' then 3 else 1 end || ' days')::interval;
  if v_n <> 4 then
    raise exception '3: % of four steps are due on the day their offset says', v_n;
  end if;
  raise notice '3 PASS — four steps, two owners, four dates that come from the offsets.';

  -- 3b — AND THEY ARE IN THE ONE INBOX, as work items, not as a checklist-shaped queue.
  select count(*) into v_n from custom.work_inbox(v_org, 50, 0, false) i where i.kind = 'assignment';
  if v_n <> 2 then
    raise exception '3b: admin@admin.com opens the inbox and sees % assignments', v_n;
  end if;
  perform set_config('request.jwt.claims', c_dana_j, true);
  select count(*) into v_n from custom.work_inbox(v_org, 50, 0, false) i where i.kind = 'assignment';
  if v_n <> 2 then
    raise exception '3b: test@test.com opens the inbox and sees % assignments', v_n;
  end if;
  select i.title into v_txt from custom.work_inbox(v_org, 50, 0, false) i
   where i.kind = 'assignment' order by i.due_on limit 1;
  if v_txt <> 'Order the laptop' then
    raise exception '3b: the first thing in her inbox is "%"', v_txt;
  end if;
  raise notice '3b PASS — two steps each, in the one inbox. Hers opens with "%".', v_txt;

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 4 — A STEP REFUSES TO BE TICKED EARLY, IN PLAIN WORDS. Still test@test.com.
  begin
    perform custom.checklist_step_complete(v_org, v_laptop,
                                           jsonb_build_object('serial_number', 'C02XK1TEST'));
    raise exception '4: the laptop was ordered before the contract was sent';
  exception when check_violation then
    get stacked diagnostics v_caught = message_text;
    if v_caught not like '%Order the laptop is waiting on Send the contract%'
       or v_caught not like '%Finish that step first%' then
      raise exception '4: refused, but not in words a person would use: %', v_caught;
    end if;
  end;
  raise notice '4 PASS — %', v_caught;

  -- 4b — AND THE SAME REFUSAL THROUGH THE STATE DOOR. This is the clause that says the rule is
  --      closed rather than guarded beside: `custom.work_set_state` is a door she holds, and it
  --      meets the same sentence.
  select s.state_id into v_done
    from custom.work_record_states(v_org, v_laptop) s where s.name = 'Done';
  select s.state_id into v_state
    from custom.work_record_states(v_org, v_laptop) s where s.name = 'In progress';
  perform custom.work_set_state(v_org, v_laptop, v_state);
  begin
    perform custom.work_set_state(v_org, v_laptop, v_done);
    raise exception '4b: the state door ticked a step the checklist door refuses';
  exception when check_violation then
    get stacked diagnostics v_caught = message_text;
    if v_caught not like '%waiting on Send the contract%' then
      raise exception '4b: refused, but for another reason: %', v_caught;
    end if;
  end;
  raise notice '4b PASS — the same sentence through custom.work_set_state: %', v_caught;

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 5 — WHAT A STEP ASKS FOR IS CHECKED. Back to admin@admin.com, who holds the contract.
  perform set_config('request.jwt.claims', c_admin_j, true);
  begin
    perform custom.checklist_step_complete(v_org, v_contract, '{}'::jsonb);
    raise exception '5: the contract step closed with nothing in it';
  exception when check_violation then
    get stacked diagnostics v_caught = message_text;
    if v_caught not like '%say what you did%' then
      raise exception '5: refused, but not usefully: %', v_caught;
    end if;
  end;
  raise notice '5 PASS — %', v_caught;

  v_res := custom.checklist_step_complete(v_org, v_contract,
             jsonb_build_object('note', 'Signed contract sent to priya@willowcreekmontessori.com on the 20th.'));
  if not (v_res ->> 'completed')::boolean or (v_res ->> 'steps_left')::integer <> 3 then
    raise exception '5b: the contract step answered %', v_res;
  end if;
  raise notice '5b PASS — %', v_res ->> 'message';

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 6 — NOW THE LAPTOP UNBLOCKS, AND ITS OWN ANSWER IS STILL REQUIRED.
  perform set_config('request.jwt.claims', c_dana_j, true);
  select r.refusal into v_txt from custom.checklist_run(v_org, v_run) r where r.ref = 'laptop';
  if v_txt not like '%Serial number%' then
    raise exception '6: with the contract done, the laptop says "%"', v_txt;
  end if;
  begin
    perform custom.checklist_step_complete(v_org, v_laptop, '{}'::jsonb);
    raise exception '6: the laptop step closed with no serial number';
  exception when check_violation then
    get stacked diagnostics v_caught = message_text;
  end;
  if v_caught not like '%needs Serial number filled in%' then
    raise exception '6: refused, but not usefully: %', v_caught;
  end if;
  raise notice '6 PASS — %', v_caught;

  v_res := custom.checklist_step_complete(v_org, v_laptop,
             jsonb_build_object('serial_number', 'C02XK1TESTMAC'));
  if not (v_res ->> 'completed')::boolean then raise exception '6b: %', v_res; end if;
  v_res := custom.checklist_step_complete(v_org, v_desk, '{}'::jsonb);
  if not (v_res ->> 'completed')::boolean then raise exception '6c: %', v_res; end if;
  raise notice '6b PASS — % then %', 'Order the laptop', v_res ->> 'message';

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 7 — THE MEMBER SEES HER OWN WORK AND NOT SOMEBODY ELSE'S.
  -- Still test@test.com. The welcome email is admin's; she may read the run she is in, and she
  -- may NOT finish his step.
  select r.may_complete into v_row from custom.checklist_run(v_org, v_run) r where r.ref = 'welcome';
  if v_row.may_complete then
    raise exception '7: test@test.com may finish a step that was never given to her';
  end if;
  select r.may_complete into v_row from custom.checklist_run(v_org, v_run) r where r.ref = 'desk';
  if not v_row.may_complete then
    raise exception '7: test@test.com may not finish the step she was given';
  end if;
  begin
    perform custom.checklist_step_complete(v_org, v_welcome, '{}'::jsonb);
    raise exception '7b: she finished a step nobody gave her';
  exception when insufficient_privilege then
    get stacked diagnostics v_caught = message_text;
  end;
  if v_caught not like '%do not have access%' then
    raise exception '7b: refused, but for the wrong reason: %', v_caught;
  end if;
  raise notice '7 PASS — she may finish hers and not his: %', v_caught;

  -- 7c — and somebody in ANOTHER organization is told THAT, not that they cannot open a
  --      checklist they were never allowed to know exists (census 1, fixed by
  --      checklists_the_start_door_names_the_wall.sql).
  begin
    perform custom.checklist_start(gen_random_uuid(), v_tpl, null, '{}'::jsonb, null);
    raise exception '7c: a stranger started this checklist in an organization of their own';
  exception when insufficient_privilege then
    get stacked diagnostics v_caught = message_text;
  end;
  if v_caught not like '%not a member of that organization%' then
    raise exception '7c: refused, but not by naming the wall: %', v_caught;
  end if;
  raise notice '7c PASS — %', v_caught;

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 8 — THE LAST STEP CLOSES THE RUN.
  perform set_config('request.jwt.claims', c_admin_j, true);
  select r.closed_at into v_row from custom.checklist_runs(v_org, v_people, v_hire, true, 10) r;
  if v_row.closed_at is not null then
    raise exception '8: the run was already closed with a step still open';
  end if;
  v_res := custom.checklist_step_complete(v_org, v_welcome, '{}'::jsonb);
  if not (v_res ->> 'run_closed')::boolean then
    raise exception '8: the last step was finished and the run answered %', v_res;
  end if;
  select r.done, r.step_count, r.closed_at, r.next_step into v_row
    from custom.checklist_runs(v_org, v_people, v_hire, true, 10) r;
  if v_row.done <> 4 or v_row.step_count <> 4 or v_row.closed_at is null then
    raise exception '8: % of % done, closed_at %', v_row.done, v_row.step_count, v_row.closed_at;
  end if;
  if v_row.next_step is not null then
    raise exception '8: a closed run still says the next step is "%"', v_row.next_step;
  end if;
  raise notice '8 PASS — %  (% of %, closed %)', v_res ->> 'message',
    v_row.done, v_row.step_count, to_char(v_row.closed_at, 'HH24:MI:SS');

  -- 8b — and it re-opens honestly if somebody pulls a step back.
  select s.state_id into v_state from custom.work_record_states(v_org, v_welcome) s
   where s.name = 'In progress';
  perform custom.work_set_state(v_org, v_welcome, v_state);
  select r.closed_at, r.done into v_row from custom.checklist_runs(v_org, v_people, v_hire, true, 10) r;
  if v_row.closed_at is not null or v_row.done <> 3 then
    raise exception '8b: a step came back out of Done and the run still reads closed % / done %',
      v_row.closed_at, v_row.done;
  end if;
  raise notice '8b PASS — a step pulled back re-opened the run: 3 of 4.';

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 9 — THE SECOND SENTENCE. The expert changes one step, and the checklist they already
  -- have is the one that changes — no second template, no second store.
  v_spec := jsonb_set(v_spec, '{steps,2,due_days}', '5'::jsonb);
  v_res := custom.checklist_declare(v_org, v_spec, v_tpl);
  if (v_res ->> 'created')::boolean then
    raise exception '9: changing a step made a second checklist';
  end if;
  select count(*) into v_n from custom.checklist_templates(v_org, v_people, 100);
  if v_n <> 1 then raise exception '9: there are now % checklists about People', v_n; end if;
  if (custom.checklist_template_shape(v_org, v_tpl) #>> '{steps,2,due_days}') <> '5' then
    raise exception '9: the change did not stick';
  end if;
  select t.open_runs, t.total_runs into v_row from custom.checklist_templates(v_org, v_people, 100) t;
  if v_row.total_runs <> 1 or v_row.open_runs <> 1 then
    raise exception '9: the checklist reports % open of % runs', v_row.open_runs, v_row.total_runs;
  end if;
  raise notice '9 PASS — one checklist, changed in place, with % open run of %.',
    v_row.open_runs, v_row.total_runs;

  raise notice 'ALL PARTS PASSED — rolling back.';
end
$t$;

rollback;
