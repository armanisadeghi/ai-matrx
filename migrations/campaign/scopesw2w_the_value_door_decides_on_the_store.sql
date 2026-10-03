-- chair-step: it REPLACES the body of the lane-9 value door's half, custom._ctx_value_write_store (behind custom.context_value_write; signature, SECURITY DEFINER, search_path and grants unchanged). It already wrote the store first and the old value row as its image; now it also decides on the store: the scope's organization, its maker, whether it is live and its name are read from its Record, not from context.scopes; the rule is the old one word for word (the scope's maker, or editor access through iam — context._scope_readable_for asks iam only), and a refusal says context._scope_denial_message's own sentences with the name read from the store. The branch that handed an organization still written by the old tables to public.set_context_value is gone (0 such organizations on production or the clone, 2026-10-03): such an organization would be refused in its own words. What still reads an old table here is the image's own bookkeeping, named for the soak's allowlist: the next version number of the old value row, context.validate_reference_value and context.index_reference_value (W2-B). No new door, no grant, no change to the chair's record doors or the access ladder.
-- lane: SCOPES-ON-THE-STORE
-- based-on: custom._ctx_value_write_store(jsonb) c6bd4d94fc6c9d6fecc2ffba3b19024fbc92354fdc148d6427acf72e8b2cc2de
-- lock: custom
--
-- Inverse: migrations/inverse/scopesw2w_the_value_door_decides_on_the_store_down.sql.
--
-- THE USE CASE. A therapist at Cedar Ridge Physical Therapy sets the Sports rehab practice area's "intake form"
-- value; a colleague with view access only is told so by name; a scope that was archived answers that it no
-- longer exists. Each decision is read from the record store.
-- Guards: scripts/campaign-tests/scopesw2w_the_value_door_decides_on_the_store_same_answer.sql and the platform
-- writers' suite.

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
  v_live    boolean;
  v_name    text;
begin
  -- LANE 9 W2-W (SCOPES-ON-THE-STORE): WHO MAY WRITE THIS VALUE IS DECIDED ON THE STORE. The scope's organization,
  -- its maker, whether it is live and its name come from its Record; the rule is the old one (the maker, or editor
  -- access through iam), and the refusal says it in the old sentences.
  if v_uid is null and nullif(current_setting('request.jwt.claims', true), '') is null then
    v_uid := (p_payload ->> 'acting_user_id')::uuid;       -- the server's own trusted path, as set_context_value
  end if;
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'unauthorized', 'message', 'no acting user'));
  end if;
  if v_item is null or v_scope is null then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'invalid_argument', 'message', 'context_item_id and scope_id are required'));
  end if;
  select r.organization_id, r.created_by, r.deleted_at is null, r.data ->> 'name'
    into v_org, v_owner, v_live, v_name
    from custom.record r
    join custom.record t on t.organization_id = r.organization_id and t.id = r.table_id
                        and t.table_id = custom.table_kernel_id() and t.data ->> 'kept_for' = 'context'
   where r.id = v_scope and r.data_class = 'record';
  if not found then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'not_found', 'message', 'scope not found'));
  end if;
  if not (v_owner = v_uid or context._scope_readable_for(v_uid, v_scope, 'editor')) then
    -- context._scope_denial_message's own sentences, its scope read from the store.
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'forbidden',
      'message', case
        when not v_live or v_name is null then 'That record no longer exists, or it was deleted.'
        when context._scope_readable(v_scope, 'viewer')
          then format('You can view "%s" but you cannot change it. Ask for edit access on that record.', v_name)
        else format('You do not have access to "%s". Ask someone who can already open it to share it with you.', v_name) end));
  end if;
  -- Every organization's scopes are written in the store (custom.context_writer); one that is not refuses in
  -- its own words instead of reaching for the old value function.
  if custom.context_writer(v_org) <> 'store' then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'unavailable',
      'message', 'This organization''s scopes are not written in the record store yet, so this value was not saved.'));
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
