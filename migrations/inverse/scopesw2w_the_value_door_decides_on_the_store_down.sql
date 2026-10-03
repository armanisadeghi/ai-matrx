-- chair-step: the inverse of scopesw2w_the_value_door_decides_on_the_store.sql — restores the body of custom._ctx_value_write_store exactly as production holds it on 2026-10-03 (sha256 c6bd4d94…), in which the door reads the scope's organization and maker from context.scopes and hands an old-writer organization to public.set_context_value.
-- lane: SCOPES-ON-THE-STORE
-- based-on: custom._ctx_value_write_store(jsonb) 8ebb62144706fae502602e49152ff5c6f9e43d4b56ce435679d0e02369c62cf5
-- lock: custom

CREATE OR REPLACE FUNCTION custom._ctx_value_write_store(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
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
  -- AN ORGANIZATION WHOSE OLD TABLES STILL WRITE ITS SCOPES: today's value door, unchanged.
  if custom.context_writer(v_org) <> 'store' then
    return public.set_context_value(p_payload) || jsonb_build_object('writer', 'old');
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

