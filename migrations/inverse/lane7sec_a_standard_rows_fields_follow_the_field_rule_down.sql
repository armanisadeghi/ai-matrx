-- chair-step: the inverse of lane7sec_a_standard_rows_fields_follow_the_field_rule.sql. It puts
-- the six bodies back exactly as they were before that file ran, deletes its three
-- platform.client_callable_door rows, revokes the mask_document grant it added, and drops the two functions it created.
-- based-on: custom.entity_record_read(uuid, text, uuid) 34a0944ef8c389aea17486889dc24e92908a97170657efc7c33ea0fd0daca3c7
-- based-on: custom.entity_value_write(uuid, text, uuid, jsonb) 4dfae77bde95b76f5e89b3347ade47cf6fd2067dee32c12bed46bb2973e1b103
-- based-on: custom.entity_records_find(uuid, text, text, jsonb, integer, integer) 76eece255da61d533474d6b11bece2d3b4eb801389819af47e6e37d5e42bffad
-- based-on: custom._entity_custom_fields_guard() 40e0cd49091aea328672d8134f64f19eb36d45469d572e2df091f90771332b98
-- based-on: custom._field_shape_guard() 61b232660f4fb5b016533abb6cc09db7c50c44a1c48cc7753d5c4711f75ea2a8
-- based-on: custom.doors_not_masking_fields() 73b08724426e3e94da5309077b12e3f7239639d951668a1861bcf33ae62e6493

CREATE OR REPLACE FUNCTION custom.entity_record_read(p_organization_id uuid, p_token text, p_record_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  t        record;
  v_row    jsonb;
  v_doc    jsonb;
  v_fields jsonb;
begin
  perform custom.assert_entity_door(p_organization_id, 'custom.entity_record_read');
  select * into t from custom.entity_table(p_token);
  perform custom.assert_entity_is_organization_scoped(t.token, t.label, t.has_organization);

  execute format('select to_jsonb(x) from %I.%I x where x.id = $1 and x.organization_id = $2',
                 t.schema_name, t.table_name)
    into v_row using p_record_id, p_organization_id;

  if v_row is null then
    raise exception 'There is no % you can open with that id in this organization.', t.label
      using errcode = '02000',
            hint = 'DOOR-1: this door reads the row as YOU, through the table''s own access rules - so a row somebody has not shared with you is the same answer as a row that is not there. Ask whoever holds it to share it with you.';
  end if;

  v_doc := v_row -> 'custom_fields';
  if v_doc is null or jsonb_typeof(v_doc) <> 'object' then v_doc := '{}'::jsonb; end if;

  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
           'id', f.id, 'key', f.data ->> 'key', 'label', f.data ->> 'label',
           'type', f.data ->> 'type', 'parity_type', f.data ->> 'parity_type',
           'format', f.data ->> 'format', 'unit', f.data ->> 'unit',
           'multi', f.data -> 'multi', 'required', f.data -> 'required', 'sort', f.data -> 'sort',
           'sensitivity', f.data ->> 'sensitivity',
           'options_table_id', f.data -> 'config' ->> 'options_table_id',
           'relation_target', f.data ->> 'relation_target',
           'value', v_doc -> (f.data ->> 'key'),
           'written', v_doc -> '_values' -> (f.data ->> 'key')))), '[]'::jsonb)
    into v_fields
    from custom.entity_fields(p_organization_id, p_token) f;

  return jsonb_build_object(
    'token', t.token, 'label', t.label, 'type', t.type, 'id', p_record_id,
    'organization_id', p_organization_id,
    'title', case when t.title_column is not null then v_row ->> t.title_column end,
    'columns', v_row - 'custom_fields',
    'custom', v_doc - '_values' - '_retired',
    'custom_written', coalesce(v_doc -> '_values', '{}'::jsonb),
    'fields', v_fields,
    'live', (v_row ->> 'deleted_at') is null);
end
$function$
;

CREATE OR REPLACE FUNCTION custom.entity_value_write(p_organization_id uuid, p_token text, p_record_id uuid, p_patch jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  t     record;
  v_doc jsonb;
  v_key text;
  v_n   int;
begin
  perform custom.assert_entity_door(p_organization_id, 'custom.entity_value_write');
  select * into t from custom.entity_table(p_token);
  perform custom.assert_entity_is_organization_scoped(t.token, t.label, t.has_organization);

  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'A write names the fields it is setting and what to set them to.'
      using errcode = '22023',
            hint = 'Pass {"key": value}. A key set to null clears that value; a key left out is left alone. Nothing was written.';
  end if;

  execute format('select coalesce(x.custom_fields, %L::jsonb) from %I.%I x where x.id = $1 and x.organization_id = $2',
                 '{}', t.schema_name, t.table_name)
    into v_doc using p_record_id, p_organization_id;
  if v_doc is null then
    raise exception 'There is no % you can open with that id in this organization.', t.label
      using errcode = '02000',
            hint = 'DOOR-1 decides reading and writing with the same question: a row you may not open is a row you may not change.';
  end if;
  if jsonb_typeof(v_doc) <> 'object' then v_doc := '{}'::jsonb; end if;

  for v_key in select k from jsonb_object_keys(p_patch) k loop
    if jsonb_typeof(p_patch -> v_key) = 'null' and left(v_key, 1) <> '_' then
      v_doc := v_doc - v_key;
      if jsonb_typeof(v_doc -> '_values') = 'object' then
        v_doc := jsonb_set(v_doc, '{_values}', (v_doc -> '_values') - v_key);
      end if;
    else
      v_doc := jsonb_set(v_doc, array[v_key], p_patch -> v_key, true);
    end if;
  end loop;

  execute format('update %I.%I x set custom_fields = $1 where x.id = $2 and x.organization_id = $3',
                 t.schema_name, t.table_name)
    using v_doc, p_record_id, p_organization_id;
  get diagnostics v_n = row_count;
  if v_n = 0 then
    raise exception 'You can see this %, but it is not yours to change.', t.label
      using errcode = '42501',
            hint = 'DOOR-1: this door writes as YOU, through the table''s own access rules. It would take the editor level, or a share of this row with you. Nothing was written.';
  end if;

  return custom.entity_record_read(p_organization_id, p_token, p_record_id);
end
$function$
;

CREATE OR REPLACE FUNCTION custom.entity_records_find(p_organization_id uuid, p_token text, p_key text, p_value jsonb DEFAULT NULL::jsonb, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  t      record;
  v_rows jsonb;
  v_lim  int := custom.page_size(p_organization_id, 'custom.entity_records_find', p_limit, 50, 500);
begin
  perform custom.assert_entity_door(p_organization_id, 'custom.entity_records_find');
  select * into t from custom.entity_table(p_token);
  perform custom.assert_entity_is_organization_scoped(t.token, t.label, t.has_organization);

  if not exists (select 1 from custom.entity_fields(p_organization_id, p_token) f
                  where f.data ->> 'key' = p_key) then
    raise exception '% has no custom field called "%" in this organization.', t.label, p_key
      using errcode = '23514',
            hint = 'REC-40 / FLD-8: filtering by a field nobody declared would quietly return nothing and look like an empty result. Declare it first, or ask for the fields this table has.';
  end if;

  execute format(
    'select coalesce(jsonb_agg(jsonb_build_object('
    || '''id'', x.id, ''title'', %s, ''value'', x.custom_fields -> $1) order by x.id), ''[]''::jsonb) '
    || 'from (select * from %I.%I y where y.organization_id = $2 '
    ||       'and y.custom_fields ? $1 '
    ||       'and ($3::jsonb is null or y.custom_fields -> $1 = $3) '
    ||       '%s order by y.id limit $4 offset $5) x',
    case when t.title_column is null then 'null::text' else format('x.%I::text', t.title_column) end,
    t.schema_name, t.table_name,
    case when t.has_deleted_at then 'and y.deleted_at is null' else '' end)
    into v_rows using p_key, p_organization_id, p_value, v_lim, greatest(coalesce(p_offset, 0), 0);

  return jsonb_build_object('token', t.token, 'label', t.label, 'key', p_key,
                            'value', p_value, 'rows', v_rows,
                            'count', jsonb_array_length(v_rows),
                            -- PAGE-1. What was asked, what came back, the ceiling, and the
                            -- offset to ask for next. NULL `next` is the end of the data.
                            'page', jsonb_build_object(
                              'requested', v_lim,
                              'returned',  jsonb_array_length(v_rows),
                              'ceiling',   custom.page_ceiling(p_organization_id),
                              'next',      case when jsonb_array_length(v_rows) = v_lim
                                                then greatest(coalesce(p_offset, 0), 0) + v_lim else null end));
end
$function$
;

CREATE OR REPLACE FUNCTION custom.doors_not_masking_fields()
 RETURNS TABLE(function_name text, identity_args text, why text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
  select p.proname::text,
         pg_get_function_identity_arguments(p.oid),
         'a client may execute it, it reaches a RAW value source (custom.record_values, '
         'custom.record_values_of, custom.record_state_as_of, custom.history_changes, '
         'history.row_versions or custom.record directly) and its body never reaches '
         'custom.read_mask or the two doors that already carry it, so a Field this reader '
         'may not see leaves the store'::text
    from pg_proc p
   where p.pronamespace = 'custom'::regnamespace
     and has_function_privilege('authenticated', p.oid, 'EXECUTE')
     and p.prorettype not in ('pg_catalog.trigger'::regtype, 'pg_catalog.event_trigger'::regtype)
     and regexp_replace(pg_get_functiondef(p.oid), '--[^' || chr(10) || ']*', '', 'g')
         ~* '(custom\.record_values(_of)?\M|custom\.record_state_as_of|custom\.history_changes|history\.row_versions|history\.record_versions)'
     and regexp_replace(pg_get_functiondef(p.oid), '--[^' || chr(10) || ']*', '', 'g')
         !~* '(custom\.read_mask|custom\.mask_says_withheld|custom\.read_record\M|custom\.read_records\M|custom\.record_values_versioned)'
   order by 1;
$function$
;

CREATE OR REPLACE FUNCTION custom._entity_custom_fields_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_org     uuid;
  v_token   text := tg_argv[0];
  v_doc     jsonb;
  v_old     jsonb;
  v_actor   text;
  v_obo     text;
  v_fields  custom.record[];
  v_values  jsonb;
  v_keys    text[];
  v_key     text;
  v_refusal text;
  v_open    boolean;
  v_memo_key text;
  v_memo    jsonb;
  v_row     jsonb;
begin
  -- WRITE-PERF-4: `to_jsonb(new)` ONCE. This serialised the whole row twice (three times on
  -- an UPDATE) to read two keys out of it; on a wide standard table that is the row's entire
  -- content, per row, on 643 tables.
  begin
    v_row := to_jsonb(new);
  exception when others then
    v_row := null;
  end;
  -- GUARD-SWITCH (2026-09-19), B1's move, unchanged. This used to read
  -- `custom/entity_custom_fields_guard`, which was false platform-wide with no rung that
  -- could turn any on, so a `custom_fields` document on a standard Entity table was never
  -- validated for anybody. It follows the organization's own store switch: an organization
  -- whose store is OFF answers byte for byte as it does today.
  begin
    v_org := v_row ->> 'organization_id';
  exception when others then
    v_org := null;
  end;
  if v_org is null then
    return new;
  end if;
  -- THE SWITCH, READ BY NAME AND EXACTLY ONCE. This is `custom.store_is_open`'s own body,
  -- spelled out here rather than called: the runner refuses a guarded replacement whose
  -- body never NAMES the knob that is supposed to hold it off (`guardUnreadBy`, ATTACK-6
  -- finding 2), and it is right to — a switch a body never names is a comment. Spelling it
  -- out also keeps this to ONE knob read on a path that now fires on every INSERT into 643
  -- tables, some of them busy. The rule is the store's own and unchanged: a switch this
  -- writer cannot read is CLOSED, never open. While it answers false the row is written
  -- byte for byte as it is today.
  begin
    v_open := custom.store_is_open(v_org);
  exception when others then
    v_open := false;
  end;
  if not v_open then
    return new;
  end if;

  -- A ROW WITH NO CUSTOM FIELDS HAS NONE, AND THAT IS NOT A MALFORMED WRITE.
  -- `crm.party.custom_fields` — the one column that existed before this lane — is NULLABLE
  -- with no default, so `to_jsonb(new) -> 'custom_fields'` is JSON `null`, which `coalesce`
  -- does not catch because it is not SQL NULL. The first version of this guard therefore
  -- refused every INSERT into `crm.party` for a store-ON organization with "this write gives
  -- them as null" — trading one outage for another. Measured from the seat immediately after
  -- that apply, which is why it is a sentence here and not a story.
  -- Absent, SQL NULL and JSON null all mean the same thing and are read as the empty set.
  -- A value that is genuinely the wrong SHAPE — a string, a number, an array — is still
  -- refused by name, which is what that refusal was always for.
  v_doc := v_row -> 'custom_fields';
  if v_doc is null or jsonb_typeof(v_doc) = 'null' then
    v_doc := '{}'::jsonb;
  elsif jsonb_typeof(v_doc) <> 'object' then
    raise exception 'The custom fields of a % are a set of named values, and this write gives them as %.',
      v_token, jsonb_typeof(v_doc)
      using errcode = '22023',
            hint = 'REC-40: custom_fields is one jsonb object per row - {"key": value}. Nothing was written.';
  end if;
  v_old := case when tg_op = 'UPDATE' then to_jsonb(old) -> 'custom_fields' else null end;
  if v_old is null or jsonb_typeof(v_old) = 'null' then
    v_old := '{}'::jsonb;
  end if;

  -- A WRITE THAT CHANGES NO CUSTOM VALUE ASSERTS NOTHING AND HAS NO AUTHOR TO RECORD. This
  -- is `custom._value_envelope`'s own rule, for the same reason: an UPDATE touching only the
  -- row's real columns must not re-author values nobody touched.
  if tg_op = 'UPDATE' and v_old is not distinct from v_doc then
    return new;
  end if;

  -- 1. THE DEFINITIONS DECIDE. FLD-8: the Fields of a STANDARD table are the field-kernel
  -- records carrying this table's registry token, and there is no per-table list anywhere.
  --
  -- WRITE-PERF-3, 2026-09-22: READ ONCE PER STATEMENT, NOT TWICE PER ROW. This block used to
  -- run the SAME index query over `custom.record` twice for every row written — once inside
  -- `custom.validate_custom_fields`, whose whole body is that query plus
  -- `custom.validate_values`, and once again here for the envelope. The Fields of a standard
  -- table are a fact about the TABLE, so the answer is now read once per (organization, token)
  -- into WRITE-PERF-3's transaction-local memo and both readers use it. Measured on the main
  -- database: this trigger cost 185 ms of one 250-row insert into `custom.record`, for 250
  -- rows that carry no custom fields at all.
  --
  -- IT CANNOT GO STALE. The memo is a GUC set with `is_local => true`, dies with the
  -- transaction, is scoped to the seat by `platform.memo_b_seat()`, and `custom.record` — the
  -- one table this query reads — carries `_aa_memo_clear`
  -- (`platform.memo_clear_on_structure_row`, BEFORE ROW, so a Field written EARLIER IN THE
  -- SAME STATEMENT empties it before this reader is served) and `zz_memo_clear_i/_u/_d`.
  v_memo_key := 'scf:' || v_org::text || ':' || v_token;
  v_memo     := platform.memo_k_get(v_memo_key)::jsonb;
  if v_memo is null then
    select coalesce(jsonb_agg(to_jsonb(f)), '[]'::jsonb) into v_memo
      from custom.record f
     where f.organization_id = v_org
       and f.table_id = custom.field_kernel_id()
       and f.deleted_at is null
       and f.data ->> 'table_token' = v_token;
    perform platform.memo_k_put(v_memo_key, v_memo::text);
  end if;
  select array_agg(q) into v_fields
    from jsonb_populate_recordset(null::custom.record, v_memo) q;

  -- `custom.validate_custom_fields`'s own body, character for character, with the read it
  -- would have repeated handed to it. The function itself is untouched: every other caller
  -- keeps it exactly as it is.
  if v_fields is not null then
    perform custom.validate_values(v_org, v_fields, coalesce(v_doc, '{}'::jsonb), null);
  end if;

  -- NOTHING DECLARED, NOTHING TO ENVELOPE. An organization that has added no custom field to
  -- this table gets exactly the document it wrote, byte for byte, as it does with the store
  -- off. Opening an envelope over a document with no Fields would invent provenance for
  -- values no Field describes.
  if v_fields is null then
    return new;
  end if;

  -- 2. THE CEILING, over what the writer supplied, before anything else touches it.
  v_refusal := custom.size_refusal(v_org, v_doc);
  if v_refusal is not null then
    raise exception '%', v_refusal
      using errcode = '23514',
            hint = 'The ceilings are custom/value_max_bytes and custom/document_max_bytes - organization-settable knobs with published defaults, not constants.';
  end if;

  -- 3. WHO WROTE IT (VAL-2 / AGT-N-4), the same two arms `custom._value_envelope` asks.
  v_actor := custom.actor_word(v_doc ->> '_actor');
  v_obo   := nullif(btrim(coalesce(v_doc ->> '_on_behalf_of', '')), '');
  if v_obo is not null and v_actor <> 'agent' then
    raise exception 'This write says it is on behalf of somebody, and its author is a %. Only an agent acts on behalf of a person.', v_actor
      using errcode = '22023';
  end if;
  if v_actor = 'agent' and v_obo is null then
    raise exception 'This write says an agent wrote it, and does not say who the agent is acting for. An agent always acts on behalf of a person.'
      using errcode = '22004',
            hint = 'Put "_on_behalf_of" in the custom fields with that person''s id.';
  end if;
  v_doc := v_doc - '_actor' - '_on_behalf_of';

  -- 4. THE ENVELOPE, over the declared Fields and never over anything else.
  v_values := coalesce(v_doc -> '_values', '{}'::jsonb);
  if jsonb_typeof(v_values) <> 'object' then
    v_values := '{}'::jsonb;       -- the envelope law below refuses the malformed block by name
  end if;
  select coalesce(array_agg(f.data ->> 'key'), '{}'::text[]) into v_keys from unnest(v_fields) f;
  foreach v_key in array v_keys loop
    if v_key is not null and v_doc ? v_key and not (v_values ? v_key) then
      v_values := v_values || jsonb_build_object(v_key, '{}'::jsonb);
    end if;
  end loop;
  if v_values <> '{}'::jsonb or v_doc ? '_values' then
    v_doc := jsonb_set(v_doc, '{_values}', v_values);
  end if;
  v_doc := custom.stamp_value_envelopes(v_doc, v_actor, v_obo, now());
  v_doc := custom.value_versions(v_old, v_doc);

  v_refusal := custom.value_envelope_refusal(v_doc);
  if v_refusal is not null then
    raise exception '%', v_refusal
      using errcode = '23514',
            hint = 'VAL-1..VAL-8: a value carries its source, its author, its reason for being missing and its other candidates, beside it in this row''s custom fields.';
  end if;
  perform custom.validate_value_envelope(v_org, v_fields, v_doc);

  new.custom_fields := v_doc;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION custom._field_shape_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_names_bad text;   -- SC-R: the kinds an entity reference names that no record may point at
  d           jsonb := new.data;
  v_type      text;
  v_key       text;
  v_label     text;
  v_edef      uuid;
  v_token     text;
  v_opts      uuid;
  v_display   text;
  v_source    text;
  v_names     text[];
  v_rule      jsonb;
  v_kind      text;
  v_example   text;
  v_archived  text;   -- UI-FIX-19: the name of an archived choices table
begin
  -- THE DOOR. One call to the ONE predicate (`custom.assert_store_door`), which
  -- judges `custom.caller_role()` - the identity the caller actually held - and not
  -- `current_user`, which a SECURITY DEFINER door has already rewritten to itself.
  -- The switch never removes a check: everything below runs exactly as before.
  perform custom.assert_store_door(new.organization_id, 'custom.record');


  -- A RETIREMENT IS NOT A CHANGE OF SHAPE (the shared rule DOOR-FIX and TABLE-DELETE built,
  -- now asked as ONE question). The only change in this update is `deleted_at` going from
  -- nothing to a time: the document is byte-for-byte what it was, so there is no new shape
  -- to judge. This is what lets a dependent field retire in the SAME operation as the
  -- relation it reads through - the sweep, the cascade and the door all arrive here.
  if tg_op = 'UPDATE'
     and custom.is_a_retirement(old.deleted_at, new.deleted_at,
                                old.data, new.data,
                                old.table_id, new.table_id,
                                old.organization_id, new.organization_id,
                                old.data_class, new.data_class) then
    return new;
  end if;

  -- Only field definitions. A `kernel` row is the kernel Table `Field` itself (REC-27:
  -- defined in code, not data) and is exempt, exactly as W1-TABLE exempts the kernel Tables.
  if new.table_id is distinct from custom.field_kernel_id() or new.data_class = 'kernel' then
    return new;
  end if;

  v_label := nullif(d ->> 'label', '');
  v_key   := d ->> 'key';
  if v_key is null or v_key !~ '^[a-z][a-z0-9_]*$' then
    raise exception 'a field needs a key made of lower-case letters, digits and underscores, and this one says %',
                    custom.said(v_key, 'nothing')
      using errcode = '23514', hint = 'FLD-13: key.';
  end if;
  if v_label is null then
    raise exception 'the field % needs a label - it is what a person reads', v_key
      using errcode = '23514', hint = 'FLD-13: label.';
  end if;

  -- FLD-8 / FLD-13: ONE definitions surface for standard and custom tables alike. Exactly
  -- one of the two identifiers, never both and never neither — which is what makes it one
  -- surface rather than two tables sharing a name.
  v_edef  := nullif(d ->> 'entity_definition_id', '')::uuid;
  v_token := nullif(d ->> 'table_token', '');
  if (v_edef is null) = (v_token is null) then
    raise exception 'the field % has to say what it is a field OF - a custom table or a standard one, and exactly one of them',
                    v_label
      using errcode = '23514',
            hint = 'FLD-8 / FLD-13: entity_definition_id names a custom Table record; table_token names a standard table''s registry token. One definitions table holds both, so exactly one of the two is set.';
  end if;
  if v_token is not null
     and not exists (select 1 from platform.entity_types e
                      where e.token = v_token and e.is_active) then
    raise exception 'the field % says it belongs to a standard table called %, and no such table is registered',
                    v_label, v_token
      using errcode = '23514', hint = 'FLD-8: table_token names a live platform.entity_types token.';
  end if;

  -- FLD-1: exactly ONE behavior, from a CLOSED set. An array is refused by name, so
  -- "exactly one" is unrepresentable rather than merely unwritten.
  if jsonb_typeof(d -> 'type') = 'array' then
    raise exception 'the field % has more than one behavior, and a field has exactly one', v_label
      using errcode = '23514',
            hint = 'FLD-1: one of list, range, text, relation, formula, boolean. What looks like a second behavior is a modifier (FLD-2) or a Rule (FLD-3).';
  end if;
  v_type := d ->> 'type';
  -- LIMITS-FIX 2026-09-21: `boolean` joins the closed set. It is a BEHAVIOUR and not a
  -- format on something else, because a tick box has THREE answers — ticked, unticked, and
  -- nobody has said — and only a behaviour of its own can hold a real boolean while an
  -- absent key keeps meaning "never asked" (VAL-2).
  if v_type is null or v_type not in ('list', 'range', 'text', 'relation', 'formula', 'boolean') then
    raise exception 'the field % says its behavior is %, and a field behaves as a list, a range, text, a relation, a formula or a tick box',
                    v_label, custom.said(v_type, 'nothing')
      using errcode = '23514', hint = 'FLD-1: the set is closed.';
  end if;

  -- FLD-2: modifiers are SEPARATE from behavior. Three distinct stored keys.
  if jsonb_typeof(d -> 'multi') is distinct from 'boolean' then
    raise exception 'the field % has to say whether it holds one value or many', v_label
      using errcode = '23514', hint = 'FLD-2: multi is a modifier, never a behavior of its own.';
  end if;
  if jsonb_typeof(d -> 'dated') is distinct from 'boolean' then
    raise exception 'the field % has to say whether its values are dated', v_label
      using errcode = '23514', hint = 'FLD-2: dated is a modifier, never a behavior of its own.';
  end if;
  if jsonb_typeof(d -> 'rules') is distinct from 'array' then
    raise exception 'the field % has to carry its rules as a list, even an empty one', v_label
      using errcode = '23514', hint = 'FLD-2 / FLD-3: any number of attached validation Rules.';
  end if;

  -- FLD-3: a constraint is a Rule, not a behavior — and not a config key either. This is
  -- the only shape in which the law can actually be broken, so it is the shape refused.
  for v_rule in select r from jsonb_array_elements(d -> 'rules') r loop
    v_kind := v_rule ->> 'kind';
    -- STORE-T / B1: `unique` joins the set. It is not judged here — a shape guard sees one
    -- row and uniqueness is a statement about the OTHERS — it is carried out by
    -- custom._unique_rule_holds, which is a trigger and can take the lock that makes it true
    -- under concurrency. A kind this store cannot execute is still refused by name.
    if v_kind is null or v_kind not in ('min', 'max', 'pattern', 'length', 'equals_field', 'differs_from_field', 'unique') then
      raise exception 'the field % carries a rule of kind %, which this validator cannot execute',
                      v_label, custom.said(v_kind, 'nothing')
        using errcode = '23514',
              hint = 'FLD-3: an attached validation Rule declares its kind. The general Rule object, its versions and its four uses are W1-RULE''s (REC-15, REC-17, REC-19).';
    end if;

    -- ── STORE-RULE-GAPS (1), 2026-09-23: A PATTERN SAYS HOW TO WRITE IT. ─────────────────
    -- The older grid's `patternHint`: "949-555-0142" beside a phone pattern, so a person who is
    -- refused is shown the shape rather than told only that theirs is wrong. It belongs to the
    -- pattern Rule (it is an example OF that pattern), it is judged here once, and an example
    -- that its own pattern would refuse is refused - a hint that is wrong is worse than none.
    if v_rule ? 'example' and jsonb_typeof(v_rule -> 'example') <> 'null' then
      if v_kind <> 'pattern' then
        raise exception 'the field % shows an example on its % rule, and only a pattern rule has an example to show',
                        v_label, v_kind
          using errcode = '23514',
                hint = 'FLD-3: example belongs to a pattern Rule - {"kind":"pattern","value":"<pattern>","example":"<how a person writes it>"}.';
      end if;
      v_example := case when jsonb_typeof(v_rule -> 'example') = 'string' then btrim(v_rule ->> 'example') end;
      if v_example is null or v_example = '' then
        raise exception 'the field % gives an example of how to write it, and an example is the words a person would type',
                        v_label
          using errcode = '23514', hint = 'FLD-3: example is a short piece of text, like 949-555-0142.';
      end if;
      if length(v_example) > 120 then
        raise exception 'the field % gives an example that is % characters long, and an example is at most 120',
                        v_label, length(v_example)
          using errcode = '23514', hint = 'FLD-3: an example shows the shape of one value, not a paragraph about it.';
      end if;
      if v_example !~ (v_rule ->> 'value') then
        raise exception 'the field % shows "%" as the way to write it, and its own pattern would refuse that',
                        v_label, v_example
          using errcode = '23514',
                hint = 'FLD-3: the example has to pass the pattern it illustrates. Change the example, or the pattern.';
      end if;
    end if;

    -- ── STORE-RULE-GAPS (3), 2026-09-23: A LENGTH HAS A SHORTEST AS WELL AS A LONGEST. ──
    -- The older grid's `minLength`. `value` stays the longest (every stored rule already means
    -- that), `min` is the shortest, and a length rule says at least one of the two. Both are
    -- whole numbers of characters; a shortest past the longest could never be met.
    if v_rule ? 'min' and jsonb_typeof(v_rule -> 'min') <> 'null' and v_kind <> 'length' then
      raise exception 'the field % gives its % rule a shortest length, and only a length rule has one',
                      v_label, v_kind
        using errcode = '23514',
              hint = 'FLD-3: {"kind":"length","min":<shortest>,"value":<longest>} - min is the fewest characters, value the most.';
    end if;
    if v_kind = 'length' then
      if coalesce(v_rule ->> 'value', '') = '' and coalesce(v_rule ->> 'min', '') = '' then
        raise exception 'the field % has a length rule that says neither how short nor how long a value may be',
                        v_label
          using errcode = '23514',
                hint = 'FLD-3: a length rule carries min (the fewest characters), value (the most), or both.';
      end if;
      if coalesce(v_rule ->> 'value', '') <> '' and (v_rule ->> 'value') !~ '^[0-9]+$' then
        raise exception 'the field % says a value may be at most % characters long, and that is not a whole number',
                        v_label, v_rule ->> 'value'
          using errcode = '23514', hint = 'FLD-3: value is the most characters, as a whole number.';
      end if;
      if coalesce(v_rule ->> 'min', '') <> '' and (v_rule ->> 'min') !~ '^[0-9]+$' then
        raise exception 'the field % says a value has to be at least % characters long, and that is not a whole number',
                        v_label, v_rule ->> 'min'
          using errcode = '23514', hint = 'FLD-3: min is the fewest characters, as a whole number.';
      end if;
      if coalesce(v_rule ->> 'value', '') <> '' and coalesce(v_rule ->> 'min', '') <> ''
         and (v_rule ->> 'min')::bigint > (v_rule ->> 'value')::bigint then
        raise exception 'the field % has to be at least % characters and at most %, and nothing is both',
                        v_label, v_rule ->> 'min', v_rule ->> 'value'
          using errcode = '23514', hint = 'FLD-3: the shortest length cannot be more than the longest.';
      end if;
    end if;
  end loop;
  if d -> 'config' ?| array['min', 'max', 'pattern', 'length', 'required_if', 'validation', 'constraint'] then
    raise exception 'the field % writes a constraint into its behavior, and a constraint is a Rule', v_label
      using errcode = '23514',
            hint = 'FLD-3: move it into rules, where it is an attached validation Rule with a kind.';
  end if;

  -- FLD-N-1: unit and format change what a value MEANS, so they live on the Field and reach
  -- the agent''s context. Only layout, colour and conditional formatting are presentation —
  -- and a presentation blob carrying either is the one way this law actually fails.
  if d -> 'presentation' ?| array['unit', 'format'] then
    raise exception 'the field % puts its unit or its format in presentation, and those change what the value MEANS',
                    v_label
      using errcode = '23514',
            hint = 'FLD-N-1: unit and format are the Field''s own columns and reach the agent''s context; presentation carries layout, colour and conditional formatting.';
  end if;
  if d ? 'unit' and jsonb_typeof(d -> 'unit') not in ('string', 'null') then
    raise exception 'the field % has to say its unit as a word', v_label
      using errcode = '23514', hint = 'FLD-N-1: unit.';
  end if;
  if d ? 'format' and jsonb_typeof(d -> 'format') not in ('string', 'null') then
    raise exception 'the field % has to say its format as a word', v_label
      using errcode = '23514', hint = 'FLD-N-1: format.';
  end if;

  -- FLD-7: where the value comes from.
  v_source := d ->> 'source';
  if v_source is null or v_source not in ('manual', 'formula', 'agent', 'synced') then
    raise exception 'the field % says its values come from %, and a field is filled in by hand, computed, written by an agent, or synced from somewhere else',
                    v_label, custom.said(v_source, 'nothing')
      using errcode = '23514', hint = 'FLD-7: manual, formula, agent, synced.';
  end if;

  -- FLD-9: a Formula declares whether it computes on read or on write — and only a formula
  -- may declare it, or the choice stops meaning anything.
  if v_type = 'formula' or v_source = 'formula' then
    if coalesce(d ->> 'compute_on', '') not in ('read', 'write') then
      raise exception 'the formula % has to say whether it works out its answer when somebody reads it or when somebody saves',
                      v_label
        using errcode = '23514', hint = 'FLD-9: compute_on is read or write.';
    end if;
  elsif d ? 'compute_on' and jsonb_typeof(d -> 'compute_on') <> 'null' then
    raise exception 'the field % is not a formula, so it has nothing to work out', v_label
      using errcode = '23514', hint = 'FLD-9: compute_on belongs to a formula and to nothing else.';
  end if;

  -- FLD-5 / FLD-6: a list field''s options are the records of a Table with display: list.
  if v_type = 'list' then
    v_opts := nullif(d -> 'config' ->> 'options_table_id', '')::uuid;
    if v_opts is null then
      raise exception 'the list field % has to say which table its choices come from', v_label
        using errcode = '23514',
              hint = 'FLD-5 / FLD-6: every pick-list is already a Table, so a list field names one rather than carrying an enum.';
    end if;
    select t.data ->> 'display' into v_display
      from custom.record t
     where t.organization_id = new.organization_id
       and t.id = v_opts
       and t.table_id = custom.table_kernel_id()
       and t.deleted_at is null;
    if v_display is null then
      -- UI-FIX-19 (VERIFIER-19 #4): A CHOICES TABLE THAT IS ARCHIVED IS NAMED, WITH ITS WAY BACK.
      -- Rooms and its Status choices were archived separately; bringing Rooms back refused with
      -- "points at something that is not a table of this organization", which is false (it is
      -- this organization's table, only archived) and names no fix. Now the refusal names the
      -- archived table and says to bring it back first.
      select coalesce(nullif(btrim(t.data ->> 'name'), ''), 'its choices table') into v_archived
        from custom.record t
       where t.organization_id = new.organization_id
         and t.id = v_opts
         and t.table_id = custom.table_kernel_id()
         and t.deleted_at is not null;
      if v_archived is not null then
        raise exception 'the list field % takes its choices from "%", which is archived - bring "%" back first, then bring this back', v_label, v_archived, v_archived
          using errcode = '23514',
                hint = 'FLD-5: a list field''s choices come from a live Table. "Bring it back" on the archived choices table, in the organization''s archive, restores it.';
      end if;
      raise exception 'the list field % points at something that is not a table of this organization', v_label
        using errcode = '23514', hint = 'FLD-5: options_table_id names a Table record.';
    end if;
    if v_display <> 'list' then
      raise exception 'the list field % takes its choices from a table that shows its records as a page, not as a list',
                      v_label
        using errcode = '23514',
              hint = 'FLD-5: a category is a Record of a Table with display: list. A table that grew up (T4) keeps serving the fields that already point at it — this refusal is about DECLARING a new one.';
    end if;
  elsif d -> 'config' ? 'options_table_id' then
    raise exception 'the field % is not a list, so it has no choices to take from a table', v_label
      using errcode = '23514', hint = 'FLD-1 / FLD-5.';
  end if;

  -- ── STORE-RULE-GAPS (2), 2026-09-23: A CHOICE LIST MAY TAKE OTHER VALUES. ───────────────
  -- The older grid's `allowOther`, as the column's own setting: when it is on, a value that is
  -- none of the choices is ADDED to the list as it was typed (custom._resolve_choice_words)
  -- instead of refused. Absent means off, which is what every column declared before today
  -- means. It is a list's setting and nothing else's.
  if d -> 'config' ? 'allow_other' and jsonb_typeof(d -> 'config' -> 'allow_other') <> 'null' then
    if jsonb_typeof(d -> 'config' -> 'allow_other') <> 'boolean' then
      raise exception 'the field % has to say whether it takes values that are not one of its choices as yes or no, and it says %',
                      v_label, d -> 'config' ->> 'allow_other'
        using errcode = '23514', hint = 'FLD-5: allow_other is true or false.';
    end if;
    if v_type <> 'list' then
      raise exception 'the field % is not a choice list, so there is no list for other values to join', v_label
        using errcode = '23514', hint = 'FLD-5: allow_other belongs to a list field.';
    end if;
  end if;

  -- FLD-12 / FLD-13: the relation properties, and they belong to a relation.
  if v_type = 'relation' then
    -- SC-R / P12: an ENTITY REFERENCE says what it points at with config.allowed_types — the
    -- platform kinds it may name — and target mode `any` (REL-8), instead of one Table. Every
    -- kind it names is one custom.entity_reference_kinds() lists, and it names no Table too.
    if jsonb_typeof(d -> 'config' -> 'allowed_types') = 'array' then
      if jsonb_array_length(d -> 'config' -> 'allowed_types') = 0 then
        raise exception 'the field % points at things on the platform and names no kind of thing', v_label
          using errcode = '23514', hint = 'SC-R / P12: config.allowed_types lists the kinds, from custom.entity_reference_kinds().';
      end if;
      if coalesce(d -> 'config' ->> 'target_mode', '') <> 'any' then
        raise exception 'the field % points at things on the platform, so its target mode is any', v_label
          using errcode = '23514', hint = 'SC-R / P12 / REL-8: an entity reference is polymorphic; config.allowed_types is what restricts it.';
      end if;
      if nullif(d ->> 'relation_target', '') is not null then
        raise exception 'the field % points at things on the platform, so it names no Table as well', v_label
          using errcode = '23514', hint = 'SC-R / P12: a column points at the records of a Table (relation_target) or at platform things (config.allowed_types), never both.';
      end if;
      select string_agg(x #>> '{}', ', ' order by x #>> '{}') into v_names_bad
        from jsonb_array_elements(d -> 'config' -> 'allowed_types') x
       where jsonb_typeof(x) <> 'string'
          or not exists (select 1 from custom.entity_reference_kinds() k where k.token = x #>> '{}');
      if v_names_bad is not null then
        raise exception 'the field % points at %, and a record cannot point at that kind of thing', v_label, v_names_bad
          using errcode = '23514',
                hint = case when v_names_bad ~ '(^|, )(file)(,|$)'
                            then 'SC-R / P12: a file is a File column (an attachment — a relation to the kernel File Table), not an entity reference. The kinds are custom.entity_reference_kinds().'
                            when v_names_bad ~ '(^|, )(user|person|user_profile)(,|$)'
                            then 'SC-R / P12: a person is a Person column (a relation to the kernel Person Table), not an entity reference. The kinds are custom.entity_reference_kinds().'
                            else 'SC-R / P12: the kinds a record may point at are custom.entity_reference_kinds(). Nothing was written.' end;
      end if;
    elsif nullif(d ->> 'relation_target', '') is null then
      raise exception 'the relation field % has to say what it points at', v_label
        using errcode = '23514', hint = 'FLD-13: relation_target.';
    end if;
    if coalesce((d ->> 'relation_max')::integer, 0) < 1 then
      raise exception 'the relation field % has to say how many things it can point at, and it is at least one',
                      v_label
        using errcode = '23514', hint = 'FLD-13: relation_max, where 1 is a foreign key.';
    end if;
    if coalesce(d ->> 'on_target_delete', '') not in ('cascade', 'set_null', 'restrict') then
      raise exception 'the relation field % has to say what happens to it when the thing it points at is deleted',
                      v_label
        using errcode = '23514', hint = 'FLD-13: on_target_delete is cascade, set_null or restrict.';
    end if;
  elsif d ?| array['relation_target', 'relation_max', 'on_target_delete', 'inverse_key']
        and (nullif(d ->> 'relation_target', '') is not null
             or nullif(d ->> 'relation_max', '') is not null
             or nullif(d ->> 'on_target_delete', '') is not null
             or nullif(d ->> 'inverse_key', '') is not null) then
    raise exception 'the field % is not a relation, so it has no relation properties', v_label
      using errcode = '23514', hint = 'FLD-13: relation_target, relation_max, on_target_delete and inverse_key belong to a relation.';
  end if;

  -- FLD-12: the four properties the live system declares and enforces nowhere.
  if coalesce(d ->> 'sensitivity', '') not in ('public', 'internal', 'confidential', 'restricted') then
    raise exception 'the field % has to say how sensitive its values are, and it says %',
                    v_label, custom.said(d ->> 'sensitivity', 'nothing')
      using errcode = '23514', hint = 'FLD-12: sensitivity is public, internal, confidential or restricted.';
  end if;
  if coalesce(d ->> 'context_policy', '') not in ('include', 'summarize', 'exclude', 'on_request') then
    raise exception 'the field % has to say whether an agent may see its values, and it says %',
                    v_label, custom.said(d ->> 'context_policy', 'nothing')
      using errcode = '23514', hint = 'FLD-12: context_policy is include, summarize, exclude or on_request.';
  end if;
  if d ? 'review_interval_days' and jsonb_typeof(d -> 'review_interval_days') = 'number'
     and (d ->> 'review_interval_days')::numeric <= 0 then
    raise exception 'the field % says it is reviewed every % days, and a review interval is at least one day',
                    v_label, d ->> 'review_interval_days'
      using errcode = '23514', hint = 'FLD-12: review_interval_days.';
  end if;
  if jsonb_typeof(d -> 'depends_on') is distinct from 'array' then
    raise exception 'the field % has to list what it depends on, even when the list is empty', v_label
      using errcode = '23514', hint = 'FLD-12: depends_on.';
  end if;

  -- FLD-10: which record types this field applies to.
  if jsonb_typeof(d -> 'applies_to_types') is distinct from 'array' then
    raise exception 'the field % has to say which kinds of record it applies to, even when that is all of them',
                    v_label
      using errcode = '23514', hint = 'FLD-10: applies_to_types, empty meaning every kind.';
  end if;

  -- ONE SOURCE OF TRUTH, both ways. A custom Table declares WHICH fields it has (REC-1,
  -- W1-TABLE''s guard); this record declares WHAT one of them is. They can never disagree,
  -- because a definition for a field the Table never declared is refused here by name.
  -- DATA-V2-BASICS, 2026-09-27: A RETIRED COLUMN IS NOT DECLARED, BY DESIGN. Retiring a column takes
  -- its name off the Table's list, so any later write to the retired row (a press that points older
  -- tables at their copies, a carry, a restamp) was refused "the table does not declare a field called
  -- referral_source" — measured: Harbor Dental's Data tables press rolled back whole at 18:41 UTC over
  -- one column somebody added to a copy and removed again. The check is for columns that are LIVE.
  if v_edef is not null and new.deleted_at is null then
    select array_agg(f ->> 'name') into v_names
      from custom.record t, jsonb_array_elements(coalesce(t.data -> 'fields', '[]'::jsonb)) f
     where t.organization_id = new.organization_id
       and t.id = v_edef
       and t.table_id = custom.table_kernel_id()
       and t.deleted_at is null;
    if v_names is null then
      raise exception 'the field % says it belongs to a table this organization does not have', v_label
        using errcode = '23514', hint = 'FLD-8: entity_definition_id names a Table record of the same organization.';
    end if;
    if not (v_key = any (v_names)) then
      raise exception 'the table does not declare a field called % - declare it there first', v_key
        using errcode = '23514',
              hint = 'REC-1 / FLD-8: a Table declares its fields and custom.field defines them. A definition for a field the table never declared would be a second source of truth.';
    end if;
  end if;

  return new;
end;
$function$;

DELETE FROM platform.client_callable_door
 WHERE schema_name = 'custom' AND function_name IN ('entity_seat_level', 'entity_read_mask', 'mask_document')
   AND declared_by = 'migrations/campaign/lane7sec_a_standard_rows_fields_follow_the_field_rule.sql';
REVOKE EXECUTE ON FUNCTION custom.mask_document(jsonb, text[], jsonb, boolean, jsonb, text[]) FROM authenticated;
DROP FUNCTION IF EXISTS custom.entity_seat_level(uuid, text, uuid);
DROP FUNCTION IF EXISTS custom.entity_read_mask(uuid, text, permission_level, text);
