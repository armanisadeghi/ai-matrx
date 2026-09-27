-- chair-step: lane SCOPES-WRITE-THROUGH — the store's scope doors, the one writer API for scope types, scopes, context fields, values, templates and tags (custom.context_*). Each is SECURITY INVOKER over today's scope door (every check it makes today, made the same way), except the value door, which in an organization whose store is the writer writes the Record first (custom._ctx_value_write_store, the same permission set_context_value asks) and the old row as its image. Each door answers {ok, writer, row, store}. Door rows are declared before their grants. Nothing is replaced; no row is written.
-- lane: SCOPES-WRITE-THROUGH
-- INVERSE: migrations/inverse/scopeswt_the_scope_doors_down.sql
-- window-class: new functions only. Applied directly (owner, 2026-09-24).
--
-- THE USE CASE. The web app's one scopes service calls these and nothing else to write scopes; the
-- server's agent write-back calls custom.context_value_write. At the final switch the old-door call
-- inside each is replaced by a store-side check and the image write goes away; no caller changes.

-- ── 8. THE STORE'S SCOPE DOORS — the one writer API every caller uses ─────────────────────────────
--
-- SECURITY INVOKER on purpose: in both kinds of organization every permission and validation the
-- scope system enforces today is enforced exactly as today, by the same door (no new security, no
-- widening). In an organization whose store is the writer, the rows those doors write are carried
-- into the record store in the same statement by the store halves (the write-through above), whose
-- rules govern — a store refusal refuses the write; a VALUE is written in the store first (below) and
-- the old row is its image. The final switch replaces the old-door call inside each of these with a
-- store-side check and removes the image; callers never change.

-- Which system wrote, and the store's own version of the thing, for the answer.
create or replace function custom._ctx_answer(p_org uuid, p_id uuid, p_row jsonb)
 returns jsonb
 language sql
 stable
 security definer
 set search_path to 'pg_catalog'
as $function$
  -- The store row's facts are answered only to a member of its organization (or the server).
  select jsonb_build_object(
    'ok', true,
    'writer', custom.context_writer(p_org),
    'row', p_row,
    'store', (select jsonb_build_object('id', r.id, 'table_id', r.table_id, 'data_class', r.data_class,
                                        'version', r.version, 'archived', r.deleted_at is not null)
                from custom.record r
               where r.organization_id = p_org and r.id = p_id
                 and (auth.uid() is null or iam.is_org_member(auth.uid(), p_org))))
$function$;
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, signed_in_callers, anonymous_callers, argument_rules)
values ('custom', '_ctx_answer', 'p_org uuid, p_id uuid, p_row jsonb', array['uuid'::regtype, 'uuid'::regtype, 'jsonb'::regtype]::oid[],
        'The answer shape of the scope doors (custom.context_*): which system writes the organization named, and the store row''s id, Table, class, version and archived flag — answered only when the caller is a member of that organization (iam.is_org_member) or the server itself.',
        'scopeswt_the_scope_doors.sql', true, false,
        jsonb_build_object('arguments', jsonb_build_object(
          'p_org', jsonb_build_object('foreign', jsonb_build_object('bounded', true, 'note', 'answered only to a member of this organization (iam.is_org_member) or the server')),
          'p_id', jsonb_build_object('foreign', jsonb_build_object('bounded', true, 'note', 'read only inside p_org, which the member check bounds')))))
on conflict do nothing;
grant execute on function custom._ctx_answer(uuid, uuid, jsonb) to authenticated, service_role;

-- A SCOPE TYPE.
create or replace function custom.context_type_write(p_organization_id uuid, p_type_id uuid, p_spec jsonb)
 returns jsonb
 language plpgsql
 set search_path to 'pg_catalog'
as $function$
declare
  v_row jsonb;
  v_org uuid := p_organization_id;
  s jsonb := coalesce(p_spec, '{}'::jsonb);
begin
  if p_type_id is null then
    if v_org is null then
      raise exception 'A new scope type needs the organization it belongs to.' using errcode = '22004';
    end if;
    v_row := public.create_scope_type(
      v_org, s ->> 'label_singular', s ->> 'label_plural', nullif(s ->> 'parent_type_id', '')::uuid,
      coalesce(s ->> 'icon', 'folder'), coalesce(s ->> 'description', ''),
      coalesce((s ->> 'sort_order')::smallint, 0::smallint), (s ->> 'max_assignments')::smallint,
      coalesce(array(select jsonb_array_elements_text(s -> 'default_variable_keys')), '{}'::text[]),
      s ->> 'color', nullif(s ->> 'slug', ''));
  else
    v_row := public.update_scope_type(
      p_type_id, s ->> 'label_singular', s ->> 'label_plural', s ->> 'icon', s ->> 'description',
      (s ->> 'sort_order')::smallint, (s ->> 'max_assignments')::smallint, s ->> 'color', nullif(s ->> 'slug', ''));
    v_org := (v_row ->> 'organization_id')::uuid;
  end if;
  return custom._ctx_answer(coalesce(v_org, (v_row ->> 'organization_id')::uuid), (v_row ->> 'id')::uuid, v_row);
end;
$function$;

create or replace function custom.context_type_archive(p_type_id uuid)
 returns jsonb
 language plpgsql
 set search_path to 'pg_catalog'
as $function$
declare v_org uuid := (select t.organization_id from context.scope_types t where t.id = p_type_id);
begin
  return custom._ctx_answer(v_org, p_type_id, public.delete_scope_type(p_type_id));
end;
$function$;

create or replace function custom.context_type_restore(p_type_id uuid)
 returns jsonb
 language plpgsql
 set search_path to 'pg_catalog'
as $function$
declare v_org uuid := (select t.organization_id from context.scope_types t where t.id = p_type_id);
begin
  return custom._ctx_answer(v_org, p_type_id, public.restore_scope_type(p_type_id));
end;
$function$;

-- A SCOPE.
create or replace function custom.context_scope_write(p_organization_id uuid, p_scope_id uuid, p_type_id uuid, p_spec jsonb)
 returns jsonb
 language plpgsql
 set search_path to 'pg_catalog'
as $function$
declare
  v_row jsonb;
  s jsonb := coalesce(p_spec, '{}'::jsonb);
begin
  if p_scope_id is null then
    v_row := public.create_scope(
      p_organization_id, p_type_id, s ->> 'name', nullif(s ->> 'parent_scope_id', '')::uuid,
      coalesce(s ->> 'description', ''), coalesce(s -> 'settings', '{}'::jsonb), nullif(s ->> 'slug', ''),
      (s ->> 'sort_order')::smallint);
  else
    v_row := public.update_scope(
      p_scope_id, s ->> 'name', s ->> 'description', case when s ? 'settings' then s -> 'settings' end,
      nullif(s ->> 'slug', ''), (s ->> 'sort_order')::smallint);
  end if;
  return custom._ctx_answer((v_row ->> 'organization_id')::uuid, (v_row ->> 'id')::uuid, v_row);
end;
$function$;

create or replace function custom.context_scope_archive(p_scope_id uuid)
 returns jsonb
 language plpgsql
 set search_path to 'pg_catalog'
as $function$
declare v_org uuid := (select s.organization_id from context.scopes s where s.id = p_scope_id);
begin
  return custom._ctx_answer(v_org, p_scope_id, public.delete_scope(p_scope_id));
end;
$function$;

create or replace function custom.context_scope_restore(p_scope_id uuid)
 returns jsonb
 language plpgsql
 set search_path to 'pg_catalog'
as $function$
declare v_org uuid := (select s.organization_id from context.scopes s where s.id = p_scope_id);
begin
  return custom._ctx_answer(v_org, p_scope_id, public.restore_scope(p_scope_id));
end;
$function$;

-- A CONTEXT ITEM (a Field). The everyday columns go through update_context_item; a patch that
-- clears a column or reaches one that door has no parameter for is one row update under the
-- writer's own row policy — exactly the two paths the web app has always used.
create or replace function custom.context_item_write(p_item_id uuid, p_scope_type_id uuid, p_spec jsonb)
 returns jsonb
 language plpgsql
 set search_path to 'pg_catalog'
as $function$
declare
  v_row  jsonb;
  s jsonb := coalesce(p_spec, '{}'::jsonb);
  v_org  uuid;
  v_rowupdate boolean;
begin
  if p_item_id is null then
    v_row := public.create_context_item(
      p_scope_type_id, s ->> 'key', s ->> 'display_name', coalesce(s ->> 'value_type', 'string')::public.context_value_type,
      coalesce(s ->> 'description', ''), s ->> 'category',
      coalesce(s ->> 'fetch_hint', 'on_demand')::public.context_fetch_hint,
      coalesce(s ->> 'sensitivity', 'internal')::public.context_sensitivity,
      coalesce(array(select jsonb_array_elements_text(s -> 'tags')), '{}'::text[]),
      nullif(s ->> 'slug', ''), (s ->> 'sort_order')::smallint,
      case when jsonb_typeof(s -> 'allowed_reference_types') = 'array' then array(select jsonb_array_elements_text(s -> 'allowed_reference_types')) end,
      (s ->> 'max_items')::int,
      case when jsonb_typeof(s -> 'allowed_scope_type_ids') = 'array' then array(select jsonb_array_elements_text(s -> 'allowed_scope_type_ids'))::uuid[] end,
      case when jsonb_typeof(s -> 'reference_source') = 'object' then s -> 'reference_source' end);
  else
    v_rowupdate := exists (select 1 from jsonb_each(s) e where jsonb_typeof(e.value) = 'null')
                   or s ?| array['custom_component', 'review_interval_days', 'allowed_reference_types', 'max_items',
                                 'allowed_scope_type_ids', 'reference_source'];
    if v_rowupdate then
      update context.context_items i
         set display_name = case when s ? 'display_name' then s ->> 'display_name' else i.display_name end,
             description = case when s ? 'description' then s ->> 'description' else i.description end,
             category = case when s ? 'category' then s ->> 'category' else i.category end,
             value_type = case when s ? 'value_type' then (s ->> 'value_type')::public.context_value_type else i.value_type end,
             fetch_hint = case when s ? 'fetch_hint' then (s ->> 'fetch_hint')::public.context_fetch_hint else i.fetch_hint end,
             sensitivity = case when s ? 'sensitivity' then (s ->> 'sensitivity')::public.context_sensitivity else i.sensitivity end,
             tags = case when s ? 'tags' then coalesce(array(select jsonb_array_elements_text(s -> 'tags')), '{}'::text[]) else i.tags end,
             sort_order = case when s ? 'sort_order' then (s ->> 'sort_order')::smallint else i.sort_order end,
             status = case when s ? 'status' then (s ->> 'status')::public.context_item_status else i.status end,
             status_note = case when s ? 'status_note' then s ->> 'status_note' else i.status_note end,
             custom_component = case when s ? 'custom_component' then case when jsonb_typeof(s -> 'custom_component') = 'null' then null else s -> 'custom_component' end else i.custom_component end,
             review_interval_days = case when s ? 'review_interval_days' then (s ->> 'review_interval_days')::int else i.review_interval_days end,
             allowed_reference_types = case when s ? 'allowed_reference_types' then case when jsonb_typeof(s -> 'allowed_reference_types') = 'array' then array(select jsonb_array_elements_text(s -> 'allowed_reference_types')) end else i.allowed_reference_types end,
             max_items = case when s ? 'max_items' then coalesce((s ->> 'max_items')::int, 1) else i.max_items end,
             allowed_scope_type_ids = case when s ? 'allowed_scope_type_ids' then case when jsonb_typeof(s -> 'allowed_scope_type_ids') = 'array' then array(select jsonb_array_elements_text(s -> 'allowed_scope_type_ids'))::uuid[] end else i.allowed_scope_type_ids end,
             reference_source = case when s ? 'reference_source' then case when jsonb_typeof(s -> 'reference_source') = 'null' then null else s -> 'reference_source' end else i.reference_source end
       where i.id = p_item_id
      returning to_jsonb(i.*) into v_row;
      if v_row is null then
        raise exception 'There is no context field % you may change.', p_item_id using errcode = '42501';
      end if;
    else
      v_row := public.update_context_item(
        p_item_id, s ->> 'display_name', s ->> 'description', s ->> 'category',
        (s ->> 'value_type')::public.context_value_type, (s ->> 'fetch_hint')::public.context_fetch_hint,
        (s ->> 'sensitivity')::public.context_sensitivity,
        case when s ? 'tags' then array(select jsonb_array_elements_text(s -> 'tags')) end,
        (s ->> 'sort_order')::smallint, (s ->> 'status')::public.context_item_status, s ->> 'status_note');
    end if;
  end if;
  select t.organization_id into v_org from context.scope_types t where t.id = (v_row ->> 'scope_type_id')::uuid;
  return custom._ctx_answer(v_org, (v_row ->> 'id')::uuid, v_row);
end;
$function$;

create or replace function custom.context_item_archive(p_item_id uuid)
 returns jsonb
 language plpgsql
 set search_path to 'pg_catalog'
as $function$
declare v_org uuid := (select t.organization_id from context.context_items i join context.scope_types t on t.id = i.scope_type_id where i.id = p_item_id);
begin
  return custom._ctx_answer(v_org, p_item_id, public.delete_context_item(p_item_id));
end;
$function$;

create or replace function custom.context_item_restore(p_item_id uuid)
 returns jsonb
 language plpgsql
 set search_path to 'pg_catalog'
as $function$
declare v_org uuid := (select t.organization_id from context.context_items i join context.scope_types t on t.id = i.scope_type_id where i.id = p_item_id);
begin
  return custom._ctx_answer(v_org, p_item_id, public.restore_context_item(p_item_id));
end;
$function$;

-- A VALUE — the store first. In an organization whose store is the writer the value is written into
-- the scope's Record (the store's rules: its Field type, its ceiling, its envelope law), then the old
-- context_item_values row is written as its image under the same id the Record's source names. The
-- permission is the one public.set_context_value asks (the scope's owner, or an editor of it).
create or replace function custom._ctx_value_write_store(p_payload jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'pg_catalog'
as $function$
declare
  v_uid     uuid := auth.uid();
  v_item    uuid := (p_payload ->> 'context_item_id')::uuid;
  v_scope   uuid := (p_payload ->> 'scope_id')::uuid;
  v_source  text := coalesce(p_payload ->> 'source_type', 'ai_enriched');
  v_org     uuid;
  v_owner   uuid;
  v_id      uuid := gen_random_uuid();
  v_version int;
  v_image   jsonb;
  v_was     text;
  v_row     context.context_item_values;
begin
  if v_uid is null and nullif(current_setting('request.jwt.claims', true), '') is null then
    v_uid := (p_payload ->> 'acting_user_id')::uuid;       -- the server's own trusted path, as set_context_value
  end if;
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'unauthorized', 'message', 'no acting user'));
  end if;
  if v_item is null or v_scope is null then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'invalid_argument', 'message', 'context_item_id and scope_id are required'));
  end if;
  select s.organization_id, s.created_by into v_org, v_owner from context.scopes s where s.id = v_scope;
  if not found then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'not_found', 'message', 'scope not found'));
  end if;
  if not (v_owner = v_uid or context._scope_readable_for(v_uid, v_scope, 'editor')) then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'forbidden',
      'message', context._scope_denial_message(v_scope, 'editor')));
  end if;

  begin
    perform context.validate_reference_value(v_item, p_payload ->> 'value_text');
    perform pg_advisory_xact_lock(hashtext('civ:' || v_item::text || ':' || v_scope::text));
    select coalesce(max(v.version), 0) + 1 into v_version
      from context.context_item_values v where v.context_item_id = v_item and v.scope_id = v_scope;
    v_image := jsonb_build_object(
      'id', v_id, 'context_item_id', v_item, 'scope_id', v_scope, 'version', v_version, 'is_current', true,
      'value_text', p_payload -> 'value_text', 'value_number', p_payload -> 'value_number',
      'value_boolean', p_payload -> 'value_boolean', 'value_json', p_payload -> 'value_json',
      'value_date', p_payload -> 'value_date', 'value_document_url', p_payload -> 'value_document_url',
      'value_timestamp', p_payload -> 'value_timestamp', 'value_time', p_payload -> 'value_time',
      'source_type', v_source, 'authored_by', v_uid, 'change_summary', p_payload -> 'change_summary',
      'created_at', now());

    -- THE STORE FIRST: its rules decide.
    v_was := custom._ctx_mark('door');
    perform custom._ctx_store_value(v_org, v_image);

    -- THE IMAGE: the old row, under the id the Record's source names.
    insert into context.context_item_values (
      id, context_item_id, scope_id,
      value_text, value_number, value_boolean, value_json, value_date, value_document_url,
      value_timestamp, value_time, source_type, authored_by, change_summary)
    values (
      v_id, v_item, v_scope,
      p_payload ->> 'value_text',
      case when p_payload ? 'value_number' then (p_payload ->> 'value_number')::numeric end,
      case when p_payload ? 'value_boolean' then (p_payload ->> 'value_boolean')::boolean end,
      case when p_payload ? 'value_json' then p_payload -> 'value_json' end,
      case when p_payload ? 'value_date' then (p_payload ->> 'value_date')::date end,
      p_payload ->> 'value_document_url',
      case when p_payload ? 'value_timestamp' then (p_payload ->> 'value_timestamp')::timestamptz end,
      case when p_payload ? 'value_time' then (p_payload ->> 'value_time')::time end,
      v_source::public.context_source_type, v_uid, p_payload ->> 'change_summary')
    returning * into v_row;
    perform context.index_reference_value(v_row.id, v_item, v_scope, p_payload ->> 'value_text');
    perform custom._ctx_mark(v_was);
  exception
    when unique_violation then
      return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'conflict', 'message', 'concurrent write on this cell — retry'));
    when sqlstate '22023' then
      return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'invalid_argument', 'message', sqlerrm));
  end;
  return jsonb_build_object('ok', true, 'writer', 'store', 'data', jsonb_build_object(
    'id', v_row.id, 'context_item_id', v_row.context_item_id, 'scope_id', v_row.scope_id,
    'version', v_row.version, 'is_current', v_row.is_current,
    'value_text', v_row.value_text, 'value_date', v_row.value_date,
    'value_timestamp', v_row.value_timestamp, 'value_time', v_row.value_time,
    'source_type', v_row.source_type),
    'store', (select jsonb_build_object('id', r.id, 'table_id', r.table_id, 'version', r.version)
                from custom.record r where r.organization_id = v_org and r.id = v_scope));
end;
$function$;
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, signed_in_callers, anonymous_callers)
values ('custom', '_ctx_value_write_store', 'p_payload jsonb', array['jsonb'::regtype]::oid[],
        'The store-first half of custom.context_value_write for an organization whose record store writes its scopes. p_payload names one cell (context_item_id, scope_id) and its value columns exactly as public.set_context_value takes them; the caller must own the scope or be an editor of it (context._scope_readable_for, the check set_context_value makes), and acting_user_id is honoured only on a connection with no signed-in claims (the server''s trusted path), as set_context_value does.',
        'scopeswt_the_scope_doors.sql', true, false)
on conflict do nothing;
grant execute on function custom._ctx_value_write_store(jsonb) to authenticated, service_role;

create or replace function custom.context_value_write(p_payload jsonb)
 returns jsonb
 language plpgsql
 set search_path to 'pg_catalog'
as $function$
declare
  v_org uuid := (select s.organization_id from context.scopes s where s.id = (p_payload ->> 'scope_id')::uuid);
  v_out jsonb;
begin
  if custom.context_writer(v_org) = 'store' then
    return custom._ctx_value_write_store(p_payload);
  end if;
  v_out := public.set_context_value(p_payload);
  return v_out || jsonb_build_object('writer', 'old');
end;
$function$;

-- A TEMPLATE, applied: a set of Table and Field definitions (scope types and their context fields).
create or replace function custom.context_template_apply(p_organization_id uuid, p_template_id uuid)
 returns jsonb
 language plpgsql
 set search_path to 'pg_catalog'
as $function$
begin
  return public.apply_template(p_template_id, p_organization_id)
         || jsonb_build_object('writer', custom.context_writer(p_organization_id));
end;
$function$;

-- The templates a person can apply (the catalogue is platform reference data, like System context).
create or replace function custom.context_templates()
 returns setof jsonb
 language sql
 stable
 set search_path to 'pg_catalog'
as $function$
  select to_jsonb(t) || jsonb_build_object(
           'scope_types', coalesce((select jsonb_agg(to_jsonb(st) || jsonb_build_object('fields',
                             coalesce((select jsonb_agg(to_jsonb(ti) order by ti.sort_order)
                                         from context.template_context_items ti where ti.template_scope_type_id = st.id), '[]'::jsonb))
                             order by st.sort_order)
                              from context.template_scope_types st where st.template_id = t.id), '[]'::jsonb))
    from context.templates t
   where t.is_active
   order by t.name
$function$;

-- TAGS. The tag doors keep their own checks; the write-through carries each edge into the store.
create or replace function custom.context_tags_set(p_entity_type text, p_entity_id uuid, p_scope_ids uuid[])
 returns jsonb
 language plpgsql
 set search_path to 'pg_catalog'
as $function$
declare v_out jsonb;
begin
  v_out := to_jsonb(public.set_entity_scopes(p_entity_type, p_entity_id, coalesce(p_scope_ids, '{}'::uuid[])));
  return jsonb_build_object('ok', true, 'row', v_out,
    'writers', coalesce((select jsonb_object_agg(x.org, custom.context_writer(x.org))
                           from (select distinct s.organization_id as org from context.scopes s
                                  where s.id = any (coalesce(p_scope_ids, '{}'::uuid[]))) x), '{}'::jsonb));
end;
$function$;

-- The doors, declared before their grants.
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, signed_in_callers, anonymous_callers)
select 'custom', v.fn, v.args, v.types, v.reason, 'scopeswt_the_scope_doors.sql', true, false
  from (values
    ('context_type_write', 'p_organization_id uuid, p_type_id uuid, p_spec jsonb', array['uuid'::regtype, 'uuid'::regtype, 'jsonb'::regtype]::oid[],
     'SECURITY INVOKER scope door: creates (no id) or changes a scope type through public.create_scope_type / update_scope_type, which make every check they make today; in an organization whose store is the writer the write-through carries the row into the record store in the same statement.'),
    ('context_type_archive', 'p_type_id uuid', array['uuid'::regtype]::oid[], 'SECURITY INVOKER scope door over public.delete_scope_type (its own checks); the write-through carries the archive and its cascade.'),
    ('context_type_restore', 'p_type_id uuid', array['uuid'::regtype]::oid[], 'SECURITY INVOKER scope door over public.restore_scope_type (its own checks); the write-through carries the restore.'),
    ('context_scope_write', 'p_organization_id uuid, p_scope_id uuid, p_type_id uuid, p_spec jsonb', array['uuid'::regtype, 'uuid'::regtype, 'uuid'::regtype, 'jsonb'::regtype]::oid[],
     'SECURITY INVOKER scope door over public.create_scope / update_scope (their own checks); the write-through carries the scope into its Record.'),
    ('context_scope_archive', 'p_scope_id uuid', array['uuid'::regtype]::oid[], 'SECURITY INVOKER scope door over public.delete_scope (its own checks).'),
    ('context_scope_restore', 'p_scope_id uuid', array['uuid'::regtype]::oid[], 'SECURITY INVOKER scope door over public.restore_scope (its own checks).'),
    ('context_item_write', 'p_item_id uuid, p_scope_type_id uuid, p_spec jsonb', array['uuid'::regtype, 'uuid'::regtype, 'jsonb'::regtype]::oid[],
     'SECURITY INVOKER scope door over public.create_context_item / update_context_item, or one row update of context.context_items under the writer''s own row policy (the two paths the web app has always used).'),
    ('context_item_archive', 'p_item_id uuid', array['uuid'::regtype]::oid[], 'SECURITY INVOKER scope door over public.delete_context_item (its own checks).'),
    ('context_item_restore', 'p_item_id uuid', array['uuid'::regtype]::oid[], 'SECURITY INVOKER scope door over public.restore_context_item (its own checks).'),
    ('context_value_write', 'p_payload jsonb', array['jsonb'::regtype]::oid[],
     'SECURITY INVOKER scope door for one cell: store first (custom._ctx_value_write_store) in an organization whose store is the writer, public.set_context_value otherwise.'),
    ('context_template_apply', 'p_organization_id uuid, p_template_id uuid', array['uuid'::regtype, 'uuid'::regtype]::oid[],
     'SECURITY INVOKER scope door over public.apply_template (its own organization check).'),
    ('context_templates', '', array[]::oid[], 'SECURITY INVOKER read of the platform''s active scope templates under the reader''s own row policy.'),
    ('context_tags_set', 'p_entity_type text, p_entity_id uuid, p_scope_ids uuid[]', array['text'::regtype, 'uuid'::regtype, 'uuid[]'::regtype]::oid[],
     'SECURITY INVOKER tag door over public.set_entity_scopes (its own checks); the write-through carries each edge.')
  ) as v(fn, args, types, reason)
on conflict do nothing;

grant execute on function custom.context_type_write(uuid, uuid, jsonb) to authenticated, service_role;
grant execute on function custom.context_type_archive(uuid) to authenticated, service_role;
grant execute on function custom.context_type_restore(uuid) to authenticated, service_role;
grant execute on function custom.context_scope_write(uuid, uuid, uuid, jsonb) to authenticated, service_role;
grant execute on function custom.context_scope_archive(uuid) to authenticated, service_role;
grant execute on function custom.context_scope_restore(uuid) to authenticated, service_role;
grant execute on function custom.context_item_write(uuid, uuid, jsonb) to authenticated, service_role;
grant execute on function custom.context_item_archive(uuid) to authenticated, service_role;
grant execute on function custom.context_item_restore(uuid) to authenticated, service_role;
grant execute on function custom.context_value_write(jsonb) to authenticated, service_role;
grant execute on function custom.context_template_apply(uuid, uuid) to authenticated, service_role;
grant execute on function custom.context_templates() to authenticated, service_role;
grant execute on function custom.context_tags_set(text, uuid, uuid[]) to authenticated, service_role;
