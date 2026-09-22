-- W3-HIST — THE RED TWIN of `scripts/campaign-tests/w3_hist_c17.sql`.
--
-- Rule 2: a guard that cannot be demonstrated failing is not a guard. This file turns THIS
-- LANE'S enforcement points off, one at a time, inside ONE transaction that ROLLS BACK, and
-- asserts that each thing C-17 relies on DISAPPEARS — and, where the failure is silent rather
-- than loud, that the WRONG ANSWER IS ACTUALLY HANDED TO A PERSON, which is the half that
-- matters.
--
-- 🚨 RE-POINTED AND SEATED (lane ORG-DELETE, 2026-09-19), to agree with its green twin.
-- Three things changed and each of them changed what this file proves:
--
--   1. IT RUNS ON THE MAIN DATABASE, on a disposable organization of its own, exactly like
--      `w3_hist_c17.sql`. It used to refuse to run anywhere but the rehearsal branch — a copy
--      carrying 226 functions in schema `custom` against main's 332 and no `custom.field_declare`
--      at all — so a red twin that ran there was measuring a store nobody uses. The owner's
--      2026-09-18 ruling is that there is no production and everything is the main database.
--
--   2. EVERY OBSERVATION IS MADE FROM THE SEAT `authenticated`, THROUGH THE DOORS A SIGNED-IN
--      PERSON REACHES. This is the half a red twin is for: "the guard is gone" is a fact about
--      a function body, but "a person is now told something untrue" is the defect. So each arm
--      asks `custom.query_record_as_of`, `custom.io_revisions`, `custom.history_retention_set`,
--      `custom.history_prune`, `custom.migrations`, `custom.migrate_undo`, `custom.share_grant`,
--      `custom.visibility_as_of`, `custom.record_update` and `custom.read_record` — never
--      `custom.record`, `history.migration_log` or `history.value_as_of`, which no person may
--      reach and which the connected owner can read straight through.
--
--   3. THE WEAKENINGS ARE AIMED AT THE ENFORCEMENT POINTS THE DOORS ACTUALLY USE. The old
--      RED 2 and RED 3 replaced `history.value_in_document` and `history.value_as_of` — and
--      `custom.query_record_as_of`, the door C-17 asks, calls NEITHER of them. It calls
--      `history.value_in_force` and `history.record_at`. A red twin aimed at a function nothing
--      in the client lane calls goes green for the wrong reason: it is a demonstration that the
--      suite's own assertion path was never the product's. Both arms are re-aimed, and both now
--      turn the door's answer wrong in front of a person.
--
-- WHAT IS DONE OUT OF THE SEAT, AND WHY. A weakening is DDL — `drop trigger`, `create or
-- replace function` — and no signed-in person may do DDL at all; that is the point of a seat.
-- So every weakening, and every restore, steps out with `perform set_config('role', v_boss,
-- true)`, does the one operator statement, and steps back. NO CLAUSE IS ASSERTED WHILE OUT.
-- The same rule covers the fixtures with no client door: a Home record, a Rule record, a Merge
-- field record, the kernel probe, the simulated-time shift, and the one inverse-less Migration
-- RED 6 needs written by hand.
--
-- EVERY ARM PUTS BACK WHAT IT TOOK, by re-executing the definition it captured with
-- `pg_get_functiondef` before weakening it. The transaction rolls back anyway; the restore is
-- so that arm N+1 measures the store as it is rather than as arm N left it.
--
--   RED 1 — the capture trigger. `zzz_history_capture` is dropped and six writes across six
--           data_class values record NOTHING — and `custom.io_revisions`, the door onto a
--           person's own record's past, shows them zero versions of a record they just wrote.
--   RED 2 — the world clock's absence. `history.value_in_force` falls back to the document's
--           plain key when no period covers the date, and `custom.query_record_as_of` hands a
--           person a contract valid from 2027 as the answer for June 2026 — the silent wrong
--           answer, not a refusal, and `_effective`'s "not_yet" goes with it.
--   RED 3 — the second clock. `history.record_at` ignores the moment it is asked about, so
--           `custom.query_record_as_of(…, p_recorded_at, …)` answers with today's document:
--           "what did this store SAY in August 2026" comes back as September's correction.
--           One clock wearing two argument names.
--   RED 4 — the retention floor. `history.retention_set` loses its floor comparison and the
--           refusal a person meets at `custom.history_retention_set` moves one layer deeper,
--           from the door that names the remedy to the shape guard that names the rule.
--   RED 5 — HIS-4. `history.prune` loses its `migration_log` arm and `custom.history_prune`
--           deletes the one thing that is never pruned — read back through `custom.migrations`,
--           which is where a person would have found the Migration and now finds nothing.
--   RED 6 — HIS-8. `history.migration_record` accepts a null inverse, a log entry that claims
--           undoability it does not have is written, and the person who tries to undo it
--           through `custom.migrate_undo` sixty days later is the one who finds out.
--   RED 7 — VIS-16's registration. The `record` row in `platform.shareable_resource_registry`
--           is deactivated, `custom.share_grant` refuses the person the share, and
--           `custom.visibility_as_of` replays "nobody" — which is what this database answered
--           before the registration existed.
--   RED 8 — DYN-19. `custom_record_merge_field_temporal_guard` is dropped and a person lands
--           "whenever" as a temporal mode through `custom.record_update`, readable straight
--           back off `custom.read_record`.
--
-- IT IS NOT A MIGRATION: it lives outside `migrations/`, no sweep can see it, and it ROLLS
-- BACK. Everything it makes — one disposable organization, its home, its tables, its fields,
-- its records, its grants and one knob override — disappears with it.
--
-- RUN IT:
--   PSQL="$(node node_modules/tsx/dist/cli.mjs scripts/lib/psql-path.ts --print)"
--   "$PSQL" "<the main database DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/w3_hist_red.sql

\set ON_ERROR_STOP on
\timing off

-- TARGET AND DEPENDENCIES — the one shared preamble. It accepts the MAIN database or the
-- rehearsal branch named in common-docs/.../plan/BRANCH-REF, refuses anything else by name,
-- says which database this is, and SKIPS (never fake-passes) when a declared dependency is
-- absent here. Declare dependencies with `\set requires` above the include; see the preamble.
\set suite 'w3_hist_red.sql'
\set requires 'grant:authenticated:custom.table_declare'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local statement_timeout = '60s';
set local lock_timeout = '10s';

do $r$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_dana    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_t_open   constant timestamptz := '2026-07-01 00:00:00+00';
  v_t_before constant timestamptz := '2026-08-10 12:00:00+00';
  v_t_ask    constant timestamptz := '2026-08-15 12:00:00+00';
  v_org     uuid := gen_random_uuid();
  v_home    uuid;
  v_tbl     uuid;
  v_tbl2    uuid;
  v_f_addr  uuid;
  v_rule    uuid;
  v_mf      uuid;
  v_rec     uuid;
  v_rec2    uuid;
  v_rec3    uuid;
  v_mark    bigint;
  v_log     uuid;
  v_doc     jsonb;
  v_res     jsonb;
  v_txt     text;
  v_msg     text;
  v_n       integer;
  v_def     text;
  v_trg     text;
  v_trgs    text[];
  v_drops   text[];
  v_boss    text := current_user;   -- the connected role, for the operator statements
begin
  perform set_config('app.actor_system', 'campaign-test/w3_hist_red', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Meridian Auto Body Hist Red', 'meridian-auto-body-hist-red-' || substr(v_org::text, 1, 8), 'MHR', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org, 'organization', v_org, c_admin, 'owner',  'active'),
    (v_org, 'organization', v_org, c_dana,  'member', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom','system_enabled','organization', v_org, v_org, 'true'::jsonb, 'w3_hist_red');

  -- A Home record has no client door of its own; it is built as the connected role.
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name', 'Home')) returning id into v_home;

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 0 — THE SEAT. Every observation below this line is a person's.
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
  begin
    perform 1 from history.row_versions limit 1;
  exception when insufficient_privilege then
    raise exception '0: this seat cannot SELECT history.row_versions, and the RLS policy std_select says a member may read their own organization''s versions';
  end;
  begin
    perform 1 from history.capture_window limit 1;
    raise exception '0: this seat can read history.capture_window, which is the mechanism''s own bookkeeping and holds no client grant';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PART 0 PASSED — the seat is `authenticated`, the ladder sees a client, custom.record is not readable from it, and history.row_versions is reached only through its RLS.';

  -- ══════════════════════════════════════════════════════════════════════════
  -- RED 1 — THE CAPTURE TRIGGER. Take it away and a person's own past is blank.
  -- ══════════════════════════════════════════════════════════════════════════
  perform set_config('role', v_boss, true);
  -- 🚨 DERIVED FROM THE LIVE CATALOGUE (lane RED-SUITES-3, 2026-09-21). This block used to
  -- name ONE trigger, `zzz_history_capture`, and
  -- `writeperf2_the_after_triggers_fire_once_per_statement.sql` replaced it with a
  -- STATEMENT-level trio — `zzz_history_capture_s_i` / `_s_u` / `_s_d` over
  -- `history.record_capture_stmt_insert` / `_stmt_update` / `_stmt_delete`. So the
  -- precondition stopped finding anything and this arm proved nothing for as long as that
  -- was true. It now asks the catalogue WHICH triggers on `custom.record` write history,
  -- takes every one of them away and puts every one back — so a future rewrite that renames
  -- or re-splits them keeps working, and a rewrite that removes the last of them fails HERE,
  -- by name, instead of quietly passing.
  select array_agg(pg_get_triggerdef(tg.oid) order by tg.tgname),
         array_agg(format('drop trigger %I on custom.record', tg.tgname) order by tg.tgname)
    into v_trgs, v_drops
    from pg_trigger tg
    join pg_proc p on p.oid = tg.tgfoid
    join pg_namespace n on n.oid = p.pronamespace
   where tg.tgrelid = 'custom.record'::regclass
     and not tg.tgisinternal
     and n.nspname = 'history' and p.proname like 'record_capture%';
  if v_trgs is null or array_length(v_trgs, 1) = 0 then
    raise exception 'RED 1 precondition: no trigger on custom.record calls a history.record_capture* body, so there is no capture to take away';
  end if;
  foreach v_txt in array v_drops loop execute v_txt; end loop;
  select coalesce(max(id), 0) into v_mark from history.row_versions;
  perform set_config('role', 'authenticated', true);

  -- The shape, through the doors a person reaches.
  v_tbl := custom.table_declare(v_org, jsonb_build_object(
    'name', 'W3-HIST RED Client', 'slug', 'w3_hist_red_client', 'type', 'entity',
    'label_singular', 'Client', 'label_plural', 'Clients', 'title_field', 'client_name',
    'display', 'page', 'weight', 'light', 'ordered', false, 'row_order', 'sorted',
    'default_sort', '[]'::jsonb, 'agent_writable', true, 'retention_days', 365,
    'fields', jsonb_build_array(jsonb_build_object('name','client_name'),
                                jsonb_build_object('name','address'),
                                jsonb_build_object('name','contract')),
    'parent_id', v_home::text));

  v_tbl2 := custom.table_declare(v_org, jsonb_build_object(
    'name', 'W3-HIST RED Light', 'slug', 'w3_hist_red_light', 'type', 'entity',
    'label_singular', 'Light', 'label_plural', 'Lights', 'title_field', 'client_name',
    'display', 'list', 'weight', 'light', 'ordered', false, 'row_order', 'sorted',
    'default_sort', '[]'::jsonb, 'agent_writable', true, 'retention_days', 30,
    'fields', jsonb_build_array(jsonb_build_object('name','client_name')),
    'parent_id', v_home::text));

  perform custom.field_declare(v_org, v_tbl, jsonb_build_object(
    'key','client_name','label','Client name','plain','text','sort',10));
  v_f_addr := custom.field_declare(v_org, v_tbl, jsonb_build_object(
    'key','address','label','Address','plain','text','sort',20,'dated',true));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object(
    'key','contract','label','Contract','plain','text','sort',30,'dated',true));
  perform custom.field_declare(v_org, v_tbl2, jsonb_build_object(
    'key','client_name','label','Client name','plain','text','sort',10));

  -- The three declarations no client door covers — a Rule, a Merge field and the kernel row
  -- that is the sixth data_class. They step out, and assert nothing while out.
  perform set_config('role', v_boss, true);
  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org, custom.rule_kernel_id(), 'rule', jsonb_build_object(
    'name','RED has an address','kind','predicate','sort',10,
    'uses', jsonb_build_array('membership'),
    'expr', jsonb_build_object('op','present','args',
              jsonb_build_array(jsonb_build_object('field', v_f_addr::text))),
    'message','this client has an address',
    'scope_table_id', v_tbl::text, 'applies_to_types','[]'::jsonb))
  returning id into v_rule;

  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org, custom.merge_field_kernel_id(), 'merge_field', jsonb_build_object(
    'key','red_address','label','RED address','source','record',
    'semantic_type','value','override_policy','derived',
    'modifiers', jsonb_build_array('temporal'),
    'temporal', jsonb_build_object('mode','live')))
  returning id into v_mf;

  update custom.record set data = data || jsonb_build_object('w3_hist_red_probe', true)
   where id = custom.file_kernel_id() and data_class = 'kernel';
  perform set_config('role', 'authenticated', true);

  v_rec := custom.record_write(v_org, v_tbl, jsonb_build_object(
    'client_name', 'ABC', 'address', 'X', 'contract', 'CT-77',
    '_values', jsonb_build_object(
      'address',  jsonb_build_object('dated', jsonb_build_array(
                    jsonb_build_object('from', null, 'to', null, 'value', 'X'))),
      'contract', jsonb_build_object('dated', jsonb_build_array(
                    jsonb_build_object('from', '2027-01-01', 'to', '2029-01-01', 'value', 'CT-77'))))));

  v_rec2 := custom.record_write(v_org, v_tbl2, jsonb_build_object('client_name', 'Light one'));

  -- THE PERSON'S OWN QUESTION, and this is the clause. `custom.io_revisions` is the door onto
  -- a record's past; with the trigger gone it shows the person who has just written a record
  -- that the record has no past at all.
  select count(*) into v_n from custom.io_revisions(v_org, v_rec);
  if v_n <> 0 then
    raise exception 'RED 1 did not go red: custom.io_revisions still shows the person % version(s) with the capture trigger gone', v_n;
  end if;
  -- And the store behind it, read the way a person reaches it (RLS: their own organizations).
  select count(*) into v_n from history.row_versions v
   where v.id > v_mark and v.entity_type = 'custom.record' and v.organization_id = v_org;
  if v_n <> 0 then
    raise exception 'RED 1 did not go red: % rows were still recorded with the capture trigger gone', v_n;
  end if;
  raise notice 'RED 1 — the capture trigger dropped: six writes across six data_class values recorded 0 rows, and custom.io_revisions shows the person 0 versions of the record they have just written. C-17 PART 1 requires all six, and its (d) requires the person to be able to see one.';

  -- Put them back, exactly as they were. Every arm below needs a store that records.
  perform set_config('role', v_boss, true);
  foreach v_txt in array v_trgs loop execute v_txt; end loop;
  perform set_config('role', 'authenticated', true);

  -- A second, recorded write so the arms below have History to read.
  perform custom.record_update(v_org, v_rec, jsonb_build_object('client_name', 'ABC recorded'));

  -- SIMULATED TIME. `occurred_at` defaults to `now()`, constant inside one transaction, so a
  -- recorded-clock question would otherwise have one moment to ask about. Two operator writes
  -- into the History store, out of the seat, asserting nothing.
  perform set_config('role', v_boss, true);
  update history.row_versions set occurred_at = v_t_before
   where id > v_mark and entity_type = 'custom.record' and organization_id = v_org;
  update history.capture_window set opened_at = v_t_open where entity_type = 'custom.record';
  perform set_config('role', 'authenticated', true);

  -- The September 2026 correction, through the write door: address was X until June 2024,
  -- then Y. The contract's periods are re-sent because `_values` is one block.
  perform custom.record_update(v_org, v_rec, jsonb_build_object(
    'address', 'Y',
    '_values', jsonb_build_object(
      'address', jsonb_build_object('dated', jsonb_build_array(
        jsonb_build_object('from', null,         'to', '2024-06-01', 'value', 'X'),
        jsonb_build_object('from', '2024-06-01', 'to', null,         'value', 'Y'))),
      'contract', jsonb_build_object('dated', jsonb_build_array(
        jsonb_build_object('from', '2027-01-01', 'to', '2029-01-01', 'value', 'CT-77'))))));

  -- GREEN FIRST, from the seat, so a red that was already red cannot be mistaken for a guard
  -- working. These are C-17's own clauses, asked of the same doors.
  v_doc := custom.query_record_as_of(v_org, v_rec, null, date '2026-06-01');
  if v_doc -> 'contract' is not null and jsonb_typeof(v_doc -> 'contract') <> 'null' then
    raise exception 'RED 2 precondition: the 2027 contract was already leaking for June 2026 — %', v_doc -> 'contract';
  end if;
  if (v_doc -> '_effective' -> 'contract' ->> 'state') is distinct from 'not_yet' then
    raise exception 'RED 2 precondition: _effective does not say not_yet before anything was weakened — %',
                    coalesce((v_doc -> '_effective' -> 'contract')::text, 'nothing');
  end if;
  if (custom.query_record_as_of(v_org, v_rec, v_t_ask, date '2025-03-01') ->> 'address') is distinct from 'X' then
    raise exception 'RED 3 precondition: the recorded clock did not answer X before it was weakened';
  end if;

  -- ══════════════════════════════════════════════════════════════════════════
  -- RED 2 — THE WORLD CLOCK'S ABSENCE, which is a value, not a blank.
  -- ══════════════════════════════════════════════════════════════════════════
  perform set_config('role', v_boss, true);
  select pg_get_functiondef('history.value_in_force(jsonb,text,date)'::regprocedure) into v_def;
  create or replace function history.value_in_force(p_data jsonb, p_key text, p_world_on date)
  returns jsonb language plpgsql immutable set search_path to 'pg_catalog' as $red$
  declare
    v_periods jsonb := p_data -> '_values' -> p_key -> 'dated';
    v_p jsonb; v_from date; v_to date;
  begin
    if v_periods is null or jsonb_typeof(v_periods) <> 'array' then
      return jsonb_build_object('dated', false, 'state', 'undated', 'value', p_data -> p_key);
    end if;
    for v_p in select value from jsonb_array_elements(v_periods) loop
      v_from := nullif(v_p ->> 'from', '')::date;
      v_to   := nullif(v_p ->> 'to', '')::date;
      if (v_from is null or p_world_on >= v_from) and (v_to is null or p_world_on < v_to) then
        return jsonb_build_object('dated', true, 'state', 'in_force', 'value', v_p -> 'value',
                                  'from', v_from, 'to', v_to);
      end if;
    end loop;
    -- THE WEAKENING: "nothing was true then" becomes "whatever it is now", and the store stops
    -- saying WHICH kind of nothing it is.
    return jsonb_build_object('dated', true, 'state', 'in_force', 'value', p_data -> p_key);
  end;
  $red$;
  perform set_config('role', 'authenticated', true);

  v_doc := custom.query_record_as_of(v_org, v_rec, null, date '2026-06-01');
  if v_doc -> 'contract' is null or jsonb_typeof(v_doc -> 'contract') = 'null' then
    raise exception 'RED 2 did not go red: the contract is still absent for June 2026';
  end if;
  if (v_doc -> '_effective' -> 'contract' ->> 'state') = 'not_yet' then
    raise exception 'RED 2 did not go red: _effective still says not_yet';
  end if;
  raise notice 'RED 2 — value_in_force falls back to the plain key: custom.query_record_as_of hands a person % as the contract in force in June 2026, and _effective now reads "%" instead of not_yet. T6''s fourth date returns a value that was never true, and the store stops saying which kind of nothing it had.',
               v_doc -> 'contract', v_doc -> '_effective' -> 'contract' ->> 'state';

  perform set_config('role', v_boss, true);
  execute v_def;
  perform set_config('role', 'authenticated', true);

  -- ══════════════════════════════════════════════════════════════════════════
  -- RED 3 — THE SECOND CLOCK, removed. One clock, two argument names.
  -- ══════════════════════════════════════════════════════════════════════════
  perform set_config('role', v_boss, true);
  select pg_get_functiondef('history.record_at(uuid,uuid,timestamptz)'::regprocedure) into v_def;
  create or replace function history.record_at(p_organization_id uuid, p_record_id uuid,
                                               p_at timestamptz)
  returns jsonb language sql stable set search_path to 'pg_catalog' as $red$
    -- THE WEAKENING: p_at is accepted and ignored, so "what did this store SAY then" is
    -- answered with what it says now.
    select r.data from custom.record r
     where r.organization_id = p_organization_id and r.id = p_record_id;
  $red$;
  perform set_config('role', 'authenticated', true);

  v_txt := custom.query_record_as_of(v_org, v_rec, v_t_ask, date '2025-03-01') ->> 'address';
  if v_txt is not distinct from 'X' then
    raise exception 'RED 3 did not go red: the recorded clock still answers X';
  end if;
  raise notice 'RED 3 — record_at ignores the recorded clock: "what did this store SAY on %" now answers "%" through custom.query_record_as_of, which is September''s correction reaching backwards. T6''s third date is the only thing that catches it.',
               v_t_ask, coalesce(v_txt, 'nothing');

  perform set_config('role', v_boss, true);
  execute v_def;
  perform set_config('role', 'authenticated', true);

  -- ══════════════════════════════════════════════════════════════════════════
  -- RED 4 — THE RETENTION FLOOR, removed from the door a person meets.
  -- ══════════════════════════════════════════════════════════════════════════
  perform set_config('role', v_boss, true);
  select pg_get_functiondef('history.retention_set(uuid,uuid,integer)'::regprocedure) into v_def;
  create or replace function history.retention_set(p_organization_id uuid, p_table_id uuid,
                                                   p_days integer)
  returns integer language plpgsql set search_path to 'pg_catalog' as $red$
  begin
    perform custom.assert_store_door(p_organization_id, 'history.retention_set');
    -- THE WEAKENING: no floor comparison at all.
    perform custom.record_update(p_organization_id, p_table_id,
                                 jsonb_build_object('retention_days', p_days));
    return p_days;
  end;
  $red$;
  perform set_config('role', 'authenticated', true);

  -- The store still has a second wall — W1-TABLE's `custom._table_shape_guard` reads the same
  -- floor on the WRITE — so what RED 4 proves is precisely which refusal belongs to which
  -- guard: the sentence the PERSON meets at `custom.history_retention_set` moves from the door
  -- (which names the remedy) to the shape guard (which names the rule), and T14's clause is
  -- about the door.
  begin
    perform custom.history_retention_set(v_org, v_tbl2, 10);
    raise exception 'RED 4: ten days landed with BOTH walls gone — the shape guard is not reading the floor either';
  exception when check_violation then
    get stacked diagnostics v_txt = pg_exception_context, v_msg = message_text;
    if v_txt !~ '_table_shape_guard' then
      raise exception 'RED 4 did not go red: the refusal still comes from history.retention_set — %', v_txt;
    end if;
    raise notice 'RED 4 — retention_set loses its floor comparison: its own refusal is GONE and the person asking custom.history_retention_set for ten days is now stopped only by custom._table_shape_guard, one layer deeper, which says "%". T14''s door-level refusal, with its remedy, disappears; a caller using any other write path would land it.', v_msg;
  end;

  perform set_config('role', v_boss, true);
  execute v_def;
  perform set_config('role', 'authenticated', true);

  -- ══════════════════════════════════════════════════════════════════════════
  -- RED 5 — HIS-4: the Migration log becomes prunable, through the person's door.
  -- ══════════════════════════════════════════════════════════════════════════
  -- A real Migration first, made the way a person makes one.
  v_res := custom.migrate_rename(v_org, v_rec, 'ABC renamed',
             'W3-HIST RED: a Migration for the prune to destroy');
  v_log := (v_res ->> 'migration_id')::uuid;
  select count(*) into v_n from custom.migrations(v_org, v_rec) m where m.id = v_log;
  if v_n <> 1 then
    raise exception 'RED 5 precondition: the rename is not on the log a person reads — custom.migrations answered % row(s)', v_n;
  end if;

  perform set_config('role', v_boss, true);
  select pg_get_functiondef('history.prune(uuid,text,uuid,boolean)'::regprocedure) into v_def;
  create or replace function history.prune(p_organization_id uuid, p_scope text default 'values',
                                           p_table_id uuid default null, p_dry_run boolean default true)
  returns jsonb language plpgsql set search_path to 'pg_catalog' as $red$
  declare v_count bigint := 0;
  begin
    -- THE WEAKENING: the migration_log arm is gone, so the scope is simply honoured.
    if p_scope = 'migration_log' then
      with gone as (
        delete from history.migration_log m
         where not p_dry_run and m.organization_id = p_organization_id returning 1)
      select case when p_dry_run
                  then (select count(*) from history.migration_log m2 where m2.organization_id = p_organization_id)
                  else (select count(*) from gone) end into v_count;
    end if;
    return jsonb_build_object('function','history.prune','scope',p_scope,'rows_pruned',v_count);
  end;
  $red$;
  perform set_config('role', 'authenticated', true);

  v_res := custom.history_prune(v_org, 'migration_log', null, false);
  select count(*) into v_n from custom.migrations(v_org, v_rec) m where m.id = v_log;
  if v_n <> 0 then
    raise exception 'RED 5 did not go red: the Migration log entry survived and custom.migrations still shows it';
  end if;
  raise notice 'RED 5 — prune loses its migration_log arm: a person asked custom.history_prune for the Migration log and it DELETED the permanent structural record (% row(s)) instead of refusing by name. custom.migrations now shows 0 rows for a rename that happened. T14''s refusal disappears and nothing else notices.',
               v_res ->> 'rows_pruned';

  perform set_config('role', v_boss, true);
  execute v_def;
  perform set_config('role', 'authenticated', true);

  -- ══════════════════════════════════════════════════════════════════════════
  -- RED 6 — HIS-8: a log entry that lies about being undoable.
  -- ══════════════════════════════════════════════════════════════════════════
  perform set_config('role', v_boss, true);
  select pg_get_functiondef('history.migration_record(uuid,text,text,uuid,jsonb,text)'::regprocedure) into v_def;
  create or replace function history.migration_record(p_organization_id uuid, p_verb text,
                                                      p_target_kind text, p_target_id uuid,
                                                      p_inverse jsonb, p_note text default null)
  returns uuid language plpgsql set search_path to 'pg_catalog' as $red$
  declare v_id uuid;
  begin
    perform custom.assert_store_door(p_organization_id, 'history.migration_log');
    -- THE WEAKENING: no inverse is required, and none is checked.
    insert into history.migration_log
      (organization_id, verb, target_kind, target_id, inverse, note)
    values (p_organization_id, p_verb, p_target_kind, p_target_id,
            coalesce(p_inverse, '{}'::jsonb), p_note)
    returning id into v_id;
    return v_id;
  end;
  $red$;
  -- `history.migration_record` is a SERVER LANE and holds no client grant — a person never
  -- records a Migration by hand. So the one inverse-less row is written out of the seat, and
  -- asserts nothing; the clause is what happens to the PERSON who meets it, below.
  v_log := history.migration_record(v_org, 'rename', 'record', v_rec, null);
  perform set_config('role', 'authenticated', true);

  if v_log is null then
    raise exception 'RED 6 did not go red: the inverse-less Migration was still refused';
  end if;
  -- The person finds it on their own log, looking exactly like every other undoable Migration.
  if not exists (select 1 from custom.migrations(v_org, v_rec) m
                  where m.id = v_log and m.undone_at is null) then
    raise exception 'RED 6: the inverse-less Migration was written and custom.migrations does not show it, so the person never even sees the lie';
  end if;
  v_msg := null;
  begin
    perform custom.migrate_undo(v_org, v_log);
  exception when others then
    get stacked diagnostics v_msg = message_text;
  end;
  if v_msg is null then
    raise exception 'RED 6: the undo of an inverse-less Migration reported success, which is worse again';
  end if;
  raise notice 'RED 6 — migration_record accepts a null inverse: entry % was written, custom.migrations offers it to the person as an outstanding undoable Migration, and custom.migrate_undo then fails with "%" at the moment somebody needs it. HIS-8''s refusal moves from write time to sixty days later.',
               v_log, v_msg;

  perform set_config('role', v_boss, true);
  execute v_def;
  delete from history.migration_log where id = v_log;
  perform set_config('role', 'authenticated', true);

  -- ══════════════════════════════════════════════════════════════════════════
  -- RED 7 — VIS-16: the registration removed, and the replay goes empty.
  -- ══════════════════════════════════════════════════════════════════════════
  -- GREEN FIRST, from the seat, and ON A DIFFERENT RECORD. The control has to be a share that
  -- really happened, and a share on THIS arm's record would leave version rows behind that the
  -- replay would go on finding after the registration is taken away — which would make the
  -- clause below pass or fail for a reason that has nothing to do with the registration. So
  -- the control is a record of its own, and the arm itself is asked of ABC, which nobody has
  -- ever shared. A replay also needs the RECORD to have existed on the date asked about, so
  -- the control record's own version rows are shifted back with the grant's. Both shifts are
  -- operator writes into the History store, out of the seat, asserting nothing.
  perform set_config('role', v_boss, true);
  select coalesce(max(id), 0) into v_mark from history.row_versions;
  perform set_config('role', 'authenticated', true);

  v_rec3 := custom.record_write(v_org, v_tbl, jsonb_build_object('client_name', 'Shared one'));
  perform custom.share_grant(v_org, v_rec3, 'user', c_dana, 'viewer'::public.permission_level);

  perform set_config('role', v_boss, true);
  update history.row_versions set occurred_at = v_t_before
   where id > v_mark and entity_type in ('iam.permissions', 'custom.record');
  update history.capture_window set opened_at = v_t_open
   where entity_type in ('iam.permissions', 'custom.record');
  perform set_config('role', 'authenticated', true);

  select count(*) into v_n from custom.visibility_as_of(v_org, v_rec3, v_t_ask) g
   where g.principal_id = c_dana and g.through_kind = 'grant';
  if v_n < 1 then
    raise exception 'RED 7 precondition: the replay did not find the grant before the registration was taken away';
  end if;
  perform custom.share_revoke(v_org, v_rec3, 'user', c_dana);

  perform set_config('role', v_boss, true);
  update platform.shareable_resource_registry set is_active = false where resource_type = 'record';
  perform set_config('role', 'authenticated', true);

  v_msg := null;
  begin
    perform custom.share_grant(v_org, v_rec, 'user', c_dana, 'viewer'::public.permission_level);
  exception when others then
    get stacked diagnostics v_msg = message_text;
  end;
  if v_msg is null then
    raise exception 'RED 7 did not go red: the person was still able to share the record with the registration deactivated';
  end if;
  select count(*) into v_n from custom.visibility_as_of(v_org, v_rec, v_t_ask) g
   where g.principal_id = c_dana and g.through_kind = 'grant';
  if v_n <> 0 then
    raise exception 'RED 7 partial: the replay still returns % grant row(s) although no grant may be written', v_n;
  end if;
  raise notice 'RED 7 — the `record` registration deactivated: custom.share_grant refuses the person with "%" and custom.visibility_as_of replays % grants for %. This is what this database answered before the registration existed, and the answer is "nobody".',
               v_msg, v_n, v_t_ask;

  perform set_config('role', v_boss, true);
  update platform.shareable_resource_registry set is_active = true where resource_type = 'record';
  perform set_config('role', 'authenticated', true);

  -- ══════════════════════════════════════════════════════════════════════════
  -- RED 8 — DYN-19: the temporal guard dropped.
  -- ══════════════════════════════════════════════════════════════════════════
  -- GREEN FIRST, from the seat: the guard is what a person meets, through the write door.
  begin
    perform custom.record_update(v_org, v_mf, jsonb_build_object(
      'temporal', jsonb_build_object('mode','whenever')));
    raise exception 'RED 8 precondition: "whenever" was already accepted as a mode before the guard was dropped';
  exception when check_violation then null;
  end;

  perform set_config('role', v_boss, true);
  select pg_get_triggerdef(tg.oid) into v_trg
    from pg_trigger tg where tg.tgrelid = 'custom.record'::regclass
     and tg.tgname = 'custom_record_merge_field_temporal_guard' and not tg.tgisinternal;
  if v_trg is null then
    raise exception 'RED 8 precondition: there is no custom_record_merge_field_temporal_guard on custom.record to take away';
  end if;
  drop trigger custom_record_merge_field_temporal_guard on custom.record;
  perform set_config('role', 'authenticated', true);

  perform custom.record_update(v_org, v_mf, jsonb_build_object(
    'temporal', jsonb_build_object('mode','whenever')));
  v_txt := custom.read_record(v_org, v_mf, true) -> 'temporal' ->> 'mode';
  if v_txt is distinct from 'whenever' then
    raise exception 'RED 8 did not go red: the mode a person reads back off custom.read_record is "%"', coalesce(v_txt, 'nothing');
  end if;
  raise notice 'RED 8 — the temporal guard dropped: a person landed mode "%" through custom.record_update and reads it straight back off custom.read_record, and history.merge_field_resolve then silently resolves it live. DYN-19''s four refusals disappear together.', v_txt;

  perform set_config('role', v_boss, true);
  execute v_trg;
  perform set_config('role', 'authenticated', true);

  raise notice '════ W3-HIST RED — eight arms, eight things C-17 relies on gone, every one of them observed from the seat `authenticated` through the doors a signed-in person reaches. Rolling back; nothing here survives this transaction. ════';
end;
$r$;

rollback;
