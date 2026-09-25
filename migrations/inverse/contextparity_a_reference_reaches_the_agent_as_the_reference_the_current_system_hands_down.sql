-- chair-step: the inverse of contextparity_a_reference_reaches_the_agent_as_the_reference_the_current_system_hands.sql. It puts custom.agent_context_value back byte for byte as it stood before it (same signature, so every grant stays). WHAT IT UNDOES: a relation to a copied scope is handed to the agent as a bare record id again, an entity reference as [{id, token, label}] again, and one picklist fence in a list Field as a list of one again. No record is touched.
-- lane: CONTEXT-PARITY
-- lock: custom
-- based-on: custom.agent_context_value(jsonb, text, text, uuid, uuid, bigint) bb6f87aea1d84c3d65a02fe8597fb01f47c3b2e462239ed831ae5cab3208c469

set local lock_timeout = '30s';
set local statement_timeout = '60s';

CREATE OR REPLACE FUNCTION custom.agent_context_value(p_doc jsonb, p_key text, p_type text, p_organization_id uuid, p_record_id uuid, p_cap bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_val    jsonb := p_doc -> p_key;
  v_ptr    jsonb;
  v_text   text;
  v_bytes  bigint;
  v_size   text;
  v_capped boolean;
  v_files  jsonb;
  v_n      integer;
begin
  -- 1. A VALUE KEPT AS A FILE. The cell holds its first words; the whole text is the file. The
  --    door cannot read a file's bytes, so it hands the words with the file NAMED — an honest
  --    value on its own — and `whole_value.expand` tells the store's client to hand the whole
  --    text instead (matrx_records RecordStore.resolve_context). Under the cap it stays the words
  --    and the file to open, announced.
  if jsonb_typeof(v_val) = 'string' then
    v_ptr := custom.whole_value_pointer_of(p_doc -> '_values', p_doc -> '_sources', p_key);
  end if;
  if v_ptr is not null then
    v_bytes := coalesce((v_ptr ->> 'bytes')::bigint, 0);
    v_size := case when v_bytes >= 1048576 then to_char(round(v_bytes / 1048576.0, 1), 'FM999990.0') || ' MB'
                   else greatest(round(v_bytes / 1024.0), 1)::text || ' KB' end;
    v_capped := p_cap > 0 and v_bytes > p_cap;
    v_text := v_val #>> '{}';
    if v_capped then
      v_text := custom.text_head_bytes(v_text, p_cap);
    end if;
    return jsonb_build_object(
      'value', to_jsonb(v_text || E'…\n\n' || case
        when v_capped then format(
          '[This value is %s, over this organization''s limit of %s bytes for one value handed to an agent, so only its start is here. The whole text is file %s; open it with the files tool to read all of it.]',
          v_size, p_cap, v_ptr ->> 'file_id')
        else format(
          '[This is the start of a %s text. The whole text is file %s; open it with the files tool to read all of it.]',
          v_size, v_ptr ->> 'file_id') end),
      'whole_value', v_ptr || jsonb_build_object(
        'expand', not v_capped, 'cap_bytes', nullif(p_cap, 0),
        'record_id', p_record_id, 'key', p_key));
  end if;

  -- 2. A TEXT IN THE CELL, over the organization's cap: its start and where the rest is, announced.
  if p_cap > 0 and jsonb_typeof(v_val) = 'string' and octet_length(v_val #>> '{}') > p_cap then
    v_bytes := octet_length(v_val #>> '{}');
    return jsonb_build_object(
      'value', to_jsonb(custom.text_head_bytes(v_val #>> '{}', p_cap) || E'…\n\n' || format(
        '[This value is %s bytes, over this organization''s limit of %s bytes for one value handed to an agent, so only its start is here. The whole value is the "%s" field of record %s.]',
        v_bytes, p_cap, p_key, p_record_id)),
      'whole_value', jsonb_build_object(
        'kind', 'capped_in_record', 'record_id', p_record_id, 'key', p_key,
        'bytes', v_bytes, 'cap_bytes', p_cap, 'expand', false));
  end if;

  -- 3. A RELATION TO FILES is the file reference the current context system hands for the same
  --    value (```matrx {kind: reference, type: file, items: [{file_id}]}```), so the agent opens
  --    the file with the files tool instead of being handed a File record id it cannot open.
  if p_type in ('relation', 'entity_reference') and jsonb_typeof(v_val) = 'array' and jsonb_array_length(v_val) > 0 then
    select jsonb_agg(jsonb_build_object('file_id', fr.data ->> 'file_id') order by x.ord), count(*)
      into v_files, v_n
      from jsonb_array_elements(v_val) with ordinality x(e, ord)
      join custom.record fr
        on jsonb_typeof(x.e) = 'string'
       and (x.e #>> '{}') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       and fr.organization_id = p_organization_id
       and fr.id = (x.e #>> '{}')::uuid
       and fr.table_id = custom.file_kernel_id()
       and fr.deleted_at is null
       and coalesce(fr.data ->> 'file_id', '') <> '';
    if v_n = jsonb_array_length(v_val) then
      return jsonb_build_object('value', to_jsonb(E'```matrx\n' || jsonb_pretty(jsonb_build_object(
        'kind', 'reference', 'type', 'file', 'items', v_files, 'matrx_version', 1)) || E'\n```'));
    end if;
  end if;

  return jsonb_build_object('value', v_val);
end;
$function$;
