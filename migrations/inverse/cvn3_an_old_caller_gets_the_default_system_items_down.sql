-- chair-step: the inverse of cvn3_an_old_caller_gets_the_default_system_items.sql. It puts the five-argument public.resolve_full_context and custom.resolve_context back byte for byte (NULL p_system_item_refs reads none again) and drops context.system_item_refs_or_defaults(text[]). WHAT IT UNDOES: a caller that does not pass the list gets no System item again.
-- lane: CONTEXT-VALUES-NAMED-2
-- lock: platform
-- based-on: custom.resolve_context(text, uuid, uuid[], uuid[], text[]) 558c5dff60fbcfa19bc4c61965db49b4aa6fb7132e50bc41a311d39b5fdad7d6
-- based-on: public.resolve_full_context(uuid, text, uuid, uuid[], text[]) 285751eb5d89e696049730d31083158d45a98e7c9e897511b49274aa769339d8

set local lock_timeout = '30s';
set local statement_timeout = '60s';

CREATE OR REPLACE FUNCTION public.resolve_full_context(p_user_id uuid, p_entity_type text, p_entity_id uuid, p_scope_ids uuid[] DEFAULT NULL::uuid[], p_system_item_refs text[] DEFAULT NULL::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- A CONCRETE CELL IS IDENTIFIED BY (context_item_id, scope_id) — NEVER BY context_item_id ALONE.
-- Two active scopes of the SAME scope type (two Clients on one conversation, two Repositories
-- on one task) each carry their own value for the SAME context item. Keying `cell_values` by
-- context_item_id alone made the second row silently overwrite the first, and the ORDER BY did
-- not tie-break between scopes, so WHICH value survived was arbitrary. `cell_values` is now
-- LOSSLESS: {context_item_id: [cell, ...]} — one entry per contributing scope, in a
-- deterministic order. `variables` stays keyed by bare `key` (it is the name-addressed
-- awareness map) but every entry now carries the full `cells` array, so a name collision
-- across scope types or scopes can be RENDERED rather than silently dropped.
declare
    v_org_id uuid; v_project_id uuid; v_task_id uuid;
    v_scope_labels jsonb := '{}'; v_variables jsonb := '{}'; v_sources jsonb := '{}';
    v_cells jsonb := '{}';
    v_cell jsonb;
    rec record;
    v_entity_scopes jsonb;
    v_explicit_scopes jsonb;
begin
    if p_entity_type = 'task' then
        select t.project_id, p.organization_id, t.id into v_project_id, v_org_id, v_task_id
        from workspace.tasks t left join workspace.projects p on t.project_id = p.id where t.id = p_entity_id;
    elsif p_entity_type = 'project' then
        select p.organization_id, p.id into v_org_id, v_project_id
        from workspace.projects p where p.id = p_entity_id;
    elsif p_entity_type = 'conversation' then
        select
            c.organization_id,
            (
                select a.target_id
                from platform.associations_live a
                where a.source_type = 'conversation'
                  and a.source_id = c.id
                  and a.target_type = 'project'
                  and a.organization_id = c.organization_id
                order by a.position nulls last, a.created_at, a.id
                limit 1
            ),
            c.task_id
        into v_org_id, v_project_id, v_task_id
        from chat.conversation c where c.id = p_entity_id;
    elsif p_entity_type = 'note' then
        select
            n.organization_id,
            (
                select a.target_id
                from platform.associations_live a
                where a.source_type = 'note'
                  and a.source_id = n.id
                  and a.target_type = 'project'
                order by a.position nulls last, a.created_at, a.id
                limit 1
            ),
            (
                select a.target_id
                from platform.associations_live a
                where a.source_type = 'note'
                  and a.source_id = n.id
                  and a.target_type = 'task'
                order by a.position nulls last, a.created_at, a.id
                limit 1
            )
        into v_org_id, v_project_id, v_task_id
        from workbench.notes n where n.id = p_entity_id;
    end if;

    select jsonb_agg(jsonb_build_object(
        'scope_id', s.id, 'scope_name', s.name, 'scope_type_id', st.id,
        'type_label', lower(st.label_singular), 'type_sort_order', st.sort_order, 'parent_scope_id', s.parent_scope_id
    )) into v_entity_scopes
    from platform.associations_live sa join context.scopes s on sa.target_id = s.id
    join context.scope_types st on s.scope_type_id = st.id
    where sa.target_type = 'scope' and sa.source_type = p_entity_type and sa.source_id = p_entity_id
      and s.deleted_at is null and st.deleted_at is null;

    if v_entity_scopes is null and v_project_id is not null and p_entity_type != 'project' then
        select jsonb_agg(jsonb_build_object(
            'scope_id', s.id, 'scope_name', s.name, 'scope_type_id', st.id,
            'type_label', lower(st.label_singular), 'type_sort_order', st.sort_order, 'parent_scope_id', s.parent_scope_id
        )) into v_entity_scopes
        from platform.associations_live sa join context.scopes s on sa.target_id = s.id
        join context.scope_types st on s.scope_type_id = st.id
        where sa.target_type = 'scope' and sa.source_type = 'project' and sa.source_id = v_project_id
          and s.deleted_at is null and st.deleted_at is null;
    end if;

    if p_scope_ids is not null and array_length(p_scope_ids, 1) > 0 then
        select jsonb_agg(jsonb_build_object(
            'scope_id', s.id, 'scope_name', s.name, 'scope_type_id', st.id,
            'type_label', lower(st.label_singular), 'type_sort_order', st.sort_order, 'parent_scope_id', s.parent_scope_id
        )) into v_explicit_scopes
        from context.scopes s
        join context.scope_types st on s.scope_type_id = st.id
        join lateral (select 1 as ok) om on context._scope_readable_for(p_user_id, s.id, 'viewer')
        where s.id = any(p_scope_ids) and s.deleted_at is null and st.deleted_at is null
          and (v_entity_scopes is null or not (v_entity_scopes @> jsonb_build_array(jsonb_build_object('scope_id', s.id))));
        if v_explicit_scopes is not null then
            v_entity_scopes := coalesce(v_entity_scopes, '[]'::jsonb) || v_explicit_scopes;
        end if;
    end if;

    -- Scope LABELS are name-addressed by type_label and therefore collapse when two scopes
    -- share a type. Aggregate every name for a type into an array instead of letting the
    -- last one win — build_system_prompt_block already renders a list value.
    if v_entity_scopes is not null then
        select coalesce(jsonb_object_agg(t.type_label, t.names), '{}'::jsonb)
        into v_scope_labels
        from (
            select elem->>'type_label' as type_label,
                   case when count(*) > 1
                        then jsonb_agg(elem->>'scope_name' order by elem->>'scope_name')
                        else to_jsonb(min(elem->>'scope_name')) end as names
            from jsonb_array_elements(v_entity_scopes) elem
            group by elem->>'type_label'
        ) t;
    end if;

    -- SYSTEM lane: platform-wide truths from context.system_context_item (its own
    -- storage since 2026-08-27 — no longer is_system scope types). Three classes:
    -- ambient (computed per request by the server), curated (admin-maintained values),
    -- dataset (pointers the agent queries via RAG). Cells carry scope_id/scope_type_id
    -- NULL and scope_name 'System' — System context has no scope dimension.
    -- A SYSTEM ITEM IS READ ONLY WHEN IT IS NAMED (lane CONTEXT-VALUES-NAMED-2): the lane reads
    -- only the rows p_system_item_refs names (ids or keys, from the server's SystemContextNames);
    -- NULL or empty reads none. An unnamed row is never fetched.
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
            'scope_id', null, 'scope_name', 'System', 'scope_type_id', null,
            'source', 'system');
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
            'scope_id', null, 'scope_name', 'System', 'scope_type_id', null,
            'source', 'system');
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

    if v_entity_scopes is not null then
        for rec in (
            select ci.id as context_item_id, ci.key, ci.description, ci.value_type::text as value_type,
                   s.id as scope_id, s.name as scope_name, s.scope_type_id as scope_type_id,
                   case
                       when civ.value_text is not null then to_jsonb(civ.value_text)
                       when civ.value_number is not null then to_jsonb(civ.value_number)
                       when civ.value_boolean is not null then to_jsonb(civ.value_boolean)
                       when civ.value_date is not null then to_jsonb(civ.value_date::text)
                       when civ.value_timestamp is not null then to_jsonb(civ.value_timestamp::text)
                       when civ.value_time is not null then to_jsonb(civ.value_time::text)
                       when civ.value_json is not null then civ.value_json
                       when civ.value_document_url is not null then to_jsonb(civ.value_document_url)
                       when civ.value_reference_id is not null then to_jsonb(civ.value_reference_id::text)
                       else null
                   end as value
            from context.context_item_values civ
            join context.context_items ci on ci.id = civ.context_item_id and ci.is_active = true
            join context.scopes s on s.id = civ.scope_id
            join context.scope_types st on st.id = s.scope_type_id
            where civ.is_current = true and ci.fetch_hint != 'never' and s.deleted_at is null and st.deleted_at is null
              and civ.scope_id in (select (elem->>'scope_id')::uuid from jsonb_array_elements(v_entity_scopes) elem)
            order by st.sort_order asc, ci.sort_order asc, s.name asc, s.id asc
        ) loop
            continue when rec.value is null;
            v_cell := jsonb_build_object(
                'key', rec.key, 'value', rec.value, 'type', rec.value_type, 'description', rec.description,
                'context_item_id', rec.context_item_id,
                'scope_id', rec.scope_id, 'scope_name', rec.scope_name, 'scope_type_id', rec.scope_type_id,
                'source', 'scope:' || rec.scope_name);
            v_variables := v_variables || jsonb_build_object(rec.key, jsonb_build_object(
                'value', rec.value, 'type', rec.value_type, 'inject_as', 'direct',
                'source', 'scope:' || rec.scope_name, 'description', rec.description,
                'cells', coalesce(v_variables -> rec.key -> 'cells', '[]'::jsonb) || jsonb_build_array(v_cell)));
            v_sources := v_sources || jsonb_build_object(rec.key, 'scope:' || rec.scope_name);
            v_cells := v_cells || jsonb_build_object(rec.context_item_id::text,
                coalesce(v_cells -> rec.context_item_id::text, '[]'::jsonb) || jsonb_build_array(v_cell));
        end loop;
    end if;

    return jsonb_build_object('scope_labels', v_scope_labels, 'variables', v_variables, 'sources', v_sources,
        'cell_values', v_cells,
        'context', jsonb_build_object('user_id', p_user_id, 'organization_id', v_org_id, 'project_id', v_project_id, 'task_id', v_task_id,
            'scope_ids', coalesce((select jsonb_agg(elem->'scope_id') from jsonb_array_elements(v_entity_scopes) elem), '[]'::jsonb)),
        'resolved_at', extract(epoch from now()));
end;
$function$;

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
  v_wheres      jsonb;
  v_tcache      jsonb := '{}'::jsonb;
  v_tid         uuid;
  v_tbl         jsonb;
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
  -- STORE-READ-PERF-3: where each candidate opens, asked ONCE for the whole set — one lookup of
  -- their homes, the organization wall once per organization, and the ladder's viewer answer
  -- taken from v_levels (asked above for the same person) — each answer exactly
  -- custom.where_id_opens(<id>).
  v_wheres := custom._where_ids_open_with(
                (select array_agg((e ->> 'record_id')::uuid) from jsonb_array_elements(v_cands) e),
                auth.uid(), v_levels);
  for c in select value from jsonb_array_elements(v_cands) loop
    v_rec := (c ->> 'record_id')::uuid;
    v_via := c ->> 'via';
    v_where := v_wheres -> (v_rec::text);
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
      -- THE DECISION, IN THIS BODY (lane SUITE-HEALTH-2): the record's own organization's wall,
      -- asked by this door. custom._where_ids_open_with asked it once for this organization and
      -- remembered the yes for the transaction, so this is free and refuses nobody it admitted.
      perform custom.assert_client_may_reach(v_org, 'custom.resolve_context');
      select w.o_doc, w.o_cache into v_doc, v_rcache
        from custom._read_record_with(v_org, v_rec, false, v_levels, v_rcache) w;
    exception when others then
      v_checks := v_checks || jsonb_build_object('record_id', v_rec, 'via', v_via, 'admitted', false,
        'reason', 'door_refused', 'organization_id', v_org, 'sqlstate', sqlstate, 'says', sqlerrm);
      continue;
    end;

    -- STORE-READ-PERF-3: the record's Table is looked up once per Table, not once per record.
    v_tid := (select x.table_id from custom.record x where x.organization_id = v_org and x.id = v_rec);
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

    v_checks := v_checks || jsonb_build_object('record_id', v_rec, 'via', v_via, 'admitted', true,
      'organization_id', v_org, 'table_id', (v_tbl ->> 'id')::uuid, 'name', v_name);
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
      'table_id', (v_tbl ->> 'id')::uuid, 'name', v_name, 'type_label', lower(v_label), 'via', v_via,
      'doc', v_doc - '_hidden' - '_alternates' - '_retired' - '_redirected_from' - '_redirect_says',
      'hidden', v_hidden, 'title_field', v_title_field, 'versions', v_versions, 'cap', v_cap);
  end loop;

  -- ── THE ACTIVE TABLES with no record chosen ("I'm working in Clients") — named, for the person ─
  if p_table_ids is not null then
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

drop function context.system_item_refs_or_defaults(text[]);
