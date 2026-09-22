-- W1-RULE — REC-15, REC-17 and REC-19 EXECUTED ON THE MAIN DATABASE, FROM THE SEAT A
-- SIGNED-IN PERSON SITS IN: one Rule row, four declared uses, two of them run, a Field
-- renamed underneath it, and a version that travels with the answer.
--
-- RUN IT:
--   PSQL="$(node node_modules/tsx/dist/cli.mjs scripts/lib/psql-path.ts --print)"
--   "$PSQL" "<the main database DSN>" -v ON_ERROR_STOP=1 \
--     -f scripts/campaign-tests/w1_rule_t8.sql
--
-- 🚨 RE-POINTED (lane SEAT-SUITES, 2026-09-19). It used to refuse to run anywhere but the
-- rehearsal branch, which holds 226 functions in schema `custom` against main's 332 and
-- grants a client 29 against main's 103. The owner's 2026-09-18 ruling is that there is no
-- production: everything is the main database.
--
-- 🚨 THE SEAT. It also ran every clause as the role that OWNS `custom.record`, where
-- `custom.assert_client_may_reach` returns on its first line, EXECUTE grants are free and
-- `custom.record` is directly readable. It now takes the seat `authenticated` in PART 0,
-- proves it holds it, and asks every question a person can ask through the door they reach:
--
--   insert into custom.record (a record) → custom.record_write
--   update custom.record (a record)      → custom.record_update
--   insert into custom.record ('rule')   → custom.record_write at custom.rule_kernel_id()
--   update custom.record (a Field)       → custom.field_update
--   select … from custom.rule / .record  → custom.read_record / custom.record_values_versioned
--
-- WHAT IS ASKED AS AN OPERATOR, out of the seat, saying so, asserting no product clause
-- while out: `custom.table_rules` (the use enumerator), `custom.rule_run` / `custom.rule_eval`
-- / `custom.rule_truth` (the evaluator), `custom.rule_field_key` / `custom.rule_field_label`
-- (the resolver), the `custom.rule` projection, a Table's own `fields` list, and the
-- catalogue of schema `custom`. None of the eight carries a client grant, and a person never
-- calls an evaluator directly — they write a record and the store runs the Rule for them,
-- which is what every clause in §B, §C, §D and §E does from the seat.
--
-- WHAT MAKES IT FAIL. Every assertion is a POSITIVE query with a stated expected value, and
-- every refusal assertion compares the GUARD'S OWN MESSAGE. Every refusal is PAIRED with a
-- positive control (rule 14) and every value assertion carries a SECOND input with a
-- DIFFERENT expected value (rule 3) — the compute use is asked for `true` and for `false`
-- from the same Rule row. Its RED twin is `w1_rule_red.sql`.
--
-- THE ONE ROW EVERYTHING IS ABOUT: `11111111-0004-4000-8000-000000000101`, seeded by
-- `migrations/campaign/w1_rule_object_and_uses.sql` and on the main database now.
--
-- IT IS NOT A MIGRATION: it lives outside `migrations/` and its one transaction ends in
-- ROLLBACK. THE IDENTITIES: `admin@admin.com` and `test@test.com`, nobody else.

\set ON_ERROR_STOP on
\timing off

-- TARGET AND DEPENDENCIES — the one shared preamble. It accepts the MAIN database or the
-- rehearsal branch named in common-docs/.../plan/BRANCH-REF, refuses anything else by name,
-- says which database this is, and SKIPS (never fake-passes) when a declared dependency is
-- absent here. Declare dependencies with `\set requires` above the include; see the preamble.
\set suite 'w1_rule_t8.sql'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;

do $t$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_dana    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_dana_j  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_org     constant uuid := '39c38960-d30c-4840-b0c1-c9960de95582';  -- Matrx System
  v_tbl     constant uuid := '11111111-0004-4000-8000-000000000001';  -- Rule conformance shape
  v_f_title constant uuid := '11111111-0004-4000-8000-000000000010';
  v_f_kind  constant uuid := '11111111-0004-4000-8000-000000000011';
  v_f_width constant uuid := '11111111-0004-4000-8000-000000000012';
  v_f_hgt   constant uuid := '11111111-0004-4000-8000-000000000013';
  v_f_sides constant uuid := '11111111-0004-4000-8000-000000000014';
  v_rule    constant uuid := '11111111-0004-4000-8000-000000000101';
  v_mf_kern constant uuid := '11111111-0000-4000-8000-000000000009';
  v_sq      uuid;
  v_rect    uuid;
  v_r2      uuid;
  v_n       integer;
  v_v       integer;
  v_v2      integer;
  v_j       jsonb;
  v_src     jsonb;
  v_at      timestamptz;
  v_msg     text;
  v_txt     text;
  v_seen    text;
  v_tables_before integer;
  v_tables_after  integer;
  v_boss    text := current_user;   -- the connected role, for the steps no door covers
begin
  -- Schema `custom` is LIVE and other campaign suites are writing it right now, so this
  -- suite WAITS for a row rather than dying on the five-second lock_timeout the connection
  -- carries. Nothing below is a race.
  perform set_config('lock_timeout', '120s', true);
  perform set_config('statement_timeout', '240s', true);

  -- THIS LANE CREATED NO RELATION. Counted as a query, as the connected role, before the
  -- seat is taken: no client door reads the catalogue.
  select count(*) into v_tables_before
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'custom' and c.relkind in ('r', 'p');

  -- ════════════════════════════════════════════════════════════════════════════
  -- THE FIXTURE, as the connected role: a membership for each person and the
  -- organization's own store switch. Both disappear with the ROLLBACK.
  -- ════════════════════════════════════════════════════════════════════════════
  perform set_config('app.actor_system', 'campaign-test/w1_rule_t8', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org, 'organization', v_org, c_admin, 'owner',  'active'),
    (v_org, 'organization', v_org, c_dana,  'member', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom','system_enabled','organization', v_org, v_org, 'true'::jsonb, 'w1_rule_t8');

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 0 — THE SEAT. Everything below this line runs as a signed-in person.
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

  -- ══════════════════════════════════════════════════════════════════════════
  -- A. REC-15 — ONE ROW, FOUR USES, declared rather than described
  -- ══════════════════════════════════════════════════════════════════════════
  -- THE ROW ITSELF, through the read door a person has.
  v_j := custom.read_record(v_org, v_rule, true);
  if v_j is null then raise exception 'REC-15: the seeded Rule does not read back through custom.read_record'; end if;
  if jsonb_array_length(v_j -> 'uses') <> 4 then
    raise exception 'REC-15: the Rule declares % uses, and the law is four', jsonb_array_length(v_j -> 'uses');
  end if;
  if not ((v_j -> 'uses') ? 'validate' and (v_j -> 'uses') ? 'compute'
          and (v_j -> 'uses') ? 'membership' and (v_j -> 'uses') ? 'applicability') then
    raise exception 'REC-15: the Rule declares %, and the four uses are validate, compute, membership and applicability', v_j -> 'uses';
  end if;
  if (v_j ->> 'kind') <> 'predicate' then
    raise exception 'REC-15: the Rule''s kind is %, and only a predicate can serve all four uses', v_j ->> 'kind';
  end if;

  -- THE SAME ROW IS RETURNED FOR ALL FOUR USES by the one enumerator every use reads, and an
  -- invented use is refused BY NAME. `custom.table_rules` is the STORE's own enumerator and
  -- holds no client grant — a person never calls it, the store calls it on their behalf when
  -- they write a record, which is what §B and §C below do from the seat. So this one clause
  -- steps OUT and says so, and asserts nothing about what a person may do.
  perform set_config('role', v_boss, true);
  select count(*) into v_n from (
    select 1 from custom.table_rules(v_org, v_tbl, 'validate',      'square')  where id = v_rule
    union all
    select 1 from custom.table_rules(v_org, v_tbl, 'compute',       'square')  where id = v_rule
    union all
    select 1 from custom.table_rules(v_org, v_tbl, 'membership',    'square')  where id = v_rule
    union all
    select 1 from custom.table_rules(v_org, v_tbl, 'applicability', 'square')  where id = v_rule) s;
  if v_n <> 4 then
    raise exception 'REC-15: the one Rule row is reachable for % of its four uses', v_n;
  end if;
  begin
    perform 1 from custom.table_rules(v_org, v_tbl, 'frobnicate', 'square');
    raise exception 'REC-15: an invented use was accepted';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'there is no frobnicate use of a rule' then
      raise exception 'REC-15 uses: the refusal said "%"', v_msg;
    end if;
  end;
  perform set_config('role', 'authenticated', true);
  raise notice 'A GREEN — one Rule row declares four uses and reads back through custom.read_record, the enumerator returns it for all four, and a fifth use is refused by name';

  -- ══════════════════════════════════════════════════════════════════════════
  -- B. USE 1 — VALIDATE, executed by the store when a person writes a record
  -- ══════════════════════════════════════════════════════════════════════════
  -- POSITIVE CONTROL FIRST: a square whose sides agree LANDS.
  v_sq := custom.record_write(v_org, v_tbl, '{"title":"S1","kind":"square","width":4,"height":4}'::jsonb);
  if v_sq is null then raise exception 'REC-15 validate: a square with equal sides did not land'; end if;

  -- AND THE REFUSAL, in the Rule's own words.
  begin
    perform custom.record_write(v_org, v_tbl, '{"title":"S2","kind":"square","width":4,"height":5}'::jsonb);
    raise exception 'REC-15 validate: a square with unequal sides was stored';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'the sides of a square have to be the same length' then
      raise exception 'REC-15 validate: the refusal said "%"', v_msg;
    end if;
  end;

  -- THE NARROWING IS REAL, NOT DECORATIVE: the same Rule does NOT validate a rectangle, so a
  -- rectangle whose sides differ is a perfectly good rectangle. Second input, same row,
  -- opposite outcome — and asked the way a person asks it, by writing the record.
  v_rect := custom.record_write(v_org, v_tbl, '{"title":"R1","kind":"rectangle","width":3,"height":4}'::jsonb);
  if v_rect is null then raise exception 'REC-15 use_types: a rectangle with unequal sides was refused, and the validate use is narrowed to squares'; end if;
  raise notice 'B GREEN — a square with equal sides lands, one with unequal sides is refused in the Rule''s own words, and the same Rule leaves a rectangle alone';

  -- ══════════════════════════════════════════════════════════════════════════
  -- C. USE 2 — COMPUTE, executed against THE SAME row id, twice, two answers
  -- ══════════════════════════════════════════════════════════════════════════
  -- THE DOOR'S OWN ANSWER: `custom.read_record` merges the worked-out Value in beside the
  -- typed ones, without a reader knowing they are stored apart — and it never leaks the
  -- storage shape.
  v_j := custom.read_record(v_org, v_sq, true);
  if (v_j -> 'sides_equal') <> to_jsonb(true) then
    raise exception 'REC-15 compute: the square''s sides_equal reads %, and 4 by 4 is equal', v_j -> 'sides_equal';
  end if;
  if v_j ? '_computed' then
    raise exception 'REC-15: the read door leaked the storage shape into the answer';
  end if;
  -- AND IT SAYS WHAT WORKED IT OUT. Until SEAT-SUITES landed
  -- `migrations/campaign/seat_a_rules_answer_says_which_rule.sql` a person got the boolean
  -- and nothing else: the Rule, its version and the moment were all thrown away by the one
  -- versioned read door a client has.
  select v.source, v.field_id, v.written_at into v_src, v_r2, v_at
    from custom.value_read(v_org, v_sq, 'sides_equal') v;
  if (v_src ->> 'rule_id')::uuid is distinct from v_rule then
    raise exception 'REC-15 compute: the answer says it came from %, and the Rule is %', v_src ->> 'rule_id', v_rule;
  end if;
  if v_r2 is distinct from v_f_sides then
    raise exception 'REC-17 compute: the answer says it belongs to field %, and the target is %', v_r2, v_f_sides;
  end if;
  if v_at is null then raise exception 'REC-15 compute: the answer carries no moment'; end if;

  -- THE SECOND INPUT, from the SAME ROW: a rectangle's answer is FALSE. A compute use that
  -- always returned true would pass every assertion above and fail here.
  v_j := custom.read_record(v_org, v_rect, true);
  if (v_j -> 'sides_equal') <> to_jsonb(false) then
    raise exception 'REC-15 compute second input: the rectangle''s sides_equal reads %, and 3 by 4 is not equal', v_j -> 'sides_equal';
  end if;
  if (v_j -> 'width') <> to_jsonb(3) then
    raise exception 'REC-15: the read door returned %, and it should carry both the typed and the worked-out values', v_j;
  end if;
  select v.source into v_src from custom.value_read(v_org, v_rect, 'sides_equal') v;
  if (v_src ->> 'rule_id')::uuid is distinct from v_rule then
    raise exception 'REC-15 compute: the two answers do not come from the same Rule row';
  end if;

  -- A WORKED-OUT ANSWER NOBODY WORKS OUT IS REFUSED, never quietly kept and never quietly
  -- dropped. The positive control is the write above, which landed with its own answer.
  begin
    perform custom.record_write(v_org, v_tbl,
      '{"title":"F1","kind":"square","width":2,"height":2,"_computed":{"title":{"value":"forged"}}}'::jsonb);
    raise exception 'REC-15: a forged worked-out answer was stored';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'this record carries a worked-out answer for title that no rule works out' then
      raise exception 'REC-15 forgery: the refusal said "%"', v_msg;
    end if;
  end;

  -- T8's RETYPE, which is the one thing a refusal here would make impossible. A square
  -- becomes a circle: `sides_equal` stops being a thing about this record, and its worked-out
  -- answer is RETIRED with its reason, its Rule and the version that produced it.
  v_r2 := custom.record_write(v_org, v_tbl, '{"title":"S8","kind":"square","width":5,"height":5}'::jsonb);
  perform custom.record_update(v_org, v_r2, '{"kind":"circle"}'::jsonb);
  v_j := custom.read_record(v_org, v_r2, true);
  if v_j ? 'sides_equal' then
    raise exception 'T8 retype: the retyped record still shows a worked-out answer — %', v_j -> 'sides_equal';
  end if;
  select count(*) into v_n from jsonb_array_elements(coalesce(v_j -> '_retired', '[]'::jsonb)) e
   where e ->> 'key' = 'sides_equal'
     and (e -> 'value') = to_jsonb(true)
     and (e ->> 'rule_id')::uuid = v_rule
     and (e ->> 'rule_version')::integer = 1
     and e ->> 'reason' is not null;
  if v_n <> 1 then
    raise exception 'T8 retype: the worked-out answer was not retired with its reason, its Rule and its version — %',
                    v_j -> '_retired';
  end if;
  raise notice 'C GREEN — the same Rule row answers true for a square and false for a rectangle, each answer naming the Rule that produced it; a forged answer is refused; and a retype retires the answer with its reason, its Rule and its version';

  -- ══════════════════════════════════════════════════════════════════════════
  -- D. REC-17 — BY ID, NEVER BY NAME, proven by RENAMING the field underneath
  -- ══════════════════════════════════════════════════════════════════════════
  -- The Rule is NOT touched in this section. Only the Field moves, THROUGH THE DOOR a person
  -- renames a column with.
  --
  -- WHAT A PERSON CAN ACTUALLY RENAME, measured from the seat 2026-09-19: the LABEL — what
  -- the column is CALLED on every screen and in every refusal. The KEY cannot be renamed by
  -- anybody, through any door, and that is a deliberate law of the store rather than a gap:
  -- `custom.field_update` answers "A field's key is how every saved value finds it, so it
  -- cannot be renamed." Both halves are asserted below, and REC-17 is exactly what makes the
  -- first half safe: the Rule points at the Field's ID, so renaming what the column is called
  -- changes every sentence a person reads and changes nothing about whether the Rule fires.
  v_j := custom.migrate_rename(v_org, v_f_width, 'Breadth', 'w1_rule_t8 REC-17');
  if (v_j ->> 'field') <> 'label' or (v_j ->> 'now') <> 'Breadth' then
    raise exception 'REC-17: the rename door renamed % to %', v_j ->> 'field', v_j ->> 'now';
  end if;
  select a.data ->> 'label' into v_txt from custom.applicable_fields(v_org, v_tbl, null) a
   where a.data ->> 'key' = 'width';
  if v_txt <> 'Breadth' then raise exception 'REC-17: the column is still called "%"', v_txt; end if;

  -- THE KEY IS NOT A PERSON'S TO CHANGE, and the store says so in its own words.
  v_seen := null;
  begin
    perform custom.field_update(v_org, v_f_width, '{"key":"breadth"}'::jsonb);
  exception when others then v_seen := sqlerrm;
  end;
  if v_seen is null or position('cannot be renamed' in v_seen) = 0 then
    raise exception 'REC-17: a field''s key was renamed through a client door — %', coalesce(v_seen, 'it landed');
  end if;

  -- The resolver follows the ID: the KEY is still `width` and the LABEL a refusal will speak
  -- is now `Breadth`. `custom.rule_field_key` and `custom.rule_field_label` are the store's
  -- own and hold no client grant, so this one clause steps OUT and says so.
  perform set_config('role', v_boss, true);
  if custom.rule_field_key(v_org, v_f_width) <> 'width' then
    raise exception 'REC-17: the field id resolves to the key %, and no key was renamed',
                    custom.rule_field_key(v_org, v_f_width);
  end if;
  if custom.rule_field_label(v_org, v_f_width) <> 'Breadth' then
    raise exception 'REC-17: a refusal would still say %, and the field is now called Breadth',
                    custom.rule_field_label(v_org, v_f_width);
  end if;
  perform set_config('role', 'authenticated', true);

  -- AND THE RULE STILL FIRES, with nothing about the Rule changed. THIS is the clause: a
  -- name-keyed Rule would have been written against the label a person typed, and would now
  -- be reading something that moved.
  begin
    perform custom.record_write(v_org, v_tbl, '{"title":"S3","kind":"square","width":4,"height":5}'::jsonb);
    raise exception 'REC-17: after the rename the Rule stopped resolving — a square with unequal sides was stored';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'the sides of a square have to be the same length' then
      raise exception 'REC-17 after rename: the refusal said "%"', v_msg;
    end if;
  end;
  -- The positive control, and the SECOND input: it lands, and its worked-out answer is true.
  v_r2 := custom.record_write(v_org, v_tbl, '{"title":"S4","kind":"square","width":7,"height":7}'::jsonb);
  if (custom.read_record(v_org, v_r2, true) -> 'sides_equal') <> to_jsonb(true) then
    raise exception 'REC-17 after rename: the worked-out answer reads %, and 7 by 7 is equal',
                    custom.read_record(v_org, v_r2, true) -> 'sides_equal';
  end if;

  -- THE COMPLEMENT, which is what makes the clause above mean something: every sentence a
  -- person reads now speaks the NEW name, although nothing about the stored Rule moved.
  begin
    perform custom.record_write(v_org, v_tbl, '{"title":"S5","kind":"square","height":5}'::jsonb);
    raise exception 'REC-17: a square with no width was stored';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'Breadth is required' then
      raise exception 'REC-17 new label: the refusal said "%", and the column is now called Breadth', v_msg;
    end if;
  end;

  -- Put the name back, so the rest of the suite reads the seeded label.
  perform custom.migrate_rename(v_org, v_f_width, 'Width', 'w1_rule_t8 REC-17 restore');

  -- REC-17 AS A REFUSAL: a Rule that reaches for a Field BY NAME cannot be STORED, through
  -- the same write door a person declares a Rule with. Four shapes, because these are the
  -- four ways the law actually gets broken in practice.
  begin
    perform custom.record_write(v_org, custom.rule_kernel_id(), jsonb_build_object(
      'name','Insurance carrier must be on file','kind','predicate','scope_table_id',v_tbl::text,'uses',jsonb_build_array('validate'),
      'applies_to_types','[]'::jsonb,
      'expr', jsonb_build_object('op','eq','args', jsonb_build_array(
                jsonb_build_object('field_name','width'), jsonb_build_object('field', v_f_hgt::text)))));
    raise exception 'REC-17: a Rule naming a field was stored';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'the rule Insurance carrier must be on file names a field instead of pointing at it' then
      raise exception 'REC-17 field_name: the refusal said "%"', v_msg;
    end if;
  end;
  begin
    perform custom.record_write(v_org, custom.rule_kernel_id(), jsonb_build_object(
      'name','Chart number must be six digits','kind','predicate','scope_table_id',v_tbl::text,
      'uses',jsonb_build_array('validate'),'applies_to_types','[]'::jsonb,
      'expr', jsonb_build_object('op','eq','args', jsonb_build_array(
                jsonb_build_object('field','width'), jsonb_build_object('field', v_f_hgt::text)))));
    raise exception 'REC-17: a Rule with a field NAME in the id slot was stored';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'the rule Chart number must be six digits points at a field with width instead of with its id' then
      raise exception 'REC-17 name-in-id-slot: the refusal said "%"', v_msg;
    end if;
  end;
  begin
    perform custom.record_write(v_org, custom.rule_kernel_id(), jsonb_build_object(
      'name','Balance due must stay under the plan limit','kind','predicate','scope_table_id',v_tbl::text,
      'uses',jsonb_build_array('validate'),'applies_to_types','[]'::jsonb,
      'expr', jsonb_build_object('op','present','args', jsonb_build_array(
                jsonb_build_object('field','11111111-0003-4000-8000-000000000001')))));
    raise exception 'REC-17: a Rule pointing at another table''s field was stored';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'the rule Balance due must stay under the plan limit points at a field that is not one of that table''s fields' then
      raise exception 'REC-17 foreign field: the refusal said "%"', v_msg;
    end if;
  end;
  begin
    perform custom.record_write(v_org, custom.rule_kernel_id(), jsonb_build_object(
      'name','Recall interval must be set','kind','predicate','scope_table_id',v_tbl::text,
      'uses',jsonb_build_array('validate'),'applies_to_types','[]'::jsonb,
      'expr', jsonb_build_object('op','present','args', jsonb_build_array(
                jsonb_build_object('field','11111111-9999-4000-8000-000000000099')))));
    raise exception 'REC-17: a Rule pointing at no field at all was stored';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'the rule Recall interval must be set points at a field that is not one of that table''s fields' then
      raise exception 'REC-17 absent field: the refusal said "%"', v_msg;
    end if;
  end;
  raise notice 'D GREEN — the Width field was renamed through custom.field_update and the Rule still fires on the new key, the old key is refused by the FIELD''s name, and four ways of naming a field instead of pointing at it are each refused through custom.record_write';

  -- ══════════════════════════════════════════════════════════════════════════
  -- E. REC-19 — VERSIONS, and the version that PRODUCED a Value
  -- ══════════════════════════════════════════════════════════════════════════
  -- THE VERSION THE ANSWER CARRIES is a person's question and is asked from the seat: the
  -- answer written at the top of this suite says version 1.
  select (v.source ->> 'rule_version')::integer into v_v
    from custom.value_read(v_org, v_sq, 'sides_equal') v;
  if v_v <> 1 then raise exception 'REC-19: the first answer says version %, and a seeded Rule is version 1', v_v; end if;

  -- THE VERSION INCREMENTS ON CHANGE, through the write door a person edits a Rule with.
  perform custom.record_update(v_org, v_rule, '{"message":"a square is as wide as it is tall"}'::jsonb);
  perform custom.record_update(v_org, v_rule, '{"message":"the sides of a square have to be the same length"}'::jsonb);

  -- AND THE VERSION TRAVELS WITH THE ANSWER: a record written now carries THREE, where the
  -- one written at the top of this suite carries ONE. Same Rule, same expression, different
  -- version — which is what History stamps.
  v_r2 := custom.record_write(v_org, v_tbl, '{"title":"S6","kind":"square","width":9,"height":9}'::jsonb);
  select (v.source ->> 'rule_version')::integer into v_v2
    from custom.value_read(v_org, v_r2, 'sides_equal') v;
  if v_v2 <> 3 then
    raise exception 'REC-19: two changes after version 1 and the new answer says version %', v_v2;
  end if;
  select (v.source ->> 'rule_version')::integer into v_n
    from custom.value_read(v_org, v_sq, 'sides_equal') v;
  if v_n <> 1 then
    raise exception 'REC-19 second input: the answer written before the Rule changed says version %, and it was produced by version 1', v_n;
  end if;

  -- WHAT W3-HIST READS, as a query rather than as a promise. `custom.computed_provenance`
  -- holds no client grant — a person reads the same three facts through
  -- `custom.value_read` above — so this one clause steps OUT and says so.
  perform set_config('role', v_boss, true);
  select count(*) into v_n from custom.computed_provenance(v_org, v_r2);
  if v_n <> 1 then raise exception 'REC-19: custom.computed_provenance returned % rows for one worked-out value', v_n; end if;
  select count(*) into v_n from custom.computed_provenance(v_org, v_r2) p
   where p.rule_id = v_rule and p.field_id = v_f_sides and p.rule_version = v_v2 and p.computed_at is not null;
  if v_n <> 1 then raise exception 'REC-19: the provenance row does not name the Rule, the Field, the version and the moment'; end if;
  perform set_config('role', 'authenticated', true);
  raise notice 'E GREEN — the Rule moved from version 1 to version 3 through the write door, the answer written before carries 1 and the answer written after carries 3, and both name the Rule';

  -- ══════════════════════════════════════════════════════════════════════════
  -- F. THE EVALUATOR REFUSES RATHER THAN GUESSES
  -- ══════════════════════════════════════════════════════════════════════════
  -- A person never calls an evaluator: they write a record and the store runs the Rule. So
  -- the Rules below are DECLARED from the seat, through `custom.record_write`, and only the
  -- direct evaluator calls — `custom.rule_run`, `custom.rule_eval`, `custom.rule_truth`, none
  -- of which carries a client grant — step out, saying so.
  --
  -- REC-16: the node is STORABLE and never answers wrongly. With no parent in the context it
  -- is UNDECIDED (null), never false; with a parent it reads the PARENT's value.
  v_r2 := custom.record_write(v_org, custom.rule_kernel_id(), jsonb_build_object(
    'name','Visit fee follows the patient plan','kind','predicate','scope_table_id',v_tbl::text,
    'uses',jsonb_build_array('applicability'),'applies_to_types','[]'::jsonb,
    'expr', jsonb_build_object('op','eq','args', jsonb_build_array(
              jsonb_build_object('field', v_f_kind::text),
              jsonb_build_object('parent_field', v_f_kind::text)))));
  if v_r2 is null then raise exception 'REC-16: an applicability Rule reading the parent could not be stored at all'; end if;
  perform set_config('role', v_boss, true);
  if custom.rule_truth(custom.rule_run(v_org, v_r2, '{"kind":"square"}'::jsonb) -> 'answer') is not null then
    raise exception 'REC-16: with no parent in the context the rule answered % instead of leaving it undecided',
      custom.rule_run(v_org, v_r2, '{"kind":"square"}'::jsonb) -> 'answer';
  end if;
  if custom.rule_truth(custom.rule_run(v_org, v_r2, '{"kind":"square"}'::jsonb,
                                       '{"parent_values":{"kind":"circle"}}'::jsonb) -> 'answer') is not false then
    raise exception 'REC-16: the parent_field node did not read the PARENT''s value';
  end if;
  if custom.rule_truth(custom.rule_run(v_org, v_r2, '{"kind":"square"}'::jsonb,
                                       '{"parent_values":{"kind":"square"}}'::jsonb) -> 'answer') is not true then
    raise exception 'REC-16: the parent_field node did not answer true when the parent matched';
  end if;
  perform set_config('role', 'authenticated', true);

  -- A comparison of a word with a number is refused by name rather than coerced: a coerced
  -- comparison answers about a different value, which is a rule that lies. The Rule is
  -- DECLARED from the seat; only the direct run steps out.
  v_r2 := custom.record_write(v_org, custom.rule_kernel_id(), jsonb_build_object(
    'name','Allergy list must be reviewed','kind','predicate','scope_table_id',v_tbl::text,
    'uses',jsonb_build_array('validate'),'applies_to_types','[]'::jsonb,
    'expr', jsonb_build_object('op','gt','args', jsonb_build_array(
              jsonb_build_object('field', v_f_title::text), jsonb_build_object('const', 1)))));
  perform set_config('role', v_boss, true);
  begin
    perform custom.rule_run(v_org, v_r2, '{"title":"S1"}'::jsonb);
    raise exception 'REC-15: a word was compared with a number';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'this rule compares numbers, and it was given a string and a number' then
      raise exception 'REC-15 coercion: the refusal said "%"', v_msg;
    end if;
  end;
  -- POSITIVE CONTROL for the same node: two numbers compare, and the second input disagrees.
  v_j := custom.rule_eval(v_org, jsonb_build_object('op','gt','args', jsonb_build_array(
           jsonb_build_object('field', v_f_width::text), jsonb_build_object('const', 1))),
           '{"width":4}'::jsonb);
  if v_j <> to_jsonb(true) then raise exception 'REC-15: 4 > 1 answered %', v_j; end if;
  v_j := custom.rule_eval(v_org, jsonb_build_object('op','gt','args', jsonb_build_array(
           jsonb_build_object('field', v_f_width::text), jsonb_build_object('const', 9))),
           '{"width":4}'::jsonb);
  if v_j <> to_jsonb(false) then raise exception 'REC-15 second input: 4 > 9 answered %', v_j; end if;

  -- AN ABSENT VALUE MAKES THE ANSWER UNDECIDED, and undecided is not false.
  v_j := custom.rule_eval(v_org, jsonb_build_object('op','eq','args', jsonb_build_array(
           jsonb_build_object('field', v_f_width::text), jsonb_build_object('field', v_f_hgt::text))),
           '{"width":4}'::jsonb);
  if jsonb_typeof(v_j) <> 'null' then
    raise exception 'REC-15: a comparison against an absent value answered %, and it is undecided', v_j;
  end if;
  if custom.rule_truth(v_j) is not null then
    raise exception 'REC-15: custom.rule_truth read an undecided answer as %', custom.rule_truth(v_j);
  end if;
  if custom.rule_truth(to_jsonb(false)) is not false or custom.rule_truth(to_jsonb(true)) is not true then
    raise exception 'REC-15: custom.rule_truth does not read true and false as themselves';
  end if;

  -- Dividing by nothing is refused by name, and the positive control divides.
  begin
    perform custom.rule_eval(v_org, jsonb_build_object('op','div','args', jsonb_build_array(
              jsonb_build_object('const', 6), jsonb_build_object('const', 0))), '{}'::jsonb);
    raise exception 'REC-15: a division by zero answered';
  exception when division_by_zero then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'this rule divides by nothing' then
      raise exception 'REC-15 div: the refusal said "%"', v_msg;
    end if;
  end;
  v_j := custom.rule_eval(v_org, jsonb_build_object('op','div','args', jsonb_build_array(
           jsonb_build_object('const', 6), jsonb_build_object('const', 3))), '{}'::jsonb);
  if v_j <> to_jsonb(2) then raise exception 'REC-15: 6 / 3 answered %', v_j; end if;
  perform set_config('role', 'authenticated', true);
  raise notice 'F GREEN — a Rule that reads the parent is storable from the seat and never answers wrongly; the evaluator refuses a word against a number and a division by nothing by name, leaves an absent value undecided, and answers both sides of two real comparisons';

  -- ══════════════════════════════════════════════════════════════════════════
  -- G. WHAT A RULE MUST DECLARE — every refusal paired with a control
  -- ══════════════════════════════════════════════════════════════════════════
  -- All of §G is asked from the seat, through the same write door.
  begin
    perform custom.record_write(v_org, custom.rule_kernel_id(), jsonb_build_object(
      'name','Outstanding balance total','kind','expression','scope_table_id',v_tbl::text,
      'uses',jsonb_build_array('compute','validate'),'applies_to_types','[]'::jsonb,
      'target_field_id', v_f_sides::text,
      'expr', jsonb_build_object('op','add','args', jsonb_build_array(
                jsonb_build_object('field', v_f_width::text), jsonb_build_object('field', v_f_hgt::text)))));
    raise exception 'REC-15: an expression Rule was allowed to validate';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'the rule Outstanding balance total works out a value, so it cannot also decide validate' then
      raise exception 'REC-15 kind: the refusal said "%"', v_msg;
    end if;
  end;
  -- THE CONTROL: the same expression Rule, computing only, LANDS.
  v_r2 := custom.record_write(v_org, custom.rule_kernel_id(), jsonb_build_object(
    'name','Visit fee total','kind','expression','scope_table_id',v_tbl::text,
    'uses',jsonb_build_array('compute'),'applies_to_types','[]'::jsonb,'sort',20,
    'target_field_id', v_f_sides::text,
    'expr', jsonb_build_object('op','add','args', jsonb_build_array(
              jsonb_build_object('field', v_f_width::text), jsonb_build_object('field', v_f_hgt::text)))));
  if v_r2 is null then raise exception 'REC-15: an expression Rule that only computes was refused'; end if;
  -- DECLARED ORDER, which is what DYN-6's first-match Resolver will read: sort 10 then 20.
  -- The enumerator is the store's, so this clause steps out and says so.
  perform set_config('role', v_boss, true);
  select count(*) into v_n from custom.table_rules(v_org, v_tbl, 'compute', 'square');
  if v_n <> 2 then raise exception 'REC-15: % compute Rules for a square, and two were declared', v_n; end if;
  select (array_agg(t.data ->> 'name'))[1] into v_txt
    from custom.table_rules(v_org, v_tbl, 'compute', 'square') t;
  if v_txt <> 'A square has equal sides' then
    raise exception 'REC-15: the first Rule in declared order is %, and sort 10 comes before sort 20', v_txt;
  end if;
  perform set_config('role', 'authenticated', true);

  -- A compute Rule with nowhere to put its answer is refused; a compute Rule pointing at a
  -- hand-filled field is refused by that field's own name.
  begin
    perform custom.record_write(v_org, custom.rule_kernel_id(), jsonb_build_object(
      'name','Treatment estimate total','kind','predicate','scope_table_id',v_tbl::text,
      'uses',jsonb_build_array('compute'),'applies_to_types','[]'::jsonb,
      'expr', jsonb_build_object('op','present','args', jsonb_build_array(
                jsonb_build_object('field', v_f_width::text)))));
    raise exception 'REC-15: a compute Rule with no target field was stored';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'the rule Treatment estimate total works something out, so it has to say which field holds the answer' then
      raise exception 'REC-15 target: the refusal said "%"', v_msg;
    end if;
  end;
  begin
    perform custom.record_write(v_org, custom.rule_kernel_id(), jsonb_build_object(
      'name','Patient display name','kind','predicate','scope_table_id',v_tbl::text,
      'uses',jsonb_build_array('compute'),'applies_to_types','[]'::jsonb,
      'target_field_id', v_f_title::text,
      'expr', jsonb_build_object('op','present','args', jsonb_build_array(
                jsonb_build_object('field', v_f_width::text)))));
    raise exception 'REC-15: a Rule computing a hand-filled field was stored';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'the rule Patient display name puts its answer in Title, and that field is filled in by hand' then
      raise exception 'FLD-9 target: the refusal said "%"', v_msg;
    end if;
  end;
  -- A Rule with no uses at all, a Rule with an invented use, a narrowing of a use the Rule
  -- does not have, and a Rule about no Table.
  begin
    perform custom.record_write(v_org, custom.rule_kernel_id(), jsonb_build_object(
      'name','Intake stage must advance','kind','predicate','scope_table_id',v_tbl::text,
      'uses','[]'::jsonb,'applies_to_types','[]'::jsonb,
      'expr', jsonb_build_object('op','present','args', jsonb_build_array(jsonb_build_object('field', v_f_width::text)))));
    raise exception 'REC-15: a Rule for no use at all was stored';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'the rule Intake stage must advance has to say what it is for' then
      raise exception 'REC-15 uses empty: the refusal said "%"', v_msg;
    end if;
  end;
  begin
    perform custom.record_write(v_org, custom.rule_kernel_id(), jsonb_build_object(
      'name','Member ID must match the carrier','kind','predicate','scope_table_id',v_tbl::text,
      'uses',jsonb_build_array('validate','summarise'),'applies_to_types','[]'::jsonb,
      'expr', jsonb_build_object('op','present','args', jsonb_build_array(jsonb_build_object('field', v_f_width::text)))));
    raise exception 'REC-15: a fifth use was stored';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'the rule Member ID must match the carrier says it is used to summarise, and there is no such use' then
      raise exception 'REC-15 fifth use: the refusal said "%"', v_msg;
    end if;
  end;
  begin
    perform custom.record_write(v_org, custom.rule_kernel_id(), jsonb_build_object(
      'name','Primary dentist must be assigned','kind','predicate','scope_table_id',v_tbl::text,
      'uses',jsonb_build_array('validate'),'applies_to_types','[]'::jsonb,
      'use_types', jsonb_build_object('compute', jsonb_build_array('square')),
      'expr', jsonb_build_object('op','present','args', jsonb_build_array(jsonb_build_object('field', v_f_width::text)))));
    raise exception 'REC-15: a narrowing of a use the Rule does not have was stored';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'the rule Primary dentist must be assigned narrows its compute use, and it is not used to compute at all' then
      raise exception 'REC-15 narrowing: the refusal said "%"', v_msg;
    end if;
  end;
  begin
    perform custom.record_write(v_org, custom.rule_kernel_id(), jsonb_build_object(
      'name','Referral source must be recorded','kind','predicate','scope_table_id', v_mf_kern::text,
      'uses',jsonb_build_array('validate'),'applies_to_types','[]'::jsonb,
      'expr', jsonb_build_object('op','present','args', jsonb_build_array(jsonb_build_object('field', v_f_width::text)))));
    raise exception 'REC-15: a Rule about a table that is not a table was stored';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'the rule Referral source must be recorded says it is about a table this organization does not have' then
      raise exception 'REC-15 scope: the refusal said "%"', v_msg;
    end if;
  end;
  raise notice 'G GREEN — an expression that judges, a compute Rule with nowhere to put its answer, one computing a hand-filled field, one for no use at all, one with a fifth use, one narrowing a use it does not have and one about a table that is not a table are each refused by name through custom.record_write, with the corrected Rule landing beside them';

  -- ══════════════════════════════════════════════════════════════════════════
  -- H. THE PROJECTION IS A SURFACE, AND A PERSON CANNOT REACH IT AT ALL
  -- ══════════════════════════════════════════════════════════════════════════
  -- The old suite wrote a Rule THROUGH the view `custom.rule` and proved the same guard
  -- fired. From the seat that question cannot even be asked: the view carries no grant, so
  -- there is no second way in for a person — a STRONGER answer than "the second way in is
  -- guarded". The view write itself is then proven as the operator it is.
  begin
    perform 1 from custom.rule limit 1;
    raise exception 'H: the projection custom.rule is readable from a client seat, so it IS a second surface';
  exception when insufficient_privilege then null;
  end;
  -- And a DELETE through the door a person HAS soft-deletes rather than erasing, so History
  -- has something to read (W3-HIST).
  v_r2 := custom.record_write(v_org, custom.rule_kernel_id(), jsonb_build_object(
    'name','Phone number must be reachable','kind','predicate','scope_table_id',v_tbl::text,
    'uses',jsonb_build_array('validate'),'applies_to_types','[]'::jsonb,
    'expr', jsonb_build_object('op','present','args', jsonb_build_array(jsonb_build_object('field', v_f_width::text)))));
  perform custom.record_delete(v_org, v_r2);
  if (custom.record_resolve(v_org, v_r2) ->> 'live')::boolean then
    raise exception 'REC-15: a Rule deleted through the door is still live';
  end if;
  perform set_config('role', v_boss, true);
  select count(*) into v_n from custom.record where organization_id = v_org and id = v_r2 and deleted_at is not null;
  if v_n <> 1 then raise exception 'REC-15: a Rule deleted through the door was erased rather than retired'; end if;
  -- The OPERATOR half: a Rule written through the projection meets the SAME guard.
  begin
    insert into custom.rule (organization_id, name, kind, scope_table_id, uses, applies_to_types, expr)
    values (v_org, 'Email must be on file', 'predicate', v_tbl,
            jsonb_build_array('validate'), '[]'::jsonb,
            jsonb_build_object('op','present','args', jsonb_build_array(jsonb_build_object('field_name','width'))));
    raise exception 'REC-17: the surface let a name-referencing Rule through';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'the rule Email must be on file names a field instead of pointing at it' then
      raise exception 'REC-17 through the surface: the refusal said "%"', v_msg;
    end if;
  end;
  perform set_config('role', 'authenticated', true);
  raise notice 'H GREEN — the projection custom.rule is unreachable from a client seat, a Rule deleted through the door a person has is retired rather than erased, and a Rule written through the projection meets the same guard';

  -- ══════════════════════════════════════════════════════════════════════════
  -- I. THE TRIGGER ORDER IS LOAD-BEARING, so it is asserted rather than assumed
  -- ══════════════════════════════════════════════════════════════════════════
  -- W1-FIELD's validator decides the TYPES and this lane's Rules are then asked about values
  -- already the right shape. Postgres fires BEFORE ROW triggers in name order, so the proof
  -- is that a square whose width is WORDS is refused by the FIELD, not by the Rule — and
  -- that IS a person's question, asked from the seat.
  begin
    perform custom.record_write(v_org, v_tbl, '{"title":"S7","kind":"square","width":"four","height":4}'::jsonb);
    raise exception 'REC-51: a width of "four" was stored';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'Width takes a number, and it was given a string' then
      raise exception 'trigger order: the refusal said "%", and the FIELD should have spoken first', v_msg;
    end if;
  end;
  -- The catalogue half, out of the seat.
  perform set_config('role', v_boss, true);
  if (select min(tgname) from pg_trigger
       where tgrelid = 'custom.record'::regclass and not tgisinternal
         and tgname in ('custom_record_field_validation','custom_record_rule_uses'))
     <> 'custom_record_field_validation' then
    raise exception 'REC-15: the rule trigger no longer sorts after the field validation trigger';
  end if;
  perform set_config('role', 'authenticated', true);
  raise notice 'I GREEN — a width of words is refused by the FIELD and not by the Rule, and the two triggers still sort in that order';

  -- ══════════════════════════════════════════════════════════════════════════
  -- J. THIS LANE CREATED NO RELATION (operator: no door reads pg_class)
  -- ══════════════════════════════════════════════════════════════════════════
  perform set_config('role', v_boss, true);
  select count(*) into v_tables_after
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'custom' and c.relkind in ('r', 'p');
  if v_tables_after <> v_tables_before then
    raise exception 'REC-25: schema custom held % tables and now holds % — a Rule is a Record and this lane creates no relation',
                    v_tables_before, v_tables_after;
  end if;
  select count(*) into v_n from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'custom' and c.relkind = 'v' and c.relname = 'rule';
  if v_n <> 1 then raise exception 'REC-15: custom.rule is not a view'; end if;
  select count(*) into v_n from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'custom' and c.relname = 'rule' and c.relkind = 'v'
     and 'security_invoker=true' = any (c.reloptions);
  if v_n <> 1 then raise exception 'REC-15: custom.rule is not security_invoker'; end if;
  perform set_config('role', 'authenticated', true);
  raise notice 'J GREEN — schema custom holds % tables, unchanged: a Rule is a Record', v_tables_after;

  -- ══════════════════════════════════════════════════════════════════════════
  -- K. THE NEGATIVE CLAUSE, AS A REAL SECOND PERSON
  -- `test@test.com` is a member of this organization and was shared nothing. Every refusal
  -- above is a STORE RULE; this one is the ACCESS question, which the old seat could not ask
  -- at all: as the owner of `custom.record`, `custom.assert_client_may_reach` returned true
  -- on its first line for every organization on the database.
  -- ══════════════════════════════════════════════════════════════════════════
  perform set_config('request.jwt.claims', c_dana_j, true);

  -- K1. She cannot change the Rule that judges everybody else's squares.
  v_seen := null;
  begin
    perform custom.record_update(v_org, v_rule, '{"message":"Dana says anything goes"}'::jsonb);
  exception when others then v_seen := sqlerrm;
  end;
  if v_seen is null then
    raise exception 'K FAILED: test@test.com rewrote a Rule nobody shared with her';
  end if;

  -- K2. Nor delete the square that Rule judged.
  v_seen := null;
  begin
    perform custom.record_delete(v_org, v_sq);
  exception when others then v_seen := sqlerrm;
  end;
  if v_seen is null then
    raise exception 'K FAILED: test@test.com deleted a record nobody shared with her';
  end if;

  -- K3. THE CONTROL, so K1 and K2 are not a door that refuses her everything: the record she
  --     IS given reads back with the answer the Rule worked out for it.
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform custom.share_grant(v_org, v_sq, 'user', c_dana, 'viewer'::public.permission_level);
  perform set_config('request.jwt.claims', c_dana_j, true);
  if (custom.read_record(v_org, v_sq, true) -> 'sides_equal') <> to_jsonb(true) then
    raise exception 'K FAILED: the record shared with test@test.com at viewer does not read back with its worked-out answer';
  end if;
  perform set_config('request.jwt.claims', c_admin_j, true);
  raise notice 'K GREEN — a member who was shared nothing cannot rewrite the Rule or delete the record it judged, and the record shared with her at viewer reads back with the answer the Rule worked out';

  raise notice 'W1-RULE SUITE GREEN — one Rule row (%) declared for four uses, validate and compute executed against it from the seat `authenticated` on the MAIN database, the Width field renamed underneath it and the Rule still firing, and the version travelling with every answer it produced', v_rule;
end;
$t$;

rollback;
