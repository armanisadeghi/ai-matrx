-- W3-WORK — CHECK C-44, THE WORK LAYER, PROVEN. REC-69 · REC-70 · REC-71.
-- ON THE MAIN DATABASE, FROM THE SEAT `authenticated` WHEREVER A DOOR EXISTS.
--
-- RUN IT:
--   PSQL="$(node node_modules/tsx/dist/cli.mjs scripts/lib/psql-path.ts --print)"
--   "$PSQL" "<the main database DSN>" -v ON_ERROR_STOP=1 \
--     -f scripts/campaign-tests/w3_work_c44.sql
--
-- IT IS NOT A MIGRATION: it lives outside `migrations/`, no sweep can see it, and it ROLLS
-- BACK. Everything it makes — one disposable organization, its memberships, its Home, its
-- Tables, its Fields, its records, its templates, its slot holds and one knob override —
-- disappears with it.
--
-- ══════════════════════════════════════════════════════════════════════════════════════
-- 🚨 WHAT TAKING THE SEAT FOUND, AND IT IS THE HEADLINE OF THIS FILE:
--     NOT ONE VERB OF THE WORK LAYER CAN BE CALLED BY A SIGNED-IN PERSON.
-- ══════════════════════════════════════════════════════════════════════════════════════
-- Measured on the main database on 2026-09-19 (lane ORG-DELETE) and asserted as a census in
-- PART 0b below. All nineteen `custom.work_*` functions plus `custom._work_shape_guard`:
--   · are SECURITY INVOKER and read and write `custom.record` as the caller;
--   · hold NO `EXECUTE` grant for `authenticated` — the seat gets
--     `42501 permission denied for function work_take_assignment` before any of them looks
--     at anything;
--   · ask NO access question: not one calls `custom.assert_client_may_reach`,
--     `custom.assert_client_may_open` or `custom.assert_client_may_change`, so the ladder is
--     never consulted about who is asking;
--   · carry NO row in `platform.client_callable_door` — neither a declared client door nor a
--     stated server-only reason. Zero rows for `work%`.
-- So "whose turn is it", "instantiate this checklist" and "hold this room" — REC-69, REC-70
-- and REC-71, three things whose entire subject is a person on a screen — exist only for an
-- operator. Making them reachable is not a spelling change: each verb needs SECURITY DEFINER,
-- the ladder question that names the record or the Table it is about, an EXECUTE grant and a
-- `platform.client_callable_door` row saying which. That is a door design, and it is written
-- up here rather than guessed at by a test lane. Granting EXECUTE alone would NOT fix it —
-- SECURITY INVOKER over `custom.record` fails the same way `platform.relation_set` does (T9).
--
-- THEREFORE THIS FILE IS HONEST ABOUT WHERE IT SITS. It takes the seat in PART 0, PROVES it,
-- and asserts the census above from it. Every clause that HAS a client door runs from the
-- seat: the Tables (`custom.table_declare`), the columns (`custom.field_declare`,
-- `custom.applicable_fields`), the task records and every state move
-- (`custom.record_write`, `custom.record_update`), the two slot shapes the store must refuse
-- (`custom.record_write` straight at the slot Table, which is what fires
-- `zz_w3_work_shape_guard`), and PART 4's live door. The clauses that can only be asked of a
-- `custom.work_*` verb step OUT of the seat, say so at the point it happens, and are marked
-- OPERATOR — they assert nothing about what a person may do, because today a person may do
-- none of it.
--
-- 🚨 ALSO RE-POINTED. It used to refuse to run anywhere but the rehearsal branch. The owner's
-- 2026-09-18 ruling is that there is no production: everything is the main database. It now
-- runs there, on a DISPOSABLE organization of its own rather than inside the Matrx System
-- organization, so it cannot collide with anybody's live data.
--
-- 🚨 ONE CLAUSE CHANGED BECAUSE THE MECHANISM DID (and it is not a weakening). PART 3 used to
-- assert that with the knob `custom/field_index_guard` off, declaring slots is refused
-- `feature_not_supported`. On the main database `custom.work_slots_declare` no longer reads
-- that knob at all: B1's move put it behind the organization's OWN store switch, and it
-- refuses `0A000` — "the database cannot be asked to decide a double-booking" — while
-- `custom/system_enabled` is off for the organization. PART 3 now asserts THAT refusal, by
-- its own sentence, against the same positive control.
--
-- ITS RED TWIN is `scripts/campaign-tests/w3_work_red.sql`. The two clauses that CANNOT live
-- in a rolled-back transaction — REC-71's two REAL concurrent sessions and REC-70's mid-graph
-- rollback counted in autocommit — live in `scripts/campaign-tests/w3_work_parallel.sh`.
--
-- WHAT MAKES IT FAIL — THE CHANGE, NAMED (rule 3): take `next` out of `custom.work_states()`
-- and PART 1's forbidden move lands; let `custom.work_template_refusal` accept `referenced`
-- and PART 2's refusal disappears while an owned edge is written in its place; drop the
-- `unique` from the slot Field in `custom.work_slots_declare` and PART 3's second hold
-- commits; take the `custom.assert_store_door` call out of `custom._work_shape_guard` and
-- PART 4's seated write lands in a switched-off store.

\set ON_ERROR_STOP on
\timing off

begin;
set local lock_timeout = '60s';
set local statement_timeout = '240s';

do $t$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_dana    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_dana_j  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_org     uuid := gen_random_uuid();
  v_home    uuid;
  v_table   uuid;
  v_take    jsonb;
  v_again   jsonb;
  v_states  uuid;
  v_person  uuid;
  v_rec     uuid;
  v_rec2    uuid;
  v_ns      uuid;
  v_ip      uuid;
  v_done    uuid;
  v_row     record;
  v_turn    integer;
  v_tpl     uuid;
  v_inst    jsonb;
  v_ids     uuid[];
  v_log     jsonb;
  v_slots   jsonb;
  v_stable  uuid;
  v_idx     text;
  v_hold    jsonb;
  v_h2      jsonb;
  v_msg     text;
  v_st      text;
  v_n       bigint;
  v_doors   text[];
  v_fn      record;
  v_boss    text := current_user;   -- the connected role, for everything no client door covers
begin
  if (pg_control_system()).system_identifier <> 7642734024280108049 then
    raise exception 'w3_work_c44.sql runs on the MAIN database only, and this is %',
                    (pg_control_system()).system_identifier;
  end if;

  -- ════════════════════════════════════════════════════════════════════════════
  -- THE FIXTURES NO CLIENT DOOR COVERS, as the connected role. Nothing asserted.
  -- ════════════════════════════════════════════════════════════════════════════
  perform set_config('app.actor_system', 'campaign-test/w3_work_c44', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Meridian Auto Body Work C44', 'meridian-auto-body-work-c44-' || substr(v_org::text, 1, 8), 'MWC', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org, 'organization', v_org, c_admin, 'owner',  'active'),
    (v_org, 'organization', v_org, c_dana,  'member', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom','system_enabled','organization', v_org, v_org, 'true'::jsonb, 'w3_work_c44');
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name', 'Home')) returning id into v_home;

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 0 — THE SEAT.
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
  raise notice 'PART 0 PASSED — the seat is `authenticated`, the ladder sees a client, and custom.record refuses a direct read.';

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 0b — THE FINDING, AS A CENSUS, FROM THE SEAT. The work layer has no
  --           client door at all. Every line of this part is a measurement, and
  --           the day somebody BUILDS the door every line of it turns red — which
  --           is the point: this file must then be rewritten to run PARTS 1-4
  --           from the seat rather than beside it.
  -- ════════════════════════════════════════════════════════════════════════════
  -- (a) NOT ONE OF THEM HOLDS AN EXECUTE GRANT for a signed-in person. The catalogue is
  --     readable from the seat, so this is asked from it.
  select array_agg(p.proname order by p.proname) into v_doors
    from pg_proc p
   where p.pronamespace = 'custom'::regnamespace
     and (p.proname like 'work\_%' or p.proname = '_work_shape_guard')
     and has_function_privilege('authenticated', p.oid, 'EXECUTE');
  if coalesce(array_length(v_doors, 1), 0) <> 0 then
    raise exception '0b (a): the work layer has grown a client grant since this was measured (%). This file assumes it has none, and every OPERATOR banner below is now wrong: rewrite those parts to run from the seat.',
                    array_to_string(v_doors, ', ');
  end if;

  -- (b) NOT ONE OF THEM ASKS THE LADDER WHO IS CALLING.
  select array_agg(p.proname order by p.proname) into v_doors
    from pg_proc p
   where p.pronamespace = 'custom'::regnamespace
     and p.proname like 'work\_%'
     and p.prosrc ~ 'assert_client_may_(reach|open|change)';
  if coalesce(array_length(v_doors, 1), 0) <> 0 then
    raise exception '0b (b): a work verb has grown an access question (%). See (a).', array_to_string(v_doors, ', ');
  end if;

  -- (c) NOT ONE OF THEM CARRIES A ROW in platform.client_callable_door — so the store does
  --     not say it is a client door, and does not say why it is server-only either. That
  --     silence is the defect: it is the difference between "not built yet" and "decided".
  --     OUT OF THE SEAT: `platform.client_callable_door` is the platform's own register and
  --     holds no client grant. This is a fact about the register, not about what a person may
  --     do, and it asserts nothing while out.
  perform set_config('role', v_boss, true);
  select count(*) into v_n from platform.client_callable_door
   where schema_name = 'custom' and (function_name like 'work\_%' or function_name = '_work_shape_guard');
  if v_n <> 0 then
    raise exception '0b (c): the work layer has grown % row(s) in platform.client_callable_door. See (a).', v_n;
  end if;
  perform set_config('role', 'authenticated', true);

  -- (d) AND THE SEAT ACTUALLY MEETS THE WALL, on the four verbs PARTS 1-4 are about, so this
  --     census is not a catalogue query that happens to agree with itself.
  foreach v_msg in array array[
      format('select custom.work_take_assignment(%L::uuid, %L::uuid)', v_org, v_org),
      format('select count(*) from custom.work_whose_turn(%L::uuid, %L::uuid)', v_org, v_org),
      format('select custom.work_slots_declare(%L::uuid, %L, %L, %L::uuid)', v_org, 'Bay Schedule Probe', 'bay_schedule_probe', v_org),
      format('select custom.work_template_declare(%L::uuid, %L, %L::jsonb)', v_org, 'Probe Template', '{"nodes":[],"relations":[]}')]
  loop
    begin
      execute v_msg;
      raise exception '0b (d): a signed-in person was answered by `%`. See (a).', v_msg;
    exception
      when insufficient_privilege then null;   -- 42501 permission denied for function
      when others then
        get stacked diagnostics v_st = returned_sqlstate;
        raise exception '0b (d): `%` refused the seat with % rather than 42501, so the wall is not the missing grant this census is about.', v_msg, v_st;
    end;
  end loop;
  raise notice 'PART 0b — THE FINDING, MEASURED FROM THE SEAT: 0 of the 20 custom.work_* functions hold EXECUTE for `authenticated`, 0 ask the ladder who is calling, 0 carry a row in platform.client_callable_door, and all four entry verbs answer a signed-in person with 42501. REC-69, REC-70 and REC-71 are unreachable from a browser.';
  raise notice '';

  -- ════════════════════════════════════════════════════════════════════════════════════
  -- PART 1 — REC-69. THE ASSIGNMENT FIELDS, AND "WHOSE TURN IS IT" AS ONE QUERY.
  -- ════════════════════════════════════════════════════════════════════════════════════
  -- The Table and its one column are the person's, through the doors.
  v_table := custom.table_declare(v_org, jsonb_build_object(
    'name','Body Shop Tasks','slug','body_shop_tasks','type','entity',
    'label_singular','Task','label_plural','Tasks','title_field','title',
    'display','page','weight','light','ordered',false,'row_order','sorted',
    'default_sort','[]'::jsonb,'agent_writable',true,'retention_days',365,
    'fields', jsonb_build_array(jsonb_build_object('name','title')),
    'parent_id', v_home::text));
  perform custom.field_declare(v_org, v_table, jsonb_build_object(
    'key','title','label','Title','plain','text','sort',10));

  -- ── OPERATOR, because no person can call these ───────────────────────────────────────
  -- `custom.work_has_assignment` and `custom.work_take_assignment` hold no EXECUTE grant for
  -- `authenticated` (PART 0b). Nothing asserted between here and the banner that ends this
  -- block is a statement about what a signed-in person may do.
  perform set_config('role', v_boss, true);

  if custom.work_has_assignment(v_org, v_table) then
    raise exception 'PART 1 — a Table that has taken nothing reports that it holds the assignment fields';
  end if;

  v_take   := custom.work_take_assignment(v_org, v_table);
  v_states := (v_take ->> 'state_table_id')::uuid;
  if (v_take ->> 'fields_created')::int <> 3 or (v_take ->> 'states_created')::int <> 5 then
    raise exception 'PART 1 — taking the kernel fields created % field(s) and % state(s), and it is three and five',
                    v_take ->> 'fields_created', v_take ->> 'states_created';
  end if;
  if not custom.work_has_assignment(v_org, v_table) then
    raise exception 'PART 1 — the fields were created and the Table does not report holding them';
  end if;
  raise notice 'PART 1 (OPERATOR) —   take: % field(s), % state(s), declared on the Table as %',
               v_take ->> 'fields_created', v_take ->> 'states_created', v_take -> 'declared_on_table';

  -- IDEMPOTENT, and it is a positive control for the count above rather than an absence:
  -- the second take reports `taken: false` AND writes zero of both.
  v_again := custom.work_take_assignment(v_org, v_table);
  if (v_again ->> 'taken')::boolean
     or (v_again ->> 'fields_created')::int <> 0 or (v_again ->> 'states_created')::int <> 0 then
    raise exception 'PART 1 — taking twice wrote something: %', v_again;
  end if;
  raise notice 'PART 1 (OPERATOR) —   taking twice: taken=%, fields_created=%, states_created=%',
               v_again ->> 'taken', v_again ->> 'fields_created', v_again ->> 'states_created';

  select count(*) into v_n
    from custom.record f
   where f.organization_id = v_org and f.table_id = custom.field_kernel_id()
     and nullif(f.data ->> 'entity_definition_id','')::uuid = v_table
     and f.data ->> 'key' in ('assignee','due_date','status')
     and coalesce((f.data ->> 'promoted')::boolean,false);
  if v_n <> 3 then
    raise exception 'PART 1 — % of the three assignment Fields are in the store as promoted Fields', v_n;
  end if;
  for v_fn in select p.field_key, p.parity_type, p.is_unique, p.indexable, p.index_name
                from custom.promoted_fields(v_org, v_table) p loop
    raise notice 'PART 1 (OPERATOR) —   promoted Field % is a %, indexable=%, index %',
                 v_fn.field_key, v_fn.parity_type, v_fn.indexable, v_fn.index_name;
  end loop;

  select id into v_ns   from custom.record where organization_id=v_org and table_id=v_states and data->>'name'='Not started';
  select id into v_ip   from custom.record where organization_id=v_org and table_id=v_states and data->>'name'='In progress';
  select id into v_done from custom.record where organization_id=v_org and table_id=v_states and data->>'name'='Done';

  perform set_config('role', 'authenticated', true);
  -- ── back in the seat ─────────────────────────────────────────────────────────────────

  -- THE THREE FIELDS ARE ORDINARY FIELDS — and that is a claim about what a PERSON sees, so
  -- it is asked of the door that answers a person "what are this Table's columns". The
  -- operator census above says they are promoted; this says they are the Table's own columns
  -- on somebody's screen, beside the one the person declared.
  select count(*) into v_n
    from custom.applicable_fields(v_org, v_table, null) f
   where f.data ->> 'key' in ('title','assignee','due_date','status');
  if v_n <> 4 then
    raise exception 'PART 1 — a person asking this Table for its columns is told % of title, assignee, due_date and status', v_n;
  end if;

  -- THE RECORDS, written the way a person writes them. A Person record, one assigned and
  -- overdue, one nobody has, one already finished — a real mix, so the one query below is
  -- not answering about a single row that could be right by accident.
  v_person := custom.record_write(v_org, custom.person_kernel_id(),
                jsonb_build_object('_actor','user','name','Dana Ops'));
  v_rec := custom.record_write(v_org, v_table, jsonb_build_object(
    '_actor','user','title','Send the quote','assignee', v_person::text,
    'due_date','2026-09-10','status', v_ns::text));
  v_rec2 := custom.record_write(v_org, v_table, jsonb_build_object(
    '_actor','user','title','Nobody has this yet','status', v_ns::text));
  perform custom.record_write(v_org, v_table, jsonb_build_object(
    '_actor','user','title','Already shipped','assignee', v_person::text,'status', v_done::text));

  -- THE ACTION STATES, MOVED THROUGH THE DOOR A PERSON USES. `custom.record_update` fires
  -- the same `zz_w3_work_shape_guard` the operator's UPDATE does, so this is the state model
  -- asked the way it is actually asked. An allowed move lands; the one the model forbids is
  -- refused, naming both states; a status that is not a status at all is refused too.
  perform custom.record_update(v_org, v_rec,
    jsonb_build_object('_actor','user','status', v_ip::text));
  if (custom.read_record(v_org, v_rec, true) -> 'status') #>> '{}' <> v_ip::text then
    raise exception 'PART 1 — an allowed move did not land';
  end if;
  raise notice 'PART 1 —   allowed move (from the seat): Not started -> In progress landed.';

  -- THE FORBIDDEN MOVE is taken on the record still sitting at Not started, from which the
  -- model allows In progress and Cancelled and nothing else.
  begin
    perform custom.record_update(v_org, v_rec2,
      jsonb_build_object('_actor','user','status', v_done::text));
    raise exception 'PART 1 — a state the model forbids was accepted';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%Not started%' or v_msg not like '%Done%' then
      raise exception 'PART 1 — the forbidden move was refused, but not by name. It read: %', v_msg;
    end if;
    raise notice 'PART 1 —   forbidden move REFUSED (from the seat): %', v_msg;
  end;

  -- AND A STATE THAT IS NOT A STATE AT ALL is refused by the store's own option-membership
  -- check, which is what makes the workflow a Table rather than an enum.
  begin
    perform custom.record_update(v_org, v_rec2,
      jsonb_build_object('_actor','user','status', gen_random_uuid()::text));
    raise exception 'PART 1 — a status that is not one of this table''s choices was accepted';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    raise notice 'PART 1 —   a status off the list REFUSED (from the seat): %', v_msg;
  end;

  -- ── OPERATOR again: "whose turn is it" is the one query C-44 names, and no person can ask
  --    it. Everything it reports below is about records a person DID write, from the seat.
  perform set_config('role', v_boss, true);
  v_turn := 0;
  for v_row in select * from custom.work_whose_turn(v_org, v_table) loop
    v_turn := v_turn + 1;
    raise notice 'PART 1 (OPERATOR) —   WHOSE TURN: "%" -> % (%, status %)', v_row.title, v_row.turn, v_row.state, v_row.status;
  end loop;
  if v_turn <> 2 then
    raise exception 'PART 1 — "whose turn is it" returned % open row(s) and two are open', v_turn;
  end if;
  select count(*) into v_n from custom.work_whose_turn(v_org, v_table, true);
  if v_n <> 3 then
    raise exception 'PART 1 — including the finished record the one query returned %, and it is three', v_n;
  end if;
  if (select turn from custom.work_whose_turn(v_org, v_table) where title = 'Send the quote') <> 'Dana Ops'
     or (select state from custom.work_whose_turn(v_org, v_table) where title = 'Send the quote') <> 'overdue'
     or (select turn from custom.work_whose_turn(v_org, v_table) where title = 'Nobody has this yet') <> 'unassigned'
     or (select turn from custom.work_whose_turn(v_org, v_table, true) where title = 'Already shipped') <> 'nobody' then
    raise exception 'PART 1 — the one query named the wrong person, or the wrong state, for at least one row';
  end if;
  perform set_config('role', 'authenticated', true);

  raise notice 'PART 1 PASS — REC-69: the three kernel Fields are ordinary Fields a person is told about, taking them twice writes nothing, and one query answers whose turn it is (operator only).';
  raise notice '';

  -- ════════════════════════════════════════════════════════════════════════════════════
  -- PART 2 — REC-70. ONE ATOMIC, LOGGED ACT.
  -- ════════════════════════════════════════════════════════════════════════════════════
  -- ── OPERATOR, WHOLE PART. `custom.work_template_declare`, `custom.work_template_instantiate`,
  -- `custom.work_template_shape` and `custom.work_instantiation_shape` hold no EXECUTE grant
  -- for `authenticated` (PART 0b), so a person cannot declare a checklist or run one, and the
  -- containment this part counts has no client door that lists a graph either. Nothing between
  -- here and PART 2's banner is a statement about what a signed-in person may do.
  perform set_config('role', v_boss, true);

  v_tpl := custom.work_template_declare(v_org, 'Client onboarding', jsonb_build_object(
    'nodes', jsonb_build_array(
      jsonb_build_object('ref','project','table',v_table::text,'data',jsonb_build_object('title','Onboard Cascade Fleet Services')),
      jsonb_build_object('ref','kickoff','table',v_table::text,'data',jsonb_build_object('title','Kick-off call')),
      jsonb_build_object('ref','access', 'table',v_table::text,'data',jsonb_build_object('title','Grant access'))),
    'relations', jsonb_build_array(
      jsonb_build_object('kind','owned','from','project','to','kickoff'),
      jsonb_build_object('kind','owned','from','project','to','access'))));

  v_inst := custom.work_template_instantiate(v_org, v_tpl);
  if (v_inst ->> 'records_created')::int <> 3 or (v_inst ->> 'relations_created')::int <> 2 then
    raise exception 'PART 2 — the instantiation made % record(s) and % relation(s), and the template says three and two',
                    v_inst ->> 'records_created', v_inst ->> 'relations_created';
  end if;
  raise notice 'PART 2 (OPERATOR) —   instantiated: % records, % relations, log row %',
               v_inst ->> 'records_created', v_inst ->> 'relations_created', v_inst ->> 'instantiation_id';

  -- THE IDS DIFFER FROM THE TEMPLATE'S AND THE SHAPE MATCHES (C-44's own words), and the
  -- shape is a COMPARISON of two documents rather than an eyeball.
  select array_agg(x::uuid) into v_ids from jsonb_array_elements_text(v_inst -> 'records') x;
  if v_tpl = any (v_ids) then
    raise exception 'PART 2 — the instance carries the template''s own id';
  end if;
  if custom.work_template_shape(v_org, v_tpl)
     is distinct from custom.work_instantiation_shape(v_org, (v_inst ->> 'instantiation_id')::uuid) then
    raise exception 'PART 2 — the instance''s shape is not the template''s. template % / instance %',
                    custom.work_template_shape(v_org, v_tpl),
                    custom.work_instantiation_shape(v_org, (v_inst ->> 'instantiation_id')::uuid);
  end if;
  raise notice 'PART 2 (OPERATOR) —   shape matches, ids differ: %', custom.work_template_shape(v_org, v_tpl);

  -- THE RELATIONS ARE REAL CONTAINMENT, read back from the store rather than from the report.
  select count(*) into v_n
    from custom.record r
   where r.organization_id = v_org
     and custom.containment_parent(r.data) = (v_inst -> 'refs' ->> 'project')::uuid;
  if v_n <> 2 then
    raise exception 'PART 2 — % record(s) ended up inside the project, and the template puts two there', v_n;
  end if;
  select count(*) into v_n
    from custom.record r
   where r.organization_id = v_org and r.data_class = 'relation'
     and r.id = any (select x::uuid from jsonb_array_elements_text(v_inst -> 'relations') x)
     and r.data ->> 'kind' = 'owned' and (r.data ->> 'carrying')::boolean;
  if v_n <> 2 then
    raise exception 'PART 2 — % carrying relation row(s) exist, and the template declares two', v_n;
  end if;

  -- THE LOG. It names the template, the actor, the moment and both id arrays.
  select data into v_log from custom.record
   where organization_id = v_org and id = (v_inst ->> 'instantiation_id')::uuid
     and data_class = 'work_instantiation';
  if v_log is null or (v_log ->> 'template_id')::uuid <> v_tpl
     or jsonb_array_length(v_log -> 'records') <> 3
     or jsonb_array_length(v_log -> 'relations') <> 2
     or nullif(v_log ->> 'actor','') is null or nullif(v_log ->> 'at','') is null then
    raise exception 'PART 2 — the logged act does not say what it did: %', v_log;
  end if;
  raise notice 'PART 2 (OPERATOR) —   logged: template "%", actor %, at %, % records, % relations',
               v_log ->> 'template', v_log ->> 'actor', v_log ->> 'at',
               jsonb_array_length(v_log -> 'records'), jsonb_array_length(v_log -> 'relations');

  -- WHAT W1-REL HAS NOT BUILT IS REFUSED BY NAME rather than written as an owned edge.
  begin
    perform custom.work_template_declare(v_org, 'Reference Test Template', jsonb_build_object(
      'nodes', jsonb_build_array(jsonb_build_object('ref','a','table',v_table::text),
                                 jsonb_build_object('ref','b','table',v_table::text)),
      'relations', jsonb_build_array(jsonb_build_object('kind','referenced','from','a','to','b'))));
    raise exception 'PART 2 — a relation kind this store has no verb for was accepted';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%W1-REL%' then
      raise exception 'PART 2 — the referenced relation was refused without naming who owns it: %', v_msg;
    end if;
    raise notice 'PART 2 (OPERATOR) —   referenced relation REFUSED: %', v_msg;
  end;

  -- A GRAPH THAT FAILS PART-WAY. The third node is missing a Field the Table requires, so the
  -- store refuses it after two records already exist inside this statement. Counted here in a
  -- SUBTRANSACTION, which is the weaker half of the proof and says so: the real one is
  -- `w3_work_parallel.sh`, which runs the same template in AUTOCOMMIT and counts the rows
  -- from a session that never saw the failed statement.
  update custom.record set data = data || jsonb_build_object('required', true)
   where organization_id = v_org and table_id = custom.field_kernel_id()
     and nullif(data ->> 'entity_definition_id','')::uuid = v_table and data ->> 'key' = 'status';
  select count(*) into v_n from custom.record where organization_id = v_org and table_id = v_table;
  declare v_before bigint := v_n;
  begin
    begin
      perform custom.work_template_instantiate(v_org, custom.work_template_declare(v_org, 'Half Graph Template', jsonb_build_object(
        'nodes', jsonb_build_array(
          jsonb_build_object('ref','a','table',v_table::text,'data',jsonb_build_object('title','A','status',v_ns::text)),
          jsonb_build_object('ref','b','table',v_table::text,'data',jsonb_build_object('title','B','status',v_ns::text)),
          jsonb_build_object('ref','c','table',v_table::text,'data',jsonb_build_object('title','C'))),
        'relations', jsonb_build_array(jsonb_build_object('kind','owned','from','a','to','b')))));
      raise exception 'PART 2 — a graph whose third record is illegal was instantiated anyway';
    exception when check_violation then
      get stacked diagnostics v_msg = message_text;
      raise notice 'PART 2 (OPERATOR) —   mid-graph refusal: %', v_msg;
    end;
    select count(*) into v_n from custom.record where organization_id = v_org and table_id = v_table;
    if v_n <> v_before then
      raise exception 'PART 2 — the failed graph left % row(s) behind (% before, % after)',
                      v_n - v_before, v_before, v_n;
    end if;
    raise notice 'PART 2 (OPERATOR) —   rows in the Table before the failed graph: %, after: % - zero survived.', v_before, v_n;
  end;
  perform set_config('role', 'authenticated', true);

  raise notice 'PART 2 PASS — REC-70: one statement makes the whole graph, its relations and its log, and a failure part-way leaves nothing. OPERATOR ONLY: no person can declare or run a template.';
  raise notice '';

  -- ════════════════════════════════════════════════════════════════════════════════════
  -- PART 3 — REC-71. THE SLOT HOLD, ITS EXPIRY, AND THE INDEX THAT DECIDES.
  -- ════════════════════════════════════════════════════════════════════════════════════
  -- ── OPERATOR for every `custom.work_slot*` verb (PART 0b). The two clauses that go
  -- STRAIGHT AT THE STORE, past the verb, are the ones a defect would actually reach a person
  -- through — a rule enforced only inside `custom.work_slot_hold` is a safe path beside an
  -- unsafe one — and those are asked FROM THE SEAT through `custom.record_write`.
  perform set_config('role', v_boss, true);

  -- THE FIRST PROOF, and it is B1's mechanism rather than the retired `field_index_guard`
  -- knob: with this organization's store switched OFF the slot Table cannot be declared,
  -- because no index can be built to decide a double-booking. Switched back on is the
  -- positive control, two statements later.
  update platform.knob_override set value = 'false'::jsonb
   where feature = 'custom' and key = 'system_enabled' and scope_id = v_org;
  begin
    perform custom.work_slots_declare(v_org, 'Repair Bays', 'repair_bays', v_home);
    raise exception 'PART 3 — slots were declared while this organization''s store was switched off';
  exception when sqlstate '0A000' then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%double-booking%' then
      raise exception 'PART 3 — the refusal has to say what cannot be decided, and it said: %', v_msg;
    end if;
    raise notice 'PART 3 (OPERATOR) —   with this organization''s store switched off, declaring slots is REFUSED: %', v_msg;
  end;
  update platform.knob_override set value = 'true'::jsonb
   where feature = 'custom' and key = 'system_enabled' and scope_id = v_org;

  v_slots  := custom.work_slots_declare(v_org, 'Repair Bays', 'repair_bays', v_home);
  v_stable := (v_slots ->> 'table_id')::uuid;
  v_idx    := v_slots ->> 'index_name';
  if not (v_slots ->> 'unique')::boolean then
    raise exception 'PART 3 — the slot key was promoted without UNIQUE, so nothing decides a double-booking';
  end if;
  if v_idx is distinct from custom.work_slot_index_name(v_stable) then
    raise exception 'PART 3 — the name a caller can read ahead of time (%) is not the index that was built (%)',
                    custom.work_slot_index_name(v_stable), v_idx;
  end if;
  raise notice 'PART 3 (OPERATOR) —   slot table %, decided by %', v_stable, v_idx;

  v_hold := custom.work_slot_hold(v_org, v_stable, '2026-10-01T09:00', 'alice', interval '10 minutes');
  raise notice 'PART 3 (OPERATOR) —   hold taken: % until %', v_hold ->> 'holder', v_hold ->> 'expires_at';

  begin
    perform custom.work_slot_hold(v_org, v_stable, '2026-10-01T09:00', 'bob', interval '10 minutes');
    raise exception 'PART 3 — two holds on one slot both succeeded';
  exception when unique_violation then
    get stacked diagnostics v_msg = message_text;
    if position(v_idx in v_msg) = 0 then
      raise exception 'PART 3 — the second hold was refused, but not by the index''s own name. It read: %', v_msg;
    end if;
    raise notice 'PART 3 (OPERATOR) —   second hold REFUSED: %', v_msg;
  end;

  -- A DIFFERENT SLOT IS THE POSITIVE CONTROL: the index refuses a collision, not a booking.
  perform custom.work_slot_hold(v_org, v_stable, '2026-10-01T10:00', 'bob', interval '10 minutes');
  select count(*) into v_n from custom.work_slot_holds(v_org, v_stable);
  if v_n <> 2 then
    raise exception 'PART 3 — % hold(s) are live and two slots were booked', v_n;
  end if;
  raise notice 'PART 3 (OPERATOR) —   a different slot booked fine: % live hold(s).', v_n;

  -- THE EXPIRY FREES THE SLOT. The hold is aged past its own expiry and the same slot is
  -- taken again by somebody else - through the verb, so the sweep is the one that runs.
  update custom.record
     set data = data || jsonb_build_object('expires_at',
                 to_char((now() - interval '1 minute') at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
   where organization_id = v_org and id = (v_hold ->> 'hold_id')::uuid;
  v_h2 := custom.work_slot_hold(v_org, v_stable, '2026-10-01T09:00', 'carol', interval '10 minutes');
  if (v_h2 ->> 'expired_swept')::int < 1 then
    raise exception 'PART 3 — the slot was retaken without any expired hold being let go: %', v_h2;
  end if;
  if (select holder from custom.work_slot_holds(v_org, v_stable) where slot_key = '2026-10-01T09:00') <> 'carol' then
    raise exception 'PART 3 — the expired slot was retaken and the store still says somebody else holds it';
  end if;
  raise notice 'PART 3 (OPERATOR) —   after expiry the same slot was retaken by % (% expired hold swept).',
               v_h2 ->> 'holder', v_h2 ->> 'expired_swept';

  -- A HOLD THAT HAS ALREADY RUN OUT, refused by the verb.
  begin
    perform custom.work_slot_hold(v_org, v_stable, '2026-10-01T12:00', 'mallory', interval '-1 minute');
    raise exception 'PART 3 — a hold that had already expired was accepted';
  exception when invalid_parameter_value then
    get stacked diagnostics v_msg = message_text;
    raise notice 'PART 3 (OPERATOR) —   hold already expired REFUSED by the verb: %', v_msg;
  end;

  -- RELEASE frees it, and it says so rather than answering silently.
  if not custom.work_slot_release(v_org, (v_h2 ->> 'hold_id')::uuid) then
    raise exception 'PART 3 — releasing a live hold reported that it released nothing';
  end if;
  if custom.work_slot_release(v_org, (v_h2 ->> 'hold_id')::uuid) then
    raise exception 'PART 3 — releasing the same hold twice reported a second release';
  end if;
  perform custom.work_slot_hold(v_org, v_stable, '2026-10-01T09:00', 'dave', interval '10 minutes');
  raise notice 'PART 3 (OPERATOR) —   released, then retaken by dave.';

  perform set_config('role', 'authenticated', true);
  -- ── back in the seat, for the two shapes that must be refused PAST the verb ───────────
  -- A rule enforced only inside `custom.work_slot_hold` is a safe path beside an unsafe one.
  -- `custom.validate_values` accepts any parseable date, so a hold with no expiry and a hold
  -- dated in the past both reach the store and only `zz_w3_work_shape_guard` turns them away
  -- — and these go through `custom.record_write`, the door a person actually holds, so the
  -- refusal is proven where somebody could really try it.
  begin
    perform custom.record_write(v_org, v_stable, jsonb_build_object(
      '_actor','user','slot_key','2026-10-01T11:00','holder','mallory'));
    raise exception 'PART 3 — a hold with no expiry was accepted through the write door';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    raise notice 'PART 3 —   hold with no expiry REFUSED at the write door (from the seat): %', v_msg;
  end;
  begin
    perform custom.record_write(v_org, v_stable, jsonb_build_object(
      '_actor','user','slot_key','2026-10-01T13:00','holder','mallory',
      'expires_at', to_char((now()-interval '1 hour') at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')));
    raise exception 'PART 3 — a hold dated in the past was written straight into the store';
  exception when invalid_parameter_value then
    get stacked diagnostics v_msg = message_text;
    raise notice 'PART 3 —   hold already expired REFUSED at the write door (from the seat): %', v_msg;
  end;

  raise notice 'PART 3 PASS — REC-71: the index decides, by name; the expiry frees the slot; a hold without one, or dated in the past, is refused at the write door a person holds.';
  raise notice '';

  -- ════════════════════════════════════════════════════════════════════════════════════
  -- PART 4 — THE ONE DOOR PREDICATE, IN EVERY VERB AND IN THE TRIGGER.
  -- ════════════════════════════════════════════════════════════════════════════════════
  -- A CENSUS, not a list: every W3-WORK function that WRITES is read out of the catalogue and
  -- asserted to consult `custom.assert_store_door`. A verb added later without the door turns
  -- this red rather than passing quietly. The catalogue IS readable from the seat, so this
  -- stays in it.
  select array_agg(p.proname order by p.proname) into v_doors
    from pg_proc p
   where p.pronamespace = 'custom'::regnamespace
     and (p.proname like 'work\_%' or p.proname = '_work_shape_guard')
     and p.prosrc ~* '(insert|update|delete)\s+(into\s+)?custom\.record|returns trigger'
     and p.prosrc !~ 'assert_store_door';
  if coalesce(array_length(v_doors, 1), 0) > 0 then
    raise exception 'PART 4 — % W3-WORK function(s) write to the store or are triggers and never consult the door: %',
                    array_length(v_doors, 1), array_to_string(v_doors, ', ');
  end if;
  select array_agg(p.proname order by p.proname) into v_doors
    from pg_proc p
   where p.pronamespace = 'custom'::regnamespace
     and (p.proname like 'work\_%' or p.proname = '_work_shape_guard')
     and p.prosrc ~ 'assert_store_door';
  raise notice 'PART 4 —   functions consulting the one door predicate: %', array_to_string(v_doors, ', ');

  -- AND THE DOOR IS LIVE, not merely called — asked from the REAL seat rather than from a
  -- disposable probe role. The old version of this clause created `zz_w3_work_probe`, granted
  -- it the schema and every function in it, and watched it be refused; `authenticated` is
  -- that role for real, holds the write door, and is refused by this lane's own trigger the
  -- moment the organization's store is switched off. The POSITIVE CONTROL is the same write
  -- by the same seat with the switch back on.
  perform set_config('role', v_boss, true);
  update platform.knob_override set value = 'false'::jsonb
   where feature = 'custom' and key = 'system_enabled' and scope_id = v_org;
  perform set_config('role', 'authenticated', true);
  begin
    perform custom.record_write(v_org, v_stable, jsonb_build_object(
      '_actor','user','slot_key','bay-shut','holder','probe',
      'expires_at', to_char((now()+interval '1 hour') at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')));
    raise exception 'PART 4 — a signed-in person wrote a hold into a switched-off store';
  exception when insufficient_privilege then
    get stacked diagnostics v_msg = message_text;
    raise notice 'PART 4 —   a signed-in person writing into a switched-off store: %', v_msg;
  end;
  perform set_config('role', v_boss, true);
  update platform.knob_override set value = 'true'::jsonb
   where feature = 'custom' and key = 'system_enabled' and scope_id = v_org;
  perform set_config('role', 'authenticated', true);
  if custom.record_write(v_org, v_stable, jsonb_build_object(
       '_actor','user','slot_key','bay-open','holder','probe',
       'expires_at', to_char((now()+interval '1 hour') at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))) is null then
    raise exception 'PART 4 — the switch was turned back on and the same person could not write the same hold, so the refusal above was not the door';
  end if;
  raise notice 'PART 4 PASS — every W3-WORK writer and the trigger read their guard through custom.assert_store_door, and the door shuts and opens for a real signed-in seat.';
  raise notice '';

  raise notice '=== C-44 — REC-69, REC-70 and REC-71 proven on the MAIN database. Every clause that HAS a client door ran from the seat `authenticated`; every clause marked OPERATOR could not, because NOT ONE custom.work_* verb is reachable by a signed-in person (PART 0b). The two clauses that cannot live in one transaction are w3_work_parallel.sh. ===';
end
$t$;

rollback;
