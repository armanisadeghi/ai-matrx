-- LANE STORE-TAILS-2 — THE GREEN SUITE. Two things, on the MAIN database, in one transaction
-- that ends in ROLLBACK:
--
--   A. VERIFIER-11 F5 — a worked-out column that JOINS columns prints the words a person
--      reads (a choice's label, a relation's display words), joined by the separator the
--      formula asked for — while every COMPARISON over the same columns still sees the stored
--      value, because a gate that compared labels would change its mind when somebody renames
--      an option.
--   B. The owner's law of 2026-09-20 — `custom.migrate_purge` ARCHIVES, in resumable chunks,
--      and destroys nothing; the hard delete is `custom.migrate_purge_hard`, a chair-only
--      compliance door that refuses without a written reason, refuses while anything in scope
--      is still live, and refuses until every archived record has sat archived for 30 days.
--
-- RUN IT:
--   PSQL="$(node node_modules/tsx/dist/cli.mjs scripts/lib/psql-path.ts --print)"
--   "$PSQL" "<the main database DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/storetails2_green.sql
--
-- ITS RED TWIN is `scripts/campaign-tests/storetails2_red.sql`, which runs the real bytes of
-- both inverses and asserts the defects exactly as VERIFIER-11 measured them.
--
-- THE SEAT. Every asserted clause of PART 1–4 runs as `authenticated`, the role PostgREST
-- gives a signed-in person. PART 0 proves the seat is held. The fixture's Home record, the
-- back-dating of an archive date, and the chair's own call in PART 5 are the only steps that
-- leave it, and they assert nothing about the seat while they are out.
--
-- THE USE CASE, NAMED BEFORE A SINGLE VALUE IS TYPED (owner's law, 2026-09-21).
-- Sierra Ridge Tree Care is a four-person arborist crew working the Ojai valley. The office
-- keeps Work Orders — a work-order number, the service chosen from the crew's own short list
-- (Crown reduction, Deadwood removal, Stump grinding, Storm cleanup), and the property the
-- order is for — and prints ONE "Work order label" column onto the daily route sheet, so a
-- climber reads the sheet in the truck without opening the app. That printed label is exactly
-- the string F5 is about: it has to say `SR-4181 — Crown reduction — 1140 Grand Ave` and not
-- `SR-4181crown_reduction`.
--
-- WHAT MAKES IT FAIL — the production change, named, one per part:
--   1  reverse the concat arm of `custom.rule_eval` → the label prints the option key again
--   2  make `concat` resolve through `custom.field_words` for comparisons too → `eq` starts
--      answering about labels and every gate quietly changes its mind on a rename
--   3  put the unchunked `delete from custom.record` back into `custom.migrate_purge` →
--      an ordinary screen destroys an organization's records again
--   4  drop the reason check, the live check or the 30-day check from `custom.migrate_purge_hard`
--   5  grant EXECUTE on `custom.migrate_purge_hard` to `authenticated` → the hard delete is
--      back on the path a signed-in person reaches

\set ON_ERROR_STOP on
\timing off

\set suite 'storetails2_green.sql'
\set requires 'exec:custom.record_write|function:custom.field_words|function:custom.migrate_purge_hard'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;

do $t$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_boss    constant text := current_user;

  v_org     uuid := gen_random_uuid();
  v_name    text;
  v_home    uuid;
  v_props   uuid;      -- Properties
  v_orders  uuid;      -- Work Orders
  v_f_addr  uuid;
  v_f_num   uuid;
  v_f_svc   uuid;
  v_f_prop  uuid;
  v_f_label uuid;
  v_p1      uuid;
  v_o1      uuid;
  v_label   text;
  v_words   text;
  v_res     jsonb;
  v_caught  text;
  v_code    text;
  v_n       bigint;
  v_live    bigint;
  v_k_crown text;
  v_k_storm text;
begin
  perform set_config('app.actor_system', 'campaign-test/storetails2_green', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  v_name := 'Sierra Ridge Tree Care — Ojai Yard ' || substr(v_org::text, 1, 8);
  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, v_name, 'sierra-ridge-tree-ojai-' || substr(v_org::text, 1, 8), 'SRT', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
  values (v_org, 'organization', v_org, c_admin, 'owner', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom','system_enabled','organization', v_org, v_org, 'true'::jsonb, 'storetails2_green');

  -- The Home record is made by onboarding, not by a browser; no client door covers it.
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
    raise exception '0: this seat owns custom.record, so every wall would open on its first line';
  end if;
  begin
    perform 1 from custom.record limit 1;
    raise exception '0: this seat can SELECT custom.record directly, so it is not a client seat';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PART 0 PASSED — the seat is `authenticated` and custom.record is closed to it.';

  -- ── THE CREW'S TWO TABLES, through the doors a person reaches.
  v_props := custom.table_declare(v_org, jsonb_build_object(
    'name','Properties','slug','properties','type','entity',
    'label_singular','Property','label_plural','Properties','title_field','address','display','page',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,'on_delete','cascade',
    'fields', jsonb_build_array(jsonb_build_object('name','address')),
    'parent_id', v_home::text));
  v_f_addr := custom.field_declare(v_org, v_props, jsonb_build_object(
    'key','address','label','Address','plain','text','sort',10));
  v_p1 := custom.record_write(v_org, v_props, jsonb_build_object('address','1140 Grand Ave'));

  v_orders := custom.table_declare(v_org, jsonb_build_object(
    'name','Work Orders','slug','work_orders','type','entity',
    'label_singular','Work Order','label_plural','Work Orders','title_field','order_number','display','page',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,'on_delete','cascade',
    'fields', jsonb_build_array(jsonb_build_object('name','order_number')),
    'parent_id', v_home::text));
  v_f_num  := custom.field_declare(v_org, v_orders, jsonb_build_object(
    'key','order_number','label','Work order number','plain','text','sort',10));
  v_f_svc  := custom.field_declare(v_org, v_orders, jsonb_build_object(
    'label','Service','parity_type','select','sort',20,
    'options', jsonb_build_array('Crown reduction','Deadwood removal','Stump grinding','Storm cleanup')));
  v_f_prop := custom.field_declare(v_org, v_orders, jsonb_build_object(
    'key','property','label','Property','type','relation','sort',30,
    'relation_target', v_props::text));

  -- THE PRINTED LABEL, declared exactly as the field editor writes it — with the separator
  -- this lane added to that panel.
  v_f_label := custom.field_declare(v_org, v_orders, jsonb_build_object(
    'key','work_order_label','label','Work order label','parity_type','formula','sort',40,
    'compute_on','write',
    'depends_on', jsonb_build_array(to_jsonb(v_f_num::text), to_jsonb(v_f_svc::text), to_jsonb(v_f_prop::text)),
    'expr', jsonb_build_object('op','concat','separator',' — ',
      'args', jsonb_build_array(jsonb_build_object('field', v_f_num::text),
                                jsonb_build_object('field', v_f_svc::text),
                                jsonb_build_object('field', v_f_prop::text)))));

  -- The option keys, read back through the door a screen reads them with. These are the
  -- STORED values — `crown_reduction`, `storm_cleanup` — and the whole of F5 is that they are
  -- not what the route sheet should print.
  select o.metadata ->> 'option_key' into v_k_crown
    from custom.field_options(v_org, v_f_svc) o where o.data ->> 'title' = 'Crown reduction';
  select o.metadata ->> 'option_key' into v_k_storm
    from custom.field_options(v_org, v_f_svc) o where o.data ->> 'title' = 'Storm cleanup';
  if v_k_crown is null or v_k_storm is null or v_k_crown = 'Crown reduction' then
    raise exception '0: the crew''s service list did not come back with stored option keys (% / %)', v_k_crown, v_k_storm;
  end if;

  v_o1 := custom.record_write(v_org, v_orders, jsonb_build_object(
            'order_number','SR-4181',
            'service', v_k_crown,
            'property', v_p1::text));

  -- The rest of the day's route sheet, so PART 6 can prove the erasure really works a chunk
  -- at a time rather than in one statement.
  perform custom.record_write(v_org, v_orders, jsonb_build_object(
    'order_number','SR-4182', 'service', v_k_storm, 'property', v_p1::text));
  perform custom.record_write(v_org, v_orders, jsonb_build_object(
    'order_number','SR-4183', 'service', v_k_crown, 'property', v_p1::text));
  perform custom.record_write(v_org, v_orders, jsonb_build_object(
    'order_number','SR-4184', 'service', v_k_storm, 'property', v_p1::text));

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 1 — F5. THE LABEL A CLIMBER READS IN THE TRUCK.
  -- ════════════════════════════════════════════════════════════════════════════
  select x.document ->> 'work_order_label' into v_label
    from custom.read_records(v_org, v_orders, false, 50, 0) x
   where x.id = v_o1;

  if v_label is null then
    raise exception '1: the worked-out column computed nothing at all';
  end if;
  if v_label ~ '(crown_reduction|_)' then
    raise exception '1: the label a person reads still carries the machine''s word — "%"', v_label;
  end if;
  if v_label !~ '^SR-4181 — Crown reduction — 1140 Grand Ave$' then
    raise exception '1: the label reads "%", not "SR-4181 — Crown reduction — 1140 Grand Ave"', v_label;
  end if;
  raise notice '1 PASSED — the route sheet reads "%": the option''s label, the property''s words, and the separator the formula asked for.', v_label;

  -- ── 1b AND PART 2 ASK THE EVALUATOR DIRECTLY, and custom.rule_eval, custom.record_values
  --    and custom.rule_context are deliberately NOT client-callable — they are what the doors
  --    use, never what a browser calls. So this stretch, and only this stretch, is the chair's.
  execute format('set local role %I', v_boss);

  -- A SECOND INPUT WITH A DIFFERENT EXPECTED VALUE: no separator declared means the formula
  -- answers exactly what every formula written before today answers.
  v_words := custom.rule_eval(v_org,
    jsonb_build_object('op','concat','args', jsonb_build_array(
      jsonb_build_object('field', v_f_num::text), jsonb_build_object('field', v_f_svc::text))),
    custom.record_values(v_org, v_o1), custom.rule_context(v_org, v_o1)) #>> '{}';
  if v_words <> 'SR-4181Crown reduction' then
    raise exception '1b: with no separator the join reads "%", not "SR-4181Crown reduction"', v_words;
  end if;
  raise notice '1b PASSED — with no separator declared the join reads "%" — words, and nothing inserted between them.', v_words;

  -- ── IT FOLLOWS A WRITE. The office corrects the service on the order.
  perform custom.record_update(v_org, v_o1, jsonb_build_object('service', v_k_storm));
  select x.document ->> 'work_order_label' into v_label
    from custom.read_records(v_org, v_orders, false, 50, 0) x
   where x.id = v_o1;
  if v_label !~ '^SR-4181 — Storm cleanup — 1140 Grand Ave$' then
    raise exception '1c: after the service was corrected the label reads "%"', v_label;
  end if;
  raise notice '1c PASSED — after a write the label reads "%".', v_label;

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 2 — AND A COMPARISON STILL SEES THE STORED VALUE.
  -- ════════════════════════════════════════════════════════════════════════════
  if custom.rule_truth(custom.rule_eval(v_org,
       jsonb_build_object('op','eq','args', jsonb_build_array(
         jsonb_build_object('field', v_f_svc::text),
         jsonb_build_object('const', v_k_storm))),
       custom.record_values(v_org, v_o1), custom.rule_context(v_org, v_o1))) is not true then
    raise exception '2: a comparison against the STORED option key stopped being true';
  end if;
  if custom.rule_truth(custom.rule_eval(v_org,
       jsonb_build_object('op','eq','args', jsonb_build_array(
         jsonb_build_object('field', v_f_svc::text),
         jsonb_build_object('const', 'Storm cleanup'))),
       custom.record_values(v_org, v_o1), custom.rule_context(v_org, v_o1))) is true then
    raise exception '2: a comparison started matching the option''s LABEL — a rename would now change what every gate decides';
  end if;
  raise notice '2 PASSED — eq still asks about the stored key and still says no to the label. Only the join resolves words.';

  -- ── 2b, ASKED HERE BECAUSE HERE IS WHERE THE FIXTURE IS STILL LIVE. The compliance door
  --    refuses while ANYTHING in scope is unarchived, and the refusal says so in those words —
  --    a live record is not a record somebody decided to erase, it is one nobody archived.
  v_caught := null;
  begin
    perform custom.migrate_purge_hard(v_org, null,
      'Sierra Ridge Tree Care asked us to erase the closed 2019 Grand Ave file under its own records policy.', 200, false);
  exception when others then v_caught := sqlerrm; v_code := sqlstate;
  end;
  if v_caught is null or v_code <> '23514' or v_caught !~ 'still live' then
    raise exception '2b: live records did not stop the hard delete (% / %)', v_code, coalesce(v_caught, '(no error)');
  end if;
  raise notice '2b PASSED — with the crew''s records still live: "%"', v_caught;

  -- Back to the seat for PART 3 and PART 4.
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception '2: the suite did not get back into the seat — current_user is %', current_user;
  end if;

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 3 — THE PURGE ARCHIVES, AND DESTROYS NOTHING.
  -- ════════════════════════════════════════════════════════════════════════════
  v_res := custom.migrate_purge(v_org, null, true);
  if (v_res ->> 'archived')::integer <> 0 then
    raise exception '3a: a dry run changed % record(s)', v_res ->> 'archived';
  end if;
  if (v_res ->> 'remaining')::bigint = 0 then
    raise exception '3a: the dry run says there is nothing live here, and this organization holds a property and an order: %', v_res;
  end if;
  raise notice '3a PASSED — the dry run changed nothing and said "%".', v_res ->> 'message';

  select count(*) into v_n from custom.read_records(v_org, v_orders, false, 200, 0);
  if v_n = 0 then
    raise exception '3b: the fixture has no live orders before the archive';
  end if;

  v_res := custom.migrate_purge(v_org, null, false);
  if (v_res ->> 'rows_purged')::bigint <> 0 then
    raise exception '3b: the purge verb destroyed % row(s) — it is supposed to archive', v_res ->> 'rows_purged';
  end if;
  if (v_res ->> 'archived')::integer = 0 then
    raise exception '3b: the purge verb archived nothing: %', v_res;
  end if;
  if v_res ->> 'policy' !~ 'brought back' then
    raise exception '3b: the answer does not say the records can be brought back: %', v_res ->> 'policy';
  end if;

  -- NOTHING WAS DESTROYED: every row is still there, archived, and readable as archived.
  select count(*) into v_n from custom.read_records_archived(v_org, v_orders, 'org', false, 200, 0);
  if v_n = 0 then
    raise exception '3c: after the archive there is nothing in the archive — the rows are gone';
  end if;
  select count(*) into v_live from custom.read_records(v_org, v_orders, false, 200, 0);
  if v_live <> 0 then
    raise exception '3c: % order(s) are still live after the archive finished', v_live;
  end if;
  raise notice '3 PASSED — % archived order(s) are still here and still restorable; rows_purged is 0. "%"', v_n, v_res ->> 'message';

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 4 — THE COMPLIANCE DOOR IS NOT ON A SEAT'S PATH AT ALL.
  -- ════════════════════════════════════════════════════════════════════════════
  if has_function_privilege('authenticated',
       'custom.migrate_purge_hard(uuid,uuid,text,integer,boolean)', 'execute') then
    raise exception '4a: `authenticated` holds EXECUTE on the hard delete';
  end if;
  if has_function_privilege('anon',
       'custom.migrate_purge_hard(uuid,uuid,text,integer,boolean)', 'execute') then
    raise exception '4a: `anon` holds EXECUTE on the hard delete';
  end if;
  raise notice '4a PASSED — neither `authenticated` nor `anon` holds EXECUTE on the hard delete.';

  v_caught := null;
  begin
    perform custom.migrate_purge_hard(v_org, null,
      'Sierra Ridge Tree Care asked us to erase the 2019 Grand Ave file under its own records policy.', 200, false);
  exception when others then
    v_caught := sqlerrm; v_code := sqlstate;
  end;
  if v_caught is null then
    raise exception '4b: a signed-in seat called the hard delete and it ran';
  end if;
  if v_code <> '42501' then
    raise exception '4b: a seat calling the hard delete was refused with % (%), not 42501', v_code, v_caught;
  end if;
  raise notice '4b PASSED — from the seat the hard delete answers "%"', v_caught;

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 5 — AND FROM THE CHAIR IT STILL REFUSES, THREE WAYS.
  --   Leaves the seat deliberately: this door exists for a person at a terminal.
  -- ════════════════════════════════════════════════════════════════════════════
  execute format('set local role %I', v_boss);

  -- The catalogue is read here rather than in PART 4 because a client seat holds no SELECT on
  -- platform.client_callable_door at all — which is itself the boundary this clause is about.
  if not exists (select 1 from platform.client_callable_door d
                  where d.schema_name = 'custom' and d.function_name = 'migrate_purge_hard'
                    and d.signed_in_callers = false and d.anonymous_callers = false
                    and d.non_client_lane ~* 'chair') then
    raise exception '5: the hard delete is not registered as a chair-only lane';
  end if;
  raise notice '5 — the catalogue declares the hard delete a chair-only lane, with no signed-in and no anonymous caller. PASS';

  v_caught := null;
  begin
    perform custom.migrate_purge_hard(v_org, null, null, 200, false);
  exception when others then v_caught := sqlerrm; v_code := sqlstate;
  end;
  if v_caught is null or v_code <> '22004' then
    raise exception '5a: the hard delete ran with no compliance reason (% / %)', v_code, coalesce(v_caught, '(no error)');
  end if;
  raise notice '5a PASSED — with no written reason: "%"', v_caught;

  v_caught := null;
  begin
    perform custom.migrate_purge_hard(v_org, null,
      'Sierra Ridge Tree Care asked us to erase the closed 2019 Grand Ave file under its own records policy.', 200, false);
  exception when others then v_caught := sqlerrm; v_code := sqlstate;
  end;
  if v_caught is null or v_code <> '23514' then
    raise exception '5b: records archived today were destroyed (% / %)', v_code, coalesce(v_caught, '(no error)');
  end if;
  if v_caught !~ 'less than' then
    raise exception '5b: the refusal does not name the window: "%"', v_caught;
  end if;
  raise notice '5b PASSED — inside the window: "%"', v_caught;

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 6 — AND WHEN THE WINDOW HAS REALLY RUN OUT, IT DESTROYS — IN CHUNKS, AND
  --          LEAVES BEHIND THE SENTENCE THAT EXPLAINS THE MISSING ROWS.
  --          The back-dating is a fixture step, run as the chair: there is no door for
  --          "pretend this was archived last year" and there must not be one.
  -- ════════════════════════════════════════════════════════════════════════════
  update custom.record r
     set deleted_at = now() - interval '400 days'
   where r.organization_id = v_org and r.deleted_at is not null
     and ((r.data_class = 'record' and r.table_id = v_orders) or r.id = v_orders);

  v_res := custom.migrate_purge_hard(v_org, v_orders,
    'Sierra Ridge Tree Care asked us to erase the closed 2019 Grand Ave file under its own records policy.', 2, true);
  if (v_res ->> 'rows_purged')::bigint <> 0 then
    raise exception '6a: a dry run destroyed % row(s)', v_res ->> 'rows_purged';
  end if;
  if (v_res ->> 'eligible')::bigint = 0 then
    raise exception '6a: nothing is eligible although everything here has been archived for 400 days: %', v_res;
  end if;
  raise notice '6a PASSED — the dry run destroyed nothing and found % eligible row(s).', v_res ->> 'eligible';

  -- CHUNKED: asked for two, it takes two and says how many are left.
  v_res := custom.migrate_purge_hard(v_org, v_orders,
    'Sierra Ridge Tree Care asked us to erase the closed 2019 Grand Ave file under its own records policy.', 2, false);
  if (v_res ->> 'rows_purged')::bigint <> 2 then
    raise exception '6b: a chunk of 2 destroyed % row(s)', v_res ->> 'rows_purged';
  end if;
  if (v_res ->> 'remaining')::bigint = 0 or (v_res ->> 'done')::boolean then
    raise exception '6b: two rows of an organization''s whole archive was reported as the whole job: %', v_res;
  end if;
  if not exists (select 1 from history.migration_log m
                  where m.organization_id = v_org and m.verb = 'purge_hard'
                    and m.note ~ 'Sierra Ridge Tree Care'
                    and m.inverse ->> 'kind' = 'none') then
    raise exception '6b: the erasure left no entry saying who asked for it and why';
  end if;
  raise notice '6 PASSED — a chunk of 2 destroyed 2, % left to go, and the reason is on the history entry.', v_res ->> 'remaining';

  raise notice 'ALL CLAUSES PASSED — storetails2_green.sql';
  raise exception 'ROLLBACK: the suite passed and this transaction is deliberately thrown away';
exception when others then
  if sqlerrm !~ '^ROLLBACK:' then raise; end if;
  raise notice '%', sqlerrm;
end
$t$;

rollback;
