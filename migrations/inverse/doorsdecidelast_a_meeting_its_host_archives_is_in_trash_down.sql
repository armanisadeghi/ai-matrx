-- INVERSE of migrations/campaign/doorsdecidelast_a_meeting_its_host_archives_is_in_trash.sql (lane DOORS-DECIDE-LAST).
-- A Meeting stops being a Trash kind and both Trash restores lose their Meeting arm. No meeting row is touched.
-- based-on: public.entity_undelete(text, uuid) 41ad7fa77d0ab68188f9f0f53938f1743336dc4a965eec2065815ab9117de80b
-- based-on: public.org_trash_restore(uuid, text, uuid) b4c9f1cb3a03b4656328dcea65bc49cf784cb31a97a6482ea25e069448ab16da
-- lane: DOORS-DECIDE-LAST

update platform.entity_types
   set user_artifact_kind = null
 where token = 'meet_meeting'
   and user_artifact_kind = 'meet_meeting';

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

CREATE OR REPLACE FUNCTION public.org_trash_restore(p_organization_id uuid, p_token text, p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- lane TRASH-2. An owner or admin of the organization restores one member's archived item that sits
-- in THIS organization. One audit row (iam.org_admin_audit, action trash.restore) and, when the item
-- is somebody else's, an in-app notice to its owner. Never a purge.
-- lane TRASH-TABLES: a record-store Table or Record (token `record`) is restored by
-- custom.record_restore, which asks the store's own ladder for the caller and brings back exactly what
-- its archive took; a refusal is returned as restored=false with the store's sentence.
-- lane TRASH-COVERAGE-2: a row whose parent is archived brings the parent back first, through this
-- same door (audited and noticed as the parent). Kinds with their own restore door go through it:
-- folder (public.restore_folder), scope type (public.restore_scope_type), scope (public.restore_scope),
-- scope type Field (public.restore_context_item), library document (rag.fn_restore_library_document),
-- HR employee (public.hr_employee_restore); a door's
-- refusal is restored=false with a sentence, never a raw update around it.
-- lane STORE-RESTORE-DOORS: a Field, Rule, link, document template or dashboard (token `record`) goes
-- through its own store door (public._trash_store_restore) and a mandate through
-- mandate.definition_restore; the door's own refusal sentence is the answer.
declare
  v_me uuid := public._org_trash_gate(p_organization_id);
  e record;
  v_rel regclass;
  v_title_col text;
  v_owner uuid;
  v_title text;
  v_label text;
  v_me_name text;
  v_org_name text;
  v_subject text;
  v_body text;
  v_class text;
  v_i int;
  v_ptok text;
  v_pid uuid;
  v_ptitle text;
  v_via_parent boolean := false;
  v_res jsonb;
  v_at timestamptz;
  v_title_expr text;
  v_found boolean;
  v_n int;
  v_why text;
begin
  if p_token = 'record' then
    select r.created_by, r.data_class,
           case when r.data_class = 'table'
                then coalesce(nullif(btrim(r.data ->> 'name'), ''), 'Untitled table')
                when r.data_class = 'record'
                then coalesce(nullif(btrim(custom.record_words(r.organization_id, r.id)), ''), 'Untitled record')
                else coalesce(public._trash_store_title(r.organization_id, r.id), 'Untitled') end
      into v_owner, v_class, v_title
      from custom.record r
     where r.organization_id = p_organization_id and r.id = p_id
       and r.deleted_at is not null
       and r.data_class in ('table', 'record', 'field', 'rule', 'relation', 'doc_template', 'dashboard');
    if not found then
      return jsonb_build_object('restored', false,
        'message', 'It is no longer in this organization''s Trash — somebody may have restored it already.');
    end if;
    begin
      perform public._trash_store_restore(p_organization_id, p_id);
    exception
      when insufficient_privilege then
        return jsonb_build_object('restored', false,
          'message', format('Only someone who can edit %s can bring it back. Its owner can restore it from their own Trash.',
                            coalesce(nullif(btrim(v_title), ''), 'it')));
      when check_violation or unique_violation or no_data_found or raise_exception then
        get stacked diagnostics v_why = message_text;
        return jsonb_build_object('restored', false, 'message', v_why);
    end;
    v_label := case v_class when 'table' then 'Table' when 'record' then 'Record' when 'field' then 'Field'
                            when 'rule' then 'Rule' when 'relation' then 'Link'
                            when 'doc_template' then 'Document template' else 'Dashboard' end;
    select 'record'::text as token, v_label as label into e;
  else
    select t.token, t.user_artifact_kind, t.label, t.schema_name, t.table_name,
           coalesce(t.retention_owner_column, 'created_by') as owner_col, t.title_column, t.feature_owned_restore
      into e
      from platform.entity_types t
     where t.token = p_token and t.is_active and t.user_artifact_kind is not null;
    if not found then
      raise exception 'That kind of item is not in Trash.' using errcode = '22023';
    end if;
    if coalesce(e.feature_owned_restore, false) or e.token in ('credential_item', 'user_secret', 'credential_attachment') then
      raise exception 'Vault items are restored by their owner from their own Trash.' using errcode = '42501';
    end if;
    v_rel := to_regclass(format('%I.%I', e.schema_name, e.table_name));
    if v_rel is null then
      raise exception 'That kind of item is not in Trash.' using errcode = '22023';
    end if;

    select a.attname into v_title_col from pg_attribute a
     where a.attrelid = v_rel and a.attnum > 0 and not a.attisdropped
       and a.attname = any (array['label_plural', coalesce(e.title_column, '')])
     order by (a.attname <> 'label_plural') limit 1;
    if v_title_col is null then
      select a.attname into v_title_col from pg_attribute a
       where a.attrelid = v_rel and a.attnum > 0 and not a.attisdropped
         and a.attname = any (array['name','title','label','display_name','file_name','folder_name','page_title','subject_value','target_domain','jurisdiction_key','path','code','label_plural','body','description'])
       order by array_position(array['name','title','label','display_name','file_name','folder_name','page_title','subject_value','target_domain','jurisdiction_key','path','code','label_plural','body','description'], a.attname::text)
       limit 1;
    end if;

    v_title_expr := case when v_title_col is null then 'null::text' else format('left(t.%I::text, 200)', v_title_col) end;

    -- The parent first: a child of an archived parent only comes back with it.
    for v_i in 1..8 loop
      v_pid := null;
      select ap.parent_token, ap.parent_id, ap.parent_title into v_ptok, v_pid, v_ptitle
        from platform.archived_parent_of(e.token, p_id) ap limit 1;
      exit when v_pid is null;
      if not exists (select 1 from platform.entity_types t
                      where t.token = v_ptok and t.is_active and t.user_artifact_kind is not null) then
        return jsonb_build_object('restored', false,
          'message', format('It is inside %s, which is archived and is not in this organization''s Trash. Its owner can restore it from their own Trash.',
                            coalesce(nullif(btrim(v_ptitle), ''), 'something')));
      end if;
      v_res := public.org_trash_restore(p_organization_id, v_ptok, v_pid);
      if not coalesce((v_res ->> 'restored')::boolean, false) then
        return v_res;
      end if;
      v_via_parent := true;
    end loop;

    -- The row, in THIS organization (a scope type's Field reads its organization from its scope type).
    if e.token = 'context_item' then
      select true, ci.created_by, left(ci.display_name::text, 200), ci.deleted_at
        into v_found, v_owner, v_title, v_at
        from context.context_items ci
        join context.scope_types st on st.id = ci.scope_type_id
       where ci.id = p_id and st.organization_id = p_organization_id;
    else
      execute format('select true, t.%I, %s, t.deleted_at from %I.%I t where t.id = $1 and t.organization_id = $2',
                     e.owner_col, v_title_expr, e.schema_name, e.table_name)
        into v_found, v_owner, v_title, v_at
        using p_id, p_organization_id;
    end if;
    if not coalesce(v_found, false) or (v_at is null and not v_via_parent) then
      return jsonb_build_object('restored', false,
        'message', 'It is no longer in this organization''s Trash — somebody may have restored it already.');
    end if;

    if v_at is null then
      -- It came back with its parent (audited and noticed there). A Field comes back in use.
      if e.token = 'context_item' then
        perform public.restore_context_item(p_id);
      end if;
      return jsonb_build_object('restored', true, 'owner_id', v_owner, 'title', v_title,
        'message', format('%s came back with %s.', coalesce(nullif(btrim(v_title), ''), e.label),
                          coalesce(nullif(btrim(v_ptitle), ''), 'what it sits in')));
    end if;

    if e.token in ('folder', 'scope_type', 'scope', 'context_item', 'processed_document', 'hr_employee', 'mandate') then
      begin
        case e.token
          when 'folder' then perform public.restore_folder(p_id);
          when 'scope_type' then perform public.restore_scope_type(p_id);
          when 'scope' then perform public.restore_scope(p_id);
          when 'context_item' then perform public.restore_context_item(p_id);
          when 'processed_document' then perform rag.fn_restore_library_document(p_id);
          when 'mandate' then perform mandate.definition_restore(p_id);
          when 'hr_employee' then
            v_res := public.hr_employee_restore(jsonb_build_object('employee_id', p_id));
            if not coalesce((v_res ->> 'ok')::boolean, false) then
              return jsonb_build_object('restored', false,
                'message', coalesce(nullif(btrim(v_res ->> 'detail'), ''),
                                    'Only someone HR allows to restore this person can bring them back.'));
            end if;
        end case;
      exception when insufficient_privilege or raise_exception or no_data_found then
        return jsonb_build_object('restored', false,
          'message', format('Only someone who can edit %s can bring it back. Its owner can restore it from their own Trash.',
                            coalesce(nullif(btrim(v_title), ''), 'it')));
      end;
    else
      execute format(
        'update %I.%I t set deleted_at = null
          where t.id = $1 and t.organization_id = $2 and t.deleted_at is not null
          returning t.%I, %s',
        e.schema_name, e.table_name, e.owner_col, v_title_expr)
        into v_owner, v_title
        using p_id, p_organization_id;
      get diagnostics v_n = row_count;

      -- (EXECUTE never sets FOUND; the row count is the answer.)
      if v_n = 0 then
        return jsonb_build_object('restored', false,
          'message', 'It is no longer in this organization''s Trash — somebody may have restored it already.');
      end if;
      if e.token = 'workflow' then
        perform workflow.restore_triggers_archived_with(p_id, v_at);
      end if;
    end if;
    v_label := e.label;
  end if;

  perform iam._org_audit(p_organization_id, v_owner, 'trash.restore',
    jsonb_build_object('entity_token', e.token, 'id', p_id, 'label', v_label, 'title', v_title));

  if v_owner is not null and v_owner is distinct from v_me then
    select coalesce(nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
                    nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
                    nullif(btrim(u.email), ''), 'An organization admin')
      into v_me_name from auth.users u where u.id = v_me;
    select coalesce(nullif(btrim(o.name), ''), 'your organization') into v_org_name
      from iam.organizations o where o.id = p_organization_id;
    v_subject := format('%s restored your %s', coalesce(v_me_name, 'An organization admin'), lower(v_label));
    v_body := format('%s restored "%s" from %s''s Trash. It is back where it was.',
                     coalesce(v_me_name, 'An organization admin'),
                     coalesce(nullif(btrim(v_title), ''), 'Untitled'), coalesce(v_org_name, 'your organization'));
    insert into communication.notification
      (organization_id, event_key, channel, recipient_user_id, recipient_kind,
       dedupe_key, subject, body, payload, target_kind, target_id, deep_link, visibility)
    values
      (p_organization_id, 'trash.restored_by_org_admin', 'in_app', v_owner, 'user',
       format('trash.restore:%s:%s:%s', e.token, p_id, extract(epoch from clock_timestamp())::bigint),
       v_subject, left(v_body, 600),
       jsonb_build_object('entity_token', e.token, 'id', p_id, 'by', v_me, 'source', 'org_trash_restore',
                          'notice', jsonb_build_object('subject', v_subject, 'body', v_body)),
       e.token, p_id, null, 'personal'::platform.visibility)
    on conflict (dedupe_key) where dedupe_key is not null do nothing;
  end if;

  return jsonb_build_object('restored', true, 'owner_id', v_owner, 'title', v_title,
    'message', format('%s restored.', coalesce(nullif(btrim(v_title), ''), v_label)));
end;
$function$;
