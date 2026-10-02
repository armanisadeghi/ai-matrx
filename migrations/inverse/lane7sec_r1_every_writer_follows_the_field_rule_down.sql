-- chair-step: the inverse of lane7sec_r1_every_writer_follows_the_field_rule.sql. It puts
-- custom._entity_custom_fields_guard back exactly as lane7sec_a left it and drops the one
-- platform.entity_types column that file added: a brief ACCESS EXCLUSIVE lock on that registry
-- table. It changes no grant.
-- based-on: custom._entity_custom_fields_guard() 3a55d13935ba008e59889641548cf05f21f54bbbf06380d8c874330daed874d8

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
  -- LANE7-SEC (2026-10-02): the person this write is for, and the field rule asked of it.
  v_me      uuid := auth.uid();
  v_level   public.permission_level;
  v_bad     text[];
  v_list    text;
  v_label   text;
  v_sess    text;
  v_decl    text;
  v_f       custom.record;
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

  -- LANE7-SEC (2026-10-02). THE FIELD RULE ON EVERY WRITE PATH — this door, entity_value_write,
  -- and a direct supabase update of `custom_fields` all arrive here, so one guard decides.
  --
  -- (a) A VALUE NEEDS A FIELD. Only what THIS write put there or changed is judged (the same
  --     rule custom._undeclared_key_guard applies to a custom table's records), so a row that
  --     already carries an old key is not refused for a write that leaves it alone. Keys that
  --     start with `_` are the envelope's own and are judged below.
  select coalesce(array_agg(k order by k), '{}'::text[]) into v_bad
    from jsonb_object_keys(v_doc) k
   where left(k, 1) <> '_'
     and (v_old -> k) is distinct from (v_doc -> k)
     and not exists (select 1 from unnest(coalesce(v_fields, '{}'::custom.record[])) f
                      where f.data ->> 'key' = k);
  if cardinality(v_bad) > 0 then
    select e.label into v_label from custom.entity_table(v_token) e;
    select string_agg(format('"%s"', x), ', ' order by x) into v_list from unnest(v_bad) x;
    raise exception '% has no field called %, so there is nowhere to keep %; adding a field is an owner''s or an admin''s to do.',
                    coalesce(v_label, v_token), v_list,
                    case when cardinality(v_bad) = 1 then 'that value' else 'those values' end
      using errcode = '23514',
            hint = 'REC-1 / REC-51: a value with no field is a value nobody will ever see. Nothing was written.';
  end if;

  -- (b) A PERSON CHANGES ONLY THE FIELDS SHE MAY EDIT (DOOR-3), asked through the same
  --     iam.may_touch_field a custom table's custom._field_write_door asks. Creating a row is
  --     not editing somebody else's field, exactly as there. The UPDATE reaching this trigger
  --     proves `editor`; `admin` is the organization's admins and the row's admin shares.
  if v_me is not null and v_fields is not null
     and not (tg_op = 'INSERT' and (v_row ->> 'created_by') is not distinct from v_me::text) then
    begin
      v_level := case when iam.has_org_admin(v_org)
                        or iam.has_access(v_token, (v_row ->> 'id')::uuid, 'admin'::public.permission_level)
                      then 'admin'::public.permission_level else 'editor'::public.permission_level end;
    exception when others then
      v_level := 'editor'::public.permission_level;
    end;
    v_bad := '{}'::text[];
    foreach v_f in array v_fields loop
      v_key := v_f.data ->> 'key';
      continue when v_key is null;
      if (v_old -> v_key) is distinct from (v_doc -> v_key)
         and not iam.may_touch_field(v_me, v_f.id, v_org, v_level, 'edit') then
        v_bad := v_bad || coalesce(nullif(v_f.data ->> 'label', ''), v_key);
        v_decl := coalesce(v_decl, iam.level_label('record',
                    iam.field_sensitivity_level(v_f.data ->> 'sensitivity', 'edit', v_org)));
      end if;
    end loop;
    if cardinality(v_bad) > 0 then
      select e.label into v_label from custom.entity_table(v_token) e;
      select string_agg(format('"%s"', x), ', ' order by x) into v_list from unnest(v_bad) x;
      raise exception 'You can see this %, but % % not yours to change; that takes % access or a share of %, so nothing was written.',
                      coalesce(v_label, v_token), v_list,
                      case when cardinality(v_bad) = 1 then 'is' else 'are' end, v_decl,
                      case when cardinality(v_bad) = 1 then 'that one field' else 'each field' end
        using errcode = '42501',
              hint = 'DOOR-3: the store refuses an edit to a field you may not edit, whichever door you came through.';
    end if;
    v_decl := null;
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
  -- LANE7-SEC (2026-10-02): FOR A PERSON'S SESSION THE AUTHOR IS THE SESSION'S, never the
  -- payload's. The session says who (auth.uid()) and how (the connection's declared tier); a
  -- payload may say nothing, say the same, or narrow a person's own write to "her agent" —
  -- and an agent acts for exactly the person whose session it is. Anything else would let a
  -- caller stamp a value as written by the system or by somebody else, and is refused.
  -- A write with no person behind it is the store's own housekeeping and keeps both arms.
  if v_me is not null then
    v_sess  := custom.actor_word(null);
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

ALTER TABLE platform.entity_types
  DROP COLUMN IF EXISTS custom_fields_closed;
