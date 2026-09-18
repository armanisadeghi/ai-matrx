-- W3-HIST — THE RED TWIN of `scripts/campaign-tests/w3_hist_c17.sql`.
--
-- Rule 2: a guard that cannot be demonstrated failing is not a guard. This file turns THIS
-- LANE'S enforcement points off, one at a time, inside ONE transaction that ROLLS BACK, and
-- asserts that each thing C-17 relies on DISAPPEARS — and, where the failure is silent rather
-- than loud, that the WRONG ANSWER is actually returned, which is the half that matters.
--
--   RED 1 — the capture trigger. `zzz_history_capture` is dropped and six writes across six
--           data_class values record NOTHING. C-17 PART 1, and every replay under it.
--   RED 2 — the world clock's absence. `history.value_in_document` falls back to the
--           document's plain key when no period covers the date, and a contract valid from
--           2027 is returned for June 2026 — the silent wrong answer, not a refusal.
--   RED 3 — the second clock. `history.value_as_of` ignores `p_recorded_at`, and "what did
--           this store SAY in August 2026" answers with September's correction. One clock
--           wearing two argument names.
--   RED 4 — the retention floor. `history.retention_set` loses its floor comparison and a
--           ten-day retention lands under a thirty-day floor.
--   RED 5 — HIS-4. `history.prune` loses its `migration_log` arm and prunes the one thing
--           that is never pruned.
--   RED 6 — HIS-8. `history.migration_record` accepts a null inverse, and a log entry that
--           claims undoability it does not have is written.
--   RED 7 — VIS-16's registration. The `record` row in
--           `platform.shareable_resource_registry` is deactivated, the grant is refused, and
--           the replay goes empty — which is what production answers today.
--   RED 8 — DYN-19. `custom_record_merge_field_temporal_guard` is dropped and "whenever"
--           lands as a temporal mode.
--
-- It refuses to run anywhere but the rehearsal branch, by system identifier, and it is not a
-- migration: nothing in `migrations/` and no sweep can see it.
--
--   PSQL="$(node node_modules/tsx/dist/cli.mjs scripts/lib/psql-path.ts --print)"
--   "$PSQL" "$SUPABASE_BRANCH_DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f scripts/campaign-tests/w3_hist_red.sql

\set ON_ERROR_STOP on
\timing off

begin;

do $r$
declare
  v_org     constant uuid := '39c38960-d30c-4840-b0c1-c9960de95582';
  v_home    constant uuid := '11111111-0000-4000-8000-000000000001';
  v_t_open  constant timestamptz := '2026-07-01 00:00:00+00';
  v_t_before constant timestamptz := '2026-08-10 12:00:00+00';
  v_t_ask   constant timestamptz := '2026-08-15 12:00:00+00';
  v_tbl     uuid;
  v_rec     uuid;
  v_mf      uuid;
  v_rule    uuid;
  v_f_addr  uuid;
  v_perm    uuid;
  v_log     uuid;
  v_mark    bigint;
  v_n       integer;
  v_txt     text;
  v_res     jsonb;
begin
  if (pg_control_system()).system_identifier <> 7678069749886157684 then
    raise exception 'w3_hist_red.sql refuses to run here: system_identifier is %, and this file may only run on the rehearsal branch (7678069749886157684)',
                    (pg_control_system()).system_identifier;
  end if;

  perform set_config('request.jwt.claims',
                     '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}', true);

  -- ══════════════════════════════════════════════════════════════════════════
  -- RED 1 — THE CAPTURE TRIGGER. Take it away and the store records nothing.
  -- ══════════════════════════════════════════════════════════════════════════
  drop trigger zzz_history_capture on custom.record;

  select coalesce(max(id), 0) into v_mark from history.row_versions;

  v_tbl := custom.table_declare(v_org, jsonb_build_object(
    'name', 'W3-HIST RED Client', 'slug', 'w3_hist_red_client', 'type', 'entity',
    'label_singular', 'Client', 'label_plural', 'Clients', 'title_field', 'client_name',
    'display', 'page', 'weight', 'light', 'ordered', false, 'row_order', 'sorted',
    'default_sort', '[]'::jsonb, 'agent_writable', true, 'retention_days', 365,
    'fields', jsonb_build_array(jsonb_build_object('name','client_name'),
                                jsonb_build_object('name','address'),
                                jsonb_build_object('name','contract')),
    'parent_id', v_home));

  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org, custom.field_kernel_id(), 'field', jsonb_build_object(
    'key','client_name','label','Client name','type','text','sort',10,'required',false,
    'multi',false,'dated',false,'source','manual','config','{}'::jsonb,'rules','[]'::jsonb,
    'depends_on','[]'::jsonb,'sensitivity','internal','source_config','{}'::jsonb,
    'context_policy','include','applies_to_types','[]'::jsonb,'entity_definition_id',v_tbl));

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
    'context_policy','include','applies_to_types','[]'::jsonb,'entity_definition_id',v_tbl));

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
   where organization_id = v_org and id = custom.file_kernel_id();

  v_rec := custom.record_write(v_org, v_tbl, jsonb_build_object(
    'client_name', 'ABC', 'address', 'X', 'contract', 'CT-77',
    '_values', jsonb_build_object(
      'address',  jsonb_build_object('dated', jsonb_build_array(
                    jsonb_build_object('from', null, 'to', null, 'value', 'X'))),
      'contract', jsonb_build_object('dated', jsonb_build_array(
                    jsonb_build_object('from', '2027-01-01', 'to', '2029-01-01', 'value', 'CT-77'))))));

  select count(*) into v_n from history.row_versions v
   where v.id > v_mark and v.entity_type = 'custom.record' and v.organization_id = v_org;
  if v_n <> 0 then
    raise exception 'RED 1 did not go red: % rows were still recorded with the capture trigger gone', v_n;
  end if;
  raise notice 'RED 1 — the capture trigger dropped: six writes across six data_class values recorded 0 rows. C-17 PART 1 requires all six.';

  -- Put it back for the rest of the file: every arm below needs a store that records.
  create trigger zzz_history_capture
    after insert or update or delete on custom.record
    for each row execute function history.record_capture();

  -- A second, recorded write so the arms below have History to read.
  perform custom.record_update(v_org, v_rec, jsonb_build_object('client_name', 'ABC recorded'));
  update history.row_versions set occurred_at = v_t_before
   where entity_type = 'custom.record' and organization_id = v_org and row_id = v_rec;
  update history.capture_window set opened_at = v_t_open where entity_type = 'custom.record';

  perform custom.record_update(v_org, v_rec, jsonb_build_object(
    'address', 'Y',
    '_values', jsonb_build_object(
      'address', jsonb_build_object('dated', jsonb_build_array(
        jsonb_build_object('from', null,         'to', '2024-06-01', 'value', 'X'),
        jsonb_build_object('from', '2024-06-01', 'to', null,         'value', 'Y'))),
      'contract', jsonb_build_object('dated', jsonb_build_array(
        jsonb_build_object('from', '2027-01-01', 'to', '2029-01-01', 'value', 'CT-77'))))));

  -- Sanity: GREEN behaviour before each arm is weakened, so a red that was already red
  -- cannot be mistaken for a guard working.
  if history.value_as_of(v_org, v_rec, 'contract', date '2026-06-01') is not null then
    raise exception 'RED 2 precondition: the 2027 contract was already leaking for June 2026';
  end if;
  if history.value_as_of(v_org, v_rec, 'address', date '2025-03-01', v_t_ask) is distinct from to_jsonb('X'::text) then
    raise exception 'RED 3 precondition: the recorded clock did not answer X before it was weakened';
  end if;

  -- ══════════════════════════════════════════════════════════════════════════
  -- RED 2 — THE WORLD CLOCK'S ABSENCE, which is a value, not a blank.
  -- ══════════════════════════════════════════════════════════════════════════
  create or replace function history.value_in_document(p_data jsonb, p_key text, p_world_on date)
  returns jsonb language plpgsql immutable set search_path to 'pg_catalog' as $red$
  declare
    v_periods jsonb := p_data -> '_values' -> p_key -> 'dated';
    v_p jsonb; v_from date; v_to date;
  begin
    if p_world_on is null or jsonb_typeof(v_periods) <> 'array' then
      return p_data -> p_key;
    end if;
    for v_p in select value from jsonb_array_elements(v_periods) loop
      v_from := nullif(v_p ->> 'from', '')::date;
      v_to   := nullif(v_p ->> 'to', '')::date;
      if (v_from is null or p_world_on >= v_from) and (v_to is null or p_world_on < v_to) then
        return v_p -> 'value';
      end if;
    end loop;
    return p_data -> p_key;        -- THE WEAKENING: "nothing was true then" becomes "whatever it is now"
  end;
  $red$;

  if history.value_as_of(v_org, v_rec, 'contract', date '2026-06-01') is null then
    raise exception 'RED 2 did not go red: the contract is still absent for June 2026';
  end if;
  raise notice 'RED 2 — value_in_document falls back to the plain key: a contract valid 2027-2029 now reads % in June 2026. T6''s fourth date returns a value that was never true.',
               history.value_as_of(v_org, v_rec, 'contract', date '2026-06-01')::text;

  -- ══════════════════════════════════════════════════════════════════════════
  -- RED 3 — THE SECOND CLOCK, removed. One body, two argument names.
  -- ══════════════════════════════════════════════════════════════════════════
  create or replace function history.value_as_of(p_organization_id uuid, p_record_id uuid,
                                                 p_key text, p_world_on date default null,
                                                 p_recorded_at timestamptz default null)
  returns jsonb language plpgsql stable set search_path to 'pg_catalog' as $red$
  declare v_data jsonb;
  begin
    -- THE WEAKENING: p_recorded_at is accepted and ignored.
    select r.data into v_data from custom.record r
     where r.organization_id = p_organization_id and r.id = p_record_id;
    return history.value_in_document(v_data, p_key, p_world_on);
  end;
  $red$;

  if history.value_as_of(v_org, v_rec, 'address', date '2025-03-01', v_t_ask) is not distinct from to_jsonb('X'::text) then
    raise exception 'RED 3 did not go red: the recorded clock still answers X';
  end if;
  raise notice 'RED 3 — value_as_of ignores the recorded clock: "what did this store SAY on %" now answers %, which is September''s correction reaching backwards. T6''s third date is the only thing that catches it.',
               v_t_ask, history.value_as_of(v_org, v_rec, 'address', date '2025-03-01', v_t_ask)::text;

  -- ══════════════════════════════════════════════════════════════════════════
  -- RED 4 — THE RETENTION FLOOR, removed.
  -- ══════════════════════════════════════════════════════════════════════════
  create or replace function history.retention_set(p_organization_id uuid, p_table_id uuid, p_days integer)
  returns integer language plpgsql volatile set search_path to 'pg_catalog' as $red$
  begin
    perform custom.assert_store_door(p_organization_id, 'history.retention_set');
    -- THE WEAKENING: no floor comparison at all.
    perform custom.record_update(p_organization_id, p_table_id,
                                 jsonb_build_object('retention_days', p_days));
    return p_days;
  end;
  $red$;

  -- The door's OWN refusal is gone. The store still has a second wall — W1-TABLE's
  -- `custom._table_shape_guard` reads the same floor on the WRITE — so what RED 4 proves is
  -- precisely which refusal belongs to which guard: the sentence a person meets moves from
  -- the door (which names the remedy) to the shape guard (which names the rule), and T14's
  -- clause is about the door.
  begin
    perform history.retention_set(v_org, v_tbl, 10);
    raise exception 'RED 4: ten days landed with BOTH walls gone — the shape guard is not reading the floor either';
  exception when check_violation then
    get stacked diagnostics v_txt = pg_exception_context;
    if v_txt !~ '_table_shape_guard' then
      raise exception 'RED 4 did not go red: the refusal still comes from history.retention_set — %', v_txt;
    end if;
    raise notice 'RED 4 — retention_set loses its floor comparison: its own refusal is GONE and ten days is now stopped only by custom._table_shape_guard, one layer deeper. T14''s door-level refusal, with its remedy, disappears; a caller using any other write path would land it.';
  end;

  -- ══════════════════════════════════════════════════════════════════════════
  -- RED 5 — HIS-4: the Migration log becomes prunable.
  -- ══════════════════════════════════════════════════════════════════════════
  create or replace function history.prune(p_organization_id uuid, p_scope text default 'values',
                                           p_table_id uuid default null, p_dry_run boolean default true)
  returns jsonb language plpgsql volatile set search_path to 'pg_catalog' as $red$
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

  v_log := history.migration_record(v_org, 'rename', 'record', v_rec,
             jsonb_build_object('kind','patch','record_id', v_rec::text,
                                'patch', jsonb_build_object('client_name','ABC recorded')));
  v_res := history.prune(v_org, 'migration_log', null, false);
  if exists (select 1 from history.migration_log m where m.id = v_log) then
    raise exception 'RED 5 did not go red: the Migration log entry survived';
  end if;
  raise notice 'RED 5 — prune loses its migration_log arm: the permanent structural record was deleted instead of refused (% rows). T14''s refusal by name disappears and nothing else notices.',
               v_res ->> 'rows_pruned';

  -- ══════════════════════════════════════════════════════════════════════════
  -- RED 6 — HIS-8: a log entry that lies about being undoable.
  -- ══════════════════════════════════════════════════════════════════════════
  create or replace function history.migration_record(p_organization_id uuid, p_verb text,
                                                      p_target_kind text, p_target_id uuid,
                                                      p_inverse jsonb, p_note text default null)
  returns uuid language plpgsql volatile set search_path to 'pg_catalog' as $red$
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

  v_log := history.migration_record(v_org, 'rename', 'record', v_rec, null);
  if v_log is null then
    raise exception 'RED 6 did not go red: the inverse-less Migration was still refused';
  end if;
  begin
    perform history.migration_undo(v_org, v_log);
    raise exception 'RED 6: the undo of an inverse-less Migration reported success, which is worse again';
  exception when others then
    raise notice 'RED 6 — migration_record accepts a null inverse: entry % was written and its undo then fails at the moment somebody needs it. HIS-8''s refusal moves from write time to sixty days later.', v_log;
  end;

  -- ══════════════════════════════════════════════════════════════════════════
  -- RED 7 — VIS-16: the registration removed, and the replay goes empty.
  -- ══════════════════════════════════════════════════════════════════════════
  update platform.shareable_resource_registry set is_active = false where resource_type = 'record';
  begin
    insert into iam.permissions (resource_type, resource_id, granted_to_organization_id,
                                 permission_level, status)
    values ('record', v_rec, v_org, 'viewer', 'active') returning id into v_perm;
    raise exception 'RED 7 did not go red: the grant was written with the registration deactivated';
  exception when check_violation then
    select count(*) into v_n from history.grants_at('record', v_rec, v_t_ask);
    raise notice 'RED 7 — the `record` registration deactivated: the grant is refused and history.grants_at returns % rows for %. This is exactly what production answers today, and the answer is "nobody".',
                 v_n, v_t_ask;
  end;
  update platform.shareable_resource_registry set is_active = true where resource_type = 'record';

  -- ══════════════════════════════════════════════════════════════════════════
  -- RED 8 — DYN-19: the temporal guard dropped.
  -- ══════════════════════════════════════════════════════════════════════════
  drop trigger custom_record_merge_field_temporal_guard on custom.record;
  perform custom.record_update(v_org, v_mf, jsonb_build_object(
    'temporal', jsonb_build_object('mode','whenever')));
  select r.data -> 'temporal' ->> 'mode' into v_txt
    from custom.record r where r.organization_id = v_org and r.id = v_mf;
  if v_txt is distinct from 'whenever' then
    raise exception 'RED 8 did not go red: the mode reads "%"', v_txt;
  end if;
  raise notice 'RED 8 — the temporal guard dropped: a merge field now declares mode "%" and history.merge_field_resolve silently resolves it live. DYN-19''s four refusals disappear together.', v_txt;

  raise notice '════ W3-HIST RED — eight arms, eight things C-17 relies on gone. Rolling back; nothing here survives this transaction. ════';
end;
$r$;

rollback;
