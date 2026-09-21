-- W1-RULE-APPLY — DYN-6 and REC-16 EXECUTED against the MAIN database, from the seat of a
-- signed-in person, plus the save-time cycle refusal across Rules and merge fields.
--
-- RUN IT:
--   PSQL="$(node node_modules/tsx/dist/cli.mjs scripts/lib/psql-path.ts --print)"
--   "$PSQL" "<the main database DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/w1_rule_apply.sql
--
-- IT IS NOT A MIGRATION and never becomes one: it lives outside `migrations/`, is discovered
-- by no sweep, and its single transaction ends in ROLLBACK, so it leaves the database exactly
-- as it found it.
--
-- 🚨 RE-POINTED TO THE MAIN DATABASE (lane SEAT-SUITES, 2026-09-19). It used to run against
-- the rehearsal branch, which carries 226 functions in schema `custom` against main's 332 and
-- grants `authenticated` 29 of them against main's 103 — the store these clauses are about is
-- not there. The owner's 2026-09-18 ruling is that there is no production and everything is
-- the main database, so the guard names main's system_identifier 7642734024280108049.
-- MEASURED on main 2026-09-19: every seeded row this file needs is here — the Rule
-- conformance shape, its three Fields, its four Rules and the `square_rule` merge field.
--
-- 🚨 THE ROW ALL FOUR USES RUN AGAINST IS `11111111-0004-4000-8000-000000000101`, the one
-- `W1-RULE` stored. `V1-MODEL`'s `C-10a` (compute) and `C-10b` (membership) re-execute
-- against THAT id, and clause F below shows both uses reaching it in one transaction.
--
-- 🚨 THE SEAT. This file used to run as the role that OWNS `custom.record`, where
-- `custom.assert_client_may_reach` returns on its first line, EXECUTE grants are free,
-- SECURITY INVOKER and SECURITY DEFINER are the same thing and `custom.record` is directly
-- readable. It now takes the seat `authenticated` in PART 0 and runs EVERY CLAUSE A PERSON
-- OWNS through the door that person reaches: records are written with `custom.record_write`,
-- a RULE is saved with `custom.record_write(org, custom.rule_kernel_id(), …)`, a Rule is
-- re-sorted or re-written with `custom.record_update`, a Table and its columns are declared
-- with `custom.table_declare` and `custom.field_declare`, and a Rule is read back with
-- `custom.read_record`. THE WHOLE POINT of D and E — the save-time refusals — is what a
-- person is handed when they press Save, and that is now what this file measures.
--
-- WHAT STEPS OUT OF THE SEAT, AND WHY. `custom.resolve_first_match`, `custom.rule_members`,
-- `custom.rule_membership`, `custom.rule_applies`, `custom.record_applicability`,
-- `custom.rule_eval`, `custom.rule_context` and `custom.record_values` hold NO grant to
-- `authenticated` and no `platform.client_callable_door` row: they are the ENGINE, called by
-- the server lane that answers a screen, not by a browser. Each of those reads steps out with
-- `perform set_config('role', v_boss, true)`, says so, and asserts nothing about what a
-- person may do while it is out. Every write that FEEDS them is made from the seat.
--
-- 🚨 THE LOCK. The seeded fixture rows above live in ONE organization that several campaign
-- lanes touch at the same time, and `custom.record` has sixteen live hash partitions other
-- lanes are building indexes on. Main's default `lock_timeout` is short enough that even the
-- membership insert loses that race, so the transaction raises it once at the top.
--
-- WHAT MAKES IT FAIL — THE PRODUCTION CHANGES, NAMED (rule 3).
--   · Replace `exit;` in `custom.resolve_first_match` with `continue` (keep asking after a
--     match) → A fails: the trace's `matched` count stops being one and the winner moves.
--   · Drop the `order by` from `custom.table_rules` → A fails: the wide rectangle stops
--     matching "Wider than tall" first, and `considered_at` no longer follows `declared_sort`.
--   · Make `custom.rule_context` walk the chain instead of reading one parent → D2's
--     grandparent test stops being UNDECIDED and starts answering.
--   · Delete the `parent_field` branch from `custom.rule_eval` → C fails: an applicability
--     Rule goes back to raising 0A000.
--   · Drop the `custom_record_rule_topology_guard` trigger → D and E fail (that is exactly
--     what the RED twin `w1_rule_apply_red.sql` does, and it shows the same writes LANDING).
--
-- A SECOND INPUT WITH A DIFFERENT EXPECTED VALUE, everywhere it could matter (rule 3): the
-- resolver is asked about THREE records and returns THREE DIFFERENT winners from ONE ordered
-- list; applicability is asked about a child of a square, a child of a rectangle and a record
-- with no parent at all, and answers true, false and UNDECIDED; the cycle guard is shown
-- refusing TWO different circles and ACCEPTING a third graph that closes none. `return
-- expected` survives none of them.
--
-- THE IDENTITIES. admin@admin.com (owner) and test@test.com (member), both by membership into
-- the one organization the fixtures live in, with freshly generated record ids, and it rolls
-- back. It signs nobody in and reads no credential.

\set ON_ERROR_STOP on
\timing off

begin;

-- THE FLOOR (see THE LOCK above). Raised once for the whole transaction. MEASURED on main
-- 2026-09-19: `lock_timeout` is 5s and `statement_timeout` is 30s by default, and with other
-- campaign lanes queued on `custom.record` even the membership insert loses on both.
set local lock_timeout = '10s';
set local statement_timeout = '60s';

do $t$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_dana    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_dana_j  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_org     constant uuid := '39c38960-d30c-4840-b0c1-c9960de95582';  -- where W1-RULE's fixtures live
  v_tbl     constant uuid := '11111111-0004-4000-8000-000000000001';  -- Rule conformance shape
  v_f_kind  constant uuid := '11111111-0004-4000-8000-000000000011';
  v_f_width constant uuid := '11111111-0004-4000-8000-000000000012';
  v_f_hgt   constant uuid := '11111111-0004-4000-8000-000000000013';
  v_r_all   constant uuid := '11111111-0004-4000-8000-000000000101';  -- ALL FOUR USES
  v_r_wide  constant uuid := '11111111-0004-4000-8000-000000000102';
  v_r_has   constant uuid := '11111111-0004-4000-8000-000000000103';
  v_r_in    constant uuid := '11111111-0004-4000-8000-000000000104';
  v_mf      constant uuid := '11111111-0004-4000-8000-000000000120';
  v_home    constant uuid := '11111111-0000-4000-8000-000000000001';
  v_sq       uuid;
  v_wide     uuid;
  v_tall     uuid;
  v_kid_sq   uuid;
  v_kid_rect uuid;
  v_t2       uuid;
  v_f1       uuid;
  v_f2       uuid;
  v_ra       uuid;
  v_res      jsonb;
  v_doc      jsonb;
  v_msg      text;
  v_hint     text;
  v_state    text;
  v_n        integer;
  v_answer   boolean;
  v_boss     text := current_user;   -- the connected role, for the engine reads below
begin
  if (pg_control_system()).system_identifier <> 7642734024280108049 then
    raise exception 'w1_rule_apply.sql runs on the MAIN database only, and this is %',
                    (pg_control_system()).system_identifier;
  end if;

  -- ── THE FIXTURES, as the connected role. A seat is a PERSON, and a person reaches an
  --    organization only through a membership and only where the store is switched on.
  --    Both rows roll back with everything else.
  perform set_config('app.actor_system', 'campaign-test/w1_rule_apply', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org, 'organization', v_org, c_admin, 'owner',  'active'),
    (v_org, 'organization', v_org, c_dana,  'member', 'active')
  on conflict do nothing;
  -- Without this the store is off globally and every door refuses a person by name. The
  -- superuser walked past this switch on its first line; `authenticated` does not.
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom','system_enabled','organization', v_org, v_org, 'true'::jsonb, 'w1_rule_apply')
  on conflict (feature, key, scope_kind, scope_id, organization_id) do update set value = 'true'::jsonb;

  -- ══════════════════════════════════════════════════════════════════════════
  -- PART 0 — TAKE THE SEAT AND PROVE IT.
  -- ══════════════════════════════════════════════════════════════════════════
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

  -- ── THE RECORDS. One square, one wide rectangle, one tall rectangle, and two children —
  --    every one of them written through `custom.record_write`, the door a person's browser
  --    reaches. The old file INSERTed them straight into `custom.record`.
  v_sq   := custom.record_write(v_org, v_tbl, '{"title":"Square","kind":"square","width":4,"height":4}'::jsonb);
  v_wide := custom.record_write(v_org, v_tbl, '{"title":"Wide","kind":"rectangle","width":5,"height":3}'::jsonb);
  v_tall := custom.record_write(v_org, v_tbl, '{"title":"Tall","kind":"rectangle","width":3,"height":5}'::jsonb);
  v_kid_sq   := custom.record_write(v_org, v_tbl,
                  jsonb_build_object('title','In the square','kind','rectangle','width',1,'height',2,
                                     'parent_id', v_sq));
  v_kid_rect := custom.record_write(v_org, v_tbl,
                  jsonb_build_object('title','In the rectangle','kind','rectangle','width',1,'height',2,
                                     'parent_id', v_wide));

  -- ══════════════════════════════════════════════════════════════════════════
  -- A. DYN-6 — ONE ORDERED LIST, THREE RECORDS, THREE DIFFERENT WINNERS, and
  --    the order is read out of the TRACE THE RUN WROTE, never out of the list.
  --
  --    OUT OF THE SEAT for the resolver itself: `custom.resolve_first_match` holds no client
  --    grant and no door row — it is the engine a server lane calls to answer a screen. The
  --    RE-ORDERING in the middle of this clause is a PERSON'S edit and goes back into the seat.
  -- ══════════════════════════════════════════════════════════════════════════
  perform set_config('role', v_boss, true);

  v_res := custom.resolve_first_match(v_org, v_sq);
  if (v_res -> 'resolved' ->> 'rule_id')::uuid is distinct from v_r_all then
    raise exception 'A FAILED: the square resolved to % and the first Rule in the order is the one that matches it', v_res -> 'resolved';
  end if;
  if (v_res ->> 'stopped_after')::integer <> 1 then
    raise exception 'A FAILED: the square matched the first Rule and the run asked % of them', v_res ->> 'stopped_after';
  end if;

  v_res := custom.resolve_first_match(v_org, v_wide);
  if (v_res -> 'resolved' ->> 'rule_id')::uuid is distinct from v_r_wide then
    raise exception 'A FAILED: the wide rectangle resolved to %', v_res -> 'resolved';
  end if;

  v_res := custom.resolve_first_match(v_org, v_tall);
  if (v_res -> 'resolved' ->> 'rule_id')::uuid is distinct from v_r_has then
    raise exception 'A FAILED: the tall rectangle resolved to %', v_res -> 'resolved';
  end if;

  -- THE TRACE IS THE EVIDENCE. Three Rules considered, in declared-sort order, exactly one
  -- of them matched, and it is the LAST one considered — which is what "it stopped at the
  -- first match" means when the first two answered false.
  if jsonb_array_length(v_res -> 'considered') <> 3
     or (v_res -> 'considered' -> 0 ->> 'declared_sort')::integer <> 10
     or (v_res -> 'considered' -> 1 ->> 'declared_sort')::integer <> 20
     or (v_res -> 'considered' -> 2 ->> 'declared_sort')::integer <> 30 then
    raise exception 'A FAILED: the trace is not in declared order: %', v_res -> 'considered';
  end if;
  select count(*) into v_n from jsonb_array_elements(v_res -> 'considered') c
   where (c ->> 'matched')::boolean;
  if v_n <> 1 then
    raise exception 'A FAILED: % of the considered Rules matched, and a first-match resolver stops at one', v_n;
  end if;

  -- AND THE ORDER IS REALLY THE ORDER: A PERSON moves "Has a width at all" to the front —
  -- through `custom.record_update`, the door the Rule screen writes with — and the wide
  -- rectangle's winner CHANGES, out of the same three Rules, read out of the new trace.
  perform set_config('role', 'authenticated', true);
  perform custom.record_update(v_org, v_r_has, jsonb_build_object('sort', 5), null);
  perform set_config('role', v_boss, true);
  v_res := custom.resolve_first_match(v_org, v_wide);
  if (v_res -> 'resolved' ->> 'rule_id')::uuid is distinct from v_r_has
     or (v_res ->> 'stopped_after')::integer <> 1 then
    raise exception 'A FAILED: re-ordering the Rules did not move the first match: %', v_res;
  end if;
  perform set_config('role', 'authenticated', true);
  perform custom.record_update(v_org, v_r_has, jsonb_build_object('sort', 30), null);

  raise notice 'A. DYN-6 — one ordered list of 3 Rules gives 3 winners (square -> "A square has equal sides", wide -> "Wider than tall", tall -> "Has a width at all"); a PERSON re-sorting through custom.record_update moves the winner; the trace carries declared_sort 10/20/30 in that order and exactly one match.';

  -- ══════════════════════════════════════════════════════════════════════════
  -- B. DYN-6 — MEMBERSHIP IS A SET, and it is the SAME Rule row that validates
  --    and computes. No seventh core object: this is custom.record, projected.
  --
  --    OUT OF THE SEAT: `custom.rule_members` is the engine, with no client grant.
  -- ══════════════════════════════════════════════════════════════════════════
  perform set_config('role', v_boss, true);

  select count(*) into v_n from custom.rule_members(v_org, v_r_all) m
   where m.id in (v_sq, v_wide, v_tall, v_kid_sq, v_kid_rect);
  if v_n <> 1 then
    raise exception 'B FAILED: % of this suite''s five records are in the square set', v_n;
  end if;
  if not exists (select 1 from custom.rule_members(v_org, v_r_all) m where m.id = v_sq) then
    raise exception 'B FAILED: the square is not in the set its own Rule defines.';
  end if;
  -- A Rule that does not declare the membership use is refused BY NAME rather than answering
  -- an empty set, which would read as "nothing is in it".
  begin
    perform custom.rule_members(v_org, v_r_in);
    raise exception 'B FAILED: a Rule that is not used for membership answered a membership question.';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg like 'B FAILED%' then raise; end if;
    if v_msg not like '%Inside a square%' then
      raise exception 'B FAILED: the refusal does not name the Rule: %', v_msg;
    end if;
  end;
  raise notice 'B. DYN-6 — the set is a query over the same store (1 of this suite''s 5 records), and a Rule that is not used for membership is refused naming it: "%"', v_msg;

  -- ══════════════════════════════════════════════════════════════════════════
  -- C. REC-16 — the record's own Values AND ITS PARENT'S, one level up.
  --    Three inputs, three different answers: true, false, UNDECIDED.
  --
  --    The READS are the engine (`custom.record_applicability`, no client grant) and step
  --    out. The RETYPING of the parent in the middle is a person's edit and is seated.
  -- ══════════════════════════════════════════════════════════════════════════
  perform set_config('role', v_boss, true);

  select a.applies into v_answer from custom.record_applicability(v_org, v_kid_sq) a where a.rule_id = v_r_in;
  if v_answer is not true then
    raise exception 'C FAILED: a record inside a SQUARE answered % to "Inside a square".', coalesce(v_answer::text, 'undecided');
  end if;
  select a.applies into v_answer from custom.record_applicability(v_org, v_kid_rect) a where a.rule_id = v_r_in;
  if v_answer is not false then
    raise exception 'C FAILED: a record inside a RECTANGLE answered % to "Inside a square".', coalesce(v_answer::text, 'undecided');
  end if;
  select a.applies into v_answer from custom.record_applicability(v_org, v_sq) a where a.rule_id = v_r_in;
  if v_answer is not null then
    raise exception 'C FAILED: a record with NO parent answered % instead of leaving it undecided.', v_answer;
  end if;

  -- The parent's Value really is the parent's: A PERSON retypes the parent through
  -- `custom.record_update` and the child's answer moves.
  perform set_config('role', 'authenticated', true);
  perform custom.record_update(v_org, v_sq, jsonb_build_object('kind', 'rectangle'), null);
  perform set_config('role', v_boss, true);
  select a.applies into v_answer from custom.record_applicability(v_org, v_kid_sq) a where a.rule_id = v_r_in;
  if v_answer is not false then
    raise exception 'C FAILED: the parent stopped being a square and the child still answers %.', v_answer;
  end if;
  perform set_config('role', 'authenticated', true);
  perform custom.record_update(v_org, v_sq, jsonb_build_object('kind', 'square'), null);
  raise notice 'C. REC-16 — a child of a square applies (true), a child of a rectangle does not (false), a record with no parent is UNDECIDED, and a PERSON retyping the PARENT moves the child''s answer.';

  -- ══════════════════════════════════════════════════════════════════════════
  -- D. REC-16's CEILING — one level and no further, refused BY NAME in the three
  --    shapes a person actually writes, AT SAVE TIME — through the door they save
  --    with, `custom.record_write(org, custom.rule_kernel_id(), …)`. This is the
  --    clause the old seat could not ask: a refusal nobody can reach is not a refusal.
  -- ══════════════════════════════════════════════════════════════════════════
  perform set_config('role', 'authenticated', true);

  begin
    perform custom.record_write(v_org, custom.rule_kernel_id(),
      jsonb_build_object('name','Two up','kind','predicate','scope_table_id',v_tbl,
                         'uses', jsonb_build_array('applicability'), 'applies_to_types','[]'::jsonb,
                         'expr', jsonb_build_object('op','eq','args', jsonb_build_array(
                           jsonb_build_object('parent_field', jsonb_build_object('parent_field', v_f_kind)),
                           jsonb_build_object('const','square')))));
    raise exception 'D FAILED: a Rule reading two ancestor levels was stored.';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg like 'D FAILED%' then raise; end if;
    if v_msg not like '%Two up%' then raise exception 'D FAILED: the refusal does not name the Rule: %', v_msg; end if;
    raise notice 'D1. nested parent_field REFUSED at the save door, naming the Rule — "%"', v_msg;
  end;
  begin
    perform custom.record_write(v_org, custom.rule_kernel_id(),
      jsonb_build_object('name','Two up by number','kind','predicate','scope_table_id',v_tbl,
                         'uses', jsonb_build_array('applicability'), 'applies_to_types','[]'::jsonb,
                         'expr', jsonb_build_object('op','eq','args', jsonb_build_array(
                           jsonb_build_object('parent_field', v_f_kind, 'levels', 2),
                           jsonb_build_object('const','square')))));
    raise exception 'D FAILED: a Rule asking for two levels by number was stored.';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg like 'D FAILED%' then raise; end if;
    if v_msg not like '%Two up by number%' then raise exception 'D FAILED: the refusal does not name the Rule: %', v_msg; end if;
    raise notice 'D2. levels: 2 REFUSED at the save door, naming the Rule — "%"', v_msg;
  end;
  begin
    perform custom.record_write(v_org, custom.rule_kernel_id(),
      jsonb_build_object('name','Grandparent','kind','predicate','scope_table_id',v_tbl,
                         'uses', jsonb_build_array('applicability'), 'applies_to_types','[]'::jsonb,
                         'expr', jsonb_build_object('op','eq','args', jsonb_build_array(
                           jsonb_build_object('grandparent_field', v_f_kind),
                           jsonb_build_object('const','square')))));
    raise exception 'D FAILED: a grandparent_field Rule was stored.';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg like 'D FAILED%' then raise; end if;
    if v_msg not like '%Grandparent%' then raise exception 'D FAILED: the refusal does not name the Rule: %', v_msg; end if;
    raise notice 'D3. grandparent_field REFUSED at the save door, naming the Rule — "%"', v_msg;
  end;

  -- AT EVALUATION TOO, for anything already stored, and the POSITIVE CONTROL at one level in
  -- the same breath: the same call shape, one level, answers instead of raising.
  -- OUT OF THE SEAT: `custom.rule_eval` and `custom.rule_context` are the engine.
  perform set_config('role', v_boss, true);
  begin
    perform custom.rule_eval(v_org,
      jsonb_build_object('parent_field', jsonb_build_object('parent_field', v_f_kind)),
      '{}'::jsonb, custom.rule_context(v_org, v_kid_sq));
    raise exception 'D FAILED: two levels were evaluated instead of refused.';
  exception when others then
    get stacked diagnostics v_msg = message_text, v_state = returned_sqlstate;
    if v_msg like 'D FAILED%' then raise; end if;
    raise notice 'D4. two levels REFUSED at evaluation too — % "%"', v_state, v_msg;
  end;
  if custom.rule_eval(v_org, jsonb_build_object('parent_field', v_f_kind),
                      '{}'::jsonb, custom.rule_context(v_org, v_kid_sq)) #>> '{}' <> 'square' then
    raise exception 'D FAILED: the POSITIVE CONTROL at one level did not read the parent''s value.';
  end if;
  raise notice 'D5. the positive control at ONE level reads the parent''s answer: "square".';
  perform set_config('role', 'authenticated', true);

  -- ══════════════════════════════════════════════════════════════════════════
  -- E. THE SAVE-TIME CYCLE REFUSAL, ACROSS RULES AND MERGE FIELDS, NAMING BOTH
  --    SIDES. Two different circles, and a positive control that closes none.
  --    ALL OF IT FROM THE SEAT: every save here is a person pressing Save.
  -- ══════════════════════════════════════════════════════════════════════════
  -- E1. Rule <-> merge field. The seeded merge field `square_rule` already resolves THROUGH
  --     Rule …0101; a person making …0101 read that merge field closes the loop.
  begin
    perform custom.record_update(v_org, v_r_all, jsonb_build_object('expr', jsonb_build_object(
      'op','and','args', jsonb_build_array(
        jsonb_build_object('op','eq','args', jsonb_build_array(
          jsonb_build_object('field', v_f_width),
          jsonb_build_object('field', v_f_hgt))),
        jsonb_build_object('merge_field', v_mf)))), null);
    raise exception 'E FAILED: a Rule and a merge field were saved waiting on each other.';
  exception when others then
    get stacked diagnostics v_msg = message_text, v_hint = pg_exception_hint;
    if v_msg like 'E FAILED%' then raise; end if;
    if v_msg not like '%A square has equal sides%' or v_msg not like '%square_rule%' then
      raise exception 'E FAILED: the refusal does not name BOTH sides: %', v_msg;
    end if;
    raise notice 'E1. rule <-> merge field REFUSED naming both sides — "%"', v_msg;
    raise notice 'E1. the circle — "%"', v_hint;
  end;

  -- E2. Rule <-> Rule, over two formula Fields of a Table this suite declares ITSELF THROUGH
  --     THE DOORS — `custom.table_declare` then `custom.field_declare` — so the second circle
  --     is a different shape and a longer path than the first. MEASURED on main 2026-09-19:
  --     a formula column declared through the door must say HOW it is worked out
  --     (`custom._field_type_parity_guard`: "the field A is worked out and does not say how"),
  --     so each one is declared with a trivial expression of its own; the CIRCLE is between
  --     the two RULES that later target them.
  v_t2 := custom.table_declare(v_org, jsonb_build_object(
    'name','Account Balances','slug','account_balances','type','entity',
    'label_singular','Account Balance','label_plural','Account Balances','title_field','a','display','page',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,
    'fields', jsonb_build_array(jsonb_build_object('name','a'), jsonb_build_object('name','b')),
    'parent_id', v_home::text));
  v_f1 := custom.field_declare(v_org, v_t2, jsonb_build_object(
    'key','a','label','A','parity_type','formula','compute_on','write','sort',10,
    'expr', jsonb_build_object('const','')));
  v_f2 := custom.field_declare(v_org, v_t2, jsonb_build_object(
    'key','b','label','B','parity_type','formula','compute_on','write','sort',20,
    'expr', jsonb_build_object('const','')));
  -- A computes from B. This one SAVES — the positive control of the pair.
  v_ra := custom.record_write(v_org, custom.rule_kernel_id(),
    jsonb_build_object('name','A from B','kind','expression','scope_table_id', v_t2,
      'uses', jsonb_build_array('compute'), 'applies_to_types','[]'::jsonb,
      'target_field_id', v_f1,
      'expr', jsonb_build_object('op','concat','args', jsonb_build_array(jsonb_build_object('field', v_f2)))));
  -- B computes from A. This one closes the circle.
  begin
    perform custom.record_write(v_org, custom.rule_kernel_id(),
      jsonb_build_object('name','B from A','kind','expression','scope_table_id', v_t2,
        'uses', jsonb_build_array('compute'), 'applies_to_types','[]'::jsonb,
        'target_field_id', v_f2,
        'expr', jsonb_build_object('op','concat','args', jsonb_build_array(jsonb_build_object('field', v_f1)))));
    raise exception 'E FAILED: two Rules were saved working each other''s answers out.';
  exception when others then
    get stacked diagnostics v_msg = message_text, v_hint = pg_exception_hint;
    if v_msg like 'E FAILED%' then raise; end if;
    if v_msg not like '%B from A%' or v_msg not like '%A from B%' then
      raise exception 'E FAILED: the refusal does not name BOTH Rules: %', v_msg;
    end if;
    raise notice 'E2. rule <-> rule REFUSED naming both sides — "%"', v_msg;
    raise notice 'E2. the circle — "%"', v_hint;
  end;
  raise notice 'E3. POSITIVE CONTROL — "A from B" (%) saved through the same door, by the same person, in the same transaction: a graph that closes nothing is not refused.', v_ra;

  -- ══════════════════════════════════════════════════════════════════════════
  -- F. REC-15 — ONE ROW, FOUR USES, and this lane's two reach the SAME id the
  --    other two do. This is what V1-MODEL's C-10a and C-10b re-execute.
  --
  --    The four USES are read from the seat, through `custom.read_record` — the door that
  --    hands a person the Rule document. The two ENGINE answers step out.
  -- ══════════════════════════════════════════════════════════════════════════
  v_doc := custom.read_record(v_org, v_r_all, true);
  select count(distinct u) into v_n from jsonb_array_elements_text(v_doc -> 'uses') u;
  if v_n <> 4 then
    raise exception 'F FAILED: the row a person is handed declares % uses: %', v_n, v_doc -> 'uses';
  end if;

  perform set_config('role', v_boss, true);
  if (custom.rule_membership(v_org, v_r_all, v_sq) ->> 'rule_id')::uuid is distinct from v_r_all
     or (custom.rule_applies(v_org, v_r_all, v_sq) ->> 'rule_id')::uuid is distinct from v_r_all then
    raise exception 'F FAILED: the membership and applicability uses did not run against the row that validates and computes.';
  end if;
  if (custom.record_values(v_org, v_sq) ->> 'sides_equal') <> 'true'
     or (custom.record_values(v_org, v_wide) ->> 'sides_equal') <> 'false' then
    raise exception 'F FAILED: the compute use of the same row no longer answers true for a square and false for a rectangle.';
  end if;
  perform set_config('role', 'authenticated', true);
  raise notice 'F. REC-15 — 11111111-0004-4000-8000-000000000101 declares all FOUR uses in the document a PERSON reads, and answers as all four: validate and compute (W1-RULE), membership and applicability (this lane), against that ONE row id.';

  -- ══════════════════════════════════════════════════════════════════════════
  -- G. THE NEGATIVE CLAUSE, AS A REAL SECOND PERSON.
  -- `test@test.com` is a member of this organization and was shared nothing. Every refusal
  -- above is a STORE RULE; this one is the ACCESS question, which the old seat could not ask
  -- at all: as the owner of `custom.record`, `custom.assert_client_may_reach` returned true
  -- on its first line for every organization on this database.
  -- ══════════════════════════════════════════════════════════════════════════
  perform set_config('request.jwt.claims', c_dana_j, true);

  -- G1. She cannot save a Rule against a Table she is not an admin of.
  v_msg := null;
  begin
    perform custom.record_write(v_org, custom.rule_kernel_id(),
      jsonb_build_object('name','Dana''s rule','kind','predicate','scope_table_id', v_tbl,
        'uses', jsonb_build_array('applicability'), 'applies_to_types','[]'::jsonb,
        'expr', jsonb_build_object('op','eq','args', jsonb_build_array(
          jsonb_build_object('field', v_f_kind), jsonb_build_object('const','square')))));
  exception when others then
    get stacked diagnostics v_msg = message_text;
  end;
  if v_msg is null then
    raise exception 'G1: test@test.com saved a Rule against a Table she is not an admin of';
  end if;
  raise notice 'G1. she is refused the Rule — "%"', v_msg;

  -- G2. Nor re-sort a Rule somebody else owns.
  v_msg := null;
  begin
    perform custom.record_update(v_org, v_r_has, jsonb_build_object('sort', 1), null);
  exception when others then
    get stacked diagnostics v_msg = message_text;
  end;
  if v_msg is null then
    raise exception 'G2: test@test.com re-sorted a Rule nobody shared with her';
  end if;
  raise notice 'G2. she is refused the re-sort — "%"', v_msg;

  -- G3. THE CONTROL, so G1 and G2 are not a door that refuses her everything: the records of
  --     the Table she IS a member of, she reads, through the same door.
  select count(*) into v_n from custom.read_records(v_org, v_tbl, true, 5, 0);
  if v_n < 1 then
    raise exception 'G3: the member who was refused the Rule cannot read a single record either, so G1 and G2 prove nothing';
  end if;
  raise notice 'G3. THE CONTROL — the same person reads % record(s) of the same Table through custom.read_records.', v_n;

  perform set_config('request.jwt.claims', c_admin_j, true);

  raise notice '=== W1-RULE-APPLY — DYN-6, REC-16 and the cycle refusal all executed on the MAIN database, every clause a person owns from the seat `authenticated`, and this transaction rolls back. ===';
end;
$t$;

rollback;
