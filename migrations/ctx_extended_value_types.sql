-- ctx_extended_value_types.sql
-- Adds a full set of first-class value types to the CTX context/scope system, in
-- one coordinated pass (approved 2026-07-13). New members of the
-- public.context_value_type enum:
--   datetime, time, email, url, phone, percent, color, markdown, currency
--
-- Storage strategy:
--   datetime -> NEW column value_timestamp timestamptz
--   time     -> NEW column value_time time
--   currency -> value_json {amount, currency}
--   percent  -> value_number
--   email/url/phone/color/markdown -> value_text (semantics carried by value_type)
--
-- Applied to Matrx Main (txzxabzwovsujtloxrus) on 2026-07-13 via TWO MCP migrations
-- (an added enum label cannot be *used* in the same transaction it is created, and
-- these are split for that rule even though no function body references the new
-- labels as literals):
--   1) ctx_extended_value_types_enum     (enum values only)
--   2) ctx_extended_value_types_plumbing (columns + RPC plumbing)
-- Idempotent (IF NOT EXISTS / CREATE OR REPLACE / DROP IF EXISTS) so re-apply is safe.

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1 — enum values (own transaction)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TYPE public.context_value_type ADD VALUE IF NOT EXISTS 'datetime';
ALTER TYPE public.context_value_type ADD VALUE IF NOT EXISTS 'time';
ALTER TYPE public.context_value_type ADD VALUE IF NOT EXISTS 'email';
ALTER TYPE public.context_value_type ADD VALUE IF NOT EXISTS 'url';
ALTER TYPE public.context_value_type ADD VALUE IF NOT EXISTS 'phone';
ALTER TYPE public.context_value_type ADD VALUE IF NOT EXISTS 'percent';
ALTER TYPE public.context_value_type ADD VALUE IF NOT EXISTS 'color';
ALTER TYPE public.context_value_type ADD VALUE IF NOT EXISTS 'markdown';
ALTER TYPE public.context_value_type ADD VALUE IF NOT EXISTS 'currency';

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2 — storage columns + RPC plumbing (separate transaction)
-- ─────────────────────────────────────────────────────────────────────────────

-- 2a) Two new dedicated storage columns (datetime + time). Every other new type
--     rides an existing column.
ALTER TABLE context.context_item_values
  ADD COLUMN IF NOT EXISTS value_timestamp timestamptz,
  ADD COLUMN IF NOT EXISTS value_time time;

-- 2b) context.write_context_value — the single base writer. Add the two new
--     value params (signature change → drop the old overload first).
DROP FUNCTION IF EXISTS context.write_context_value(uuid, uuid, text, numeric, boolean, jsonb, date, text, text, text, uuid);
CREATE OR REPLACE FUNCTION context.write_context_value(
  p_item_id uuid,
  p_scope_id uuid,
  p_value_text text DEFAULT NULL::text,
  p_value_number numeric DEFAULT NULL::numeric,
  p_value_boolean boolean DEFAULT NULL::boolean,
  p_value_json jsonb DEFAULT NULL::jsonb,
  p_value_date date DEFAULT NULL::date,
  p_value_document_url text DEFAULT NULL::text,
  p_value_timestamp timestamptz DEFAULT NULL::timestamptz,
  p_value_time time DEFAULT NULL::time,
  p_change_summary text DEFAULT NULL::text,
  p_source_type text DEFAULT 'manual'::text,
  p_actor uuid DEFAULT NULL::uuid
)
 RETURNS context.context_item_values
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_row context.context_item_values;
BEGIN
  PERFORM context.validate_reference_value(p_item_id, p_value_text);

  PERFORM pg_advisory_xact_lock(hashtext('civ:' || p_item_id::text || ':' || p_scope_id::text));

  INSERT INTO context.context_item_values (
    context_item_id, scope_id,
    value_text, value_number, value_boolean, value_json, value_date, value_document_url,
    value_timestamp, value_time,
    source_type, authored_by, change_summary
  ) VALUES (
    p_item_id, p_scope_id,
    p_value_text, p_value_number, p_value_boolean, p_value_json, p_value_date, p_value_document_url,
    p_value_timestamp, p_value_time,
    p_source_type::public.context_source_type, p_actor, p_change_summary
  ) RETURNING * INTO v_row;

  PERFORM context.index_reference_value(v_row.id, p_item_id, p_scope_id, p_value_text);

  RETURN v_row;
END;
$function$;

-- 2c) public.set_scope_context_value — manual per-scope writer (drawer/autosave).
--     Add p_value_timestamp + p_value_time (grouped with the other value params;
--     the FE calls this with named args). Signature change → drop old overload.
DROP FUNCTION IF EXISTS public.set_scope_context_value(uuid, uuid, text, numeric, boolean, jsonb, text, date, text);
CREATE OR REPLACE FUNCTION public.set_scope_context_value(
  p_scope_id uuid,
  p_context_item_id uuid,
  p_value_text text DEFAULT NULL::text,
  p_value_number numeric DEFAULT NULL::numeric,
  p_value_boolean boolean DEFAULT NULL::boolean,
  p_value_json jsonb DEFAULT NULL::jsonb,
  p_value_document_url text DEFAULT NULL::text,
  p_value_date date DEFAULT NULL::date,
  p_value_timestamp timestamptz DEFAULT NULL::timestamptz,
  p_value_time time DEFAULT NULL::time,
  p_change_summary text DEFAULT NULL::text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_row context.context_item_values;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM context.scopes s
    JOIN iam.organization_member om
      ON om.organization_id = s.organization_id AND om.user_id = auth.uid()
    WHERE s.id = p_scope_id
  ) THEN
    RAISE EXCEPTION 'not authorized to write to scope %', p_scope_id
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM context.context_items ci
    JOIN context.scopes s ON s.id = p_scope_id
    WHERE ci.id = p_context_item_id AND ci.scope_type_id = s.scope_type_id
  ) THEN
    RAISE EXCEPTION 'context item % does not belong to scope %', p_context_item_id, p_scope_id
      USING ERRCODE = '22023';
  END IF;

  v_row := context.write_context_value(
    p_item_id => p_context_item_id,
    p_scope_id => p_scope_id,
    p_value_text => p_value_text,
    p_value_number => p_value_number,
    p_value_boolean => p_value_boolean,
    p_value_json => p_value_json,
    p_value_date => p_value_date,
    p_value_document_url => p_value_document_url,
    p_value_timestamp => p_value_timestamp,
    p_value_time => p_value_time,
    p_change_summary => p_change_summary,
    p_source_type => 'manual',
    p_actor => auth.uid()
  );

  RETURN jsonb_build_object(
    'id', v_row.id, 'context_item_id', v_row.context_item_id, 'scope_id', v_row.scope_id,
    'version', v_row.version, 'is_current', v_row.is_current,
    'value_text', v_row.value_text, 'value_number', v_row.value_number,
    'value_boolean', v_row.value_boolean, 'value_json', v_row.value_json,
    'value_date', v_row.value_date,
    'value_timestamp', v_row.value_timestamp, 'value_time', v_row.value_time,
    'value_document_url', v_row.value_document_url, 'created_at', v_row.created_at
  );
END;
$function$;
GRANT EXECUTE ON FUNCTION public.set_scope_context_value(uuid, uuid, text, numeric, boolean, jsonb, text, date, timestamptz, time, text) TO authenticated, service_role;

-- 2d) public.set_context_value(jsonb) — AI/agent writeback path. Same signature;
--     accept value_timestamp + value_time from the payload.
CREATE OR REPLACE FUNCTION public.set_context_value(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid             UUID := auth.uid();
  v_item_id         UUID := (p_payload->>'context_item_id')::uuid;
  v_scope_id        UUID := (p_payload->>'scope_id')::uuid;
  v_source_type     TEXT := COALESCE(p_payload->>'source_type', 'ai_enriched');
  v_change_summary  TEXT := p_payload->>'change_summary';
  v_scope_org       UUID;
  v_scope_owner     UUID;
  v_can_write       BOOLEAN;
  v_row             context.context_item_values;
BEGIN
  IF v_uid IS NULL
     AND NULLIF(current_setting('request.jwt.claims', true), '') IS NULL THEN
    v_uid := (p_payload->>'acting_user_id')::uuid;
  END IF;

  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code','unauthorized','message','no acting user'));
  END IF;
  IF v_item_id IS NULL OR v_scope_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code','invalid_argument',
        'message','context_item_id and scope_id are required'));
  END IF;

  SELECT s.organization_id, s.created_by
    INTO v_scope_org, v_scope_owner
    FROM context.scopes s
   WHERE s.id = v_scope_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code','not_found','message','scope not found'));
  END IF;

  v_can_write := (v_scope_owner = v_uid)
    OR EXISTS (
      SELECT 1 FROM iam.organization_member om
       WHERE om.organization_id = v_scope_org
         AND om.user_id = v_uid
    );
  IF NOT v_can_write THEN
    RETURN jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code','forbidden_org',
        'message','caller may not write this scope'));
  END IF;

  BEGIN
    v_row := context.write_context_value(
      p_item_id => v_item_id,
      p_scope_id => v_scope_id,
      p_value_text => p_payload->>'value_text',
      p_value_number => CASE WHEN p_payload ? 'value_number' THEN (p_payload->>'value_number')::numeric END,
      p_value_boolean => CASE WHEN p_payload ? 'value_boolean' THEN (p_payload->>'value_boolean')::boolean END,
      p_value_json => CASE WHEN p_payload ? 'value_json' THEN p_payload->'value_json' END,
      p_value_date => CASE WHEN p_payload ? 'value_date' THEN (p_payload->>'value_date')::date END,
      p_value_document_url => p_payload->>'value_document_url',
      p_value_timestamp => CASE WHEN p_payload ? 'value_timestamp' THEN (p_payload->>'value_timestamp')::timestamptz END,
      p_value_time => CASE WHEN p_payload ? 'value_time' THEN (p_payload->>'value_time')::time END,
      p_change_summary => v_change_summary,
      p_source_type => v_source_type,
      p_actor => v_uid
    );
  EXCEPTION
    WHEN unique_violation THEN
      RETURN jsonb_build_object('ok', false, 'error',
        jsonb_build_object('code','conflict',
          'message','concurrent write on this cell — retry'));
    WHEN SQLSTATE '22023' THEN
      RETURN jsonb_build_object('ok', false, 'error',
        jsonb_build_object('code','invalid_argument', 'message', SQLERRM));
  END;

  RETURN jsonb_build_object(
    'ok', true,
    'data', jsonb_build_object(
      'id', v_row.id,
      'context_item_id', v_row.context_item_id,
      'scope_id', v_row.scope_id,
      'version', v_row.version,
      'is_current', v_row.is_current,
      'value_text', v_row.value_text,
      'value_date', v_row.value_date,
      'value_timestamp', v_row.value_timestamp,
      'value_time', v_row.value_time,
      'source_type', v_row.source_type));
END;
$function$;

-- 2e) public.get_scope_context — emit the two new columns in both views.
CREATE OR REPLACE FUNCTION public.get_scope_context(p_scope_id uuid, p_item_ids uuid[] DEFAULT NULL::uuid[], p_include_empty boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
declare v_scope_type_id uuid; v_result jsonb;
begin
  select scope_type_id into v_scope_type_id from context.scopes where id = p_scope_id and deleted_at is null;
  if v_scope_type_id is null then return '{}'::jsonb; end if;
  if p_include_empty then
    select jsonb_agg(
      jsonb_build_object(
        'item_id', ci.id, 'key', ci.key, 'slug', ci.slug, 'display_name', ci.display_name,
        'description', ci.description, 'category', ci.category, 'value_type', ci.value_type,
        'fetch_hint', ci.fetch_hint, 'sensitivity', ci.sensitivity, 'sort_order', ci.sort_order,
        'custom_component', ci.custom_component,
        'allowed_reference_types', ci.allowed_reference_types, 'max_items', ci.max_items,
        'allowed_scope_type_ids', ci.allowed_scope_type_ids,
        'has_value', civ.id is not null,
        'value_text', civ.value_text, 'value_number', civ.value_number, 'value_boolean', civ.value_boolean,
        'value_json', civ.value_json, 'value_date', civ.value_date,
        'value_timestamp', civ.value_timestamp, 'value_time', civ.value_time,
        'value_document_url', civ.value_document_url,
        'version', civ.version, 'updated_at', civ.created_at
      )
      order by ci.sort_order, ci.display_name
    ) into v_result
    from context.context_items ci
    left join context.context_item_values civ
      on civ.context_item_id = ci.id and civ.scope_id = p_scope_id and civ.is_current = true
    where ci.scope_type_id = v_scope_type_id and ci.is_active = true
      and (p_item_ids is null or ci.id = any(p_item_ids));
  else
    select jsonb_agg(
      jsonb_build_object(
        'item_id', ci.id, 'key', ci.key, 'slug', ci.slug, 'display_name', ci.display_name,
        'value_type', ci.value_type, 'custom_component', ci.custom_component,
        'allowed_reference_types', ci.allowed_reference_types, 'max_items', ci.max_items,
        'allowed_scope_type_ids', ci.allowed_scope_type_ids,
        'value_text', civ.value_text, 'value_number', civ.value_number,
        'value_boolean', civ.value_boolean, 'value_json', civ.value_json, 'value_date', civ.value_date,
        'value_timestamp', civ.value_timestamp, 'value_time', civ.value_time,
        'value_document_url', civ.value_document_url
      )
      order by ci.sort_order, ci.display_name
    ) into v_result
    from context.context_item_values civ
    join context.context_items ci on civ.context_item_id = ci.id
    where civ.scope_id = p_scope_id and civ.is_current = true and ci.is_active = true
      and (p_item_ids is null or ci.id = any(p_item_ids));
  end if;
  return coalesce(v_result, '[]'::jsonb);
end;
$function$;

-- 2f) public.resolve_full_context — the agent reader. Add value_timestamp +
--     value_time to BOTH cell CASE ladders (system-scope + entity-scope), placed
--     right after value_date so the "first populated column wins" order holds.
CREATE OR REPLACE FUNCTION public.resolve_full_context(p_user_id uuid, p_entity_type text, p_entity_id uuid, p_scope_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
    v_org_id uuid; v_project_id uuid; v_task_id uuid;
    v_scope_labels jsonb := '{}'; v_variables jsonb := '{}'; v_sources jsonb := '{}';
    v_cells jsonb := '{}';
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
        select c.organization_id, c.project_id, c.task_id into v_org_id, v_project_id, v_task_id
        from chat.conversation c where c.id = p_entity_id;
    elsif p_entity_type = 'note' then
        select n.organization_id, n.project_id, n.task_id into v_org_id, v_project_id, v_task_id
        from workbench.notes n where n.id = p_entity_id;
    end if;

    select jsonb_agg(jsonb_build_object(
        'scope_id', s.id, 'scope_name', s.name, 'scope_type_id', st.id,
        'type_label', lower(st.label_singular), 'type_sort_order', st.sort_order, 'parent_scope_id', s.parent_scope_id
    )) into v_entity_scopes
    from platform.associations sa join context.scopes s on sa.target_id = s.id
    join context.scope_types st on s.scope_type_id = st.id
    where sa.target_type = 'scope' and sa.source_type = p_entity_type and sa.source_id = p_entity_id
      and s.deleted_at is null and st.deleted_at is null;

    if v_entity_scopes is null and v_project_id is not null and p_entity_type != 'project' then
        select jsonb_agg(jsonb_build_object(
            'scope_id', s.id, 'scope_name', s.name, 'scope_type_id', st.id,
            'type_label', lower(st.label_singular), 'type_sort_order', st.sort_order, 'parent_scope_id', s.parent_scope_id
        )) into v_entity_scopes
        from platform.associations sa join context.scopes s on sa.target_id = s.id
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
        join iam.organization_member om
          on om.organization_id = s.organization_id and om.user_id = p_user_id
        where s.id = any(p_scope_ids)
          and s.deleted_at is null and st.deleted_at is null
          and (v_entity_scopes is null
               or not (v_entity_scopes @> jsonb_build_array(jsonb_build_object('scope_id', s.id))));
        if v_explicit_scopes is not null then
            v_entity_scopes := coalesce(v_entity_scopes, '[]'::jsonb) || v_explicit_scopes;
        end if;
    end if;

    if v_entity_scopes is not null then
        select coalesce(jsonb_object_agg(elem->>'type_label', elem->>'scope_name'), '{}'::jsonb)
        into v_scope_labels
        from jsonb_array_elements(v_entity_scopes) elem;
    end if;

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
        join context.scope_types st on st.id = s.scope_type_id and st.is_system = true
        where civ.is_current = true and ci.fetch_hint != 'never' and s.deleted_at is null and st.deleted_at is null
        order by st.sort_order asc, ci.sort_order asc
    ) loop
        continue when rec.value is null;
        v_variables := v_variables || jsonb_build_object(rec.key, jsonb_build_object(
            'value', rec.value, 'type', rec.value_type, 'inject_as', 'direct',
            'source', 'system', 'description', rec.description));
        v_sources := v_sources || jsonb_build_object(rec.key, 'system');
        v_cells := v_cells || jsonb_build_object(rec.context_item_id::text, jsonb_build_object(
            'key', rec.key, 'value', rec.value, 'type', rec.value_type, 'description', rec.description,
            'scope_id', rec.scope_id, 'scope_type_id', rec.scope_type_id, 'source', 'system'));
    end loop;

    for rec in (
        select ci.id as context_item_id, ci.key, ci.description, ci.display_name,
               ci.feed_config as feed_config,
               sc.scope_id as scope_id, ci.scope_type_id as scope_type_id
        from context.context_items ci
        join context.scope_types st on st.id = ci.scope_type_id and st.is_system = true
        left join lateral (
            select s.id as scope_id from context.scopes s
            where s.scope_type_id = ci.scope_type_id and s.deleted_at is null order by s.sort_order limit 1
        ) sc on true
        where ci.is_active = true and ci.fetch_hint != 'never'
          and ci.feed_type = 'dataset'
          and ci.feed_config ? 'data_store_id' and st.deleted_at is null
        order by st.sort_order asc, ci.sort_order asc
    ) loop
        v_variables := v_variables || jsonb_build_object(rec.key, jsonb_build_object(
            'value', jsonb_build_object(
                'kind', 'dataset',
                'data_store_id', rec.feed_config->>'data_store_id',
                'name', coalesce(rec.feed_config->>'data_store_name', rec.display_name),
                'short_code', rec.feed_config->>'data_store_short_code',
                'hint', 'Knowledge resource — query it with the RAG tools, e.g. rag_search(data_store_id=<data_store_id>).'),
            'type', 'dataset', 'inject_as', 'reference',
            'source', 'system', 'description', rec.description));
        v_sources := v_sources || jsonb_build_object(rec.key, 'system');
        v_cells := v_cells || jsonb_build_object(rec.context_item_id::text, jsonb_build_object(
            'key', rec.key,
            'value', jsonb_build_object(
                'kind', 'dataset',
                'data_store_id', rec.feed_config->>'data_store_id',
                'name', coalesce(rec.feed_config->>'data_store_name', rec.display_name),
                'short_code', rec.feed_config->>'data_store_short_code'),
            'type', 'dataset', 'description', rec.description,
            'scope_id', rec.scope_id, 'scope_type_id', rec.scope_type_id, 'source', 'system'));
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
            where civ.is_current = true
              and ci.fetch_hint != 'never'
              and s.deleted_at is null and st.deleted_at is null
              and civ.scope_id in (
                  select (elem->>'scope_id')::uuid from jsonb_array_elements(v_entity_scopes) elem
              )
            order by st.sort_order asc, ci.sort_order asc
        ) loop
            continue when rec.value is null;
            v_variables := v_variables || jsonb_build_object(rec.key, jsonb_build_object(
                'value', rec.value, 'type', rec.value_type, 'inject_as', 'direct',
                'source', 'scope:' || rec.scope_name, 'description', rec.description));
            v_sources := v_sources || jsonb_build_object(rec.key, 'scope:' || rec.scope_name);
            v_cells := v_cells || jsonb_build_object(rec.context_item_id::text, jsonb_build_object(
                'key', rec.key, 'value', rec.value, 'type', rec.value_type, 'description', rec.description,
                'scope_id', rec.scope_id, 'scope_type_id', rec.scope_type_id, 'source', 'scope:' || rec.scope_name));
        end loop;
    end if;

    return jsonb_build_object('scope_labels', v_scope_labels, 'variables', v_variables, 'sources', v_sources,
        'cell_values', v_cells,
        'context', jsonb_build_object('user_id', p_user_id, 'organization_id', v_org_id, 'project_id', v_project_id, 'task_id', v_task_id,
            'scope_ids', coalesce((select jsonb_agg(elem->'scope_id') from jsonb_array_elements(v_entity_scopes) elem), '[]'::jsonb)),
        'resolved_at', extract(epoch from now()));
end;
$function$;
