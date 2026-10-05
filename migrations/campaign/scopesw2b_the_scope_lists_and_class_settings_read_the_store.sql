-- chair-step: it REPLACES eight bodies so that they stop reading the old context.* scope tables and read the record store instead, with signatures, volatility, search_path and grants unchanged: public.list_scopes and public.search_scopes (the scopes come from custom.scope_rows_of, the scope tree's own store reader), context._readable_scope_ids (the server's every-scope answer comes from the store), context._scope_denial_message (the scope's name from its Record), public.edu_class_join_code and public.edu_class_set_access (the class's settings are read from its Record, locked FOR UPDATE, then written through the scope door as before), custom._ctx_table_live (the store alone answers; the copy-from-the-old-table fallback is gone, no type needs it), and workbench.guard_used_template_fields (the template binding is read from the Table's data.scope_binding; it becomes SECURITY DEFINER because a signed-in caller cannot read the store, and it only answers whether a binding exists). Same answer on live, rolled back, as admin, test@test.com, a stranger and the server: 1,098 calls each, 0 differences except list_scopes' row bookkeeping (version, created_at, updated_at, updated_by, published_to_web_at/_by), where it now answers the store's own values exactly as the live scope tree door does. Settings equal for all 9,510 scopes; table-live equal for all 150 types; the guard equal for every template.
-- lane: FINISH-THE-SWITCH (FTS-1b, wave 2 bodies of SCOPES-ON-THE-STORE)
-- based-on: context._readable_scope_ids() 05fdd68714f655d42fdd7a07aa490c05f1048768995bd2e39d2a5c1009bdb253
-- based-on: public.list_scopes(uuid, uuid, uuid) 0c2d7ad55f10e02afbb19aee703a63019d2c3ca0b4dbc03bf4b3dbe664b71823
-- based-on: public.search_scopes(uuid, text, uuid) 3dbbe48a15a026995228e74bb63580d2fa6276da9c97accba6c0d07663d1cc0d
-- based-on: context._scope_denial_message(uuid, text) e51b76bd189787f3692aa22cb59c8cbfda7bf43483e6fc2b96a1cb7220713616
-- based-on: public.edu_class_join_code(uuid, text) aa2875b527c512e8dd2246c94d9a04b48f502c9270fbdbd6f0c71dc5381ff7a3
-- based-on: public.edu_class_set_access(uuid, text) b9679661bc5bec382c392e3831f9a89784a87709bb2e9e2f9b6594c22821816a
-- based-on: workbench.guard_used_template_fields() 70db9d9c338994cccbb85a1e9eef57cc125a0a502d9f79d19dbefddb6cbfd306
-- based-on: custom._ctx_table_live(uuid, uuid) c4d20ca17974123bcbdd6303ac28ba349e84c15cd878ccbf2b1107d5e7f34feb
-- lock: custom, context, public, workbench, platform
--
-- Inverse: migrations/inverse/scopesw2b_the_scope_lists_and_class_settings_read_the_store_down.sql.
--
-- THE USE CASE. A teacher at Cedar Ridge rotates a class's join code and a member lists the clinic's scopes; both
-- answers come from the record store, so the old tables can be parked without either of them noticing.

CREATE OR REPLACE FUNCTION context._readable_scope_ids()
 RETURNS SETOF uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  -- FTS-1b: the server's answer is every scope the store holds (a Record of a Table kept for context), archived
  -- ones too, as the old table answered; a member's answer is the access kernel's, which already reads the store.
  if auth.role() = 'service_role' then
    return query select r.id from custom.record r
      join custom.record t on t.organization_id = r.organization_id and t.id = r.table_id
                          and t.table_id = custom.table_kernel_id() and t.data ->> 'kept_for' = 'context'
     where r.data_class = 'record';
    return;
  end if;
  return query select iam.unnest_uuids(iam.accessible_entity_ids('scope', 'viewer'::public.permission_level));
end;
$function$;

CREATE OR REPLACE FUNCTION public.list_scopes(p_org_id uuid, p_type_id uuid DEFAULT NULL::uuid, p_parent_scope_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_result jsonb;
begin
  if (auth.role() = 'service_role' or iam.has_org_access(p_org_id)) is not true then
    raise exception 'not authorized for this organization' using errcode = '42501',
            detail = jsonb_build_object('org_id', p_org_id)::text;
  end if;
  -- FTS-1b: the scopes come from the store (custom.scope_rows_of, the scope tree's own reader), in the old row's shape.
  select jsonb_agg(
    (s.row_doc - 'search_engine_indexed') || jsonb_build_object(
      'type_label', s.type_doc ->> 'label_singular',
      'type_label_plural', s.type_doc ->> 'label_plural',
      'type_icon', s.type_doc ->> 'icon',
      'type_color', s.type_doc ->> 'color',
      'child_count', (select count(*) from custom.record c
                        join custom.record ct on ct.organization_id = c.organization_id and ct.id = c.table_id
                                             and ct.table_id = custom.table_kernel_id() and ct.data ->> 'kept_for' = 'context'
                       where c.organization_id = p_org_id and c.data_class = 'record' and c.deleted_at is null
                         and c.data ->> 'parent_id' = s.id::text),
      'assignment_count', (select count(*) from platform.associations_live a where a.target_type = 'scope' and a.target_id = s.id)
    ) order by s.sort_order, s.name
  ) into v_result
  from custom.scope_rows_of(p_org_id, case when p_type_id is null then null else array[p_type_id] end) s
  where s.id in (select context._readable_scope_ids())
    and ((p_parent_scope_id is null and s.row_doc ->> 'parent_scope_id' is null)
         or s.row_doc ->> 'parent_scope_id' = p_parent_scope_id::text);
  return coalesce(v_result, '[]'::jsonb);
end;
$function$;

CREATE OR REPLACE FUNCTION public.search_scopes(p_org_id uuid, p_query text, p_type_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_result jsonb;
begin
  if (auth.role() = 'service_role' or iam.has_org_access(p_org_id)) is not true then
    raise exception 'not authorized for this organization' using errcode = '42501',
            detail = jsonb_build_object('org_id', p_org_id)::text;
  end if;
  -- FTS-1b: the scopes come from the store (custom.scope_rows_of), answered in the same words and order.
  select jsonb_agg(
    jsonb_build_object(
      'id', s.id,
      'name', s.name,
      'description', s.row_doc -> 'description',
      'parent_scope_id', s.row_doc -> 'parent_scope_id',
      'type_id', s.table_id,
      'type_label', s.type_doc ->> 'label_singular',
      'type_icon', s.type_doc ->> 'icon',
      'type_color', s.type_doc ->> 'color'
    ) order by s.type_sort, s.sort_order, s.name
  ) into v_result
  from custom.scope_rows_of(p_org_id, case when p_type_id is null then null else array[p_type_id] end) s
  where s.id in (select context._readable_scope_ids())
    and s.name ilike '%' || coalesce(p_query, '') || '%';
  return coalesce(v_result, '[]'::jsonb);
end;
$function$;

CREATE OR REPLACE FUNCTION context._scope_denial_message(p_scope_id uuid, p_level text DEFAULT 'viewer'::text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_name text;
begin
  -- FTS-1b: the scope's name comes from the store.
  select r.data ->> 'name' into v_name
  from custom.record r
  join custom.record t on t.organization_id = r.organization_id and t.id = r.table_id
                      and t.table_id = custom.table_kernel_id() and t.data ->> 'kept_for' = 'context'
  where r.id = p_scope_id and r.data_class = 'record' and r.deleted_at is null;
  if v_name is null then
    return 'That record no longer exists, or it was deleted.';
  end if;
  if p_level <> 'viewer' and context._scope_readable(p_scope_id, 'viewer') then
    return format('You can view "%s" but you cannot change it. Ask for edit access on that record.', v_name);
  end if;
  return format('You do not have access to "%s". Ask someone who can already open it to share it with you.', v_name);
end;
$function$;

CREATE OR REPLACE FUNCTION public.edu_class_join_code(p_class uuid, p_action text DEFAULT 'get'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_scope public._edu_class_row;
  v_uid uuid := (select auth.uid());
  v_code text;
  v_settings jsonb;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if p_action not in ('get', 'rotate', 'disable') then
    raise exception 'invalid action %', p_action using errcode = '22023';
  end if;
  v_scope := public._edu_class_of(p_class);
  if not public._edu_is_owner(v_scope) then
    raise exception 'class owner required' using errcode = '42501';
  end if;

  v_code := v_scope.settings->>'join_code';

  -- FTS-1b: the class's settings are read from its Record in the store, locked, so two rotations still queue.
  if p_action = 'disable' then
    select coalesce(custom._ctx_scope_settings(r.organization_id, r.table_id, r.data), '{}'::jsonb) into v_settings
      from custom.record r where r.id = v_scope.id and r.data_class = 'record' for update;
    perform custom.context_scope_write(v_scope.organization_id, v_scope.id, null,
      jsonb_build_object('settings', coalesce(v_settings, '{}'::jsonb) - 'join_code'));
    return jsonb_build_object('code', null);
  end if;

  if p_action = 'rotate' or v_code is null then
    v_code := public._edu_generate_join_code();
    select coalesce(custom._ctx_scope_settings(r.organization_id, r.table_id, r.data), '{}'::jsonb) into v_settings
      from custom.record r where r.id = v_scope.id and r.data_class = 'record' for update;
    perform custom.context_scope_write(v_scope.organization_id, v_scope.id, null,
      jsonb_build_object('settings', jsonb_set(coalesce(v_settings, '{}'::jsonb), '{join_code}', to_jsonb(v_code))));
  end if;

  return jsonb_build_object('code', v_code);
end;
$function$;

CREATE OR REPLACE FUNCTION public.edu_class_set_access(p_class uuid, p_access_mode text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_scope public._edu_class_row; v_settings jsonb;
begin
  if p_access_mode not in ('open', 'closed', 'paid') then
    raise exception 'invalid access_mode %', p_access_mode using errcode = '22023';
  end if;
  v_scope := public._edu_class_of(p_class);
  if not public._edu_is_owner(v_scope) then
    raise exception 'only the class owner can change access mode' using errcode = '42501';
  end if;
  -- The write merges into the class's own settings and goes through the scope door. FTS-1b: those settings are
  -- read from the class's Record in the store, locked.
  select coalesce(custom._ctx_scope_settings(r.organization_id, r.table_id, r.data), '{}'::jsonb) into v_settings
    from custom.record r where r.id = v_scope.id and r.data_class = 'record' for update;
  perform custom.context_scope_write(v_scope.organization_id, v_scope.id, null,
    jsonb_build_object('settings', coalesce(v_settings, '{}'::jsonb) || jsonb_build_object('access_mode', p_access_mode)));
  perform public._edu_ensure_owner_membership(v_scope);
  return jsonb_build_object('status', 'ok', 'access_mode', p_access_mode);
end;
$function$;

CREATE OR REPLACE FUNCTION workbench.guard_used_template_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  -- SWITCH-STEP-TWO: a template is instantiated when a scope holds a table made from it. FTS-1b: that binding lives
  -- on the Table in the store (data.scope_binding, written by custom.scope_table_provision); read as the owner,
  -- because the store is not readable by a signed-in caller.
  if exists (select 1 from custom.record t
              where t.table_id = custom.table_kernel_id() and t.data_class = 'table'
                and t.data -> 'scope_binding' ->> 'template_id' = coalesce(new.template_id, old.template_id)::text) then
    raise exception 'template % is already instantiated; create a new template version instead of changing its fields',
      coalesce(new.template_id, old.template_id) using errcode = '55000';
  end if;
  return coalesce(new, old);
end; $function$;

CREATE OR REPLACE FUNCTION custom._ctx_table_live(p_org uuid, p_type uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
begin
  -- FTS-1b: the store alone answers. The old fallback (copy a type only the old table held) is gone: every type
  -- has been in the store since the copy, and a type the store lacks is not live.
  return exists (select 1 from custom.record r where r.organization_id = p_org and r.id = p_type and r.deleted_at is null);
end;
$function$;

-- WHO MAY CALL THE THREE DEFINERS THAT HAD NO DECLARATION (provision_shape_guard): none is a client door.
insert into platform.client_callable_door (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, non_client_lane, signed_in_callers, anonymous_callers) values
  ('context', '_readable_scope_ids', '', '{}'::oid[],
   'No arguments. The server (service_role) is answered every scope the store holds; anyone else is answered the access kernel''s viewer set (iam.accessible_entity_ids(''scope'', ''viewer'')) for auth.uid().',
   'migrations/campaign/scopesw2b_the_scope_lists_and_class_settings_read_the_store.sql (lane FINISH-THE-SWITCH, FTS-1b)',
   'internal: no client role holds EXECUTE; reached only from public.list_scopes and public.search_scopes (which check organization access first) and the scope access conformance instrument.', false, false),
  ('context', '_scope_denial_message', 'p_scope_id uuid, p_level text', array['uuid'::regtype, 'text'::regtype]::oid[],
   'p_scope_id is read only for its name, to word a refusal the caller already earned; p_level picks the sentence, and context._scope_readable(p_scope_id, ''viewer'') decides which. NULL p_scope_id answers the no-longer-exists sentence.',
   'migrations/campaign/scopesw2b_the_scope_lists_and_class_settings_read_the_store.sql (lane FINISH-THE-SWITCH, FTS-1b)',
   'internal: no client role holds EXECUTE; reached only from refusal paths (context._assert_scope_readable, the value write doors) after access was refused.', false, false),
  ('workbench', 'guard_used_template_fields', '', '{}'::oid[],
   'A trigger function on workbench.udt_dataset_template_fields: it reads only whether a Table in the store is bound to the row''s template_id (data.scope_binding) and refuses the change if so. It takes no arguments and returns the row.',
   'migrations/campaign/scopesw2b_the_scope_lists_and_class_settings_read_the_store.sql (lane FINISH-THE-SWITCH, FTS-1b)',
   'internal: a trigger function; it is never called by name, only fired by writes to workbench.udt_dataset_template_fields.', false, false);
