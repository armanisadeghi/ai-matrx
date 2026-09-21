-- LANE WORK-DOORS — THE GREEN SUITE. The work layer reached from a browser: a record is given
-- to a person, moved along its declared states, commented on, grown from a checklist template,
-- held as a slot — and a change to it waits for somebody's yes in ONE queue that holds a
-- colleague's request and an agent's proposal side by side.
-- On the MAIN database, in one transaction that ends in ROLLBACK.
--
-- RUN IT:
--   PSQL="$(node node_modules/tsx/dist/cli.mjs scripts/lib/psql-path.ts --print)"
--   "$PSQL" "<the main database DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/workdoors_green.sql
--
-- ITS RED TWIN is `scripts/campaign-tests/workdoors_red.sql`, which runs the REAL BYTES of this
-- lane's inverse migrations and asserts each defect exactly as it stood before the fix.
--
-- THE SEAT. Every asserted clause runs as `authenticated`, the role PostgREST gives a signed-in
-- person, through doors that person reaches. PART 0 proves the seat is held AND that the census
-- ORG-DELETE's converter wrote down is now false. The only steps that leave the seat are the
-- fixture's two Home records and the one knob the slot part needs, and they assert nothing
-- while they are out.
--
-- WHAT MAKES IT FAIL — the production change, named, one per part:
--   1  revoke the grant, or make any `custom.work_*` verb SECURITY INVOKER again → the work
--      layer is back to being unreachable from a browser, which is what this lane found.
--   2  drop the `custom.share_grant` call from `custom.work_assign` → a person is handed a row
--      in her inbox and refused when she opens it.
--   3  drop `zz_w3_work_shape_guard`, or the model question from `custom.work_set_state` → a  -- matrx-real-data:allow zz_w3_work_shape_guard is a live trigger name, an ordering device, not data
--      record moves to a state the workflow forbids and nobody is told.
--   4  let the requester decide their own request, or drop the approver query → "somebody has
--      to say yes" becomes "I say yes to myself".
--   5  make `custom.work_approval_decide` mark the row without applying the change → an
--      approval that approves nothing, which is worse than no approval.
--   6  give the agent's proposal a queue of its own → the inbox stops being ONE inbox, which is
--      the whole of PRODUCTS.md row 6.
--   7  drop the unique index behind the slot key → the booking system double-books silently.
--
-- A SECOND INPUT WITH A DIFFERENT EXPECTED VALUE IN EVERY PART: PART 1's assigned record is
-- paired with the unassigned one beside it; PART 3's allowed move is paired with the forbidden
-- one; PART 4's approval is paired with the refusal `test@test.com` earns on the same row and
-- with the refusal the REQUESTER earns on her own; PART 5's applied field is paired with the
-- declined one that leaves the table alone; PART 7's hold is paired with the collision.

\set ON_ERROR_STOP on
\timing off

begin;

do $t$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_dana    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_dana_j  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_org     uuid := gen_random_uuid();
  v_name    text;
  v_home    uuid;
  v_tbl     uuid;
  v_quote   uuid;   -- the record that gets assigned, moved and re-priced
  v_other   uuid;   -- the one nobody has
  v_take    jsonb;
  v_states  uuid;
  v_started uuid;
  v_progress uuid;
  v_done    uuid;
  v_res     jsonb;
  v_appr    jsonb;
  v_appr_id uuid;
  v_agent   uuid;
  v_tpl     uuid;
  v_inst    jsonb;
  v_slots   jsonb;
  v_hold    jsonb;
  v_person  uuid;
  v_caught  text;
  v_code    text;
  v_n       integer;
  v_txt     text;
  v_row     record;
  v_boss    text := current_user;
  v_secdef  integer;
  v_granted integer;
  v_doors   integer;
  v_cmt     uuid;
  v_hist    integer;
  v_lvl     public.permission_level;
begin
  if (select system_identifier from pg_control_system()) <> 7642734024280108049 then
    raise exception 'workdoors_green.sql runs on the MAIN database only, and this is %',
      (select system_identifier from pg_control_system());
  end if;

  perform set_config('app.actor_system', 'campaign-test/workdoors_green', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  v_name := 'Rincon Plumbing Co — Millbrook Branch ' || substr(v_org::text, 1, 8);
  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, v_name, 'rincon-plumbing-millbrook-' || substr(v_org::text, 1, 8), 'RPM', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org, 'organization', v_org, c_admin, 'owner',  'active'),
    (v_org, 'organization', v_org, c_dana,  'member', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note) values
    ('custom','system_enabled','organization', v_org, v_org, 'true'::jsonb, 'workdoors_green'),
    -- THIS ORGANIZATION SHARES DELIBERATELY. Under the shipped default a member of an
    -- organization can already open every record in it, so "she was given access" would be
    -- true before anybody gave her anything and PART 1b would prove nothing. On
    -- `shared_only` a member reaches exactly what has been shared with her, which is what
    -- makes the assignment's own grant the thing under test.
    ('custom','member_default_visibility','organization', v_org, v_org, '"shared_only"'::jsonb, 'workdoors_green');

  -- The Home record is made by the onboarding path, not by a person's browser, and no client
  -- door covers it. Written before the seat is taken; no clause is asserted here.
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name', 'Home')) returning id into v_home;

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 0 — THE SEAT, AND THE CENSUS THAT USED TO BE TRUE.
  -- 0b — MEASURED BEFORE THE SEAT IS TAKEN, and it asserts no product clause: `pg_proc` and
  --      `platform.client_callable_door` are the CATALOGUE, and no client door covers reading
  --      them (`authenticated` holds no SELECT on that table, which is itself correct).
  --      THE EXACT CENSUS lane ORG-DELETE wrote down on 2026-09-20: "all 19 custom.work_*
  --      functions are SECURITY INVOKER, hold ZERO EXECUTE for authenticated and carry ZERO
  --      rows in platform.client_callable_door". Every number below is now the opposite.
  select count(*) filter (where p.prosecdef),
         count(*) filter (where has_function_privilege('authenticated', p.oid, 'EXECUTE'))
    into v_secdef, v_granted
    from pg_proc p
   where p.pronamespace = 'custom'::regnamespace
     and p.proname like 'work\_%';
  select count(*) into v_doors
    from platform.client_callable_door d
   where d.schema_name = 'custom' and d.function_name like 'work\_%' and d.signed_in_callers;
  if v_secdef < 20 or v_granted < 22 or v_doors < 22 then
    raise exception '0b: the work layer is still not reachable — % SECURITY DEFINER, % granted, % declared doors', v_secdef, v_granted, v_doors;
  end if;
  raise notice '0b PASSED — % of the work verbs are SECURITY DEFINER, % hold a client grant, % are declared doors (the census said 0, 0 and 0).', v_secdef, v_granted, v_doors;

  -- ════════════════════════════════════════════════════════════════════════════
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
  raise notice 'PART 0 PASSED — the seat is `authenticated`, the ladder sees a client, and custom.record is not readable from it.';

  -- ── One table with two records, all through the doors. ──────────────────────
  v_tbl := custom.table_declare(v_org, jsonb_build_object(
    'name','Estimates','slug','estimates','type','entity',
    'label_singular','Estimate','label_plural','Estimates','title_field','name','display','page',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,'on_delete','cascade',
    'fields', jsonb_build_array(jsonb_build_object('name','name'), jsonb_build_object('name','price')),
    'parent_id', v_home::text));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object(
    'key','name','label','Name','plain','text','sort',10));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object(
    'key','price','label','Price','plain','number','sort',20));
  v_quote := custom.record_write(v_org, v_tbl, jsonb_build_object('name','Send the quote','price',1000));
  v_other := custom.record_write(v_org, v_tbl, jsonb_build_object('name','Nobody has this yet','price',50));

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 1 — ASSIGNMENT: A PERSON, AND THE ACCESS THAT GOES WITH BEING GIVEN IT.
  -- ════════════════════════════════════════════════════════════════════════════
  v_take := custom.work_take_assignment(v_org, v_tbl);
  if not (v_take ->> 'taken')::boolean or (v_take ->> 'fields_created')::int <> 3 then
    raise exception '1a: turning assignments on for a table did not add the three fields: %', v_take;
  end if;
  v_states := (v_take ->> 'state_table_id')::uuid;
  if (v_take ->> 'states_created')::int <> 5 then
    raise exception '1a: the five shipped workflow states were not created: %', v_take;
  end if;
  -- Idempotent: a second take writes nothing and says so.
  if (custom.work_take_assignment(v_org, v_tbl) ->> 'taken')::boolean then
    raise exception '1a: taking the assignment fields twice wrote them twice';
  end if;
  raise notice '1a PASSED — assignments are on for this table: % fields, % states, and a second take writes nothing.',
    v_take ->> 'fields_created', v_take ->> 'states_created';

  -- 1b — GIVE IT TO DANA. The value AND the access, in one act.
  v_res := custom.work_assign(v_org, v_quote, c_dana, now() - interval '2 days');
  if not (v_res ->> 'assigned')::boolean then
    raise exception '1b: the record was not assigned: %', v_res;
  end if;
  v_person := (v_res ->> 'assignee')::uuid;
  if v_person is null then
    raise exception '1b: nobody was resolved as the person this was given to: %', v_res;
  end if;
  -- `custom.effective_level` is declared SERVER-ONLY, and rightly so, so the seat asks the
  -- SHARE DIALOG'S own door instead — which is the same thing a person would look at.
  select a.level into v_lvl
    from custom.share_access(v_org, v_quote) a
   where a.principal_kind = 'person' and a.principal_id = c_dana;
  if v_lvl is distinct from 'editor'::public.permission_level then
    raise exception '1b: THE WHOLE DEFECT — she was given the row and not the access. Her level is %',
      coalesce(v_lvl::text, 'none');
  end if;
  -- And she was given access to THIS row, not to the table.
  if exists (select 1 from custom.share_access(v_org, v_other) a
              where a.principal_kind = 'person' and a.principal_id = c_dana) then
    raise exception '1b: assigning one record gave her access to a record nobody assigned her';
  end if;
  raise notice '1b PASSED — "%" and her level on it is %.', v_res ->> 'message', v_lvl;

  -- 1c — ONE person record per (organization, person), never two.
  if custom.work_person(v_org, c_dana, true) <> v_person then
    raise exception '1c: asking for the same person twice made a second person record';
  end if;
  select count(*) into v_n from custom.work_list(v_org, 'mine', false, 100, 0);
  if v_n <> 0 then
    raise exception '1c: the ADMIN has 0 records assigned to him and his work list says %', v_n;
  end if;
  raise notice '1c PASSED — one person record per person, and the admin''s own work list is empty (he assigned, he did not take).';

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 2 — WHOSE TURN IS IT, FROM HER SEAT.
  -- ════════════════════════════════════════════════════════════════════════════
  perform set_config('request.jwt.claims', c_dana_j, true);

  select count(*) into v_n from custom.work_list(v_org, 'mine', false, 100, 0);
  if v_n <> 1 then
    raise exception '2a: her work list should hold the one record she was given, and it holds %', v_n;
  end if;
  select * into v_row from custom.work_list(v_org, 'mine', false, 100, 0) limit 1;
  if v_row.record_id <> v_quote or v_row.due_state <> 'overdue' or v_row.title <> 'Send the quote' then
    raise exception '2a: her work list row is wrong: % / % / %', v_row.record_id, v_row.due_state, v_row.title;
  end if;
  raise notice '2a PASSED — she sees "%" in her work, and it is %.', v_row.title, v_row.due_state;

  -- 2b — and NOT the record nobody gave her. The second input with the other answer.
  if exists (select 1 from custom.work_list(v_org, 'mine', false, 100, 0) w where w.record_id = v_other) then
    raise exception '2b: a record nobody assigned her is in her work list';
  end if;
  begin
    perform custom.read_record(v_org, v_other, true);
    raise exception '2b: she could open a record nobody shared with her';
  exception when insufficient_privilege or no_data_found then null;
  end;
  raise notice '2b PASSED — the record nobody gave her is neither in her work nor readable by her.';

  -- 2c — and she can COMMENT on what she holds (commenter is the second rung; editor clears it).
  v_cmt := custom.io_comment_write(v_org, v_quote, 'Chasing the client today.');
  if v_cmt is null or not exists (select 1 from custom.io_comments(v_org, v_quote, false) c where c.id = v_cmt) then
    raise exception '2c: her comment did not land on the record she was given';
  end if;
  raise notice '2c PASSED — she commented on her own work and the comment reads back.';

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 3 — THE ACTION STATE, AND THE MOVE THE MODEL FORBIDS.
  -- ════════════════════════════════════════════════════════════════════════════
  select s.state_id into v_started from custom.work_record_states(v_org, v_quote) s where s.name = 'Not started';
  select s.state_id into v_progress from custom.work_record_states(v_org, v_quote) s where s.name = 'In progress';
  select s.state_id into v_done from custom.work_record_states(v_org, v_quote) s where s.name = 'Done';
  if v_started is null or v_progress is null or v_done is null then
    raise exception '3a: the workflow states are not readable from her seat';
  end if;

  v_res := custom.work_set_state(v_org, v_quote, v_started);
  if v_res ->> 'state' <> 'Not started' then
    raise exception '3a: the first move did not land: %', v_res;
  end if;

  -- The screen offers the moves the model allows, and says why about the ones it does not.
  select count(*) into v_n from custom.work_record_states(v_org, v_quote) s where s.allowed;
  if v_n <> 3 then
    raise exception '3a: from Not started the model allows itself, In progress and Cancelled — 3 — and the door offered %', v_n;
  end if;
  select s.refusal into v_txt from custom.work_record_states(v_org, v_quote) s where s.name = 'Done';
  if v_txt is null or v_txt !~ 'cannot go straight to Done' then
    raise exception '3a: the door did not say why Done is not offered: %', coalesce(v_txt, '<nothing>');
  end if;
  raise notice '3a PASSED — it is Not started, % moves are offered, and Done is not, because "%".', v_n, v_txt;

  -- 3b — THE FORBIDDEN MOVE IS REFUSED, in a sentence, naming both states and the way out.
  begin
    perform custom.work_set_state(v_org, v_quote, v_done);
    raise exception '3b: a move the workflow forbids was written';
  exception when check_violation then
    get stacked diagnostics v_caught = message_text;
    if v_caught !~ 'Not started cannot go straight to Done' then
      raise exception '3b: it was refused, but not by the model: %', v_caught;
    end if;
  end;
  -- 3c — and the ALLOWED one lands. The second input with the other answer.
  v_res := custom.work_set_state(v_org, v_quote, v_progress);
  if v_res ->> 'state' <> 'In progress' then
    raise exception '3c: the allowed move did not land: %', v_res;
  end if;
  raise notice '3b/3c PASSED — "%" and the allowed move landed: %', v_caught, v_res ->> 'message';

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 4 — SHE ASKS, HE DECIDES. The approval pair.
  -- ════════════════════════════════════════════════════════════════════════════
  v_appr := custom.work_approval_request(
    v_org, v_quote,
    jsonb_build_object('kind', 'record_patch', 'patch', jsonb_build_object('price', 750)),
    'A 25% discount to close it this week.');
  v_appr_id := (v_appr ->> 'approval_id')::uuid;
  if v_appr_id is null or v_appr ->> 'state' <> 'pending' then
    raise exception '4a: the request did not file: %', v_appr;
  end if;
  if jsonb_array_length(v_appr -> 'approvers') = 0 then
    raise exception '4a: a request nobody could answer was filed anyway: %', v_appr;
  end if;
  -- NOTHING HAPPENED YET. That is the point of asking.
  if (custom.read_record(v_org, v_quote, true) ->> 'price')::numeric <> 1000 then
    raise exception '4a: asking for approval CHANGED the record, which is the opposite of asking';
  end if;
  raise notice '4a PASSED — "%" and the price is still %.', v_appr ->> 'message',
    custom.read_record(v_org, v_quote, true) ->> 'price';

  -- 4b — SHE CANNOT DECIDE HER OWN.
  if custom.work_approval_may_decide(v_org, v_appr_id) then
    raise exception '4b: the person who asked is listed as able to decide it';
  end if;
  begin
    perform custom.work_approval_decide(v_org, v_appr_id, true, 'I approve myself');
    raise exception '4b: she approved her own request';
  exception when insufficient_privilege then
    get stacked diagnostics v_caught = message_text;
  end;
  raise notice '4b PASSED — "%"', v_caught;

  -- 4c — HE DECIDES, AND THE CHANGE HAPPENS.
  perform set_config('request.jwt.claims', c_admin_j, true);
  if not custom.work_approval_may_decide(v_org, v_appr_id) then
    raise exception '4c: the owner of the organization cannot decide a request in it';
  end if;
  v_res := custom.work_approval_decide(v_org, v_appr_id, true, 'Fine for this one.');
  if not (v_res ->> 'applied')::boolean then
    raise exception '4c: approved and not applied: %', v_res;
  end if;
  if (custom.read_record(v_org, v_quote, true) ->> 'price')::numeric <> 750 then
    raise exception '4c: THE WHOLE DEFECT — it was marked approved and the record still says %',
      custom.read_record(v_org, v_quote, true) ->> 'price';
  end if;
  -- Decided once.
  begin
    perform custom.work_approval_decide(v_org, v_appr_id, false, 'changed my mind');
    raise exception '4c: an approval was decided twice';
  exception when unique_violation then null;
  end;
  raise notice '4c PASSED — "%" and the record now says %.', v_res ->> 'message',
    custom.read_record(v_org, v_quote, true) ->> 'price';

  -- 4d — HISTORY NAMES EACH STEP, in the same transaction as the decision.
  -- The timeline IS the record: every Value carries its own version, its writer and when it
  -- was written. The price is on its SECOND version because a person approved the change.
  select h.value_version into v_hist
    from custom.record_values_versioned(v_org, v_quote) h
   where h.field_key = 'price';
  if coalesce(v_hist, 0) < 2 then
    raise exception '4d: the approved price change left no version behind it — the price is on version %',
      coalesce(v_hist, 0);
  end if;
  select count(*) into v_n from custom.io_revisions(v_org, v_quote) r;
  if v_n < 3 then
    raise exception '4d: the assignment, the state moves and the approved change left only % revisions', v_n;
  end if;
  raise notice '4d PASSED — the price is on version % and the record has % revisions, each with its writer.', v_hist, v_n;

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 5 — THE AGENT'S PROPOSAL IS IN THE SAME QUEUE.
  -- ════════════════════════════════════════════════════════════════════════════
  -- This is the wait `matrx_records.RecordStore.field_propose` produces under `ask` on a table
  -- that already existed — filed, this time, instead of living only in a tool result.
  v_appr := custom.work_approval_request(
    v_org, v_tbl,
    jsonb_build_object('kind', 'field_add', 'field', jsonb_build_object(
      'key','rate_card','label','Rate card','plain','text','sort',30)),
    'The agent wants a Rate card column on a table that already existed.',
    null, 'agent', gen_random_uuid());
  v_agent := (v_appr ->> 'approval_id')::uuid;
  if v_agent is null then
    raise exception '5a: the agent''s wait did not file: %', v_appr;
  end if;
  if exists (select 1 from custom.applicable_fields(v_org, v_tbl, null) f where f.data ->> 'key' = 'rate_card') then
    raise exception '5a: the agent''s proposal ADDED the column while it was still waiting';
  end if;

  -- 5b — IT IS IN THE SAME INBOX, beside the human's, with the same verb on it.
  select count(*) into v_n from custom.work_inbox(v_org, 50, 0, false) i;
  if v_n = 0 then
    raise exception '5b: the inbox is empty and there is a proposal waiting in it';
  end if;
  if not exists (select 1 from custom.work_inbox(v_org, 50, 0, false) i
                  where i.item_id = v_agent and i.kind = 'proposal' and i.origin = 'agent' and i.actionable) then
    raise exception '5b: the agent''s proposal is not an actionable row of the one inbox';
  end if;
  raise notice '5b PASSED — the inbox holds % item(s) and the agent''s proposal is one of them, actionable.', v_n;

  -- 5c — APPROVE APPLIES IT, through the store's own doors.
  v_res := custom.work_approval_decide(v_org, v_agent, true, null);
  if not (v_res ->> 'applied')::boolean or (v_res ->> 'field_id') is null then
    raise exception '5c: the proposal was approved and no column was added: %', v_res;
  end if;
  if not exists (select 1 from custom.applicable_fields(v_org, v_tbl, null) f where f.data ->> 'key' = 'rate_card') then
    raise exception '5c: approved, and the table still has no Rate card column';
  end if;
  raise notice '5c PASSED — "%"', v_res ->> 'message';

  -- 5d — AND DECLINE LEAVES THE TABLE ALONE, saying so. The other answer.
  v_appr := custom.work_approval_request(
    v_org, v_tbl,
    jsonb_build_object('kind', 'field_add', 'field', jsonb_build_object(
      'key','margin','label','Margin','plain','number','sort',40)),
    null, null, 'agent', gen_random_uuid());
  v_res := custom.work_approval_decide(v_org, (v_appr ->> 'approval_id')::uuid, false, 'Not this one.');
  if (v_res ->> 'applied')::boolean then
    raise exception '5d: a declined proposal was applied';
  end if;
  if exists (select 1 from custom.applicable_fields(v_org, v_tbl, null) f where f.data ->> 'key' = 'margin') then
    raise exception '5d: declined, and the column is there anyway';
  end if;
  raise notice '5d PASSED — "%"', v_res ->> 'message';

  -- 5e — A MEMBER WHO IS NOT AN APPROVER SEES NO DECISION IN HER INBOX, and is refused one.
  perform set_config('request.jwt.claims', c_dana_j, true);
  if exists (select 1 from custom.work_inbox(v_org, 50, 0, true) i where i.kind in ('approval','proposal')) then
    raise exception '5e: a member who cannot approve anything has approvals in her inbox';
  end if;
  -- but her ASSIGNMENT is there, so the inbox is not simply refusing her everything.
  if not exists (select 1 from custom.work_inbox(v_org, 50, 0, false) i
                  where i.kind = 'assignment' and i.subject_id = v_quote) then
    raise exception '5e: her own assigned work is missing from her inbox';
  end if;
  raise notice '5e PASSED — her inbox holds her assignment and none of the decisions she cannot make.';

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 6 — REC-70: A CHECKLIST TEMPLATE BECOMES REAL RECORDS IN ONE ACT.
  -- ════════════════════════════════════════════════════════════════════════════
  perform set_config('request.jwt.claims', c_admin_j, true);
  v_tpl := custom.work_template_declare(v_org, 'New client onboarding', jsonb_build_object(
    'nodes', jsonb_build_array(
      jsonb_build_object('ref','kickoff','table', v_tbl::text, 'data', jsonb_build_object('name','Kick-off call','price',0)),
      jsonb_build_object('ref','survey', 'table', v_tbl::text, 'data', jsonb_build_object('name','Site survey','price',0)),
      jsonb_build_object('ref','quote',  'table', v_tbl::text, 'data', jsonb_build_object('name','Send the quote','price',0))),
    'relations', jsonb_build_array(
      jsonb_build_object('from','kickoff','to','survey'),
      jsonb_build_object('from','kickoff','to','quote'))));
  if v_tpl is null then
    raise exception '6a: the template did not declare';
  end if;
  if not exists (select 1 from custom.work_templates(v_org, 100) t where t.template_id = v_tpl and t.nodes = 3) then
    raise exception '6a: the template is not in the list a person picks from';
  end if;

  v_inst := custom.work_template_instantiate(v_org, v_tpl, jsonb_build_object(
    'kickoff', jsonb_build_object('name','Kick-off call — Borealis Foods')));
  if (v_inst ->> 'records_created')::int <> 3 or (v_inst ->> 'relations_created')::int <> 2 then
    raise exception '6b: the graph was not created whole: %', v_inst;
  end if;
  if custom.work_instantiation_shape(v_org, (v_inst ->> 'instantiation_id')::uuid)
     is distinct from custom.work_template_shape(v_org, v_tpl) then
    raise exception '6b: the instance does not have the template''s shape: % vs %',
      custom.work_instantiation_shape(v_org, (v_inst ->> 'instantiation_id')::uuid),
      custom.work_template_shape(v_org, v_tpl);
  end if;
  if custom.read_record(v_org, ((v_inst -> 'refs') ->> 'kickoff')::uuid, true) ->> 'name'
     <> 'Kick-off call — Borealis Foods' then
    raise exception '6b: the override did not reach the record it named';
  end if;
  raise notice '6a/6b PASSED — % records and % relations in one act, same shape as the template, and the override landed.',
    v_inst ->> 'records_created', v_inst ->> 'relations_created';

  -- 6c — A GRAPH THE STORE CANNOT BUILD IS REFUSED WHOLE, and nothing survives it.
  select count(*) into v_n from custom.read_records(v_org, v_tbl, true, 200, 0);
  begin
    perform custom.work_template_declare(v_org, 'Broken', jsonb_build_object(
      'nodes', jsonb_build_array(jsonb_build_object('ref','a','table', v_tbl::text)),
      'relations', jsonb_build_array(jsonb_build_object('from','a','to','a'))));
    raise exception '6c: a template that puts a record inside itself was accepted';
  exception when check_violation then
    get stacked diagnostics v_caught = message_text;
  end;
  if (select count(*) from custom.read_records(v_org, v_tbl, true, 200, 0)) <> v_n then
    raise exception '6c: the refused template still wrote rows';
  end if;
  raise notice '6c PASSED — "%" and the table still holds % records.', v_caught, v_n;

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 7 — REC-71: THE SLOT HOLD, DECIDED BY THE DATABASE.
  -- ════════════════════════════════════════════════════════════════════════════
  v_slots := custom.work_slots_declare(v_org, 'Site Visits', 'site_visits', v_home);
  if not (v_slots ->> 'unique')::boolean then
    raise exception '7a: the slot key is not kept unique, so this would double-book: %', v_slots;
  end if;
  v_hold := custom.work_slot_hold(v_org, (v_slots ->> 'table_id')::uuid,
                                  '2026-10-01T14:00', 'dana@greenlinelandscaping.com', interval '15 minutes');
  if v_hold ->> 'hold_id' is null then
    raise exception '7a: the first hold did not take: %', v_hold;
  end if;
  raise notice '7a PASSED — the slot is held, kept single by %.', v_hold ->> 'kept_single_by';

  -- 7b — THE SECOND CALLER IS REFUSED BY THE INDEX'S OWN NAME. The other answer.
  begin
    perform custom.work_slot_hold(v_org, (v_slots ->> 'table_id')::uuid,
                                  '2026-10-01T14:00', 'sam@greenlinelandscaping.com', interval '15 minutes');
    raise exception '7b: two people hold the same slot';
  exception when unique_violation then
    get stacked diagnostics v_caught = message_text;
    if v_caught !~ 'already held' or v_caught !~ (v_slots ->> 'index_name') then
      raise exception '7b: refused, but not by REC-N-12''s index: %', v_caught;
    end if;
  end;
  if (select count(*) from custom.work_slot_holds(v_org, (v_slots ->> 'table_id')::uuid)) <> 1 then
    raise exception '7b: the refused hold was written anyway';
  end if;
  raise notice '7b PASSED — "%"', v_caught;

  -- 7c — a different slot books, and releasing frees the first.
  if custom.work_slot_hold(v_org, (v_slots ->> 'table_id')::uuid,
                           '2026-10-01T15:00', 'sam@greenlinelandscaping.com', interval '15 minutes') ->> 'hold_id' is null then
    raise exception '7c: a different slot could not be booked';
  end if;
  if not custom.work_slot_release(v_org, (v_hold ->> 'hold_id')::uuid) then
    raise exception '7c: the hold could not be released';
  end if;
  if custom.work_slot_hold(v_org, (v_slots ->> 'table_id')::uuid,
                           '2026-10-01T14:00', 'sam@greenlinelandscaping.com', interval '15 minutes') ->> 'hold_id' is null then
    raise exception '7c: the released slot could not be taken';
  end if;
  raise notice '7c PASSED — a different slot books, a release frees the first, and somebody else takes it.';

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 8 — THE WALL. A stranger's organization id opens nothing.
  -- ════════════════════════════════════════════════════════════════════════════
  perform set_config('request.jwt.claims', c_dana_j, true);
  begin
    perform custom.work_take_assignment(v_org, v_tbl);
    raise exception '8a: a member with no admin on the table changed its shape';
  exception when insufficient_privilege then
    get stacked diagnostics v_caught = message_text;
  end;
  raise notice '8a PASSED — "%"', v_caught;

  raise notice 'ALL PARTS PASSED (0 the seat, 0b the census that used to be true, 1 assignment is a person AND a share, 2 whose turn it is from her seat, 3 the model refuses the move it forbids, 4 she asks and he decides and the change happens, 5 the agent''s proposal is the same queue, 6 a template becomes real records in one act, 7 the database decides a double-booking, 8 the rungs hold) — every clause from the seat `authenticated`.';
end
$t$;

rollback;
