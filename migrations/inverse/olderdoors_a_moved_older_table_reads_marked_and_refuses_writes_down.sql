-- INVERSE of migrations/campaign/olderdoors_a_moved_older_table_reads_marked_and_refuses_writes.sql (lane OLDER-DOORS-AFTER-SWITCH).
-- Puts back the ten bodies exactly as production held them before the file (the based-on bodies),
-- turns the write guard into a pass-through (the six triggers stay bound: dropping a trigger on the
-- older tables takes the same lock as creating one, and a pass-through changes nothing), and drops
-- the functions the file added. Older lists a press archived stay archived (data, not schema);
-- Switch back after this inverse would not restore them — re-apply the file first.
-- based-on: public.get_full_table(jsonb) e0b2a564f2ef39cfcbb3cfe8efc4914f1aca285e9e7bcc2fa39c582bf3f2ec20
-- based-on: public.get_user_table_data_paginated_v2(uuid, integer, integer, text, text, text) 62f94f7b879d68143b37d3c2cd1aa6154487111ca05061f7317928eba52e02d6
-- based-on: public.get_user_table_data_paginated(uuid, integer, integer, text, text, text) 9e6fffcc5aeb22b4808fc149531c8f6ee31dc97716eb0fc16d6a14a91928c55a
-- based-on: public.get_user_table_complete(uuid, text, text) ad4039674c395525b897ae80f7e6f1ea2dd6f8bc3f413415d5dc49245dc26593
-- based-on: public.get_user_list_with_items(uuid) ca8e64aeffe669a09bab34f1344221b8c3911b4da05eb8df798448578caf3d89
-- based-on: public._d31_impl_get_user_list_with_items(uuid) be29b00e4be1d1a1e8ec61f5a020f203832ab9a98b8de40adca06a0db792c61e
-- based-on: public.get_structured_list_for_selection(uuid) e80c56df47991b07495c5a7589ee6dc842b452ee3f9601b6d88f242feb808195
-- based-on: platform._cutover_seam_apply(text, uuid, text, uuid, uuid) 238b739188fc1b305cdc9cbba3a4c1fcbd91f249f676c2eaf7f6db04a962f142
-- based-on: workbench._moved_older_table_takes_no_writes() 4583394bb38a03158bfec59bb0af4fe324ac8e38069441487a5798289ea09b4e
-- based-on: public.update_data_row_in_user_table(uuid, jsonb) fd4fbbcaf69e381c693dc81337987085fcb7a1cc8d33aa397a008a13e4dcafdf
-- based-on: public.udt_upsert_row(uuid, uuid, jsonb) d46c5f7365bd65793002b2969302ff4182bea96e02155d8c2aca68ac57dbbd23
-- lane: OLDER-DOORS-AFTER-SWITCH

CREATE OR REPLACE FUNCTION public.get_full_table(ref jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  v_table_id uuid;
  v_table_name text;
  j jsonb;
BEGIN
  v_table_id := (ref->>'table_id')::uuid;
  v_table_name := ref->>'table_name';

  IF NOT EXISTS (
    SELECT 1 FROM workbench.udt_datasets t
    WHERE t.id = v_table_id
      AND (v_table_name IS NULL OR t.table_name = v_table_name)
  ) THEN
    perform platform.refuse_not_found(format('dataset %s is not available to this account — it may not exist, the table_name may not match, or your access may not reach it', v_table_id));
  END IF;

  j := jsonb_build_object(
    -- Full row. row_ordering_config in particular is load-bearing: it carries
    -- default_sort, which the dataset viewer applies on first load.
    'table',
    (
      SELECT to_jsonb(t)
      FROM workbench.udt_datasets t
      WHERE t.id = v_table_id
    ),
    -- Full field rows, in field_order. validation_rules and default_value are
    -- needed by export and by any column-editing surface.
    'columns',
    (
      SELECT COALESCE(
               jsonb_agg(to_jsonb(tf) ORDER BY tf.field_order, tf.created_at),
               '[]'::jsonb)
      FROM workbench.udt_dataset_fields tf
      WHERE tf.table_id = v_table_id
    ),
    -- COUNT(*), not the length of a materialized row array. This is the whole
    -- reason to call this instead of get_user_table_complete.
    'row_count',
    (
      SELECT COUNT(*)::int
      FROM workbench.udt_dataset_rows d
      WHERE d.table_id = v_table_id
    )
  );

  RETURN j;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_user_table_data_paginated_v2(p_table_id uuid, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_sort_field text DEFAULT NULL::text, p_sort_direction text DEFAULT 'asc'::text, p_search_term text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_result JSONB;
    v_data JSONB;
    v_total_count INT;
    v_field_name TEXT;
    v_field_data_type TEXT;
    v_query TEXT;
    v_sort_expr TEXT;
BEGIN
    IF p_sort_field IS NOT NULL THEN
        SELECT tf.field_name, tf.data_type::text
        INTO v_field_name, v_field_data_type
        FROM workbench.udt_dataset_fields tf
        WHERE tf.table_id = p_table_id
          AND (tf.field_name = p_sort_field OR tf.display_name = p_sort_field)
        LIMIT 1;
    END IF;

    IF p_search_term IS NOT NULL THEN
        SELECT COUNT(*) INTO v_total_count
        FROM workbench.udt_dataset_rows
        WHERE table_id = p_table_id
          AND data::text ILIKE '%' || p_search_term || '%';
    ELSE
        SELECT COUNT(*) INTO v_total_count
        FROM workbench.udt_dataset_rows
        WHERE table_id = p_table_id;
    END IF;

    v_query := 'SELECT id, data, created_at, updated_at FROM workbench.udt_dataset_rows WHERE table_id = $1';

    IF p_search_term IS NOT NULL THEN
        v_query := v_query || ' AND (data::text ILIKE ''%' || replace(p_search_term, '''', '''''') || '%'')';
    END IF;

    IF v_field_name IS NOT NULL THEN
        v_field_name := replace(v_field_name, '''', '''''');

        IF v_field_data_type IN ('integer', 'number') THEN
            v_sort_expr := format(
                'CASE WHEN data->>''%s'' ~ ''^-?[0-9]+\.?[0-9]*$'' THEN (data->>''%s'')::numeric ELSE NULL END',
                v_field_name, v_field_name
            );
        ELSIF v_field_data_type IN ('date', 'datetime') THEN
            v_sort_expr := format(
                'CASE WHEN data->>''%s'' IS NOT NULL AND data->>''%s'' <> '''' THEN (data->>''%s'')::timestamptz ELSE NULL END',
                v_field_name, v_field_name, v_field_name
            );
        ELSE
            v_sort_expr := format('LOWER(data->>''%s'')', v_field_name);
        END IF;

        v_query := v_query || ' ORDER BY ' || v_sort_expr;

        IF p_sort_direction = 'desc' THEN
            v_query := v_query || ' DESC NULLS LAST';
        ELSE
            v_query := v_query || ' ASC NULLS LAST';
        END IF;
        -- `id` is the unique tiebreaker that makes this a TOTAL order. Do not remove it.
        v_query := v_query || ', id';
    ELSE
        -- `id` is the unique tiebreaker that makes this a TOTAL order. Do not remove it.
        v_query := v_query || ' ORDER BY created_at DESC, id';
    END IF;

    v_query := v_query || ' LIMIT $2 OFFSET $3';

    EXECUTE 'SELECT jsonb_agg(t) FROM (' || v_query || ') t'
    USING p_table_id, p_limit, p_offset
    INTO v_data;

    v_result := jsonb_build_object(
        'success', true,
        'data', COALESCE(v_data, '[]'::jsonb),
        'pagination', jsonb_build_object(
            'total_count', v_total_count,
            'page_count', CEIL(v_total_count::float / p_limit),
            'current_page', (p_offset / p_limit) + 1,
            'limit', p_limit,
            'offset', p_offset
        )
    );

    RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_user_table_data_paginated(p_table_id uuid, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0, p_sort_field text DEFAULT NULL::text, p_sort_direction text DEFAULT 'asc'::text, p_search_term text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_result JSONB;
    v_data JSONB;
    v_total_count INT;
    v_field_name TEXT;
    v_query TEXT;
BEGIN
    IF p_sort_field IS NOT NULL THEN
        SELECT field_name INTO v_field_name
        FROM workbench.udt_dataset_fields
        WHERE table_id = p_table_id
          AND (field_name = p_sort_field OR display_name = p_sort_field)
        LIMIT 1;
    END IF;

    IF p_search_term IS NOT NULL THEN
        SELECT COUNT(*) INTO v_total_count
        FROM workbench.udt_dataset_rows
        WHERE table_id = p_table_id
          AND (data::text ILIKE '%' || p_search_term || '%');
    ELSE
        SELECT COUNT(*) INTO v_total_count
        FROM workbench.udt_dataset_rows
        WHERE table_id = p_table_id;
    END IF;

    v_query := 'SELECT id, data, created_at, updated_at FROM workbench.udt_dataset_rows WHERE table_id = $1';

    IF p_search_term IS NOT NULL THEN
        v_query := v_query || ' AND (data::text ILIKE ''%'' || $4 || ''%'')';
    END IF;

    IF v_field_name IS NOT NULL THEN
        v_query := v_query || format(' ORDER BY (data->>%L)', v_field_name);
        IF p_sort_direction = 'desc' THEN
            v_query := v_query || ' DESC';
        ELSE
            v_query := v_query || ' ASC';
        END IF;
        -- `id` is the unique tiebreaker that makes this a TOTAL order. Do not remove it.
        v_query := v_query || ', id';
    ELSE
        -- `id` is the unique tiebreaker that makes this a TOTAL order. Do not remove it.
        v_query := v_query || ' ORDER BY created_at DESC, id';
    END IF;

    v_query := v_query || ' LIMIT $2 OFFSET $3';

    EXECUTE 'SELECT jsonb_agg(t) FROM (' || v_query || ') t'
    USING p_table_id, p_limit, p_offset, p_search_term
    INTO v_data;

    v_result := jsonb_build_object(
        'success', true,
        'data', COALESCE(v_data, '[]'::jsonb),
        'pagination', jsonb_build_object(
            'total_count', v_total_count,
            'page_count', CEIL(v_total_count::float / p_limit),
            'current_page', (p_offset / p_limit) + 1,
            'limit', p_limit,
            'offset', p_offset
        )
    );

    RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_user_table_complete(p_table_id uuid, p_sort_field text DEFAULT NULL::text, p_sort_direction text DEFAULT 'asc'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if workbench.udt_dataset_access(p_table_id, 'viewer') is not true then
    raise exception 'viewer access required for dataset %', p_table_id using errcode = '42501';
  end if;
  return public._d31_impl_get_user_table_complete(p_table_id, p_sort_field, p_sort_direction);
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_user_list_with_items(p_list_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if (
    auth.role() = 'service_role'
    or exists (
      select 1 from workbench.udt_structured_lists l
      where l.id = p_list_id
        and l.deleted_at is null
        and (l.is_public or l.public_read or l.user_id = (select auth.uid()))
    )
    or coalesce(iam.has_access('structured_list', p_list_id, 'viewer'::public.permission_level), false)
  ) is not true then
    raise exception 'viewer access required for list %', p_list_id using errcode = '42501';
  end if;
  return public._d31_impl_get_user_list_with_items(p_list_id);
end;
$function$;

CREATE OR REPLACE FUNCTION public._d31_impl_get_user_list_with_items(p_list_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
    v_result jsonb;
    v_is_editor boolean := false;
begin
    select (l.user_id = (select auth.uid())
            or iam.has_access('structured_list', l.id, 'editor'::public.permission_level))
      into v_is_editor
    from workbench.udt_structured_lists l
    where l.id = p_list_id
      and l.deleted_at is null;

    select jsonb_build_object(
        'list_id', l.id, 'list_name', l.list_name, 'description', l.description,
        'created_at', l.created_at, 'updated_at', l.updated_at,
        'is_public', l.is_public, 'public_read', l.public_read,
        'items_grouped', (
            select jsonb_object_agg(coalesce(group_name, 'Ungrouped'), items)
            from (
                select
                    group_name,
                    jsonb_agg(jsonb_build_object(
                        'id', i.id, 'label', i.label,
                        'description', case when v_is_editor then i.description else null end,
                        'help_text', i.help_text
                    ) order by i.created_at) as items
                from workbench.udt_structured_list_items i
                where i.list_id = l.id
                  and i.deleted_at is null
                group by group_name
            ) as grouped_items
        )
    )
    into v_result
    from workbench.udt_structured_lists l
    where l.id = p_list_id
      and l.deleted_at is null;
    return v_result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_structured_list_for_selection(p_list_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_result jsonb;
begin
    select jsonb_build_object(
        'list_id', l.id,
        'list_name', l.list_name,
        'description', l.description,
        'is_public', l.is_public,
        'public_read', l.public_read,
        'items_grouped', (
            select jsonb_object_agg(coalesce(group_name, 'Ungrouped'), items)
            from (
                select
                    group_name,
                    jsonb_agg(jsonb_build_object(
                        'id', i.id,
                        'label', i.label,
                        'help_text', i.help_text,
                        'group_name', i.group_name,
                        'icon_name', i.icon_name
                    ) order by i.created_at) as items
                from workbench.udt_structured_list_items i
                where i.list_id = l.id
                  and i.deleted_at is null
                group by group_name
            ) as grouped_items
        )
    )
    into v_result
    from workbench.udt_structured_lists l
    where l.id = p_list_id
      and l.deleted_at is null
      -- 🚨 THE GATE (DD-169 batch 3). Mirrors udt_structured_lists' std_select + pub_read.
      and (l.created_by = (select auth.uid())
        or l.visibility = 'public'::platform.visibility
        or iam.has_access('structured_list', l.id, 'viewer'::public.permission_level));
    return v_result;
end;
$function$;

CREATE OR REPLACE FUNCTION platform._cutover_seam_apply(p_seam text, p_org uuid, p_to text, p_actor uuid, p_press uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_feature text; v_key text;
  v_before jsonb;
  v_last platform.cutover_seam_press;
  v_ids uuid[] := '{}';
  v_id uuid;
  v_w jsonb;
  v_t record;
  v_rekeyed jsonb := '[]'::jsonb;
  v_cfg jsonb;
  v_resynced jsonb := '[]'::jsonb;
  v_note text := format('switched %s on the organization''s settings page (press %s)', p_to, p_press);
begin
  if p_seam = 'older_tables' then
    v_feature := 'data_tables'; v_key := 'older_tables_moved';
  elsif p_seam = 'agent_context' then
    v_feature := 'custom'; v_key := 'agent_context_reads_the_copy';
  else
    raise exception 'the switch % has no press step', p_seam using errcode = '22023';
  end if;

  select o.value into v_before from platform.knob_override o
   where o.feature = v_feature and o.key = v_key and o.scope_kind = 'organization'
     and o.scope_id = p_org and o.organization_id = p_org;

  if p_to = 'new' then
    if p_seam = 'older_tables' then
      -- THE COPY IS RE-SYNCED FROM THE OLDER TABLE FIRST (COPY-WRITABLE, chair ruling 2026-09-25):
      -- the older table is the truth at this moment, so every test edit people made on a copy is
      -- put back and every row they added is archived, with a log row per table. Then the flip.
      v_resynced := platform._cutover_copy_resync(p_org, p_press, p_actor);
      for v_id in
        select d.id from workbench.udt_datasets d
         where d.organization_id = p_org and d.deleted_at is null
         order by d.id
      loop
        perform workbench.udt_dataset_archive(v_id, v_id, v_note);
        v_ids := v_ids || v_id;
      end loop;
      -- "WHEN A ROW CHANGES, RUN AN AGENT" FOLLOWS THE TABLE (CUTOVER-PLAN D8). An automation on
      -- an older table listens for older row events, which stop the moment the table is archived;
      -- it is re-keyed to the copy's record events (same table id, same column keys — the mover
      -- keeps them; row.deleted becomes record.archived, the store's own word). Its config before
      -- is kept on the press and on the automation, so Switch back puts it back exactly.
      for v_t in
        select t.id, t.config from scheduler.sch_trigger t
         where t.organization_id = p_org and t.deleted_at is null and t.type = 'event'
           and t.config ->> 'entity_type' = 'user_table_row'
           and (t.config ->> 'table_id')::uuid = any (v_ids)
         order by t.id
         for update
      loop
        v_cfg := v_t.config
          || jsonb_build_object('entity_type', 'record:' || (v_t.config ->> 'table_id'))
          || case when v_t.config ? 'actions' then jsonb_build_object('actions', (
               select coalesce(jsonb_agg(distinct case a when 'row.deleted' then 'record.archived'
                                                     else regexp_replace(a, '^row\.', 'record.') end), '[]'::jsonb)
                 from jsonb_array_elements_text(v_t.config -> 'actions') a)) else '{}'::jsonb end;
        update scheduler.sch_trigger
           set config = v_cfg,
               metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('cutover_rekeyed',
                 jsonb_build_object('press', p_press, 'at', clock_timestamp(), 'config_before', v_t.config)),
               updated_at = now(), updated_by = p_actor
         where id = v_t.id;
        v_rekeyed := v_rekeyed || jsonb_build_object('id', v_t.id, 'config_before', v_t.config, 'config_now', v_cfg);
      end loop;
    end if;
    v_w := platform._knob_override_write(v_feature, v_key, 'organization', p_org, p_org,
                                         'true'::jsonb, v_note, p_actor);
    if not coalesce((v_w ->> 'ok')::boolean, false) then
      raise exception 'the setting %.% could not be written: %', v_feature, v_key, v_w::text using errcode = '22023';
    end if;
    return jsonb_build_object('archived', to_jsonb(v_ids), 'rekeyed', v_rekeyed,
                              'resynced', v_resynced,
                              'setting', v_feature || '.' || v_key,
                              'setting_before', coalesce(v_before, 'null'::jsonb), 'setting_now', true);
  end if;

  -- p_to = 'old': undo exactly what the last switch to new did.
  v_last := platform._cutover_seam_last_done(p_seam, p_org);
  if p_seam = 'older_tables' and v_last.id is not null then
    for v_id in select (jsonb_array_elements_text(coalesce(v_last.did -> 'archived', '[]'::jsonb)))::uuid loop
      perform workbench.udt_dataset_unarchive(v_id);
      v_ids := v_ids || v_id;
    end loop;
    -- Every automation the switch re-keyed listens to its older table again, exactly as before.
    for v_t in select * from jsonb_array_elements(coalesce(v_last.did -> 'rekeyed', '[]'::jsonb)) as r(x) loop
      update scheduler.sch_trigger
         set config = v_t.x -> 'config_before',
             metadata = coalesce(metadata, '{}'::jsonb) - 'cutover_rekeyed',
             updated_at = now(), updated_by = p_actor
       where id = (v_t.x ->> 'id')::uuid and deleted_at is null;
      v_rekeyed := v_rekeyed || jsonb_build_object('id', v_t.x ->> 'id', 'config_now', v_t.x -> 'config_before');
    end loop;
  end if;
  v_before := case when v_last.id is null then null
                   when v_last.did -> 'setting_before' = 'null'::jsonb then null
                   else v_last.did -> 'setting_before' end;
  v_w := platform._knob_override_write(v_feature, v_key, 'organization', p_org, p_org,
                                       v_before, v_note, p_actor);
  if not coalesce((v_w ->> 'ok')::boolean, false) then
    raise exception 'the setting %.% could not be put back: %', v_feature, v_key, v_w::text using errcode = '22023';
  end if;
  return jsonb_build_object('unarchived', to_jsonb(v_ids), 'rekeyed_back', v_rekeyed,
                            'setting', v_feature || '.' || v_key,
                            'setting_restored_to', coalesce(v_before, 'null'::jsonb),
                            'undid_press', v_last.id);
end;
$function$;

CREATE OR REPLACE FUNCTION public.update_data_row_in_user_table(p_row_id uuid, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_result JSONB;
    v_updated BOOLEAN;
BEGIN
    UPDATE workbench.udt_dataset_rows
    SET data = p_data, updated_at = NOW()
    WHERE id = p_row_id
    RETURNING true INTO v_updated;

    IF v_updated THEN
        v_result := jsonb_build_object(
            'success', true,
            'row_id', p_row_id,
            'data', p_data,
            'updated_at', NOW()
        );
    ELSE
        v_result := jsonb_build_object('success', false, 'error', 'Row not found or update failed');
    END IF;

    RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.udt_upsert_row(p_table_id uuid, p_row_id uuid DEFAULT NULL::uuid, p_data jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller  UUID := auth.uid();
  v_dataset workbench.udt_datasets%ROWTYPE;
  v_row     workbench.udt_dataset_rows%ROWTYPE;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'udt_upsert_row: not authenticated';
  END IF;
  IF p_data IS NULL THEN
    RAISE EXCEPTION 'udt_upsert_row: p_data is required';
  END IF;

  SELECT * INTO v_dataset FROM workbench.udt_datasets WHERE id = p_table_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'udt_upsert_row: table % not found', p_table_id;
  END IF;
  IF NOT workbench.udt_dataset_access(p_table_id, 'editor') THEN
    RAISE EXCEPTION 'udt_upsert_row: caller lacks editor permission on table %', p_table_id;
  END IF;

  IF p_row_id IS NULL THEN
    INSERT INTO workbench.udt_dataset_rows(table_id, data, user_id)
    VALUES (p_table_id, p_data, v_caller) RETURNING * INTO v_row;
  ELSE
    UPDATE workbench.udt_dataset_rows SET data = p_data, updated_at = now()
     WHERE id = p_row_id AND table_id = p_table_id RETURNING * INTO v_row;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'udt_upsert_row: row % not found in table %', p_row_id, p_table_id;
    END IF;
  END IF;
  RETURN to_jsonb(v_row);
END;
$function$;

create or replace function workbench._moved_older_table_takes_no_writes()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog'
as $$
begin
  -- pass-through: the inverse of lane OLDER-DOORS-AFTER-SWITCH's write guard.
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

delete from platform.client_callable_door
 where (schema_name, function_name) in (('workbench', 'older_table_moved_to'),
                                        ('platform', '_older_list_moved_by_switch'),
                                        ('workbench', 'udt_structured_list_archive'),
                                        ('workbench', 'udt_structured_list_unarchive'));

drop function if exists workbench.older_table_moved_to(uuid);
drop function if exists workbench.udt_structured_list_archive(uuid, uuid, text);
drop function if exists workbench.udt_structured_list_unarchive(uuid);
drop function if exists platform._older_list_moved_by_switch(uuid);
