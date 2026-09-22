-- scripts/campaign-tests/enrich_green.sql — LANE ENRICH, PRODUCTS row 10.
-- "Fill in each company's industry and headcount, and keep it fresh."
--
-- EVERY ASSERTED CLAUSE RUNS AS `authenticated`, THROUGH THE DOORS A SIGNED-IN PERSON
-- REACHES. PART 0 proves the seat is real before anything is claimed. The suite makes its
-- own organization, its own Companies table, its own fifty records and its own share, and
-- ROLLS THE WHOLE THING BACK — it leaves nothing behind and asserts nothing about anybody
-- else's data.
--
-- Run: <scratchpad>/p.sh -f scripts/campaign-tests/enrich_green.sql
--
-- The red twin is scripts/campaign-tests/enrich_red.sql.

\set ON_ERROR_STOP on

-- TARGET AND DEPENDENCIES — the one shared preamble. It accepts the MAIN database or the
-- rehearsal branch named in common-docs/.../plan/BRANCH-REF, refuses anything else by name,
-- says which database this is, and SKIPS (never fake-passes) when a declared dependency is
-- absent here. Declare dependencies with `\set requires` above the include; see the preamble.
\set suite 'enrich_green.sql'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif
begin;
-- The connection goes through the transaction pooler, so a SESSION-level SET lands on a
-- different backend than the statements below. It has to be `set local`.
set local lock_timeout = '10s';
set local statement_timeout = '60s';

do $suite$
declare
  c_admin   uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_dana    uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  c_admin_j text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_dana_j  text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_boss    text := current_user;
  v_org     uuid := gen_random_uuid();
  v_home    uuid;
  v_tbl     uuid;
  v_ind     uuid;   -- the Industry field
  v_head    uuid;   -- the Headcount field
  v_secret  uuid;   -- a confidential field, for the sensitivity refusal
  v_id      uuid;
  v_one     uuid;   -- the record a person pins
  v_out     jsonb;
  v_res     jsonb := '[]'::jsonb;
  v_row     record;
  v_msg     text;
  v_n       integer;
  v_i       integer;
  v_at      timestamptz;
  v_at2     timestamptz;
  v_actor   text;
begin
  -- ══ FIXTURE, as the connected role. A seat is a PERSON, so both people exist. ══════════
  perform set_config('app.actor_system', 'campaign-test/enrich_green.sql', true);

  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'ENRICH green suite', 'enrich-green-' || replace(v_org::text,'-',''), 'EGS', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
  values (v_org, 'organization', v_org, c_admin, 'owner',  'active'),
         (v_org, 'organization', v_org, c_dana,  'member', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value)
  values ('custom','system_enabled','organization', v_org, v_org, 'true'),
         ('custom','member_default_visibility','organization', v_org, v_org, '"shared_only"');

  insert into custom.record (organization_id, table_id, data_class, data, created_by)
  values (v_org, custom.organization_kernel_id(), 'record',
          jsonb_build_object('name','Workspace'), c_admin)
  returning id into v_home;

  perform set_config('request.jwt.claims', c_admin_j, true);

  -- ══ PART 0 — TAKE THE SEAT AND PROVE IT ════════════════════════════════════════════════
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
  raise notice 'PART 0 PASSED — the seat is authenticated and cannot read custom.record directly';

  -- ── The Companies table and its columns, through the doors a person reaches. ───────────
  v_tbl := custom.table_declare(v_org, jsonb_build_object(
    'name','Companies','slug','companies','description','','type','entity','display','list',
    'ordered', false, 'weight','light','retention_days',30,'row_order','sorted',
    'default_sort', jsonb_build_array(jsonb_build_object('field','title','direction','asc')),
    'agent_writable', true, 'label_singular','Company','label_plural','Companies',
    'title_field','title',
    'fields', jsonb_build_array(jsonb_build_object('name','title')),
    'parent_id', v_home));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('label','Name','key','title','type','text'));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('label','Website','key','website','type','url'));
  v_ind  := custom.field_declare(v_org, v_tbl, jsonb_build_object('label','Industry','key','industry','type','text'));
  v_head := custom.field_declare(v_org, v_tbl, jsonb_build_object('label','Headcount','key','headcount','type','number'));
  v_secret := custom.field_declare(v_org, v_tbl, jsonb_build_object(
    'label','Owner payroll','key','payroll','type','text','sensitivity','confidential'));

  -- FIFTY companies, the size of the brief.
  for v_i in 1..50 loop
    v_id := custom.record_write(v_org, v_tbl, jsonb_build_object(
      'title',   'Company ' || lpad(v_i::text, 2, '0'),
      'website', 'https://company' || lpad(v_i::text, 2, '0') || '.example'));
    if v_i = 7 then v_one := v_id; end if;
  end loop;

  -- ══ PART 1 — AN ENRICHMENT IS DECLARED IN PLAIN WORDS, AND IT STARTS SWITCHED OFF ══════
  v_out := custom.enrich_declare(v_org, v_ind, jsonb_build_object(
    'instruction', 'the industry this company is in, in two or three words',
    'inputs', jsonb_build_array('title','website'),
    'web_search', true,
    'review_interval_days', 30,
    'confidence_floor', 0.6));
  if (v_out -> 'enrichment' ->> 'instruction') is distinct from 'the industry this company is in, in two or three words' then
    raise exception '1: the instruction did not survive the declaration — %', v_out;
  end if;
  if coalesce((v_out -> 'enrichment' ->> 'enabled')::boolean, false) then
    raise exception '1: a brand new enrichment must start switched off, and this one did not';
  end if;
  if (v_out -> 'enrichment' ->> 'model') is null then
    raise exception '1: the enrichment names no model, so the organization knob was not read';
  end if;
  -- AGT-6: the freshness landed on the FIELD, which is where the law says it lives.
  select f.data ->> 'review_interval_days' into v_msg
    from custom.applicable_fields(v_org, v_tbl, null) f where f.data ->> 'key' = 'industry';
  if v_msg is distinct from '30' then
    raise exception '1: review_interval_days is % on the Field, not 30 — custom.field_update dropped it again', coalesce(v_msg,'absent');
  end if;
  raise notice 'PART 1 PASSED — the enrichment is on the Field, in plain words, and switched off';

  -- ══ PART 2 — NOTHING LANDS WHILE IT IS SWITCHED OFF ════════════════════════════════════
  begin
    perform custom.enrich_land(v_org, v_ind,
      jsonb_build_array(jsonb_build_object('record_id', v_one, 'value', 'Recycling', 'confidence', 0.9)));
    raise exception '2: a switched-off enrichment wrote a value';
  exception when insufficient_privilege then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%switched off%' then raise exception '2: refused for the wrong reason — %', v_msg; end if;
  end;
  raise notice 'PART 2 PASSED — an enrichment nobody enabled writes nothing: "%"', v_msg;

  -- ══ PART 3 — THE PREVIEW: FIVE ROWS, WITH WHAT THE INSTRUCTION MAY READ, BEFORE ANYBODY
  --            TURNS IT ON ═══════════════════════════════════════════════════════════════
  select count(*) into v_n from custom.enrich_due(v_org, v_ind, 5, false);
  if v_n <> 5 then raise exception '3: the preview asked for five rows and got %', v_n; end if;
  select * into v_row from custom.enrich_due(v_org, v_ind, 5, false) limit 1;
  if v_row.reason is distinct from 'never filled in' then
    raise exception '3: a column nobody has filled in says "%"', v_row.reason;
  end if;
  if (v_row.inputs ->> 'title') is null or (v_row.inputs ->> 'website') is null then
    raise exception '3: the preview row carries no inputs — %', v_row.inputs;
  end if;
  if v_row.inputs ? 'payroll' then
    raise exception '3: the preview handed the model a column the enrichment never declared';
  end if;
  raise notice 'PART 3 PASSED — five rows, each with its own % — before anything was enabled', v_row.inputs;

  -- ══ PART 4 — AN ADMIN TURNS IT ON, AND THAT IS THE STANDING APPROVAL ═══════════════════
  v_out := custom.enrich_declare(v_org, v_ind, jsonb_build_object('enabled', true));
  if (v_out -> 'enrichment' ->> 'enabled_by') is distinct from c_admin::text then
    raise exception '4: the enable did not record whose authority it runs on — %', v_out -> 'enrichment';
  end if;
  if (v_out -> 'enrichment' ->> 'instruction') is distinct from 'the industry this company is in, in two or three words' then
    raise exception '4: turning it on reset the instruction — %', v_out -> 'enrichment';
  end if;
  raise notice 'PART 4 PASSED — %', v_out ->> 'says';

  -- ══ PART 5 — THE BATCH LANDS: VALUES, AN UNSURE ANSWER, AND NOTHING TO FIND ════════════
  v_res := '[]'::jsonb;
  v_i := 0;
  -- WHICH COMPANY GETS WHICH ANSWER IS DECIDED BY ITS NAME, NOT BY THE ORDER THE DOOR
  -- HANDED THEM BACK. Every record here is created in one transaction, so they all share a
  -- `created_at` and the door's tie-break is arbitrary — a suite that assumed the loop order
  -- would assert a different company's cell on a different run, which is a flake and not a test.
  for v_row in select * from custom.enrich_due(v_org, v_ind, 50, false) loop
    v_i := (regexp_replace(v_row.title, '[^0-9]', '', 'g'))::integer;
    v_res := v_res || jsonb_build_array(case
      -- 46 of them: a confident answer with its evidence and one runner-up.
      when v_i <= 46 then jsonb_build_object(
        'record_id', v_row.record_id,
        'value', 'Commercial recycling',
        'confidence', 0.88,
        'evidence', jsonb_build_object('read', jsonb_build_array(jsonb_build_object(
                      'url', v_row.inputs ->> 'website', 'title', v_row.title,
                      'at', now()::text)),
                    'note', 'the about page says what they do'),
        'alternates', jsonb_build_array(jsonb_build_object('value','Waste management','rank',2)))
      -- two the model was not sure enough about
      when v_i <= 48 then jsonb_build_object(
        'record_id', v_row.record_id, 'value', 'Possibly logistics', 'confidence', 0.31,
        'evidence', jsonb_build_object('note','the site says almost nothing'))
      -- two with nothing to find at all
      else jsonb_build_object('record_id', v_row.record_id, 'absent', 'none',
        'evidence', jsonb_build_object('note','the website does not resolve'))
    end);
  end loop;

  v_out := custom.enrich_land(v_org, v_ind, v_res, jsonb_build_object(
    'trigger','batch','model','claude-fable-5-latest','model_version','2026-05-01',
    'cost_cents', 6.25, 'tokens_in', 41000, 'tokens_out', 2600,
    'started_at', (now() - interval '38 seconds')::text));

  if (v_out ->> 'rows_written')::int <> 46 then
    raise exception '5: % values landed, not 46 — %', v_out ->> 'rows_written', v_out ->> 'says';
  end if;
  if (v_out ->> 'rows_below_floor')::int <> 2 then
    raise exception '5: % answers were kept as candidates, not 2', v_out ->> 'rows_below_floor';
  end if;
  if (v_out ->> 'rows_absent')::int <> 2 then
    raise exception '5: % cells say there was nothing to find, not 2', v_out ->> 'rows_absent';
  end if;
  if (v_out ->> 'cost_per_row_cents')::numeric <> round(6.25 / 50, 4) then
    raise exception '5: the cost per row is % and 6.25 over 50 rows is %',
                    v_out ->> 'cost_per_row_cents', round(6.25/50, 4);
  end if;
  raise notice 'PART 5 PASSED — % (cost per row % cents)', v_out ->> 'says', v_out ->> 'cost_per_row_cents';

  -- ══ PART 6 — WHAT A CELL SHOWS: WHO, WHEN, OUT OF WHAT, AND WHAT IT BEAT ═══════════════
  select * into v_row from custom.enrich_cells(v_org, v_tbl, array['industry'], array[v_one]);
  if not v_row.agent_owned then raise exception '6: the cell does not know a model owns its column'; end if;
  if v_row.actor is distinct from 'agent' then
    raise exception '6: the badge would say "%" and not agent', coalesce(v_row.actor,'nothing');
  end if;
  if v_row.on_behalf_of is distinct from c_admin::text then
    raise exception '6: the badge does not name the person the agent acted for — %', coalesce(v_row.on_behalf_of,'nobody');
  end if;
  if (v_row.source ->> 'model') is distinct from 'claude-fable-5-latest'
     or (v_row.source ->> 'model_version') is distinct from '2026-05-01' then
    raise exception '6: the cell does not carry the model and its version — %', v_row.source;
  end if;
  if jsonb_array_length(coalesce(v_row.source -> 'read', '[]'::jsonb)) < 1 then
    raise exception '6: the cell carries no evidence of what was read — %', v_row.source;
  end if;
  if (v_row.alternates -> 0 ->> 'value') is distinct from 'Waste management' then
    raise exception '6: the runner-up did not survive — %', v_row.alternates;
  end if;
  if v_row.pinned then raise exception '6: nobody pinned this cell and it says pinned'; end if;
  if v_row.stale then raise exception '6: a value written a moment ago is not stale'; end if;
  v_at := v_row.written_at;
  raise notice 'PART 6 PASSED — the cell says: agent, for %, model %, read %, runner-up %',
    v_row.on_behalf_of, v_row.source ->> 'model', v_row.source -> 'read' -> 0 ->> 'url',
    v_row.alternates -> 0 ->> 'value';

  -- The unsure answer: a candidate, never a value.
  select c.* into v_row from custom.enrich_cells(v_org, v_tbl, array['industry'], null) c
   where c.absent_reason = 'conflicting' limit 1;
  if v_row.value is not null and jsonb_typeof(v_row.value) <> 'null' then
    raise exception '6b: an answer below the floor was written into the cell anyway — %', v_row.value;
  end if;
  if (v_row.alternates -> 0 ->> 'value') is distinct from 'Possibly logistics' then
    raise exception '6b: the unsure answer was not kept as the top candidate — %', v_row.alternates;
  end if;
  raise notice 'PART 6b PASSED — an unsure answer reads "conflicting" and its guess is candidate 1: %',
    v_row.alternates -> 0 ->> 'value';

  -- ══ PART 7 — A PERSON TYPES OVER THE CELL, AND IT IS THEIRS FROM THAT MOMENT ═══════════
  perform custom.record_update(v_org, v_one, jsonb_build_object('industry', 'Metal recovery'));
  select * into v_row from custom.enrich_cells(v_org, v_tbl, array['industry'], array[v_one]);
  if not v_row.pinned then
    raise exception '7: a person typed over a column a model owns and the cell is not held against it';
  end if;
  if v_row.actor is distinct from 'user' then
    raise exception '7: the cell says "%" wrote it and a person did', v_row.actor;
  end if;

  select count(*) into v_n from custom.enrich_due(v_org, v_ind, 50, true) d where d.record_id = v_one;
  if v_n <> 0 then raise exception '7: a pinned cell was handed out as work anyway'; end if;

  v_out := custom.enrich_land(v_org, v_ind,
    jsonb_build_array(jsonb_build_object('record_id', v_one, 'value', 'Something else', 'confidence', 0.99)),
    jsonb_build_object('trigger','now','cost_cents', 0.1));
  if (v_out ->> 'rows_pinned')::int <> 1 or (v_out ->> 'rows_written')::int <> 0 then
    raise exception '7: the run wrote over a pinned cell — %', v_out ->> 'says';
  end if;
  select * into v_row from custom.enrich_cells(v_org, v_tbl, array['industry'], array[v_one]);
  if (v_row.value #>> '{}') is distinct from 'Metal recovery' then
    raise exception '7: the person''s own answer is gone — the cell now says %', v_row.value;
  end if;
  raise notice 'PART 7 PASSED — the person''s "Metal recovery" survived the next run: %', v_out -> 'results' -> 0 ->> 'says';

  -- ══ PART 8 — AND THEY CAN HAND IT BACK ═════════════════════════════════════════════════
  v_out := custom.enrich_pin(v_org, v_one, 'industry', false);
  select * into v_row from custom.enrich_cells(v_org, v_tbl, array['industry'], array[v_one]);
  if v_row.pinned then raise exception '8: un-pinning did not un-pin — %', v_out; end if;
  select count(*) into v_n from custom.enrich_due(v_org, v_ind, 50, true) d where d.record_id = v_one;
  if v_n <> 1 then raise exception '8: an un-pinned cell is still not work the model may do'; end if;
  raise notice 'PART 8 PASSED — %', v_out ->> 'says';

  -- ══ PART 10 — FRESHNESS: PAST ITS DATE, MARKED STALE, NEVER SILENTLY OVERWRITTEN ═══════
  -- A step no client door covers, and it is STATED: `custom._value_envelope` stamps `at` on
  -- every write and REFUSES a caller's own, which is exactly right and is also why a suite
  -- cannot forge an old value through a door. The moment is moved back with the triggers off,
  -- inside this transaction, and NOTHING is asserted while out of the seat.
  perform set_config('role', v_boss, true);
  set local session_replication_role = 'replica';
  update custom.record r
     set data = jsonb_set(r.data, array['_values','industry','at'],
                          to_jsonb((now() - interval '40 days')::text))
   where r.organization_id = v_org and r.table_id = v_tbl
     and r.data -> '_values' -> 'industry' ->> 'at' is not null
     and (r.data ? 'industry');
  set local session_replication_role = 'origin';
  perform set_config('role', 'authenticated', true);

  -- ══ PART 9 — THE CLASS FIX, PROVED ON AN AGED VALUE ═══════════════════════════════════
  -- This is what freshness stands on, and it can ONLY be proved against a value whose
  -- moment is not this transaction's: `now()` is constant inside a transaction, so
  -- "write another column and see whether the moment moved" cannot tell the two behaviours
  -- apart on a value written a statement ago. Against the 40-day-old moment above it can —
  -- the old body restamps it to now() and this one leaves it exactly where it is.
  select c.written_at, c.actor into v_at, v_actor
    from custom.enrich_cells(v_org, v_tbl, array['industry'], array[v_one]) c;
  if v_at > now() - interval '39 days' then
    raise exception '9: the industry''s moment is % and the ageing step should have put it 40 days back', v_at;
  end if;
  perform custom.record_update(v_org, v_one, jsonb_build_object('headcount', 41));
  select c.written_at, c.actor into v_at2, v_msg
    from custom.enrich_cells(v_org, v_tbl, array['industry'], array[v_one]) c;
  if v_at2 is distinct from v_at then
    raise exception '9: writing the headcount moved the industry''s own moment from % to %', v_at, v_at2;
  end if;
  if v_msg is distinct from v_actor then
    raise exception '9: writing the headcount changed who wrote the industry, from % to %', v_actor, v_msg;
  end if;
  raise notice 'PART 9 PASSED — writing another column left the industry''s 40-day-old moment at % and its author "%"', v_at, v_actor;

  select count(*) into v_n from custom.enrich_cells(v_org, v_tbl, array['industry'], null) c where c.stale;
  if v_n < 40 then raise exception '10: only % cells read as stale after 40 days at a 30 day interval', v_n; end if;
  select count(*) into v_n from custom.enrich_due(v_org, v_ind, 50, false);
  if v_n < 40 then raise exception '10: only % stale rows came back as work', v_n; end if;
  select * into v_row from custom.enrich_due(v_org, v_ind, 50, false) limit 1;
  -- 🚨 RE-PINNED (lane RED-SUITES-2, 2026-09-21). The sentence changed on purpose:
  -- `migrations/campaign/tidy_one_freshness_ceiling.sql` (commit `a13209570d`) made
  -- `custom.freshness_verdict` the ONE implementation of the freshness ceiling — it had been
  -- written out twice, eighteen lines each, and nothing checked that the two agreed — and its
  -- own header states the product rule: "THE SENTENCE IS THE PRODUCT. A stale value is
  -- DELIVERED, never dropped: dropping a real value because nobody re-verified it is worse
  -- than saying how old it is."
  --
  -- The clause matched one four-word prefix. It now asserts the three things the sentence is
  -- FOR, which the prefix never checked: how old the value is, the freshness the column itself
  -- declares, and that the value was delivered rather than dropped.
  if v_row.reason not ilike '%day(s) ago%'
     or v_row.reason not ilike '%freshness this field declares%'
     or v_row.reason not ilike '%rather than dropped%' then
    raise exception '10: a stale row''s reason does not say how old it is, what freshness the column declares, and that the value was delivered anyway: "%"', v_row.reason;
  end if;
  -- AND THE VALUE IS STILL THERE. Stale marks it; it does not erase it.
  select c.value into v_out from custom.enrich_cells(v_org, v_tbl, array['industry'], null) c
   where c.stale and c.value is not null limit 1;
  if v_out is null then raise exception '10: a stale cell lost its value'; end if;
  raise notice 'PART 10 PASSED — % rows are past their freshness date, still holding their values, reason "%"', v_n, v_row.reason;

  -- ══ PART 11 — THE MONEY, PER COLUMN AND PER ROW ════════════════════════════════════════
  select * into v_row from custom.enrichments(v_org, v_tbl) e where e.field_key = 'industry';
  if not v_row.enabled then raise exception '11: the enrichment reads as switched off'; end if;
  if v_row.cost_cents <> 6.35 then
    raise exception '11: this column has cost % cents and two runs spent 6.25 + 0.10', v_row.cost_cents;
  end if;
  if v_row.rows_total <> 50 then raise exception '11: the census counts % rows, not 50', v_row.rows_total; end if;
  if v_row.runs <> 2 then raise exception '11: % runs were recorded, not 2', v_row.runs; end if;
  select count(*) into v_n from custom.enrich_runs(v_org, v_ind, 50);
  if v_n <> 2 then raise exception '11: the run list shows %', v_n; end if;
  raise notice 'PART 11 PASSED — % rows, % filled, % stale, % runs, % cents so far, % per row',
    v_row.rows_total, v_row.rows_filled, v_row.rows_stale, v_row.runs, v_row.cost_cents, v_row.cost_per_row_cents;

  -- ══ PART 12 — THE THREE REFUSALS, IN PLAIN WORDS ═══════════════════════════════════════
  -- SENSITIVITY (AGT-7): a confidential column may be neither read nor filled.
  begin
    perform custom.enrich_declare(v_org, v_ind, jsonb_build_object(
      'instruction','work out the industry from the payroll',
      'inputs', jsonb_build_array('title','payroll')));
    raise exception '12: an enrichment was allowed to read a confidential column';
  exception when insufficient_privilege then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%payroll%' or v_msg not like '%confidential%' then
      raise exception '12: refused without naming the column and its level — %', v_msg;
    end if;
  end;
  raise notice 'PART 12a PASSED — "%"', v_msg;

  -- AN INPUT THAT IS NOT A COLUMN, refused by name with the real list.
  begin
    perform custom.enrich_declare(v_org, v_head, jsonb_build_object(
      'instruction','how many people work there, as a number',
      'inputs', jsonb_build_array('revenue')));
    raise exception '12: an enrichment named a column that does not exist and was accepted';
  exception when invalid_parameter_value then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%revenue%' then raise exception '12: refused without naming it — %', v_msg; end if;
  end;
  raise notice 'PART 12b PASSED — "%"', v_msg;

  -- COST: the month's budget, asked before any work is handed out.
  perform set_config('role', v_boss, true);
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value)
  values ('custom','enrichment_cost_cap_cents','organization', v_org, v_org, '1');
  perform set_config('role', 'authenticated', true);
  begin
    perform count(*) from custom.enrich_due(v_org, v_ind, 5, true);
    raise exception '12: work was handed out past the organization''s budget';
  exception when configuration_limit_exceeded then
    get stacked diagnostics v_msg = message_text;
  end;
  raise notice 'PART 12c PASSED — "%"', v_msg;
  perform set_config('role', v_boss, true);
  update platform.knob_override set value = '2000'
   where feature='custom' and key='enrichment_cost_cap_cents' and organization_id = v_org;
  perform set_config('role', 'authenticated', true);

  -- RATE: the ask is trimmed to the organization's ceiling, and the rows say so.
  perform set_config('role', v_boss, true);
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value)
  values ('custom','enrichment_batch_ceiling','organization', v_org, v_org, '10');
  perform set_config('role', 'authenticated', true);
  select count(*) into v_n from custom.enrich_due(v_org, v_ind, 50, true);
  if v_n <> 10 then raise exception '12: the batch ceiling of 10 handed out % rows', v_n; end if;
  select * into v_row from custom.enrich_due(v_org, v_ind, 50, true) limit 1;
  if v_row.trimmed_to is distinct from 10 then
    raise exception '12: the rows do not say the ask was trimmed — %', coalesce(v_row.trimmed_to::text,'nothing');
  end if;
  raise notice 'PART 12d PASSED — an ask for 50 was trimmed to % and every row says so', v_row.trimmed_to;

  -- ══ PART 13 — THE MEMBER'S SEAT: SHE SEES THE BADGES, SHE DOES NOT SET THE COLUMN ══════
  perform set_config('role', v_boss, true);
  update custom.record set created_by = c_admin, visibility = 'personal'::platform.visibility
   where organization_id = v_org and table_id = v_tbl;
  update custom.record set created_by = c_admin where organization_id = v_org and id = v_tbl;
  insert into iam.permissions (resource_type, resource_id, granted_to_user_id, permission_level, status)
  select 'record', r.id, c_dana, 'viewer', 'active'
    from custom.record r
   where r.organization_id = v_org and r.table_id = v_tbl
     and (r.data ->> 'title') in ('Company 01','Company 02','Company 03');
  insert into iam.permissions (resource_type, resource_id, granted_to_user_id, permission_level, status)
  values ('record', v_tbl, c_dana, 'viewer', 'active');
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', c_dana_j, true);

  -- THE CONTROL: she really can reach the store, so the refusal below is not "she is refused
  -- everything".
  select count(*) into v_n from custom.enrich_cells(v_org, v_tbl, array['industry'], null);
  if v_n <> 3 then
    raise exception '13: the member sees % badged cells and three records were shared with her', v_n;
  end if;
  select * into v_row from custom.enrich_cells(v_org, v_tbl, array['industry'], null) limit 1;
  if v_row.actor is distinct from 'agent' or v_row.on_behalf_of is distinct from c_admin::text then
    raise exception '13: the member''s badge does not say who wrote the value — %', v_row;
  end if;
  -- AND THE CONTROLS ARE NOT HERS.
  begin
    perform custom.enrich_declare(v_org, v_ind, jsonb_build_object('enabled', false));
    raise exception '13: a viewer switched the organization''s enrichment off';
  exception when insufficient_privilege or check_violation then
    get stacked diagnostics v_msg = message_text;
  end;
  raise notice 'PART 13 PASSED — the member sees % badged cells, and setting the column up is refused: "%"', 3, v_msg;

  raise notice '=== ALL PARTS PASSED ===';
end;
$suite$;

rollback;
