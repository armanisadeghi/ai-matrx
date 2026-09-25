-- chair-step: the inverse of migrations/campaign/storereadperf3_where_ids_open_once_per_candidate_set.sql (lane STORE-READ-PERF-3) — puts custom.resolve_context and custom.context_resolve(jsonb) back exactly as production held them before it (pg_get_functiondef, 2026-09-25, after CONTEXT-VALUES-NAMED-2), removes the one door row, then drops custom._where_ids_open_with. Nothing of anybody's data is touched.
-- based-on: custom.resolve_context(text, uuid, uuid[], uuid[], text[]) f997bb272d7334125b8b9b45a5284efc355ca0f794d0e5cd06b9b20d5ca0e293
-- based-on: custom.context_resolve(jsonb) 4d494ba73f85aadd43cdc026f824da94cbefb9a92f79d5f0b197b64689d0e519

set local lock_timeout = '30s';

CREATE OR REPLACE FUNCTION custom.resolve_context(p_entity_type text, p_entity_id uuid, p_record_ids uuid[] DEFAULT NULL::uuid[], p_table_ids uuid[] DEFAULT NULL::uuid[], p_system_item_refs text[] DEFAULT NULL::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
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
      from workspace.tasks t left join workspace.projects p on t.project_id = p.id
     where t.id = p_entity_id;
  elsif p_entity_type = 'project' then
    select p.organization_id, p.id into v_org_id, v_project_id
      from workspace.projects p where p.id = p_entity_id;
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
  for c in select value from jsonb_array_elements(v_cands) loop
    v_rec := (c ->> 'record_id')::uuid;
    v_via := c ->> 'via';
    v_where := custom.where_id_opens(v_rec);
    if v_where is null then
      v_checks := v_checks || jsonb_build_object('record_id', v_rec, 'via', v_via, 'admitted', false,
        'reason', 'not_opened',
        'says', 'This scope is not one you may open in the record store — it has not been shared with you, or it has not been copied into the store yet.');
      continue;
    end if;
    if v_where ->> 'kind' <> 'record' then
      v_checks := v_checks || jsonb_build_object('record_id', v_rec, 'via', v_via, 'admitted', false,
        'reason', 'not_a_record', 'kind', v_where ->> 'kind',
        'says', 'That id opens something that is not a record, so it carries no context values.');
      continue;
    end if;
    if not coalesce((v_where ->> 'live')::boolean, true) then
      v_checks := v_checks || jsonb_build_object('record_id', v_rec, 'via', v_via, 'admitted', false,
        'reason', 'in_trash', 'organization_id', v_where -> 'organization_id',
        'says', 'This scope''s record is in the trash, so nothing is read from it until it is restored.');
      continue;
    end if;

    v_org := (v_where ->> 'organization_id')::uuid;
    begin
      select w.o_doc, w.o_cache into v_doc, v_rcache
        from custom._read_record_with(v_org, v_rec, false, v_levels, v_rcache) w;
    exception when others then
      v_checks := v_checks || jsonb_build_object('record_id', v_rec, 'via', v_via, 'admitted', false,
        'reason', 'door_refused', 'organization_id', v_org, 'sqlstate', sqlstate, 'says', sqlerrm);
      continue;
    end;

    select r.* into v_table
      from custom.record r
     where r.id = (select x.table_id from custom.record x where x.organization_id = v_org and x.id = v_rec)
       and r.table_id = custom.table_kernel_id()
     limit 1;
    v_title_field := coalesce(nullif(v_table.data ->> 'title_field', ''), 'name');
    v_label := coalesce(nullif(v_table.data ->> 'label_singular', ''), nullif(v_table.data ->> 'name', ''), 'record');
    v_name := coalesce(nullif(v_doc ->> v_title_field, ''), v_rec::text);
    v_hidden := coalesce(v_doc -> '_hidden', '{}'::jsonb);

    v_checks := v_checks || jsonb_build_object('record_id', v_rec, 'via', v_via, 'admitted', true,
      'organization_id', v_org, 'table_id', v_table.id, 'name', v_name);
    -- THE TRIPLE, so the compare page can say which side is behind (copy lag) rather than
    -- merely that two values differ. INSPECTOR-TAILS (2026-09-25): read from the record this
    -- door has just opened for the person (custom.read_record above), the same `_values` /
    -- `_derived` / `_computed` metadata custom.record_values_versioned reads, for the same keys
    -- (the record's values plus its `_values` entries). It used to CALL that door once per
    -- record, and the door re-asked the organization wall, the record ladder and the whole field
    -- mask the read door had just answered — about 23 ms a record, 400 of the 850 ms a type of
    -- 17 scopes took. Proven identical on 70 live scope records before the swap.
    select coalesce(jsonb_object_agg(k.key, jsonb_build_object(
             'value_version', coalesce((x.data -> '_values' -> k.key ->> 'ver')::integer, 1),
             'written_at', coalesce((x.data -> '_values' -> k.key ->> 'at')::timestamptz,
                                    (x.data -> '_derived' -> k.key ->> 'at')::timestamptz,
                                    (x.data -> '_computed' -> k.key ->> 'at')::timestamptz))),
           '{}'::jsonb)
      into v_versions
      from custom.record x
      cross join lateral (
        select j.key from jsonb_object_keys(v_doc) j(key) where left(j.key, 1) <> '_'
        union
        select j.key from jsonb_object_keys(coalesce(x.data -> '_values', '{}'::jsonb)) j(key)
      ) k
     where x.organization_id = v_org and x.id = v_rec;
    -- BIG-VALUES-READERS: this organization's cap on one context value handed to an agent
    -- (0, the default, is no cap: the agent gets the whole text, exactly as the old path does).
    v_cap := custom.agent_context_value_cap(v_org);
    v_admitted := v_admitted || jsonb_build_object('record_id', v_rec, 'organization_id', v_org,
      'table_id', v_table.id, 'name', v_name, 'type_label', lower(v_label), 'via', v_via,
      'doc', v_doc - '_hidden' - '_alternates' - '_retired' - '_redirected_from' - '_redirect_says',
      'hidden', v_hidden, 'title_field', v_title_field, 'versions', v_versions, 'cap', v_cap);
  end loop;

  -- ── THE ACTIVE TABLES with no record chosen ("I'm working in Clients") — named, for the person ─
  if p_table_ids is not null then
    select coalesce(jsonb_agg(t.id), '[]'::jsonb) into v_tables
      from unnest(p_table_ids) t(id)
     where coalesce(custom.where_id_opens(t.id) ->> 'kind', '') = 'table';
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
  for rec in (
    select sci.id as context_item_id, sci.key, sci.description,
           sci.value_type::text as value_type, sci.value as value
      from context.named_system_context_items(p_system_item_refs) sci
     where sci.is_active = true and sci.deleted_at is null and sci.feed_type != 'dataset'
     order by sci.sort_order asc, sci.key asc
  ) loop
    continue when rec.value is null;
    v_cell := jsonb_build_object(
      'key', rec.key, 'value', rec.value, 'type', rec.value_type, 'description', rec.description,
      'context_item_id', rec.context_item_id,
      'scope_id', null, 'scope_name', 'System', 'scope_type_id', null, 'source', 'system');
    v_variables := v_variables || jsonb_build_object(rec.key, jsonb_build_object(
      'value', rec.value, 'type', rec.value_type, 'inject_as', 'direct',
      'source', 'system', 'description', rec.description,
      'cells', coalesce(v_variables -> rec.key -> 'cells', '[]'::jsonb) || jsonb_build_array(v_cell)));
    v_sources := v_sources || jsonb_build_object(rec.key, 'system');
    v_cells := v_cells || jsonb_build_object(rec.context_item_id::text,
      coalesce(v_cells -> rec.context_item_id::text, '[]'::jsonb) || jsonb_build_array(v_cell));
  end loop;

  for rec in (
    select sci.id as context_item_id, sci.key, sci.description, sci.display_name,
           sci.feed_config as feed_config
      from context.named_system_context_items(p_system_item_refs) sci
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
    v_variables := v_variables || jsonb_build_object(rec.key, jsonb_build_object(
      'value', jsonb_build_object('kind', 'dataset',
          'data_store_id', rec.feed_config->>'data_store_id',
          'name', coalesce(rec.feed_config->>'data_store_name', rec.display_name),
          'short_code', rec.feed_config->>'data_store_short_code',
          'hint', 'Knowledge resource — query it with the RAG tools, e.g. knowledge_search(data_store_id=<data_store_id>).'),
      'type', 'dataset', 'inject_as', 'reference', 'source', 'system', 'description', rec.description,
      'cells', coalesce(v_variables -> rec.key -> 'cells', '[]'::jsonb) || jsonb_build_array(v_cell)));
    v_sources := v_sources || jsonb_build_object(rec.key, 'system');
    v_cells := v_cells || jsonb_build_object(rec.context_item_id::text,
      coalesce(v_cells -> rec.context_item_id::text, '[]'::jsonb) || jsonb_build_array(v_cell));
  end loop;

  -- ── THE RECORDS' FIELDS: every declared Field of each admitted record, except its title and a
  --    Field declared `exclude` — in Table, Field and record order, as the old resolver orders
  --    scope type, context item and scope. A Field this person may not see is WITHHELD and
  --    named; a relation (a reference) moves to the on-demand tier, where DYN-17 says it belongs
  --    — the one declared tier move.
  for rec in (
    select e.value as a, fr.id as field_id, fr.data ->> 'key' as fkey, fr.data ->> 'type' as ftype,
           fr.data ->> 'label' as flabel, fr.data ->> 'description' as fdesc,
           coalesce(nullif(fr.data ->> 'sort', '')::int, 0) as fsort
      from jsonb_array_elements(v_admitted) with ordinality e(value, ord)
      join custom.record fr
        on fr.organization_id = (e.value ->> 'organization_id')::uuid
       and fr.table_id = custom.field_kernel_id()
       and fr.deleted_at is null
       and (fr.data ->> 'entity_definition_id')::uuid = (e.value ->> 'table_id')::uuid
     where fr.data ->> 'key' is distinct from (e.value ->> 'title_field')
       and coalesce(fr.data ->> 'context_policy', 'include') <> 'exclude'
     order by e.value ->> 'type_label', coalesce(nullif(fr.data ->> 'sort', '')::int, 0),
              e.value ->> 'name', e.value ->> 'record_id'
  ) loop
    a := rec.a;
    if (a -> 'hidden') ? rec.fkey then
      v_withheld := v_withheld || jsonb_build_object(
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
    v_variables := v_variables || jsonb_build_object(rec.fkey, jsonb_build_object(
      'value', v_val, 'type', rec.ftype, 'inject_as', v_inject,
      'source', 'scope:' || (a ->> 'name'), 'description', coalesce(rec.fdesc, rec.flabel),
      'cells', coalesce(v_variables -> rec.fkey -> 'cells', '[]'::jsonb) || jsonb_build_array(v_cell))
      || case when v_whole is null then '{}'::jsonb else jsonb_build_object('whole_value', v_whole) end);
    v_sources := v_sources || jsonb_build_object(rec.fkey, 'scope:' || (a ->> 'name'));
    v_cells := v_cells || jsonb_build_object(rec.field_id::text,
      coalesce(v_cells -> rec.field_id::text, '[]'::jsonb) || jsonb_build_array(v_cell));
  end loop;

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

CREATE OR REPLACE FUNCTION custom.context_resolve(p_bindings jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me           uuid;
  v_binding      jsonb;
  v_record_ids   uuid[] := '{}';
  v_records      jsonb := '{}'::jsonb;
  v_scope_map    jsonb := '{}'::jsonb;
  v_orgs         jsonb := '{}'::jsonb;
  v_unresolved   jsonb := '[]'::jsonb;
  v_out          jsonb := '[]'::jsonb;
  v_rec          uuid;
  v_org          uuid;
  v_where        jsonb;
  v_doc          jsonb;
  v_hidden       jsonb;
  v_values       jsonb;
  v_row          record;
  v_key          text;
  v_field        text;
  v_cell         jsonb;
  v_sens         text;
  v_hint         text;
  v_delivery     text;
  v_note         text;
  v_fresh        text;
  v_stale        text;
  v_verdict      jsonb;
  v_order        jsonb := '{}'::jsonb;
  v_ready        text[];
  v_pending      jsonb;
  v_index        int := 0;
  v_progress     boolean;
  v_dep          jsonb;
  v_blocked      boolean;
begin
  -- THE PERSON FIRST. There is no organization argument any more: each record names its own
  -- organization (custom.where_id_opens reads it from the record), so a turn whose scopes live
  -- in two organizations — Brightline's task tagged to Harborline's app — reads each under its
  -- own, and the organization the person happens to be working in decides nothing.
  v_me := custom.query_principal();
  if v_me is null then
    raise exception 'custom.context_resolve reads context for a person, and nobody is signed in.'
      using errcode = '42501',
            hint = 'DOOR-1: the read door reads the person from the session. The server calls this door acting as the person operating the agent.';
  end if;

  if p_bindings is null or jsonb_typeof(p_bindings) <> 'array' then
    raise exception 'custom.context_resolve was asked to resolve something that is not a list of bindings.'
      using errcode = '22004',
            hint = 'Pass a JSON array of {key, scope_id|record_id, field_key} objects. A turn with no context items passes [] and gets an empty answer.';
  end if;

  if jsonb_array_length(p_bindings) = 0 then
    return jsonb_build_object(
      'scope_records', '{}'::jsonb, 'records', '{}'::jsonb, 'organizations', '{}'::jsonb,
      'bindings', '[]'::jsonb, 'unresolved', '[]'::jsonb,
      'read_as', 'the person operating this agent',
      'through', 'custom.where_id_opens, then custom.read_record under the record''s own organization',
      'principal', v_me);
  end if;

  if exists (select 1 from jsonb_array_elements(p_bindings) b where jsonb_typeof(b) <> 'object') then
    raise exception 'custom.context_resolve was handed a list whose entries are not bindings.'
      using errcode = '22004',
            hint = 'Each entry is an object: {key, scope_id|record_id, field_key}. An array of strings or numbers is not a turn''s context cells.';
  end if;

  if jsonb_array_length(p_bindings) > 500 then
    raise exception 'custom.context_resolve was handed % bindings and the ceiling is 500.',
      jsonb_array_length(p_bindings)
      using errcode = '22003',
            hint = 'A turn addresses a handful of context cells. A list this long is a caller asking for a whole catalogue, which is a different door (custom.agent_context reads a Table).';
  end if;

  -- ── 1. EVERY DISTINCT RECORD THE TURN NAMES — the scope id IS the record id ─────────────
  select array_agg(distinct x) into v_record_ids from (
    select nullif(coalesce(nullif(b ->> 'record_id', ''), b ->> 'scope_id'), '')::uuid as x
      from jsonb_array_elements(p_bindings) b
  ) s where x is not null;

  -- ── 2. EACH ONE ASKED FOR THE PERSON, THEN READ ONCE UNDER ITS OWN ORGANIZATION ─────────
  foreach v_rec in array coalesce(v_record_ids, array[]::uuid[]) loop
    -- custom.where_id_opens is the ONE answer to "which organization does this id live in, and
    -- may this person open it" (ROUTE-RESOLVER; ACCESS-IS-PERSONAL uses the same door). Null is
    -- "not given to you" and "not in the store" alike, on purpose: the store does not tell a
    -- guessed id from a real one. The unresolved row says both halves, and the turn's old value
    -- stays underneath (the fallback link), so nothing is dropped.
    v_where := custom.where_id_opens(v_rec);
    if v_where is null or v_where ->> 'kind' <> 'record' then
      v_unresolved := v_unresolved || jsonb_build_object(
        'record_id', v_rec, 'key', '*', 'reason',
        'this scope is not a record you may open in the record store — it has not been shared with you, or it has not been copied into the store yet — so its fields resolve the way they always have (nothing was dropped and nothing was guessed).');
      continue;
    end if;
    if not coalesce((v_where ->> 'live')::boolean, true) then
      v_unresolved := v_unresolved || jsonb_build_object(
        'record_id', v_rec, 'key', '*', 'reason',
        'this scope''s record is in the trash, so nothing is read from it until it is restored.');
      continue;
    end if;
    v_org := (v_where ->> 'organization_id')::uuid;
    v_orgs := v_orgs || jsonb_build_object(v_rec::text, v_org);

    begin
      v_doc := custom.read_record(v_org, v_rec, false);
    exception when others then
      -- THE DOOR'S OWN REFUSAL, CARRIED, NOT SWALLOWED.
      v_unresolved := v_unresolved || jsonb_build_object(
        'record_id', v_rec, 'key', '*', 'sqlstate', sqlstate, 'reason', sqlerrm);
      continue;
    end;

    v_scope_map := v_scope_map || jsonb_build_object(v_rec::text, v_rec);
    v_hidden := coalesce(v_doc -> '_hidden', '{}'::jsonb);
    v_values := '{}'::jsonb;

    begin
      for v_row in
        select * from custom.record_values_versioned(v_org, v_rec)
      loop
        v_values := v_values || jsonb_build_object(v_row.field_key, jsonb_build_object(
          'value',         v_doc -> v_row.field_key,
          'field_id',      v_row.field_id,
          'value_version', v_row.value_version,
          'written_at',    v_row.written_at,
          'absent_reason', v_row.absent_reason,
          'actor',         v_row.actor,
          'source',        v_row.source,
          'masked',        v_hidden ? v_row.field_key,
          'mask_reason',   v_hidden -> v_row.field_key ->> 'reason'));
      end loop;
    exception when others then
      select coalesce(jsonb_object_agg(e.key, jsonb_build_object(
               'value',         e.value,
               'field_id',      null,
               'value_version', null,
               'written_at',    null,
               'absent_reason', format('the store did not let this principal read value versions (%s) — the value is the read door''s and its version is unknown rather than guessed', sqlerrm),
               'masked',        v_hidden ? e.key,
               'mask_reason',   v_hidden -> e.key ->> 'reason')), '{}'::jsonb)
        into v_values
        from jsonb_each(v_doc - '_hidden' - '_alternates' - '_retired') e;
    end;

    v_records := v_records || jsonb_build_object(v_rec::text, v_values);
  end loop;

  -- ── 3. EVERY BINDING, WITH ITS TWO CEILINGS ───────────────────────────────────────────
  for v_binding in select b from jsonb_array_elements(p_bindings) b loop
    v_key   := v_binding ->> 'key';
    v_field := v_binding ->> 'field_key';
    -- THE SCOPE ID IS THE RECORD ID (CUT-4). No slug, no document key, no second identity.
    v_rec   := nullif(coalesce(nullif(v_binding ->> 'record_id', ''), v_binding ->> 'scope_id'), '')::uuid;

    if v_rec is null then
      v_unresolved := v_unresolved || jsonb_build_object(
        'key', v_key,
        'reason', 'this binding names no scope and no record, so there is nothing to read for it (nothing was dropped and nothing was guessed).');
      continue;
    end if;
    if not (v_records ? v_rec::text) then
      continue;  -- the record's own refusal is already in v_unresolved, with its sentence
    end if;

    -- AGT-7's SENSITIVITY CEILING. Delivery may not widen what sensitivity allows. A
    -- restricted field is not dropped — dropping a real value is worse — it is moved off
    -- the inline tier so the agent fetches it when it actually needs it.
    v_hint := lower(coalesce(nullif(btrim(v_binding ->> 'fetch_hint'), ''), 'always'));
    v_sens := lower(coalesce(nullif(btrim(v_binding ->> 'sensitivity'), ''), ''));
    v_note := null;
    v_delivery := case v_hint
                    when 'always' then 'inline'
                    when 'on_demand' then 'on_demand'
                    when 'lazy' then 'on_demand'
                    when 'batch_related' then 'on_demand'
                    else null
                  end;
    if v_delivery is null then
      v_delivery := 'inline';
      v_note := format('this field asks to be fetched %L, which is not a delivery this system knows; it is delivered inline rather than dropped', v_hint);
    end if;
    if v_delivery = 'inline' and v_sens in ('restricted', 'privileged', 'confidential') then
      v_delivery := 'on_demand';
      v_note := format('this field is %s, so it is never written into the prompt unasked — the agent fetches it when it needs it (AGT-7)', v_sens);
    end if;

    v_cell := v_records -> v_rec::text -> v_field;
    if v_cell is null then
      v_unresolved := v_unresolved || jsonb_build_object(
        'key', v_key, 'record_id', v_rec,
        'reason', format('the record this field points at has no field %L you can read', v_field));
      continue;
    end if;

    -- §D's FRESHNESS CEILING. THE RULE IS NOT WRITTEN HERE ANY MORE — it is
    -- `custom.freshness_verdict`, the one implementation this door, the merge resolver and
    -- every screen that shows a value's age all read. What used to be eighteen lines of the
    -- same arithmetic is one call, and a second copy of it anywhere now fails
    -- `pnpm check:one-freshness-ceiling`.
    v_verdict := custom.freshness_verdict(
                   nullif(v_cell ->> 'written_at', '')::timestamptz,
                   nullif(v_binding ->> 'freshness_seconds', '')::numeric);
    v_fresh := v_verdict ->> 'freshness';
    v_stale := v_verdict ->> 'stale_note';

    v_out := v_out || jsonb_build_object(
      'key',           v_key,
      'scope_id',      v_binding -> 'scope_id',
      'record_id',     v_rec,
      'field_key',     v_field,
      'field_id',      v_cell -> 'field_id',
      'value',         v_cell -> 'value',
      'value_version', v_cell -> 'value_version',
      'written_at',    v_cell -> 'written_at',
      'masked',        v_cell -> 'masked',
      'mask_reason',   v_cell -> 'mask_reason',
      'absent_reason', v_cell -> 'absent_reason',
      'delivery',      v_delivery,
      'delivery_note', v_note,
      'freshness',     v_fresh,
      'stale_note',    v_stale,
      -- CARRIED, and this is not decoration: the ordering step below reads `depends_on`
      -- off these rows. Leaving it out made `v_pending` a map of empty arrays, so every
      -- binding looked ready at once and the order was whatever `jsonb_object_keys`
      -- happened to answer — which the seat suite caught as `2 < 0`.
      'depends_on',    coalesce(v_binding -> 'depends_on', '[]'::jsonb));
  end loop;

  -- ── 4. `depends_on` ORDER, AND A CYCLE NAMED RATHER THAN LOOPED ───────────────────────
  -- DYN-9 belongs at SAVE time and this is not save time, so a circle written before anybody
  -- checked it must not end somebody's turn. The bindings inside it are ordered last, and the
  -- answer SAYS which keys made the circle so the panel can render the remedy.
  select coalesce(jsonb_object_agg(b ->> 'key', coalesce(b -> 'depends_on', '[]'::jsonb)), '{}'::jsonb)
    into v_pending
    from jsonb_array_elements(v_out) b;

  loop
    v_progress := false;
    v_ready := '{}';
    for v_key in select k from jsonb_object_keys(v_pending) k loop
      v_blocked := false;
      for v_dep in select d from jsonb_array_elements(v_pending -> v_key) d loop
        if v_pending ? (v_dep #>> '{}') and (v_dep #>> '{}') <> v_key then
          v_blocked := true;
        end if;
      end loop;
      if not v_blocked then
        v_ready := v_ready || v_key;
      end if;
    end loop;
    exit when coalesce(array_length(v_ready, 1), 0) = 0;
    foreach v_key in array v_ready loop
      v_order := v_order || jsonb_build_object(v_key, v_index);
      v_index := v_index + 1;
      v_pending := v_pending - v_key;
      v_progress := true;
    end loop;
    exit when not v_progress;
  end loop;

  if v_pending <> '{}'::jsonb then
    v_unresolved := v_unresolved || jsonb_build_object(
      'key', (select string_agg(k, ' -> ') from jsonb_object_keys(v_pending) k),
      'reason', 'these context fields depend on each other in a circle, so no order can satisfy them all. They are resolved last, in the order they were declared, and the circle is what to fix.');
    for v_key in select k from jsonb_object_keys(v_pending) k loop
      v_order := v_order || jsonb_build_object(v_key, v_index);
      v_index := v_index + 1;
    end loop;
  end if;

  select coalesce(jsonb_agg(b || jsonb_build_object('order_index', v_order -> (b ->> 'key'))
                            order by coalesce((v_order ->> (b ->> 'key'))::int, 2147483647)), '[]'::jsonb)
    into v_out
    from jsonb_array_elements(v_out) b;


  return jsonb_build_object(
    'scope_records', v_scope_map,
    'records',       v_records,
    'organizations', v_orgs,
    'bindings',      v_out,
    'unresolved',    v_unresolved,
    'read_as',       'the person operating this agent',
    'through',       'custom.where_id_opens, then custom.read_record under the record''s own organization',
    'principal',     v_me);
end;
$function$;

delete from platform.client_callable_door
 where schema_name = 'custom' and function_name = '_where_ids_open_with';
drop function custom._where_ids_open_with(uuid[], uuid, jsonb);
