-- target: clone
--
-- LEVEL THE CLONE WITH PRODUCTION'S public.entity_undelete (lane DOORS-DECIDE-LAST, 2026-09-27).
-- The clone (clone-20260926) predates the annotation restore arms (passage_link -> public.passage_link_restore,
-- comment -> public.cmt_restore), so its entity_undelete is not the body
-- migrations/campaign/doorsdecidelast_a_meeting_its_host_archives_is_in_trash.sql is based on, and rule 27
-- cannot run. This is production's body as pg_get_functiondef printed it at 2026-09-27; the clone's next
-- nightly refresh overwrites it. NEVER for production (refused by location).
-- based-on: public.entity_undelete(text, uuid) 6a11b112ae48c7d43592b0f2929a610e28b5bfeb1e6c1a5cc69e15981630da17
-- lane: DOORS-DECIDE-LAST

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

  execute format('UPDATE %I.%I SET deleted_at=NULL WHERE id=$1 AND deleted_at IS NOT NULL', v_s, v_t)
    using p_id;
  get diagnostics v_n = row_count;
  if v_n > 0 and p_token = 'workflow' then
    perform workflow.restore_triggers_archived_with(p_id, v_at);
  end if;
  return v_n > 0;
end;
$function$;
