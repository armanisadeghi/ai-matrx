-- reference_candidates_file_listing_gate.sql
--
-- Companion to files_listing_owner_grant_only.sql (same doctrine).
--
-- public.reference_search_candidates is the universal candidate reader used by
-- reference pickers and association pickers. Its generic owner-or-org branch
-- leaked every org co-member's non-private FILE into pickers. Files now get a
-- dedicated branch:
--   * enumeration (p_ids is null)  → files.is_listable_for  (owner/explicit
--     grant ONLY, top-level, non-system paths)
--   * by-id title resolution (p_ids present) → files.has_access_for (ACCESS
--     predicate, so chips for legitimately shared references still resolve)
-- Other tokens keep the existing generic behavior.

create or replace function public.reference_search_candidates(p_token text, p_search text default null::text, p_limit integer default 50, p_ids uuid[] default null::uuid[])
 returns table(id uuid, title text)
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
declare
  v_row platform.entity_types%rowtype;
  v_has_owner boolean;
  v_has_org boolean;
  v_has_visibility boolean;
  v_has_deleted boolean;
  v_access text;
  v_sql text;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;

  select * into v_row from platform.entity_types e
   where e.token = p_token and e.is_active;
  if not found then
    raise exception 'unknown or inactive entity token "%"', p_token;
  end if;
  if not v_row.reference_pickable or v_row.title_column is null then
    raise exception 'entity "%" is not reference-pickable with a title column — enable it at /administration/relationships/entity-types', p_token;
  end if;

  select
    bool_or(c.column_name = 'created_by'),
    bool_or(c.column_name = 'organization_id'),
    bool_or(c.column_name = 'visibility'),
    bool_or(c.column_name = 'deleted_at')
  into v_has_owner, v_has_org, v_has_visibility, v_has_deleted
  from information_schema.columns c
  where c.table_schema = v_row.schema_name and c.table_name = v_row.table_name;

  -- FILES ARE SPECIAL (LISTING doctrine — see files.is_listable_for):
  -- enumeration (no p_ids) may only surface owner/explicit-grant files;
  -- by-id title resolution (p_ids present) uses the ACCESS predicate so
  -- chips for legitimately shared references still resolve. Never let the
  -- generic owner-or-org branch below apply to files — that branch leaked
  -- every org co-member's non-private file into pickers.
  if p_token = 'file' then
    if p_ids is not null then
      v_access := format('files.has_access_for(%L, t.id, %L::public.permission_level)', v_uid, 'viewer');
    else
      v_access := format(
        'files.is_listable_for(%L, t.id) and t.parent_file_id is null and not public.is_system_path(t.file_path)',
        v_uid);
    end if;
  elsif v_has_owner and v_has_org then
    v_access := format(
      't.created_by = %L or (t.organization_id in (select m.organization_id from iam.organization_member m where m.user_id = %L)%s)',
      v_uid, v_uid,
      case when v_has_visibility
        then format(' and (t.visibility is null or t.visibility::text <> %L or t.created_by = %L)', 'private', v_uid)
        else '' end);
  elsif v_has_owner then
    v_access := format('t.created_by = %L', v_uid);
  elsif v_has_org then
    v_access := format(
      't.organization_id in (select m.organization_id from iam.organization_member m where m.user_id = %L)', v_uid);
  else
    v_access := 'true';
  end if;

  v_sql := format(
    'select t.id, t.%I::text as title from %I.%I t where (%s)',
    v_row.title_column, v_row.schema_name, v_row.table_name, v_access);

  if v_has_deleted then
    v_sql := v_sql || ' and t.deleted_at is null';
  end if;
  if p_ids is not null then
    v_sql := v_sql || format(' and t.id = any(%L::uuid[])', p_ids);
  end if;
  if nullif(trim(p_search), '') is not null then
    v_sql := v_sql || format(' and t.%I::text ilike %L',
      v_row.title_column, '%' || trim(p_search) || '%');
  end if;
  v_sql := v_sql || format(' order by t.%I limit %s',
    v_row.title_column, least(greatest(coalesce(p_limit, 50), 1), 200));

  return query execute v_sql;
end $function$;
