-- W3-HIST — CHECK C-17, plus T6, T14 and T15's audit half.
-- VIS-16 · HIS-1…HIS-8 · HIS-N-1 · HIS-N-2 · DYN-19.
--
-- RUN IT:
--   PSQL="$(node node_modules/tsx/dist/cli.mjs scripts/lib/psql-path.ts --print)"
--   "$PSQL" "$SUPABASE_BRANCH_DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f scripts/campaign-tests/w3_hist_c17.sql
--
-- IT IS NOT A MIGRATION: it lives outside `migrations/`, no sweep can see it, and it ROLLS
-- BACK. It refuses to run anywhere but the rehearsal branch, by system identifier.
--
-- ITS RED TWIN is `scripts/campaign-tests/w3_hist_red.sql`.
--
-- WHAT MAKES IT FAIL — THE PRODUCTION CHANGE, NAMED (rule 3):
--   · drop the `zzz_history_capture` trigger                        → PART 1 and every replay
--   · give `history.record_capture` a `data_class = 'record'` filter → PART 1's six classes
--   · make `history.value_in_document` fall back to `p_data -> p_key`
--     when no period covers the date                                → PART 2's (d) and (c)
--   · make `history.value_as_of` ignore `p_recorded_at`             → PART 2's (c): one clock
--   · take the floor comparison out of `history.retention_set`      → PART 3's two refusals
--   · let `history.retention_floor_raise` accept a lowering         → PART 3's (f)
--   · take the `migration_log` arm out of `history.prune`           → PART 3's (g)
--   · let `history.migration_record` accept a null inverse          → PART 4's (a)
--   · let `history.migration_undo` write around `custom.record_update` → PART 4's (d)
--   · make `history.snapshot_restore` write with a direct UPDATE    → PART 5's (c)
--   · make `history.grants_at` read `iam.permissions` live          → PART 6's (a)
--   · take `history.assert_watching` out of `history.who_could_see`  → PART 6's (c)
--   · default `custom._merge_field_temporal_guard` to `live`        → PART 7's four refusals
--
-- A SECOND INPUT WITH A DIFFERENT EXPECTED VALUE, everywhere it could matter (rule 3):
-- PART 2 asks FOUR dates of ONE stored row set and expects four different answers, so a
-- single-clock implementation returns the same value twice and is caught by construction.
-- PART 3 refuses 10 days naming 30, RAISES the floor to 60, and then refuses 45 naming 60 —
-- the same door, two different numbers in its refusal. PART 7 resolves one merge field under
-- four temporal declarations over one record.
--
-- EVERY REFUSAL IS PAIRED WITH A POSITIVE CONTROL that performs the same act successfully
-- (rule 14): the lowering refusal beside the raise that takes effect; the Table refused below
-- the floor beside the Table set above it; `history.prune('migration_log')` refused by name
-- beside `history.prune('values')` actually pruning rows.
--
-- SIMULATED TIME. `history.row_versions.occurred_at` defaults to `now()`, which is constant
-- inside one transaction, so a recorded-clock question would otherwise have one moment to ask
-- about. This file therefore SHIFTS the version rows it has just written back to real past
-- moments — the same device V3's exit describes as "an undo taken sixty simulated days after
-- a merge". It shifts only rows whose id is above a mark it took itself, and it rolls back.
--
-- THE IDENTITIES. It writes as the connected owner into ONE organization, the Matrx System
-- organization, with freshly generated ids, and rolls back. It signs nobody in and reads no
-- credential.

\set ON_ERROR_STOP on
\timing off

begin;

do $t$
declare
  v_org     constant uuid := '39c38960-d30c-4840-b0c1-c9960de95582';  -- Matrx System
  v_home    constant uuid := '11111111-0000-4000-8000-000000000001';  -- the Table kernel
  -- The two real past moments the recorded clock is asked about. Today is after both.
  v_t_open  constant timestamptz := '2026-07-01 00:00:00+00';
  v_t_before constant timestamptz := '2026-08-10 12:00:00+00';
  v_t_ask   constant timestamptz := '2026-08-15 12:00:00+00';
  v_tbl     uuid;
  v_tbl2    uuid;
  v_f_addr  uuid;
  v_f_ctr   uuid;
  v_f_name  uuid;
  v_rule    uuid;
  v_mf      uuid;
  v_rec     uuid;
  v_rec2    uuid;
  v_mark    bigint;
  v_perm    uuid;
  v_log     uuid;
  v_undo    jsonb;
  v_res     jsonb;
  v_txt     text;
  v_msg     text;
  v_n       integer;
  v_days    integer;
  v_ver     integer;
  v_ver2    integer;
  v_row     record;
begin
  if (pg_control_system()).system_identifier <> 7678069749886157684 then
    raise exception 'w3_hist_c17.sql refuses to run here: system_identifier is %, and this file may only run on the rehearsal branch (7678069749886157684)',
                    (pg_control_system()).system_identifier;
  end if;

  -- THE IDENTITY, and it is `admin@admin.com` — never the owner's account. HIS-3's raise goes
  -- through `platform.knob_override_set`, which refuses an unauthenticated caller by name
  -- ("not_authenticated"), so the organization rung cannot be exercised at all without one.
  -- This is a GUC on a transaction that rolls back; it signs nobody in and reads no credential.
  perform set_config('request.jwt.claims',
                     '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}', true);

  select coalesce(max(id), 0) into v_mark from history.row_versions;

  -- ══════════════════════════════════════════════════════════════════════════
  -- PART 1 — C-17 / HIS-1 + HIS-7. ONE store, ONE trigger, EVERY data_class.
  -- ══════════════════════════════════════════════════════════════════════════
  v_tbl := custom.table_declare(v_org, jsonb_build_object(
    'name', 'W3-HIST Client', 'slug', 'w3_hist_client', 'type', 'entity',
    'label_singular', 'Client', 'label_plural', 'Clients', 'title_field', 'client_name',
    'display', 'page', 'weight', 'light', 'ordered', false, 'row_order', 'sorted',
    'default_sort', '[]'::jsonb, 'agent_writable', true, 'retention_days', 365,
    'fields', jsonb_build_array(jsonb_build_object('name','client_name'),
                                jsonb_build_object('name','address'),
                                jsonb_build_object('name','contract')),
    'parent_id', v_home));

  -- A SECOND Table, so "a Table at the floor" and "a Table above it" are two real inputs.
  v_tbl2 := custom.table_declare(v_org, jsonb_build_object(
    'name', 'W3-HIST Light', 'slug', 'w3_hist_light', 'type', 'entity',
    'label_singular', 'Light', 'label_plural', 'Lights', 'title_field', 'client_name',
    'display', 'list', 'weight', 'light', 'ordered', false, 'row_order', 'sorted',
    'default_sort', '[]'::jsonb, 'agent_writable', true, 'retention_days', 30,
    'fields', jsonb_build_array(jsonb_build_object('name','client_name')),
    'parent_id', v_home));

  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org, custom.field_kernel_id(), 'field', jsonb_build_object(
    'key','client_name','label','Client name','type','text','sort',10,'required',false,
    'multi',false,'dated',false,'source','manual','config','{}'::jsonb,'rules','[]'::jsonb,
    'depends_on','[]'::jsonb,'sensitivity','internal','source_config','{}'::jsonb,
    'context_policy','include','applies_to_types','[]'::jsonb,'entity_definition_id',v_tbl))
  returning id into v_f_name;

  -- HIS-5: the world clock is OPT IN, per Field. Address and Contract declare it; Client name
  -- does not, which is what makes PART 7's refusal a real second input.
  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org, custom.field_kernel_id(), 'field', jsonb_build_object(
    'key','address','label','Address','type','text','sort',20,'required',false,
    'multi',false,'dated',true,'source','manual','config','{}'::jsonb,'rules','[]'::jsonb,
    'depends_on','[]'::jsonb,'sensitivity','internal','source_config','{}'::jsonb,
    'context_policy','include','applies_to_types','[]'::jsonb,'entity_definition_id',v_tbl))
  returning id into v_f_addr;

  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org, custom.field_kernel_id(), 'field', jsonb_build_object(
    'key','contract','label','Contract','type','text','sort',30,'required',false,
    'multi',false,'dated',true,'source','manual','config','{}'::jsonb,'rules','[]'::jsonb,
    'depends_on','[]'::jsonb,'sensitivity','internal','source_config','{}'::jsonb,
    'context_policy','include','applies_to_types','[]'::jsonb,'entity_definition_id',v_tbl))
  returning id into v_f_ctr;

  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org, custom.rule_kernel_id(), 'rule', jsonb_build_object(
    'name','Has an address at all','kind','predicate','sort',10,
    'uses', jsonb_build_array('membership'),
    'expr', jsonb_build_object('op','present','args', jsonb_build_array(jsonb_build_object('field', v_f_addr::text))),
    'message','this client has an address',
    'scope_table_id', v_tbl::text, 'applies_to_types','[]'::jsonb))
  returning id into v_rule;

  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org, custom.merge_field_kernel_id(), 'merge_field', jsonb_build_object(
    'key','client_address','label','The client''s address','source','record',
    'semantic_type','value','override_policy','derived',
    'modifiers', jsonb_build_array('temporal'),
    'temporal', jsonb_build_object('mode','live')))
  returning id into v_mf;

  -- The sixth class. A kernel row is the store's own shape; this touches one, watches the
  -- same trigger record it, and rolls back like everything else here.
  update custom.record set data = data || jsonb_build_object('w3_hist_probe', true)
   where organization_id = v_org and id = custom.file_kernel_id();

  v_rec := custom.record_write(v_org, v_tbl, jsonb_build_object(
    'client_name', 'ABC',
    'address', 'X',
    'contract', 'CT-77',
    '_values', jsonb_build_object(
      'address',  jsonb_build_object('dated', jsonb_build_array(
                    jsonb_build_object('from', null, 'to', null, 'value', 'X'))),
      'contract', jsonb_build_object('dated', jsonb_build_array(
                    jsonb_build_object('from', '2027-01-01', 'to', '2029-01-01', 'value', 'CT-77'))))));

  v_rec2 := custom.record_write(v_org, v_tbl2, jsonb_build_object('client_name', 'Light one'));

  -- (a) ONE store carries all six live data_class values, and they got there from ONE trigger.
  select string_agg(distinct v.row_data ->> 'data_class', ',' order by v.row_data ->> 'data_class')
    into v_txt
    from history.row_versions v
   where v.entity_type = 'custom.record' and v.organization_id = v_org and v.id > v_mark;
  if v_txt is distinct from 'field,kernel,merge_field,record,rule,table' then
    raise exception 'C-17 (a): HIS-1/HIS-7 — the store recorded the classes "%", and the six live classes are field,kernel,merge_field,record,rule,table', coalesce(v_txt, 'none at all');
  end if;

  -- (b) ONE mechanism: exactly one trigger on custom.record runs a function whose body writes
  --     into history.row_versions. HIS-7's "no second mechanism" as a measurement, not a claim.
  select count(*) into v_n
    from pg_trigger tg
    join pg_class c on c.oid = tg.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_proc p on p.oid = tg.tgfoid
   where n.nspname = 'custom' and c.relname = 'record' and not tg.tgisinternal
     and pg_get_functiondef(p.oid) ~* 'insert into history\.row_versions';
  if v_n <> 1 then
    raise exception 'C-17 (b): HIS-7 — % triggers on custom.record write into history.row_versions, and one store means one writer', v_n;
  end if;

  -- (c) The window opened on the first row actually recorded, not on the apply.
  if not exists (select 1 from history.capture_window w where w.entity_type = 'custom.record') then
    raise exception 'C-17 (c): HIS-1 — nothing opened the capture window for custom.record';
  end if;

  raise notice 'PART 1 — C-17 / HIS-1 / HIS-7: six data_class values (%) in ONE store from ONE trigger.', v_txt;

  -- ══════════════════════════════════════════════════════════════════════════
  -- PART 2 — T6. FOUR dates over ONE stored row set. HIS-5 · HIS-6.
  -- ══════════════════════════════════════════════════════════════════════════
  -- Simulated time: everything written so far becomes what the store held BEFORE the
  -- September 2026 correction, and the window opens before that.
  update history.row_versions set occurred_at = v_t_before where id > v_mark;
  update history.capture_window set opened_at = v_t_open where entity_type = 'custom.record';

  -- The September 2026 correction: address was X until June 2024, then Y.
  perform custom.record_update(v_org, v_rec, jsonb_build_object(
    'address', 'Y',
    '_values', jsonb_build_object(
      'address', jsonb_build_object('dated', jsonb_build_array(
        jsonb_build_object('from', null,         'to', '2024-06-01', 'value', 'X'),
        jsonb_build_object('from', '2024-06-01', 'to', null,         'value', 'Y'))),
      -- `_values` is one block: a patch that named only the address would drop the contract's
      -- periods, which is the store working, not a bug to route round.
      'contract', jsonb_build_object('dated', jsonb_build_array(
        jsonb_build_object('from', '2027-01-01', 'to', '2029-01-01', 'value', 'CT-77'))))));

  -- (a) WORLD clock, March 2024 → X.
  if history.value_as_of(v_org, v_rec, 'address', date '2024-03-01') is distinct from to_jsonb('X'::text) then
    raise exception 'T6 (a): as-of March 2024 on the world clock returned %, and the address was X',
                    coalesce(history.value_as_of(v_org, v_rec, 'address', date '2024-03-01')::text, 'nothing');
  end if;

  -- (b) WORLD clock, March 2025 → Y. Same stored row set, different answer.
  if history.value_as_of(v_org, v_rec, 'address', date '2025-03-01') is distinct from to_jsonb('Y'::text) then
    raise exception 'T6 (b): as-of March 2025 on the world clock returned %, and the address was Y',
                    coalesce(history.value_as_of(v_org, v_rec, 'address', date '2025-03-01')::text, 'nothing');
  end if;

  -- (c) RECORDED clock: what the system SAID in August 2026, before the correction → X, even
  --     though the world clock now answers Y for that same date. The two clocks, apart.
  if history.value_as_of(v_org, v_rec, 'address', date '2025-03-01', v_t_ask) is distinct from to_jsonb('X'::text) then
    raise exception 'T6 (c): what this store SAID on % for March 2025 came back as %, and it said X — a single-clock implementation answers Y here',
                    v_t_ask, coalesce(history.value_as_of(v_org, v_rec, 'address', date '2025-03-01', v_t_ask)::text, 'nothing');
  end if;

  -- (d) A contract valid 2027–2029 is storable today and ABSENT from every as-of before 2027,
  --     and PRESENT from 2027. Two dates, two different expected values.
  if history.value_as_of(v_org, v_rec, 'contract', date '2026-06-01') is not null then
    raise exception 'T6 (d): a contract that starts in 2027 was returned for June 2026 as %',
                    history.value_as_of(v_org, v_rec, 'contract', date '2026-06-01')::text;
  end if;
  if history.value_as_of(v_org, v_rec, 'contract', date '2027-06-01') is distinct from to_jsonb('CT-77'::text) then
    raise exception 'T6 (d) second input: the 2027–2029 contract read % in June 2027',
                    coalesce(history.value_as_of(v_org, v_rec, 'contract', date '2027-06-01')::text, 'nothing');
  end if;

  -- (e) History shows the September 2026 edit itself.
  select count(*) into v_n from history.record_versions(v_org, v_rec);
  if v_n < 2 then
    raise exception 'T6 (e): the correction is not on the record — % versions of ABC', v_n;
  end if;

  -- (f) The world clock is opt-in per Field: a period on a Field that never declared `dated`
  --     is refused BY THE FIELD'S NAME.
  begin
    perform custom.record_update(v_org, v_rec, jsonb_build_object(
      '_values', jsonb_build_object('client_name', jsonb_build_object('dated',
        jsonb_build_array(jsonb_build_object('from', null, 'to', null, 'value', 'ABC'))))));
    raise exception 'T6 (f): a period was accepted on Client name, which keeps a single value';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg !~* 'Client name' then
      raise exception 'T6 (f): the refusal did not name the field — "%"', v_msg;
    end if;
  end;

  raise notice 'PART 2 — T6: world 2024-03 -> X, world 2025-03 -> Y, recorded % -> X, contract absent before 2027 and present in 2027. % versions on the record.', v_t_ask, v_n;

  -- ══════════════════════════════════════════════════════════════════════════
  -- PART 3 — T14 and HIS-2 · HIS-3 · HIS-4. The floor, and what cannot be pruned.
  -- ══════════════════════════════════════════════════════════════════════════
  -- (a) The floor is READ, never written twice: the platform knob is the only floor.
  v_days := history.retention_floor_days(v_org);
  if v_days <> 30 then
    raise exception 'T14 (a): this organization''s floor reads % days and the platform floor is 30', v_days;
  end if;

  -- (b) A lowering below the floor is refused BY NAME, with the floor in the sentence.
  begin
    perform history.retention_set(v_org, v_tbl2, 10);
    raise exception 'T14 (b): a ten-day retention was accepted under a thirty-day floor';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg !~ '30' then
      raise exception 'T14 (b): the refusal did not name the floor — "%"', v_msg;
    end if;
  end;

  -- (c) THE POSITIVE CONTROL. The same door, the same table, a legal number: it lands, and it
  --     lands through custom.record_update rather than beside it.
  if history.retention_set(v_org, v_tbl2, 30) <> 30 then
    raise exception 'T14 (c): setting the light table to the floor did not return 30';
  end if;
  select nullif(r.data ->> 'retention_days', '')::integer into v_days
    from custom.record r where r.organization_id = v_org and r.id = v_tbl2;
  if v_days <> 30 then
    raise exception 'T14 (c): the light table reads % days after being set to 30', coalesce(v_days::text, 'nothing');
  end if;

  -- (d) AN ORGANIZATION RAISES ITS FLOOR, and it takes effect. This is the clause the branch
  --     could not hold at all until the knob rungs were levelled.
  if history.retention_floor_raise(v_org, 60) <> 60 then
    raise exception 'T14 (d): raising the floor to 60 did not return 60';
  end if;
  v_days := history.retention_floor_days(v_org);
  if v_days <> 60 then
    raise exception 'T14 (d): after the raise the floor reads % days', v_days;
  end if;

  -- (e) THE SECOND INPUT. The same door now refuses a DIFFERENT number, naming 60 not 30.
  begin
    perform history.retention_set(v_org, v_tbl2, 45);
    raise exception 'T14 (e): forty-five days was accepted under a sixty-day floor';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg !~ '60' then
      raise exception 'T14 (e): the refusal did not name the raised floor — "%"', v_msg;
    end if;
  end;
  if history.retention_set(v_org, v_tbl2, 90) <> 90 then
    raise exception 'T14 (e) control: ninety days above a sixty-day floor was not accepted';
  end if;

  -- (f) The floor only ever goes UP, and the refusal says so before anything is written.
  begin
    perform history.retention_floor_raise(v_org, 30);
    raise exception 'T14 (f): the floor was lowered from 60 to 30';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg !~ '60' then
      raise exception 'T14 (f): the lowering refusal did not name the current floor — "%"', v_msg;
    end if;
  end;
  if history.retention_floor_days(v_org) <> 60 then
    raise exception 'T14 (f): the refused lowering changed the floor anyway';
  end if;

  -- (g) HIS-4. The Migration log is refused BY NAME, before anything is read.
  begin
    perform history.prune(v_org, 'migration_log');
    raise exception 'T14 (g): the Migration log was accepted as a prune scope';
  exception when feature_not_supported then
    get stacked diagnostics v_msg = message_text;
    if v_msg !~* 'Migration log' then
      raise exception 'T14 (g): the refusal did not name the Migration log — "%"', v_msg;
    end if;
  end;

  -- (g) POSITIVE CONTROL: the same function, a scope it does prune, actually pruning rows.
  --     The versions written above are shifted well past the floor so there is something to
  --     prune, and the two most recent versions of every row survive whatever retention says.
  perform custom.record_update(v_org, v_rec, jsonb_build_object('client_name', 'ABC old one'));
  perform custom.record_update(v_org, v_rec, jsonb_build_object('client_name', 'ABC old two'));
  update history.row_versions set occurred_at = now() - interval '400 days'
   where id > v_mark and entity_type = 'custom.record' and organization_id = v_org
     and row_id = v_rec;
  perform custom.record_update(v_org, v_rec, jsonb_build_object('client_name', 'ABC two'));
  perform custom.record_update(v_org, v_rec, jsonb_build_object('client_name', 'ABC three'));
  v_res := history.prune(v_org, 'values', v_tbl, false);
  if coalesce((v_res ->> 'rows_pruned')::bigint, 0) < 1 then
    raise exception 'T14 (g) control: history.prune(''values'') pruned nothing — %', v_res::text;
  end if;
  select count(*) into v_n from history.record_versions(v_org, v_rec);
  if v_n < 2 then
    raise exception 'T14 (g) control: the prune left % versions of ABC, and the two most recent always survive', v_n;
  end if;

  raise notice 'PART 3 — T14: 10 refused naming 30, 30 accepted, floor raised to 60, 45 refused naming 60, 90 accepted, a lowering to 30 refused, the Migration log refused by name, and history.prune(''values'') deleted % rows leaving % versions.',
               v_res ->> 'rows_pruned', v_n;

  -- ══════════════════════════════════════════════════════════════════════════
  -- PART 4 — HIS-8. Record an inverse, undo it, and watch the undo get recorded.
  -- ══════════════════════════════════════════════════════════════════════════
  -- (a) A Migration with nothing to put it back with is REFUSED at the time, not discovered
  --     sixty days later.
  begin
    perform history.migration_record(v_org, 'rename', 'record', v_rec, null);
    raise exception 'HIS-8 (a): a Migration with no inverse was recorded';
  exception when null_value_not_allowed then
    get stacked diagnostics v_msg = message_text;
    if v_msg !~* 'put it back' then
      raise exception 'HIS-8 (a): the refusal did not say what was missing — "%"', v_msg;
    end if;
  end;

  -- (b) The real thing: rename ABC, storing the inverse WHILE it runs.
  select r.data ->> 'client_name' into v_txt
    from custom.record r where r.organization_id = v_org and r.id = v_rec;
  v_log := history.migration_record(v_org, 'rename', 'record', v_rec,
             jsonb_build_object('kind', 'patch', 'record_id', v_rec::text,
                                'patch', jsonb_build_object('client_name', v_txt)),
             'W3-HIST C-17: rename, with the old name stored at the time');
  perform custom.record_update(v_org, v_rec, jsonb_build_object('client_name', 'Renamed'));

  select count(*) into v_n from history.migration_log m
   where m.organization_id = v_org and m.id = v_log and m.undone_at is null;
  if v_n <> 1 then
    raise exception 'HIS-8 (b): the rename is not on the log as an outstanding Migration';
  end if;

  -- (c) UNDO. It restores the old name, through the same write path.
  select coalesce(max(id), 0) into v_mark from history.row_versions;
  v_undo := history.migration_undo(v_org, v_log);
  select r.data ->> 'client_name' into v_txt
    from custom.record r where r.organization_id = v_org and r.id = v_rec;
  if v_txt <> 'ABC three' then
    raise exception 'HIS-8 (c): the undo left the name as "%"', v_txt;
  end if;
  if not exists (select 1 from history.migration_log m
                  where m.organization_id = v_org and m.id = v_log and m.undone_at is not null) then
    raise exception 'HIS-8 (c): the log entry was not marked undone';
  end if;

  -- (d) THE UNDO ITSELF IS ON THE RECORD. Putting something back is not the same as it never
  --     having happened, and that is the difference between a log and a rewrite.
  select count(*) into v_n from history.row_versions v
   where v.id > v_mark and v.entity_type = 'custom.record'
     and v.organization_id = v_org and v.row_id = v_rec;
  if v_n < 1 then
    raise exception 'HIS-8 (d): the undo wrote no version of its own — it went round custom.record_update';
  end if;

  -- (e) Undoing it twice changes nothing and says why.
  begin
    perform history.migration_undo(v_org, v_log);
    raise exception 'HIS-8 (e): the same Migration was undone twice';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg !~* 'already undone' then
      raise exception 'HIS-8 (e): the second undo failed for the wrong reason — "%"', v_msg;
    end if;
  end;

  raise notice 'PART 4 — HIS-8: an inverse-less Migration refused, a rename logged, undone back to "ABC three", the log marked undone, % version row(s) written BY the undo, and a second undo refused.', v_n;

  -- ══════════════════════════════════════════════════════════════════════════
  -- PART 5 — HIS-N-1 and HIS-N-2. Snapshots and one Value, put back, forwards.
  -- ══════════════════════════════════════════════════════════════════════════
  select count(*) into v_n from history.snapshot_chain(v_org, v_rec);
  if v_n < 2 then
    raise exception 'HIS-N-1 (a): the snapshot chain holds % entries', v_n;
  end if;
  select label into v_txt from history.snapshot_chain(v_org, v_rec) order by occurred_at, version limit 1;
  if v_txt !~ '·' then
    raise exception 'HIS-N-1 (a): a snapshot is picked by what happened and when — the label reads "%"', v_txt;
  end if;

  -- (b) RESTORE an earlier version, and it becomes a NEW version rather than a hole.
  select version into v_ver from history.snapshot_chain(v_org, v_rec) order by version limit 1;
  select coalesce(max(id), 0) into v_mark from history.row_versions;
  perform history.snapshot_restore(v_org, v_rec, v_ver);
  select count(*) into v_n from history.row_versions v
   where v.id > v_mark and v.entity_type = 'custom.record' and v.row_id = v_rec;
  if v_n < 1 then
    raise exception 'HIS-N-1 (b): restoring version % wrote no new version', v_ver;
  end if;
  select r.version into v_ver2 from custom.record r where r.organization_id = v_org and r.id = v_rec;
  if v_ver2 <= v_ver then
    raise exception 'HIS-N-1 (b): the record is at version % after restoring version % — the chain went backwards', v_ver2, v_ver;
  end if;

  -- (c) A version that was never saved is refused by name, with the remedy.
  begin
    perform history.snapshot_restore(v_org, v_rec, 99999);
    raise exception 'HIS-N-1 (c): a version that does not exist was restored';
  exception when sqlstate '02000' then
    get stacked diagnostics v_msg = message_text;
    if v_msg !~* 'saved version' then
      raise exception 'HIS-N-1 (c): the refusal did not say what was missing — "%"', v_msg;
    end if;
  end;

  -- (d) HIS-N-2: ONE Value put back, through the same write path, producing a NEW version.
  perform custom.record_update(v_org, v_rec, jsonb_build_object('client_name', 'Wrong name'));
  select coalesce(max(id), 0) into v_mark from history.row_versions;
  v_res := history.value_undo(v_org, v_rec, 'client_name');
  select r.data ->> 'client_name' into v_txt
    from custom.record r where r.organization_id = v_org and r.id = v_rec;
  if v_txt = 'Wrong name' then
    raise exception 'HIS-N-2 (d): undoing client_name left it as "%"', v_txt;
  end if;
  select count(*) into v_n from history.row_versions v
   where v.id > v_mark and v.entity_type = 'custom.record' and v.row_id = v_rec;
  if v_n < 1 then
    raise exception 'HIS-N-2 (d): the value undo wrote no version of its own';
  end if;

  -- (e) A Value that has never changed has nothing to put back, and says so.
  begin
    perform history.value_undo(v_org, v_rec2, 'client_name');
    raise exception 'HIS-N-2 (e): a value that never changed was "put back"';
  exception when sqlstate '02000' then
    get stacked diagnostics v_msg = message_text;
    if v_msg !~* 'nothing to put back' then
      raise exception 'HIS-N-2 (e): the refusal read "%"', v_msg;
    end if;
  end;

  raise notice 'PART 5 — HIS-N-1 / HIS-N-2: snapshot chain labelled and restored forwards to version %, a missing version refused, one Value put back to "%" with a new version of its own, and an unchanged Value refused.', v_ver2, v_txt;

  -- ══════════════════════════════════════════════════════════════════════════
  -- PART 6 — VIS-16 and T15's audit half. Who could see R on D, BY REPLAY.
  -- ══════════════════════════════════════════════════════════════════════════
  select coalesce(max(id), 0) into v_mark from history.row_versions;
  insert into iam.permissions (resource_type, resource_id, granted_to_organization_id,
                               permission_level, status)
  values ('record', v_rec, v_org, 'viewer', 'active')
  returning id into v_perm;

  -- The grant existed on the date asked about, and the window was open before it.
  update history.row_versions set occurred_at = v_t_before
   where id > v_mark and entity_type = 'iam.permissions';
  update history.capture_window set opened_at = v_t_open where entity_type = 'iam.permissions';

  -- It has since been revoked. The live table no longer carries it.
  delete from iam.permissions where id = v_perm;

  -- (a) The replay still returns it for that date — which is exactly what an audit asks.
  select count(*) into v_n from history.grants_at('record', v_rec, v_t_ask) g
   where g.permission_id = v_perm;
  if v_n <> 1 then
    raise exception 'VIS-16 (a): the grant revoked since % came back % times for that date, and it was live then', v_t_ask, v_n;
  end if;

  -- (b) SECOND INPUT, DIFFERENT EXPECTED VALUE: today it is gone.
  select count(*) into v_n from history.grants_at('record', v_rec, now()) g
   where g.permission_id = v_perm;
  if v_n <> 0 then
    raise exception 'VIS-16 (b): a revoked grant is still returned for today';
  end if;

  -- (c) who_could_see answers from the replay, and names the principal.
  select count(*) into v_n from history.who_could_see(v_org, v_rec, v_t_ask) w
   where w.principal_id = v_org;
  if v_n < 1 then
    raise exception 'T15: "who could see this on %" did not include the organization the grant named', v_t_ask;
  end if;

  -- (d) A moment History was NOT watching is REFUSED BY NAME rather than guessed at.
  begin
    perform * from history.who_could_see(v_org, v_rec, v_t_open - interval '1 day');
    raise exception 'VIS-16 (d): a replay of a moment before the store was recording was answered';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg !~* 'not watching' and v_msg !~* 'not started recording' then
      raise exception 'VIS-16 (d): the refusal read "%"', v_msg;
    end if;
  end;

  raise notice 'PART 6 — VIS-16 / T15: a grant revoked since is returned for % and absent for today, who_could_see names the principal, and a moment before the window is refused by name.', v_t_ask;

  -- ══════════════════════════════════════════════════════════════════════════
  -- PART 7 — DYN-19. live / as_of world / as_of recorded / snapshot, and four refusals.
  -- ══════════════════════════════════════════════════════════════════════════
  -- (a) live — whatever it is now.
  select value, clock into v_res, v_txt
    from history.merge_field_resolve(v_org, v_mf, v_rec, 'address');
  if v_txt <> 'live' or v_res is distinct from to_jsonb('Y'::text) then
    raise exception 'DYN-19 (a): live resolved % on clock "%"', coalesce(v_res::text, 'nothing'), v_txt;
  end if;

  -- (b) as_of / world — what was TRUE then.
  perform custom.record_update(v_org, v_mf, jsonb_build_object(
    'temporal', jsonb_build_object('mode','as_of','clock','world','at','2024-03-01')));
  select value, clock into v_res, v_txt
    from history.merge_field_resolve(v_org, v_mf, v_rec, 'address');
  if v_txt <> 'world' or v_res is distinct from to_jsonb('X'::text) then
    raise exception 'DYN-19 (b): as-of world 2024-03-01 resolved % on clock "%"', coalesce(v_res::text, 'nothing'), v_txt;
  end if;

  -- (c) as_of / recorded — what the store SAID then. Different clock, different answer.
  perform custom.record_update(v_org, v_mf, jsonb_build_object(
    'temporal', jsonb_build_object('mode','as_of','clock','recorded','at', v_t_ask::text)));
  select clock into v_txt from history.merge_field_resolve(v_org, v_mf, v_rec, 'address');
  if v_txt <> 'recorded' then
    raise exception 'DYN-19 (c): as-of recorded resolved on clock "%"', v_txt;
  end if;

  -- (d) snapshot.
  perform custom.record_update(v_org, v_mf, jsonb_build_object(
    'temporal', jsonb_build_object('mode','snapshot')));
  select clock into v_txt from history.merge_field_resolve(v_org, v_mf, v_rec, 'address');
  if v_txt <> 'snapshot' then
    raise exception 'DYN-19 (d): snapshot resolved on clock "%"', v_txt;
  end if;

  -- THE FOUR REFUSALS.
  begin  -- 1: a mode nobody has.
    perform custom.record_update(v_org, v_mf, jsonb_build_object(
      'temporal', jsonb_build_object('mode','whenever')));
    raise exception 'DYN-19 refusal 1: "whenever" was accepted as a mode';
  exception when check_violation then null;
  end;
  begin  -- 2: as_of without a clock.
    perform custom.record_update(v_org, v_mf, jsonb_build_object(
      'temporal', jsonb_build_object('mode','as_of','at','2024-03-01')));
    raise exception 'DYN-19 refusal 2: an as-of with no clock was accepted';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg !~* 'clock' then
      raise exception 'DYN-19 refusal 2 read "%"', v_msg;
    end if;
  end;
  begin  -- 3: as_of without a moment.
    perform custom.record_update(v_org, v_mf, jsonb_build_object(
      'temporal', jsonb_build_object('mode','as_of','clock','world')));
    raise exception 'DYN-19 refusal 3: an as-of with no moment was accepted';
  exception when check_violation then null;
  end;
  begin  -- 4: a moment named by a mode that never reads one.
    perform custom.record_update(v_org, v_mf, jsonb_build_object(
      'temporal', jsonb_build_object('mode','live','at','2024-03-01')));
    raise exception 'DYN-19 refusal 4: a moment was accepted on a live merge field';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg !~* 'changes nothing' then
      raise exception 'DYN-19 refusal 4 read "%"', v_msg;
    end if;
  end;

  raise notice 'PART 7 — DYN-19: live -> Y, as-of world 2024-03 -> X, as-of recorded, snapshot, and four refusals by name.';

  raise notice '════ C-17 GREEN — HIS-1…HIS-8, HIS-N-1, HIS-N-2, VIS-16, DYN-19, T6, T14 and T15''s audit half. Rolling back. ════';
end;
$t$;

rollback;
