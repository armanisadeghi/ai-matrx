-- target: branch,production
-- additive: yes
--   It REPLACES one internal function of schema `custom`, `agent_context_value` (what the agent is
--   handed for one context value, called only by `custom.resolve_context`), with its existing
--   signature, security (invoker), owner and search_path, keeping every existing line and adding two
--   steps before its last line. No table, column, trigger, policy, grant or record is touched.
-- guard: custom/system_enabled
-- lane: CONTEXT-PARITY
-- lock: custom
-- based-on: custom.agent_context_value(jsonb, text, text, uuid, uuid, bigint) 55f524f7c22e720b047bac6a373af7e4c23404fef7ca368342defa94de7d3aa0
--
-- Inverse: migrations/inverse/contextparity_a_reference_reaches_the_agent_as_the_reference_the_current_system_hands_down.sql.
--
-- THE USE CASE. The context inspector's compare (old scope system vs the record-store copy, the
-- same selection to both) showed real value disagreements (VERIFIER-22): Castellano & Reyes, LLP ->
-- Matters, 6 defects; AI Matrx -> Features, 3; and the same sweep found Titanium -> Clients 4 and
-- Team Members 4. Two classes, both at this door:
--   A. A REFERENCE. The current system holds a reference as a ```matrx reference fence and hands
--      that fence; the copy lands it as a relation, and this door handed the bare record id (or
--      [{id, token, label}] for a reference to a note, workbook, site or brand). A relation to
--      FILES was already handed back as the file fence (BIG-VALUES-READERS); a relation to a copied
--      scope and an entity reference now are too.
--   B. ONE FENCE IN A LIST FIELD. An `array` item holding one picklist fence lands as a list of one;
--      the agent is now handed the fence, as the current system hands it.

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
  v_list   jsonb;
  v_len    integer;
  v_kinds  integer;
  v_kind   text;
  v_items  jsonb;
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

  -- 4. A REFERENCE THE COPY MADE A RELATION (lane CONTEXT-PARITY). The current context system
  --    holds a reference as its ```matrx reference fence and hands the agent that fence; the copy
  --    rightly lands it as a relation (the Field's target), so the store must hand the SAME fence
  --    back, or the agent sees a bare id with no kind (Castellano & Reyes Matters `client` /
  --    `practice_area`, Titanium Team Members `department` / `reports_to`).
  --    a. An ENTITY REFERENCE ([{id, token, label}], one token): the fence of that kind, with the
  --       label the read door already resolved for this person (never a name they may not read).
  --    b. A RELATION TO COPIED SCOPES (each id a record the scope copy made from context.scopes):
  --       the scope fence, ids only — exactly the shape the current system's backfill wrote.
  --    Anything else (a native store relation) stays the store's own value.
  if p_type in ('relation', 'entity_reference') and jsonb_typeof(v_val) in ('string', 'array', 'object') then
    v_list := case when jsonb_typeof(v_val) = 'array' then v_val else jsonb_build_array(v_val) end;
    v_len := jsonb_array_length(v_list);
    if v_len > 0 then
      select count(*), count(distinct x.e ->> 'token'), min(x.e ->> 'token'),
             jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', x.e ->> 'id', 'label', x.e ->> 'label'))
                       order by x.ord)
        into v_n, v_kinds, v_kind, v_items
        from jsonb_array_elements(v_list) with ordinality x(e, ord)
       where jsonb_typeof(x.e) = 'object'
         and coalesce(x.e ->> 'id', '') <> ''
         and coalesce(x.e ->> 'token', '') <> '';
      if v_n = v_len and v_kinds = 1 then
        return jsonb_build_object('value', to_jsonb(E'```matrx\n' || jsonb_pretty(jsonb_build_object(
          'kind', 'reference', 'type', v_kind, 'items', v_items, 'matrx_version', 1)) || E'\n```'));
      end if;
      select count(*), jsonb_agg(jsonb_build_object('id', r.id::text) order by x.ord)
        into v_n, v_items
        from jsonb_array_elements(v_list) with ordinality x(e, ord)
        join custom.record r
          on jsonb_typeof(x.e) = 'string'
         and (x.e #>> '{}') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         and r.id = (x.e #>> '{}')::uuid
         and r.data_class = 'record'
         and r.metadata -> 'moved_from' ->> 'table' = 'context.scopes';
      if v_n = v_len then
        return jsonb_build_object('value', to_jsonb(E'```matrx\n' || jsonb_pretty(jsonb_build_object(
          'kind', 'reference', 'type', 'scope', 'items', v_items, 'matrx_version', 1)) || E'\n```'));
      end if;
    end if;
  end if;

  -- 5. ONE FENCE IN A LIST FIELD (lane CONTEXT-PARITY). The current system let an `array` item
  --    hold one string, a ```matrx picklist fence; the copy lands it as a list of one, word for
  --    word (a list Field holds a list). A fence is itself the list of its items, so the agent is
  --    handed the fence exactly as the current system hands it (AI Matrx Features `included_apps`).
  if p_type not in ('relation', 'entity_reference') and jsonb_typeof(v_val) = 'array'
     and jsonb_array_length(v_val) = 1 and jsonb_typeof(v_val -> 0) = 'string'
     and (v_val ->> 0) ~ '^\s*```matrx\s' then
    return jsonb_build_object('value', v_val -> 0);
  end if;

  return jsonb_build_object('value', v_val);
end;
$function$;
