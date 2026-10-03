-- chair-step: the inverse of lane7sec_r2_an_archived_field_never_blocks_a_row.sql. It puts the three bodies back
-- exactly as production held them before that file ran. No table, trigger or grant change.
-- based-on: custom.validate_value_envelope(uuid, custom.record[], jsonb) 92f351888a258249fbc3e8bf3601b92fb0807ecf7b1243382e1d68bfc9a18b04
-- based-on: custom._entity_custom_fields_guard() 102ef124e89fa9368f4099c84fef1b83e6e405b36e050911c33de1cf29f616f8
-- based-on: custom._field_shape_guard() e63f8891325e414862f62a2f2b506629bb2cbaf6f4be527b6352beddd8caf2ae

CREATE OR REPLACE FUNCTION custom.validate_value_envelope(p_organization_id uuid, p_fields custom.record[], p_data jsonb)
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_keys  text[];
  v_key   text;
  v_alt   jsonb;
  v_table text;
  f       custom.record;
begin
  if coalesce(jsonb_typeof(p_data -> '_values'), '') <> 'object' then
    return;
  end if;
  select array_agg(x.data ->> 'key') into v_keys from unnest(p_fields) x;
  select min(x.data ->> 'entity_definition_id') into v_table from unnest(p_fields) x;

  for v_key in select k from jsonb_object_keys(p_data -> '_values') k loop
    if not (v_key = any (coalesce(v_keys, array[]::text[]))) then
      -- A RETIRED Field of this table: its envelope is the column's history, kept, never judged.
      if v_table is not null and exists (
           select 1 from custom.record r
            where r.organization_id = p_organization_id
              and r.table_id = custom.field_kernel_id()
              and r.deleted_at is not null
              and r.data ->> 'entity_definition_id' = v_table
              and r.data ->> 'key' = v_key) then
        continue;
      end if;
      raise exception 'This record carries where "%" came from, and this table has no field called "%". Provenance nobody can read is worse than none.', v_key, v_key
        using errcode = '23514', hint = 'VAL-1: every value envelope belongs to a declared Field of this table.';
    end if;
    -- VAL-3: an alternate is a candidate for the SAME field, so it is the same kind of
    -- value. An alternate nobody could promote is not an alternate.
    -- `select * into`, never `select x into`: `unnest()` over an array of a composite type
    -- EXPANDS it into columns, so `x` is the whole row and plpgsql would assign it to the
    -- first field — `id uuid` — and refuse the composite's text as a uuid.
    select * into f from unnest(p_fields) x where x.data ->> 'key' = v_key limit 1;
    for v_alt in select value from jsonb_array_elements(
                   coalesce(p_data -> '_values' -> v_key -> 'alternates', '[]'::jsonb)) loop
      if jsonb_typeof(v_alt -> 'value') is not null and jsonb_typeof(v_alt -> 'value') <> 'null' then
        perform custom.validate_values(p_organization_id, array[f],
                                       jsonb_build_object(v_key, v_alt -> 'value'), null);
      end if;
    end loop;
  end loop;
end;
$function$;

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
  -- LANE7-SEC: the person this write is for, and the field rule asked of it.
  v_me       uuid := auth.uid();
  v_bad      text[];
  v_list     text;
  v_label    text;
  v_sess     text;
  v_decl     text;
  v_needs    text;
  v_closed   boolean;
  v_declared text[];
  v_f        custom.record;
  v_ok       text;
  v_admin    text;
  v_hdr      text;
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

  -- LANE7-SEC (2026-10-02, round 1, CHAIR-SEC-R1). THE FIELD RULE, ON EVERY WRITE PATH.
  -- This door, entity_value_write, a direct supabase update, a server job and the service role
  -- all arrive here, and only when `custom_fields` actually changed (the no-change return above).
  -- Only a key THIS write added and the row did not already carry is judged: a legacy key stays
  -- editable, and clearing a key is always allowed. The store's own keys are named, never guessed
  -- by prefix: `_values` (each value's envelope), `_actor` and `_on_behalf_of` (read and removed
  -- below). A value's envelope under `_values` needs its Field too.
  --   · a CLIENT (custom.caller_role() authenticated / anon) on a table the organization's
  --     custom/closed_custom_field_tables knob names is refused, in a sentence, and nothing is written;
  --   · every other writer keeps the key, and a NOTICE names it — never silent.
  select coalesce(array_agg(f.data ->> 'key'), '{}'::text[]) into v_declared
    from unnest(coalesce(v_fields, '{}'::custom.record[])) f;
  select coalesce(array_agg(distinct k order by k), '{}'::text[]) into v_bad
    from (select k from jsonb_object_keys(v_doc) k
           where k <> all (array['_values', '_actor', '_on_behalf_of'])
             and not (v_old ? k)
          union all
          select k from jsonb_object_keys(case when jsonb_typeof(v_doc -> '_values') = 'object'
                                               then v_doc -> '_values' else '{}'::jsonb end) k
           where not coalesce((v_old -> '_values') ? k, false)) c
   where not (k = any (v_declared));
  if cardinality(v_bad) > 0 then
    v_memo := platform.memo_k_get('sccl:' || v_org::text || ':' || v_token);
    if v_memo is null then
      begin
        v_closed := coalesce(platform.knob_resolve('custom', 'closed_custom_field_tables', v_org) ? v_token, false);
      exception when others then
        v_closed := true;   -- a shape rule this writer cannot read is closed for a client, never open
      end;
      perform platform.memo_k_put('sccl:' || v_org::text || ':' || v_token, to_jsonb(v_closed)::text);
    else
      v_closed := (v_memo #>> '{}')::boolean;
    end if;
    select e.label into v_label from custom.entity_table(v_token) e;
    select string_agg(format('"%s"', x), ', ' order by x) into v_list from unnest(v_bad) x;
    if v_closed and coalesce(custom.caller_role()::text, '') in ('authenticated', 'anon') then
      if exists (select 1 from unnest(v_bad) x where left(x, 1) = '_') then
        raise exception '% keeps its own bookkeeping only under "_values", "_actor" and "_on_behalf_of", so % cannot be stored and nothing was written.',
                        coalesce(v_label, v_token), v_list
          using errcode = '23514',
                hint = 'LANE7-SEC: a key that starts with _ is the store''s own; name a value by its field''s key.';
      end if;
      raise exception '% has no field called %, so there is nowhere to keep %; adding a field is an owner''s or an admin''s to do.',
                      coalesce(v_label, v_token), v_list,
                      case when cardinality(v_bad) = 1 then 'that value' else 'those values' end
        using errcode = '23514',
              hint = 'REC-1 / REC-51: a value with no field is a value nobody will ever see. Declare the field first (custom.entity_field_declare). Nothing was written.';
    end if;
    raise notice '% has no field called %; kept as written, and no field shows it until one is declared.',
                 coalesce(v_label, v_token), v_list
      using hint = 'LANE7-SEC: custom._entity_custom_fields_guard keeps an undeclared key from the platform''s own writers and on open tables.';
  end if;

  -- (c) A PERSON CHANGES ONLY THE FIELDS SHE MAY EDIT (DOOR-3), asked through the same
  --     iam.may_touch_field a custom table's custom._field_write_door asks. The UPDATE reaching
  --     this trigger proves `editor`, so that rung is asked first and remembered per Field for
  --     the statement; only a Field `editor` may not change asks whether this person is an
  --     admin here (the organization's, remembered per statement, or this row's share).
  --     Creating a row is not editing somebody else's field, exactly as on a custom table.
  if v_me is not null and v_fields is not null
     and not (tg_op = 'INSERT' and (v_row ->> 'created_by') is not distinct from v_me::text) then
    v_bad := '{}'::text[];
    foreach v_f in array v_fields loop
      v_key := v_f.data ->> 'key';
      continue when v_key is null or (v_old -> v_key) is not distinct from (v_doc -> v_key);
      v_ok := platform.memo_k_get('mtf:' || v_f.id::text || ':editor');
      if v_ok is null then
        v_ok := iam.may_touch_field(v_me, v_f.id, v_org, 'editor'::public.permission_level, 'edit')::text;
        perform platform.memo_k_put('mtf:' || v_f.id::text || ':editor', v_ok);
      end if;
      continue when v_ok = 'true';
      v_admin := platform.memo_k_get('oadm:' || v_org::text);
      if v_admin is null then
        v_admin := coalesce(iam.has_org_admin(v_org), false)::text;
        perform platform.memo_k_put('oadm:' || v_org::text, v_admin);
      end if;
      if v_admin = 'false' then
        begin
          v_admin := coalesce(iam.has_access(v_token, (v_row ->> 'id')::uuid, 'admin'::public.permission_level), false)::text;
        exception when others then
          v_admin := 'false';
        end;
      end if;
      if v_admin = 'true' then
        v_ok := platform.memo_k_get('mtf:' || v_f.id::text || ':admin');
        if v_ok is null then
          v_ok := iam.may_touch_field(v_me, v_f.id, v_org, 'admin'::public.permission_level, 'edit')::text;
          perform platform.memo_k_put('mtf:' || v_f.id::text || ':admin', v_ok);
        end if;
        continue when v_ok = 'true';
      end if;
      v_bad := v_bad || coalesce(nullif(v_f.data ->> 'label', ''), v_key);
      v_needs := coalesce(v_needs, iam.level_label('record',
                   iam.field_sensitivity_level(v_f.data ->> 'sensitivity', 'edit', v_org)));
    end loop;
    if cardinality(v_bad) > 0 then
      select e.label into v_label from custom.entity_table(v_token) e;
      select string_agg(format('"%s"', x), ', ' order by x) into v_list from unnest(v_bad) x;
      raise exception 'You can see this %, but % % not yours to change; that takes % access or a share of %, so nothing was written.',
                      coalesce(v_label, v_token), v_list,
                      case when cardinality(v_bad) = 1 then 'is' else 'are' end, v_needs,
                      case when cardinality(v_bad) = 1 then 'that one field' else 'each field' end
        using errcode = '42501',
              hint = 'DOOR-3: the store refuses an edit to a field you may not edit, whichever door you came through.';
    end if;
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
  -- LANE7-SEC: FOR A PERSON'S SESSION THE AUTHOR IS THE SESSION'S, never the payload's. The
  -- session's word is read the way platform.declared_actor_tier() reads it — the connection's
  -- GUC first, then, for a signed-in client, its x-matrx-actor-tier header (agent / system),
  -- otherwise a person. That function asks `current_user`, which a SECURITY DEFINER trigger
  -- has already rewritten, so the client arm is asked here with custom.caller_role() — the
  -- role the request actually held — and the same accepted words and canonical spelling.
  -- A payload may say nothing, repeat the session's word, or narrow a person's own write to
  -- "her agent"; an agent acts only for the person whose session it is. A write with no
  -- person behind it is the store's own housekeeping and keeps both payload arms.
  if v_me is not null then
    v_sess := platform.declared_actor_tier();
    if v_sess is null and custom.caller_role() = 'authenticated' then
      begin
        v_hdr := nullif(lower(btrim((nullif(current_setting('request.headers', true), '')::json) ->> 'x-matrx-actor-tier')), '');
      exception when others then
        v_hdr := null;
      end;
      v_sess := case when v_hdr in ('agent', 'system', 'ai', 'code')
                     then platform.canonical_actor_tier(v_hdr) else 'user' end;
    end if;
    v_sess  := custom.actor_word(v_sess);
    v_decl  := nullif(btrim(coalesce(v_doc ->> '_actor', '')), '');
    v_actor := case when v_decl is null then v_sess else custom.actor_word(v_decl) end;
    if v_actor <> v_sess and not (v_sess = 'user' and v_actor = 'agent') then
      raise exception 'This write says it was made by "%", and the session making it is "%"; who changed a value comes from the session, so nothing was written.', v_actor, v_sess
        using errcode = '42501',
              hint = 'VAL-2: leave "_actor" out and the store records the session''s own author.';
    end if;
    v_obo := nullif(btrim(coalesce(v_doc ->> '_on_behalf_of', '')), '');
    if v_actor = 'agent' then
      if v_obo is not null and v_obo <> v_me::text then
        raise exception 'This write says its agent acts for somebody else, and an agent acts only for the person whose session it is; nothing was written.'
          using errcode = '42501',
                hint = 'VAL-2: leave "_on_behalf_of" out and the store records the signed-in person.';
      end if;
      v_obo := v_me::text;
    end if;
  else
    v_actor := custom.actor_word(v_doc ->> '_actor');
    v_obo   := nullif(btrim(coalesce(v_doc ->> '_on_behalf_of', '')), '');
  end if;
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

  -- LANE7-SEC (2026-10-02): A PROMISE THE STORE CANNOT KEEP IS REFUSED. A standard table's
  -- custom values live in the row's own `custom_fields` column, which every member who can
  -- read the row can SELECT directly (638 of 673 tables), so the masking the doors apply cannot
  -- make a confidential or restricted value secret there. Until protected values have their
  -- own storage, a Field on a standard table is never made more sensitive than internal.
  -- Fields of custom tables are unaffected: their values are only ever served by the doors.
  if v_token is not null
     and custom.sensitivity_rank(coalesce(d ->> 'sensitivity', 'internal')) > custom.sensitivity_rank('internal')
     and (tg_op = 'INSERT'
          or coalesce(old.data ->> 'sensitivity', 'internal') is distinct from coalesce(d ->> 'sensitivity', 'internal')) then
    raise exception 'A field on a standard table cannot be % yet, because its values sit in the row where every member can read them; keep "%" internal or public, or add it to a custom table instead.',
                    d ->> 'sensitivity', v_label
      using errcode = '23514',
            hint = 'LANE7-SEC: protected values on standard rows need their own storage first. Nothing was written.';
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
