-- draft: lane9-scopes-g clone proof (green suite, rule 27, timing) not yet run
-- chair-step: it REPLACES the body of one lane-9 door, custom.resolve_context (signature, SECURITY DEFINER, search_path, plan_cache_mode and grants unchanged). Same answer, byte for byte, for every seat: the Fields of the admitted records are read once per (organization, Table) by that pair's own key instead of one join against every Field of every organization; the System items a turn names are worked out once, and a turn naming none reads none; an empty list of active Tables asks nothing. No other function, no table, index, policy, grant, door row or data row is touched.
-- lane: SCOPES-ON-THE-STORE
-- based-on: custom.resolve_context(text, uuid, uuid[], uuid[], text[]) 82d167440cb2eb5fa38340aad5f27b5325308f5c2724d1f413700a0e949edf3b
-- lock: custom
--
-- Inverse: migrations/inverse/scopesg_the_agent_handoff_reads_each_tables_fields_by_its_own_key_down.sql.
--
-- WHY (lane 9 sublane G, 2026-10-03; measured on clone-20261002, one statement per call as an agent
-- turn is, median of 7 warm, interleaved). This function runs with plan_cache_mode = force_generic_plan
-- (SCOPES-HANDOFF-BUDGET), so its Fields query — a join from the admitted records to custom.record on
-- (organization_id, Table) taken from a jsonb array — was planned once, generic, as a hash join over
-- EVERY Field of EVERY organization: ~5,500 rows, ~35 ms, paid by every turn however small. Read per
-- (organization, Table) pair with scalar keys, initial pruning leaves one partition and the
-- (organization_id, table_id, created_at) index one range. The two System-item loops each called
-- context.named_system_context_items(context.system_item_refs_or_defaults(..)) — 4-6 ms a turn that
-- names no System item (aidream sends an explicit empty list). The parity sweep's set, before -> after:
-- admin@admin.com 4.1x -> 3.2x, test@test.com 3.1x -> 2.3x of the old hand-off; the rest is the
-- store's own doors (custom.levels_of, custom._where_ids_open_with, custom._read_record_with), measured
-- and handed to the chair in common-docs/projects/data-doctrine-adoption/v6/scopes-evidence/scopes-g-resolve-context-budget.md.
-- Guards: scripts/campaign-tests/scopesg_green.sql (same answer for every seat with scopes; a Field an
-- agent may never see is absent — plant red) and scripts/campaign-tests/scopesg_timing.ts (the budget).

CREATE OR REPLACE FUNCTION custom.resolve_context(p_entity_type text, p_entity_id uuid, p_record_ids uuid[] DEFAULT NULL::uuid[], p_table_ids uuid[] DEFAULT NULL::uuid[], p_system_item_refs text[] DEFAULT NULL::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
 SET plan_cache_mode TO 'force_generic_plan'
AS $function$
declare
  v_me          uuid := custom.query_principal();
  v_org_id      uuid;
  v_project_id  uuid;
  v_task_id     uuid;
  v_cands       jsonb := '[]'::jsonb;   -- [{record_id, via}] in contribution order
  v_checks      jsonb := '[]'::jsonb;   -- one row per candidate: admitted or refused, and why
  v_withheld    jsonb := '[]'::jsonb;   -- a field the person may not see on an admitted record
  v_admitted    jsonb := '[]'::jsonb;   -- [{record_id, organization_id, table_id, name, type_label, via}]
  v_tables      jsonb := '[]'::jsonb;
  v_scope_labels jsonb := '{}'::jsonb;
  v_variables   jsonb := '{}'::jsonb;
  v_sources     jsonb := '{}'::jsonb;
  v_cells       jsonb := '{}'::jsonb;
  v_cell        jsonb;
  v_where       jsonb;
  v_doc         jsonb;
  v_hidden      jsonb;
  v_table       custom.record;
  v_title_field text;
  v_label       text;
  v_name        text;
  v_inject      text;
  v_org         uuid;
  v_rec         uuid;
  v_via         text;
  v_versions    jsonb;
  c             jsonb;
  v_cap         bigint;
  v_val         jsonb;
  v_whole       jsonb;
  a             jsonb;
  f             record;
  rec           record;
  v_levels      jsonb;
  v_rcache      jsonb := '{}'::jsonb;
  v_wheres      jsonb;
  v_tcache      jsonb := '{}'::jsonb;
  v_tid         uuid;
  v_tbl         jsonb;
  -- SCOPES-HANDOFF-BUDGET: what the loops gather, gathered in arrays and made one jsonb at the end.
  -- Appending to a jsonb copies it whole, so a turn of n scopes cost n^2 bytes in the checks alone.
  v_checks_a    jsonb[] := array[]::jsonb[];
  v_admitted_a  jsonb[] := array[]::jsonb[];
  v_withheld_a  jsonb[] := array[]::jsonb[];
  v_c_key       text[]  := array[]::text[];    -- per cell, in the order it is met: the variable's key,
  v_c_attr      jsonb[] := array[]::jsonb[];   --   the variable as this cell leaves it (less its cells),
  v_c_cell      jsonb[] := array[]::jsonb[];   --   the cell,
  v_c_item      text[]  := array[]::text[];    --   and the context item (or Field) it is a cell of
  v_caps        jsonb := '{}'::jsonb;          -- organization -> custom.agent_context_value_cap
  v_attr        jsonb;
  -- SCOPES-G: the System items this turn names, worked out once (NULL = the platform's default
  -- list; an empty list names none, and then neither System loop reads anything).
  v_refs        text[];
  -- SCOPES-G: the Fields of every (organization, Table) an admitted record lives in, read once per
  -- pair by the pair's own key instead of one join against every Field of every organization.
  v_f_org       uuid[]  := array[]::uuid[];
  v_f_tbl       uuid[]  := array[]::uuid[];
  v_f_id        uuid[]  := array[]::uuid[];
  v_f_data      jsonb[] := array[]::jsonb[];
  v_fkernel     uuid    := custom.field_kernel_id();
  p             record;
  -- SCOPES-G: every candidate record's Table id and version stamps, read once per organization by
  -- the row's own key (organization_id, id) before the loop, instead of one read per record in it.
  v_pre         jsonb := '{}'::jsonb;
  v_pre_row     jsonb;
begin
  if v_me is null then
    raise exception 'custom.resolve_context resolves context for a person, and nobody is signed in.'
      using errcode = '42501',
            hint = 'The server calls this door acting as the person operating the agent (DOOR-1).';
  end if;

  -- ── THE ENTITY: where the turn lives (read exactly as public.resolve_full_context reads it) ─
  if p_entity_type = 'task' then
    select t.project_id, p.organization_id, t.id
      into v_project_id, v_org_id, v_task_id
      from projects.tasks t left join projects.projects p on t.project_id = p.id
     where t.id = p_entity_id;
  elsif p_entity_type = 'project' then
    select p.organization_id, p.id into v_org_id, v_project_id
      from projects.projects p where p.id = p_entity_id;
  elsif p_entity_type = 'conversation' then
    select c2.organization_id,
           (select a2.target_id from platform.associations_live a2
             where a2.source_type = 'conversation' and a2.source_id = c2.id
               and a2.target_type = 'project' and a2.organization_id = c2.organization_id
             order by a2.position nulls last, a2.created_at, a2.id limit 1),
           c2.task_id
      into v_org_id, v_project_id, v_task_id
      from chat.conversation c2 where c2.id = p_entity_id;
  elsif p_entity_type = 'note' then
    select n.organization_id,
           (select a2.target_id from platform.associations_live a2
             where a2.source_type = 'note' and a2.source_id = n.id and a2.target_type = 'project'
             order by a2.position nulls last, a2.created_at, a2.id limit 1),
           (select a2.target_id from platform.associations_live a2
             where a2.source_type = 'note' and a2.source_id = n.id and a2.target_type = 'task'
             order by a2.position nulls last, a2.created_at, a2.id limit 1)
      into v_org_id, v_project_id, v_task_id
      from workbench.notes n where n.id = p_entity_id;
  end if;

  -- ── THE CANDIDATES, in the old resolver's own order: the entity's tags, else its project's,
  --    then the selection. A tag is read by its TARGET ID whichever token the edge carries —
  --    `scope` today, its copy `record` (SC-4 P4, role context_tag; `custom_record` is the retired
  --    tier-2 token, read too so an edge under either store token is the same tag: grouped by
  --    target id, one candidate) (same id, CUT-4) — and in
  --    ANY organization, because the edge belongs to the entity's organization and the record
  --    to its own (Brightline's task, Harborline's app).
  select coalesce(jsonb_agg(jsonb_build_object('record_id', t.target_id, 'via', 'entity_tag') order by t.first_at, t.target_id), '[]'::jsonb)
    into v_cands
    from (select a2.target_id, min(a2.created_at) as first_at
            from platform.associations_live a2
           where a2.source_type = p_entity_type and a2.source_id = p_entity_id
             and a2.target_type in ('scope', 'record', 'custom_record')
           group by a2.target_id) t;

  if jsonb_array_length(v_cands) = 0 and v_project_id is not null and p_entity_type <> 'project' then
    select coalesce(jsonb_agg(jsonb_build_object('record_id', t.target_id, 'via', 'project_tag') order by t.first_at, t.target_id), '[]'::jsonb)
      into v_cands
      from (select a2.target_id, min(a2.created_at) as first_at
              from platform.associations_live a2
             where a2.source_type = 'project' and a2.source_id = v_project_id
               and a2.target_type in ('scope', 'record', 'custom_record')
             group by a2.target_id) t;
  end if;

  if p_record_ids is not null then
    select v_cands || coalesce(jsonb_agg(jsonb_build_object('record_id', s.id, 'via', 'selection') order by s.ord), '[]'::jsonb)
      into v_cands
      from unnest(p_record_ids) with ordinality as s(id, ord)
     where s.id is not null
       and not (v_cands @> jsonb_build_array(jsonb_build_object('record_id', s.id)));
  end if;

  -- ── EVERY CANDIDATE CHECKED FOR THE PERSON — the one rule changed on purpose ──────────────
  -- The old resolver checked only the selection; a tag and a project's tag delivered every
  -- cell to whoever ran the turn. Here each record, however it arrived, is asked through
  -- custom.where_id_opens: organization members, direct and outside grants, and (P7's read
  -- arm) a scope membership on that record. What is refused is NAMED in `checks`, never
  -- dropped in silence.
  -- STORE-READ-PERF-2: the ladder is asked about every candidate at once, for the person the read
  -- door reads as (auth.uid(), as custom.read_record does), and each read below is handed its
  -- answer; the Table's value and choice plans ride from one record to the next in v_rcache.
  v_levels := custom.levels_of(auth.uid(),
                (select array_agg((e ->> 'record_id')::uuid) from jsonb_array_elements(v_cands) e));
  -- STORE-READ-PERF-3: where each candidate opens, asked ONCE for the whole set — one lookup of
  -- their homes, the organization wall once per organization, and the ladder's viewer answer
  -- taken from v_levels (asked above for the same person) — each answer exactly
  -- custom.where_id_opens(<id>).
  v_wheres := custom._where_ids_open_with(
                (select array_agg((e ->> 'record_id')::uuid) from jsonb_array_elements(v_cands) e),
                auth.uid(), v_levels);
  for p in select (e.value ->> 'organization_id')::uuid as org, array_agg(e.key::uuid) as ids
             from jsonb_each(coalesce(v_wheres, '{}'::jsonb)) e
            where e.value ->> 'kind' = 'record' and e.value ->> 'organization_id' is not null
            group by 1 loop
    -- a key the row does not carry is left out (never a JSON null), so `-> 'v'` is SQL NULL exactly
    -- when `x.data -> '_values'` was
    select v_pre || coalesce(jsonb_object_agg(x.id::text, jsonb_build_object('t', x.table_id)
             || case when x.data ? '_values'   then jsonb_build_object('v', x.data -> '_values')   else '{}'::jsonb end
             || case when x.data ? '_derived'  then jsonb_build_object('d', x.data -> '_derived')  else '{}'::jsonb end
             || case when x.data ? '_computed' then jsonb_build_object('c', x.data -> '_computed') else '{}'::jsonb end), '{}'::jsonb)
      into v_pre
      from custom.record x
     where x.organization_id = p.org and x.id = any (p.ids);
  end loop;
  for c in select value from jsonb_array_elements(v_cands) loop
    v_rec := (c ->> 'record_id')::uuid;
    v_via := c ->> 'via';
    v_where := v_wheres -> (v_rec::text);
    if v_where is null then
      v_checks_a := v_checks_a || jsonb_build_object('record_id', v_rec, 'via', v_via, 'admitted', false,
        'reason', 'not_opened',
        'says', 'This scope is not one you may open in the record store — it has not been shared with you, or it has not been copied into the store yet.');
      continue;
    end if;
    if v_where ->> 'kind' <> 'record' then
      v_checks_a := v_checks_a || jsonb_build_object('record_id', v_rec, 'via', v_via, 'admitted', false,
        'reason', 'not_a_record', 'kind', v_where ->> 'kind',
        'says', 'That id opens something that is not a record, so it carries no context values.');
      continue;
    end if;
    if not coalesce((v_where ->> 'live')::boolean, true) then
      v_checks_a := v_checks_a || jsonb_build_object('record_id', v_rec, 'via', v_via, 'admitted', false,
        'reason', 'in_trash', 'organization_id', v_where -> 'organization_id',
        'says', 'This scope''s record is in the trash, so nothing is read from it until it is restored.');
      continue;
    end if;

    v_org := (v_where ->> 'organization_id')::uuid;
    begin
      -- THE DECISION, IN THIS BODY (lane SUITE-HEALTH-2): the record's own organization's wall,
      -- asked by this door. custom._where_ids_open_with asked it once for this organization and
      -- remembered the yes for the transaction, so this is free and refuses nobody it admitted.
      perform custom.assert_client_may_reach(v_org, 'custom.resolve_context');
      select w.o_doc, w.o_cache into v_doc, v_rcache
        from custom._read_record_with(v_org, v_rec, false, v_levels, v_rcache) w;
    exception when others then
      v_checks_a := v_checks_a || jsonb_build_object('record_id', v_rec, 'via', v_via, 'admitted', false,
        'reason', 'door_refused', 'organization_id', v_org, 'sqlstate', sqlstate, 'says', sqlerrm);
      continue;
    end;

    -- STORE-READ-PERF-3: the record's Table is looked up once per Table, not once per record.
    -- SCOPES-HANDOFF-BUDGET: the record's Table id and THE TRIPLE (below) in one read of its row.
    -- SCOPES-G: from the row read before the loop by its key (organization, id) — the same row
    -- this read used to fetch here once per record; a record not found there has no Table id and
    -- no versions, exactly as the per-record read answered no row.
    v_pre_row := case when (v_where ->> 'organization_id')::uuid = v_org then v_pre -> (v_rec::text) end;
    v_tid := (v_pre_row ->> 't')::uuid;
    v_versions := case when v_pre_row is null then null else
           (select coalesce(jsonb_object_agg(k.key, jsonb_build_object(
                     'value_version', coalesce((v_pre_row -> 'v' -> k.key ->> 'ver')::integer, 1),
                     'written_at', coalesce((v_pre_row -> 'v' -> k.key ->> 'at')::timestamptz,
                                            (v_pre_row -> 'd' -> k.key ->> 'at')::timestamptz,
                                            (v_pre_row -> 'c' -> k.key ->> 'at')::timestamptz))),
                   '{}'::jsonb)
              from (select j.key from jsonb_object_keys(v_doc) j(key) where left(j.key, 1) <> '_'
                    union
                    select j.key from jsonb_object_keys(coalesce(v_pre_row -> 'v', '{}'::jsonb)) j(key)) k) end;
    v_versions := coalesce(v_versions, '{}'::jsonb);
    v_tbl := case when v_tid is not null then v_tcache -> (v_tid::text) end;
    if v_tbl is null then
      select r.* into v_table
        from custom.record r
       where r.id = v_tid
         and r.table_id = custom.table_kernel_id()
       limit 1;
      v_tbl := jsonb_build_object('id', v_table.id,
        'title_field', coalesce(nullif(v_table.data ->> 'title_field', ''), 'name'),
        'label', coalesce(nullif(v_table.data ->> 'label_singular', ''), nullif(v_table.data ->> 'name', ''), 'record'));
      if v_tid is not null then
        v_tcache := v_tcache || jsonb_build_object(v_tid::text, v_tbl);
      end if;
    end if;
    v_title_field := v_tbl ->> 'title_field';
    v_label := v_tbl ->> 'label';
    v_name := coalesce(nullif(v_doc ->> v_title_field, ''), v_rec::text);
    v_hidden := coalesce(v_doc -> '_hidden', '{}'::jsonb);

    v_checks_a := v_checks_a || jsonb_build_object('record_id', v_rec, 'via', v_via, 'admitted', true,
      'organization_id', v_org, 'table_id', (v_tbl ->> 'id')::uuid, 'name', v_name);
    -- THE TRIPLE, so the compare page can say which side is behind (copy lag) rather than
    -- merely that two values differ. INSPECTOR-TAILS (2026-09-25): read from the record this
    -- door has just opened for the person (custom.read_record above), the same `_values` /
    -- `_derived` / `_computed` metadata custom.record_values_versioned reads, for the same keys
    -- (the record's values plus its `_values` entries). It used to CALL that door once per
    -- record, and the door re-asked the organization wall, the record ladder and the whole field
    -- mask the read door had just answered — about 23 ms a record, 400 of the 850 ms a type of
    -- 17 scopes took. Proven identical on 70 live scope records before the swap.
    -- (read above, with the record's Table id)
    -- BIG-VALUES-READERS: this organization's cap on one context value handed to an agent
    -- (0, the default, is no cap: the agent gets the whole text, exactly as the old path does).
    if not v_caps ? v_org::text then
      v_caps := v_caps || jsonb_build_object(v_org::text, custom.agent_context_value_cap(v_org));
    end if;
    v_cap := (v_caps ->> v_org::text)::bigint;
    v_admitted_a := v_admitted_a || jsonb_build_object('record_id', v_rec, 'organization_id', v_org,
      'table_id', (v_tbl ->> 'id')::uuid, 'name', v_name, 'type_label', lower(v_label), 'via', v_via,
      'doc', v_doc - '_hidden' - '_alternates' - '_retired' - '_redirected_from' - '_redirect_says',
      'hidden', v_hidden, 'title_field', v_title_field, 'versions', v_versions, 'cap', v_cap);
  end loop;
  v_checks := to_jsonb(v_checks_a);
  v_admitted := to_jsonb(v_admitted_a);

  -- ── THE ACTIVE TABLES with no record chosen ("I'm working in Clients") — named, for the person ─
  -- SCOPES-G: an empty list names no Table, so nothing is asked (the answer is the same []).
  if p_table_ids is not null and cardinality(p_table_ids) > 0 then
    v_wheres := custom._where_ids_open_with(p_table_ids);
    select coalesce(jsonb_agg(t.id), '[]'::jsonb) into v_tables
      from unnest(p_table_ids) t(id)
     where coalesce(v_wheres -> (t.id::text) ->> 'kind', '') = 'table';
  end if;

  -- ── SCOPE LABELS: every admitted record's name under its Table's singular label ────────────
  select coalesce(jsonb_object_agg(x.type_label, x.names), '{}'::jsonb)
    into v_scope_labels
    from (
      select e ->> 'type_label' as type_label,
             case when count(*) > 1 then jsonb_agg(e ->> 'name' order by e ->> 'name')
                  else to_jsonb(min(e ->> 'name')) end as names
        from jsonb_array_elements(v_admitted) e
       group by e ->> 'type_label'
    ) x;

  -- ── THE SYSTEM LANE: System context stays its own table (§5 D10), and a System item is read
  --    only when it is NAMED (lane CONTEXT-VALUES-NAMED-2): p_system_item_refs, the same ids-or-keys
  --    list public.resolve_full_context takes; NULL or empty reads none ─────────────────────────
  v_refs := context.system_item_refs_or_defaults(p_system_item_refs);
  if cardinality(v_refs) > 0 then
  for rec in (
    select sci.id as context_item_id, sci.key, sci.description,
           sci.value_type::text as value_type, sci.value as value
      from context.named_system_context_items(v_refs) sci
     where sci.is_active = true and sci.deleted_at is null and sci.feed_type != 'dataset'
     order by sci.sort_order asc, sci.key asc
  ) loop
    continue when rec.value is null;
    v_cell := jsonb_build_object(
      'key', rec.key, 'value', rec.value, 'type', rec.value_type, 'description', rec.description,
      'context_item_id', rec.context_item_id,
      'scope_id', null, 'scope_name', 'System', 'scope_type_id', null, 'source', 'system');
    v_c_key  := v_c_key  || rec.key;
    v_c_attr := v_c_attr || jsonb_build_object(
      'value', rec.value, 'type', rec.value_type, 'inject_as', 'direct',
      'source', 'system', 'description', rec.description);
    v_c_cell := v_c_cell || v_cell;
    v_c_item := v_c_item || rec.context_item_id::text;
  end loop;

  for rec in (
    select sci.id as context_item_id, sci.key, sci.description, sci.display_name,
           sci.feed_config as feed_config
      from context.named_system_context_items(v_refs) sci
     where sci.is_active = true and sci.deleted_at is null and sci.feed_type = 'dataset'
       and sci.feed_config ? 'data_store_id'
     order by sci.sort_order asc, sci.key asc
  ) loop
    v_cell := jsonb_build_object(
      'key', rec.key,
      'value', jsonb_build_object('kind', 'dataset',
          'data_store_id', rec.feed_config->>'data_store_id',
          'name', coalesce(rec.feed_config->>'data_store_name', rec.display_name),
          'short_code', rec.feed_config->>'data_store_short_code'),
      'type', 'dataset', 'description', rec.description,
      'context_item_id', rec.context_item_id,
      'scope_id', null, 'scope_name', 'System', 'scope_type_id', null, 'source', 'system');
    v_c_key  := v_c_key  || rec.key;
    v_c_attr := v_c_attr || jsonb_build_object(
      'value', jsonb_build_object('kind', 'dataset',
          'data_store_id', rec.feed_config->>'data_store_id',
          'name', coalesce(rec.feed_config->>'data_store_name', rec.display_name),
          'short_code', rec.feed_config->>'data_store_short_code',
          'hint', 'Knowledge resource — query it with the RAG tools, e.g. knowledge_search(data_store_id=<data_store_id>).'),
      'type', 'dataset', 'inject_as', 'reference', 'source', 'system', 'description', rec.description);
    v_c_cell := v_c_cell || v_cell;
    v_c_item := v_c_item || rec.context_item_id::text;
  end loop;
  end if;

  -- ── THE RECORDS' FIELDS: every declared Field of each admitted record, except its title and a
  --    Field declared `exclude` — in Table, Field and record order, as the old resolver orders
  --    scope type, context item and scope. A Field this person may not see is WITHHELD and
  --    named; a relation (a reference) moves to the on-demand tier, where DYN-17 says it belongs
  --    — the one declared tier move.
  -- SCOPES-G: the Fields are read per (organization, Table) pair, by that pair's own key: one
  -- partition and one index range each. The join this replaces was planned generic (this function
  -- runs with force_generic_plan) as a hash join over every Field of every organization — ~5,500
  -- rows and ~35 ms for a turn naming one scope. Same rows, same filter, same order below.
  for p in select distinct (e.value ->> 'organization_id')::uuid as org, (e.value ->> 'table_id')::uuid as tbl
             from jsonb_array_elements(v_admitted) e loop
    select v_f_org || coalesce(array_agg(p.org), array[]::uuid[]),
           v_f_tbl || coalesce(array_agg(p.tbl), array[]::uuid[]),
           v_f_id || coalesce(array_agg(fr.id), array[]::uuid[]),
           v_f_data || coalesce(array_agg(fr.data), array[]::jsonb[])
      into v_f_org, v_f_tbl, v_f_id, v_f_data
      from custom.record fr
     where fr.organization_id = p.org
       and fr.table_id = v_fkernel
       and fr.deleted_at is null
       and (fr.data ->> 'entity_definition_id')::uuid = p.tbl
       and coalesce(fr.data ->> 'context_policy', 'include') <> 'exclude';
  end loop;
  for rec in (
    select e.value as a, fr.id as field_id, fr.data ->> 'key' as fkey, fr.data ->> 'type' as ftype,
           fr.data ->> 'label' as flabel, fr.data ->> 'description' as fdesc,
           coalesce(nullif(fr.data ->> 'sort', '')::int, 0) as fsort
      from jsonb_array_elements(v_admitted) with ordinality e(value, ord)
      join unnest(v_f_org, v_f_tbl, v_f_id, v_f_data) fr(organization_id, tbl, id, data)
        on fr.organization_id = (e.value ->> 'organization_id')::uuid
       and fr.tbl = (e.value ->> 'table_id')::uuid
     where fr.data ->> 'key' is distinct from (e.value ->> 'title_field')
     order by e.value ->> 'type_label', coalesce(nullif(fr.data ->> 'sort', '')::int, 0),
              e.value ->> 'name', e.value ->> 'record_id'
  ) loop
    a := rec.a;
    if (a -> 'hidden') ? rec.fkey then
      v_withheld_a := v_withheld_a || jsonb_build_object(
        'record_id', a -> 'record_id', 'record_name', a -> 'name', 'key', rec.fkey,
        'reason', coalesce(a -> 'hidden' -> rec.fkey ->> 'reason', 'this field is not visible at your level'));
      continue;
    end if;
    continue when (a -> 'doc' -> rec.fkey) is null or jsonb_typeof(a -> 'doc' -> rec.fkey) = 'null';
    v_inject := case when rec.ftype in ('relation', 'entity_reference') then 'tool_accessible' else 'direct' end;
    -- BIG-VALUES-READERS: what the agent is handed for this value. A value kept as a file is
    -- its whole text (the store's client reads the file the door names in `whole_value`), or,
    -- under the organization's cap, its first words and the file to open — never the first
    -- words alone. A relation to files is the file reference the old path hands.
    v_val := custom.agent_context_value(a -> 'doc', rec.fkey, rec.ftype, (a ->> 'organization_id')::uuid,
                                        (a ->> 'record_id')::uuid, coalesce((a ->> 'cap')::bigint, 0));
    v_whole := v_val -> 'whole_value';
    v_val := v_val -> 'value';
    v_cell := jsonb_build_object(
      'key', rec.fkey, 'value', v_val, 'type', rec.ftype,
      'description', coalesce(rec.fdesc, rec.flabel),
      'context_item_id', rec.field_id,
      'scope_id', a -> 'record_id', 'scope_name', a -> 'name', 'scope_type_id', a -> 'table_id',
      'organization_id', a -> 'organization_id', 'via', a -> 'via',
      'value_version', a -> 'versions' -> rec.fkey -> 'value_version',
      'written_at', a -> 'versions' -> rec.fkey -> 'written_at',
      'source', 'scope:' || (a ->> 'name'))
      || case when v_whole is null then '{}'::jsonb else jsonb_build_object('whole_value', v_whole) end;
    v_c_key  := v_c_key  || rec.fkey;
    v_c_attr := v_c_attr || (jsonb_build_object(
      'value', v_val, 'type', rec.ftype, 'inject_as', v_inject,
      'source', 'scope:' || (a ->> 'name'), 'description', coalesce(rec.fdesc, rec.flabel))
      || case when v_whole is null then '{}'::jsonb else jsonb_build_object('whole_value', v_whole) end);
    v_c_cell := v_c_cell || v_cell;
    v_c_item := v_c_item || rec.field_id::text;
  end loop;
  v_withheld := to_jsonb(v_withheld_a);

  -- ── THE CELLS MADE ONE ANSWER, exactly as appending them one by one made it: a variable is the
  --    LAST cell's variable with every cell of its key in the order met; a source is the last
  --    cell's; a context item's cells are its cells in the order met ────────────────────────────
  select coalesce(jsonb_object_agg(v.k, v.attr || jsonb_build_object('cells', v.cells)), '{}'::jsonb),
         coalesce(jsonb_object_agg(v.k, v.attr -> 'source'), '{}'::jsonb)
    into v_variables, v_sources
    from (select u.k, (array_agg(u.attr order by u.ord desc))[1] as attr,
                 jsonb_agg(u.cell order by u.ord) as cells
            from unnest(v_c_key, v_c_attr, v_c_cell) with ordinality u(k, attr, cell, ord)
           group by u.k) v;
  select coalesce(jsonb_object_agg(v.item, v.cells), '{}'::jsonb)
    into v_cells
    from (select u.item, jsonb_agg(u.cell order by u.ord) as cells
            from unnest(v_c_item, v_c_cell) with ordinality u(item, cell, ord)
           group by u.item) v;

  return jsonb_build_object(
    'scope_labels', v_scope_labels,
    'variables',    v_variables,
    'sources',      v_sources,
    'cell_values',  v_cells,
    'context', jsonb_build_object(
      'user_id', v_me, 'organization_id', v_org_id, 'project_id', v_project_id, 'task_id', v_task_id,
      'scope_ids', coalesce((select jsonb_agg(e -> 'record_id') from jsonb_array_elements(v_admitted) e), '[]'::jsonb),
      'table_ids', v_tables),
    'checks',       v_checks,
    'withheld',     v_withheld,
    'resolved_at',  extract(epoch from now()),
    'read_as',      'the person operating this agent',
    'through',      'custom.where_id_opens for every contributing record, then custom.read_record under that record''s own organization');
end;
$function$;
