-- chair-step: swaps app.definition slug uniqueness (constraint aga_apps_slug_key) to a partial unique index on deleted_at IS NULL (db-rules §8, DD-121); no table, column or row is dropped
-- based-on: public.validate_slugs(text[]) ad95dc6a68c656eac8cd62f49c627762c098da76c610bb97330e34a4f5c4e213
-- based-on: public.access_gate_resolve_slug(text, text) eb10d4296b75156156dddf7277f3c900fe584ef5f9f9c3fb263a1f03cba849f6
-- based-on: public.entity_undelete(text, uuid) 41ad7fa77d0ab68188f9f0f53938f1743336dc4a965eec2065815ab9117de80b
-- Delete means archive (Arman, 2026-09-27). An app in Trash stops holding its
-- slug (db-rules §8, DD-121): the full unique constraint aga_apps_slug_key
-- becomes a unique index over live rows only, so a new app can take the slug
-- of an archived one. Every slug reader already filters deleted_at (the /p
-- page, get_aga_public_data, get_prompt_app_public_data,
-- get_published_app_with_prompt) or is fixed here:
--   * validate_slugs reports a slug held only by an archived app as available;
--   * access_gate_resolve_slug('app') prefers the live row (else the newest
--     archived one, so the gate can say "deleted") — same shape as its
--     content_ir_kind and learn_doc branches;
--   * entity_undelete: restoring a row whose name/slug a live row has since
--     taken now answers in plain words with the remedy (rename the other one),
--     still errcode 23505 — generic for every live-only unique index.

alter table app.definition drop constraint if exists aga_apps_slug_key;
drop index if exists app.aga_apps_slug_key;
create unique index aga_apps_slug_key on app.definition (slug) where deleted_at is null;

CREATE OR REPLACE FUNCTION public.validate_slugs(slug_array text[])
 RETURNS TABLE(slug text, is_available boolean, is_format_valid boolean, error text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'app', 'pg_temp'
AS $function$
  SELECT
    s.slug,
    NOT EXISTS (SELECT 1 FROM app.definition d WHERE d.slug = s.slug AND d.deleted_at IS NULL) AS is_available,
    (s.slug ~ '^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$'::text
      AND length(s.slug) >= 3
      AND length(s.slug) <= 50) AS is_format_valid,
    CASE
      WHEN length(s.slug) < 3 OR length(s.slug) > 50 THEN 'Slug must be 3-50 characters'
      WHEN NOT (s.slug ~ '^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$'::text) THEN 'Invalid format'
      ELSE NULL
    END AS error
  FROM unnest(slug_array) s(slug);
$function$;

CREATE OR REPLACE FUNCTION public.access_gate_resolve_slug(p_type text, p_slug text)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'platform', 'iam'
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_id  uuid;
begin
  if v_uid is null then
    return null;
  end if;

  if p_type is null or p_slug is null or length(p_slug) = 0 then
    return null;
  end if;

  case p_type
    when 'organization' then
      select o.id into v_id
      from iam.organizations o
      where o.slug = p_slug
      limit 1;
    when 'content_ir_kind' then
      -- /shapes/[kind]: features/content-ir/studio/shape-detail-server.ts
      -- matches kind_definition.kind (unique among live rows). A live row
      -- wins; else the newest deleted one, so the gate can say "deleted".
      select k.id into v_id
      from content_ir.kind_definition k
      where k.kind = p_slug
      order by k.deleted_at desc nulls first
      limit 1;
    when 'learn_doc' then
      -- /education/learn/[...slug]: features/education/publishing/queries.ts
      -- matches learn_doc.slug (the joined path; unique among live rows).
      select d.id into v_id
      from education.learn_doc d
      where d.slug = p_slug
      order by d.deleted_at desc nulls first
      limit 1;
    when 'pc_episode' then
      -- /podcast/[slug] and /podcast/[slug]/blog: id when uuid-shaped, else slug.
      if p_slug ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        select e.id into v_id from podcast.pc_episodes e where e.id = p_slug::uuid;
      else
        select e.id into v_id from podcast.pc_episodes e where e.slug = p_slug limit 1;
      end if;
    when 'pc_show' then
      -- /podcast/[slug] (show fallback): id when uuid-shaped, else slug.
      if p_slug ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        select s.id into v_id from podcast.pc_shows s where s.id = p_slug::uuid;
      else
        select s.id into v_id from podcast.pc_shows s where s.slug = p_slug limit 1;
      end if;
    when 'app' then
      -- /p/[slug]: app.definition.slug (unique among live rows). A live row
      -- wins; else the newest deleted one, so the gate can say "deleted".
      select a.id into v_id
      from app.definition a
      where a.slug = p_slug
      order by a.deleted_at desc nulls first
      limit 1;
    else
      v_id := null;
  end case;

  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.entity_undelete(p_token text, p_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
-- lane TRASH-TABLES: token `record` (custom.record — every Table and Record of the record store) is
-- restored by custom.record_restore(organization, id): the store's ladder decides (42501 when the
-- caller may not change it) and the archive event brings back exactly what it took. The organization
-- is read FROM THE ROW, never from the caller.
-- lane TRASH-COVERAGE-2: a row whose parent is archived (platform.archived_parent_of) brings the
-- parent back first, through this same door, so a child is never left live under a removed parent
-- (platform._guard_soft_delete_parent would refuse it anyway). Kinds with their own restore door go
-- through it and never a raw update: folder -> public.restore_folder (its subfolders and files),
-- scope type -> public.restore_scope_type, scope -> public.restore_scope, scope type Field ->
-- public.restore_context_item, library document -> rag.fn_restore_library_document (its chunks and
-- data-store memberships), HR employee -> public.hr_employee_restore (HR's gate and audit).
-- lane STORE-RESTORE-DOORS: a record-store row goes through its own class's door
-- (public._trash_store_restore: custom.field_restore, rule_restore, relation_restore, doc_template_restore,
-- dashboard_restore; a Table or Record custom.record_restore); a mandate through mandate.definition_restore.
-- lane DOORS-DECIDE-LAST: a Meeting through communication.meet_restore_meeting (Meet's host / co-host rule).
declare
  v_s text;
  v_t text;
  v_feature_owned_restore boolean;
  v_n int;
  v_org uuid;
  v_i int;
  v_ptok text;
  v_pid uuid;
  v_at timestamptz;
  v_found boolean;
  v_res jsonb;
  v_detail text;
  v_col text;
  v_val text;
  v_noun text;
begin
  -- A passage link (anchored_to association) is a filtered trash kind with its own door.
  if p_token = 'passage_link' then
    perform public.passage_link_restore(p_id);
    return true;
  end if;

  if p_token = 'record' then
    select r.organization_id into v_org
      from custom.record r
     where r.id = p_id and r.deleted_at is not null;
    if v_org is null then
      return false;
    end if;
    perform public._trash_store_restore(v_org, p_id);
    return true;
  end if;

  select schema_name, table_name, feature_owned_restore
    into v_s, v_t, v_feature_owned_restore
    from platform.entity_types
   where token = p_token;

  if v_s is null then
    raise exception 'unknown token %', p_token using errcode = '22023';
  end if;
  if coalesce(v_feature_owned_restore, false) then
    raise exception 'entity % requires feature-owned restoration', p_token using errcode = '42501';
  end if;
  execute format('select true, t.deleted_at from %I.%I t where t.id = $1', v_s, v_t)
    into v_found, v_at using p_id;
  if not coalesce(v_found, false) or v_at is null then
    return false;
  end if;

  -- The parent first: a child of an archived parent only comes back with it.
  for v_i in 1..8 loop
    v_pid := null;
    select ap.parent_token, ap.parent_id into v_ptok, v_pid
      from platform.archived_parent_of(p_token, p_id) ap limit 1;
    exit when v_pid is null;
    perform public.entity_undelete(v_ptok, v_pid);
  end loop;

  execute format('select t.deleted_at from %I.%I t where t.id = $1', v_s, v_t) into v_at using p_id;
  if v_at is null then
    -- It came back with its parent. A Field comes back in use.
    if p_token = 'context_item' then
      perform public.restore_context_item(p_id);
    end if;
    return true;
  end if;

  case p_token
    when 'folder' then perform public.restore_folder(p_id); return true;
    when 'scope_type' then perform public.restore_scope_type(p_id); return true;
    when 'scope' then perform public.restore_scope(p_id); return true;
    when 'context_item' then perform public.restore_context_item(p_id); return true;
    when 'processed_document' then perform rag.fn_restore_library_document(p_id); return true;
    when 'mandate' then perform mandate.definition_restore(p_id); return true;
    when 'team' then perform public.team_restore(p_id); return true;
    -- lane DOORS-DECIDE-LAST: a Meeting comes back through Meet's own door (host or co-host; its
    -- invitations and occurrence exceptions return with it by the cascade edge).
    when 'meet_meeting' then perform communication.meet_restore_meeting(p_id, null); return true;
    -- A passage comment (and its suggestion / reply rows) comes back through its own door: author or record admin.
    when 'comment' then perform public.cmt_restore(p_id); return true;
    when 'hr_employee' then
      v_res := public.hr_employee_restore(jsonb_build_object('employee_id', p_id));
      if not coalesce((v_res ->> 'ok')::boolean, false) then
        raise exception '%', coalesce(nullif(btrim(v_res ->> 'detail'), ''),
                                      'HR did not allow this person to be restored.')
          using errcode = '42501';
      end if;
      return true;
    else null;
  end case;

  -- 1347: a client_read_only type is changed only through its own doors.
  if iam.is_client_lane() and exists (select 1 from platform.entity_types et
                                       where et.token = p_token and et.client_read_only) then
    raise exception 'a % is changed only through the screen that manages it', p_token using errcode = '42501';
  end if;

  if not iam.has_access(p_token, p_id, 'editor') then
    raise exception 'access denied' using errcode = '42501';
  end if;

  -- A removed row stops holding its name (db-rules §8, DD-121): while it sat in
  -- Trash a live row may have taken the same name/slug. Restoring it then hits
  -- the live-only unique index; say which name is taken and what to do, never
  -- a raw 23505 (the code stays 23505 so callers can still tell).
  begin
    execute format('UPDATE %I.%I SET deleted_at=NULL WHERE id=$1 AND deleted_at IS NOT NULL', v_s, v_t)
      using p_id;
  exception when unique_violation then
    get stacked diagnostics v_detail = pg_exception_detail;
    v_col := substring(v_detail from 'Key \(([^)]*)\)=');
    v_val := substring(v_detail from '\)=\((.*)\) already exists');
    select lower(coalesce(nullif(btrim(et.label), ''), p_token)) into v_noun
      from platform.entity_types et where et.token = p_token;
    raise exception using
      errcode = '23505',
      message = format('This %s can''t be restored: another %s already uses the %s "%s".',
                       v_noun, v_noun, coalesce(v_col, 'same name'), coalesce(v_val, '')),
      detail  = v_detail,
      hint    = format('Rename the other %s (or give it a different %s), then restore this one.',
                       v_noun, coalesce(v_col, 'name'));
  end;
  get diagnostics v_n = row_count;
  if v_n > 0 and p_token = 'workflow' then
    perform workflow.restore_triggers_archived_with(p_id, v_at);
  end if;
  return v_n > 0;
end;
$function$;
