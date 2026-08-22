-- reference_candidates_by_id_uses_has_access.sql
--
-- public.reference_search_candidates: by-id title resolution (p_ids present)
-- now gates on iam.has_access(token, id, 'viewer') for every non-file token —
-- the platform access verdict, identical to what RLS already allows — instead
-- of the owner-or-org ENUMERATION filter, which is kept for search only.
--
-- Found live 2026-08-22 (education class assignments): a student who is an
-- active class member CAN read an assigned deck (RLS via the assignment branch),
-- but useEntityTitles -> this RPC returned [] because the deck belongs to the
-- teacher's org, so every assigned title rendered "Untitled Flashcard Set". Same
-- dead end for any shared-with-me reference chip. The `file` token already had
-- this exact split (files.has_access_for for p_ids); this generalizes it.
CREATE OR REPLACE FUNCTION public.reference_search_candidates(p_token text, p_search text DEFAULT NULL::text, p_limit integer DEFAULT 50, p_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(id uuid, title text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_row platform.entity_types%rowtype;
  v_has_owner boolean;
  v_has_org boolean;
  v_has_visibility boolean;
  v_has_deleted boolean;
  v_has_canonical boolean;
  v_access text;
  v_sql text;
  v_uid uuid := auth.uid();
  v_predicate record;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;

  select * into v_row
  from platform.entity_types e
  where e.token = p_token and e.is_active;

  if not found then
    raise exception 'unknown or inactive entity token "%"', p_token;
  end if;
  if not v_row.reference_pickable or v_row.title_column is null then
    raise exception 'entity "%" is not reference-pickable with a title column — enable it at /administration/relationships/entity-types', p_token;
  end if;

  select
    coalesce(bool_or(c.column_name = 'created_by'), false),
    coalesce(bool_or(c.column_name = 'organization_id'), false),
    coalesce(bool_or(c.column_name = 'visibility'), false),
    coalesce(bool_or(c.column_name = 'deleted_at'), false),
    coalesce(bool_or(c.column_name = 'canonical_id'), false)
  into v_has_owner, v_has_org, v_has_visibility, v_has_deleted, v_has_canonical
  from information_schema.columns c
  where c.table_schema = v_row.schema_name
    and c.table_name = v_row.table_name;

  if p_token = 'file' then
    if p_ids is not null then
      v_access := format(
        'files.has_access_for(%L, t.id, %L::public.permission_level)',
        v_uid,
        'viewer');
    else
      v_access := format(
        'files.is_listable_for(%L, t.id) and t.parent_file_id is null and not public.is_system_path(t.file_path)',
        v_uid);
    end if;
  elsif p_ids is not null then
    -- By-id TITLE RESOLUTION (not enumeration): the caller already holds the
    -- ids; the only question is "may this viewer read these rows?" — which is
    -- exactly iam.has_access, the same verdict RLS gives. The owner-or-org
    -- enumeration filter below is for SEARCH; applied to pinned ids it dead-
    -- ended every legitimately shared/assigned reference ("Untitled …" for a
    -- student's assigned deck). Mirrors the file branch above.
    v_access := format(
      'iam.has_access(%L, t.id, %L::public.permission_level)',
      p_token,
      'viewer');
  elsif v_has_owner and v_has_org then
    v_access := format(
      't.created_by = %L or (t.organization_id in (select m.organization_id from iam.organization_member m where m.user_id = %L)%s)',
      v_uid,
      v_uid,
      case
        when v_has_visibility then format(
          ' and (t.visibility is null or t.visibility::text <> %L or t.created_by = %L)',
          'personal',
          v_uid)
        else ''
      end);
  elsif v_has_owner then
    v_access := format('t.created_by = %L', v_uid);
  elsif v_has_org then
    v_access := format(
      't.organization_id in (select m.organization_id from iam.organization_member m where m.user_id = %L)',
      v_uid);
  else
    v_access := 'true';
  end if;

  v_sql := format(
    'select t.id, t.%I::text as title from %I.%I t where (%s)',
    v_row.title_column,
    v_row.schema_name,
    v_row.table_name,
    v_access);

  if v_has_deleted then
    v_sql := v_sql || ' and t.deleted_at is null';
  end if;

  if v_has_canonical then
    v_sql := v_sql || ' and t.canonical_id is null';
  end if;

  for v_predicate in
    select p.key, p.value
    from pg_catalog.jsonb_each(v_row.reference_candidate_predicates) as p(key, value)
  loop
    if not exists (
      select 1
      from information_schema.columns c
      where c.table_schema = v_row.schema_name
        and c.table_name = v_row.table_name
        and c.column_name = v_predicate.key
    ) then
      raise exception
        'entity "%" candidate predicate names missing column "%.%.%"',
        p_token,
        v_row.schema_name,
        v_row.table_name,
        v_predicate.key;
    end if;

    if v_predicate.value = 'null'::jsonb then
      v_sql := v_sql || format(' and t.%I is null', v_predicate.key);
    elsif jsonb_typeof(v_predicate.value) in ('string', 'number', 'boolean') then
      v_sql := v_sql || format(
        ' and t.%I::text = %L',
        v_predicate.key,
        v_predicate.value #>> '{}');
    else
      raise exception
        'entity "%" candidate predicate "%" must be a scalar or null',
        p_token,
        v_predicate.key;
    end if;
  end loop;

  if p_ids is not null then
    v_sql := v_sql || format(' and t.id = any(%L::uuid[])', p_ids);
  end if;

  if nullif(trim(p_search), '') is not null then
    v_sql := v_sql || format(
      ' and t.%I::text ilike %L',
      v_row.title_column,
      '%' || trim(p_search) || '%');
  end if;

  v_sql := v_sql || format(
    ' order by t.%I limit %s',
    v_row.title_column,
    least(greatest(coalesce(p_limit, 50), 1), 200));

  return query execute v_sql;
end
$function$

