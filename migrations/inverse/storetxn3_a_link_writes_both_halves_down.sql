-- chair-step: the inverse of `migrations/campaign/storetxn3_a_link_writes_both_halves.sql`, for
--   rule 27 (up -> inverse -> up) ON THE CLONE. It REPLACES the bodies of
--   `platform.relation_set` and `platform.relation_unset`, which is outside the additive
--   allow-list, and it REVOKES the EXECUTE grant the forward file added. It is never run on the
--   main database: undoing the forward file there would put the store back to a state in which
--   `custom.record_write_graph` cannot write a graph at all.
-- lock: custom,platform
--
-- It puts all three bodies back BYTE FOR BYTE as they stood on the main database at 16:1x UTC on
-- 2026-09-22 (the bytes the forward file's `-- based-on:` lines pin). A `drop function` would NOT
-- be the inverse: the forward file is a REPLACE and declares the bodies it is based on, so leg 3
-- of rule 27 has to find those exact bodies live.
--
-- based-on: platform.relation_set(uuid, uuid, text, jsonb) 8d05c5acf58f717c62a85d26271ca8be069de383e68b4737848b29115fe1ae75
-- based-on: platform.relation_unset(uuid, uuid, text, uuid) 548a20fabccdc9f720bff9b088b211438bd25aa0ff21b7d328430440f9b0e7cb
-- based-on: custom.validate_values(uuid, custom.record[], jsonb, text) 7b2d8e7c6acbd6f54a2b87592924b3774a4c2cbf08a62e85709dee98846deb60

set lock_timeout = '2s';
set statement_timeout = '300s';

CREATE OR REPLACE FUNCTION platform.relation_set(p_organization_id uuid, p_record_id uuid, p_field_key text, p_targets jsonb)
returns integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  d        jsonb;
  v_field  uuid;
  t        jsonb;
  i        integer := 0;
  v_type   text;
  v_id     uuid;
  v_written integer := 0;
  v_tbl    uuid;
begin
  perform platform.assert_relations_door(p_organization_id);
  -- BOTH ENDS, BEFORE THE FIRST WRITE. Linking is a change to the SOURCE record, so it asks
  -- editor there; and the TARGET is a record in another table whose title this link then
  -- shows on the source's screen, so it asks viewer there. A link you could make to a record
  -- you may not see would be a way to read one row at a time by guessing ids.
  perform custom.assert_client_may_change(p_organization_id, p_record_id, 'platform.relation_set',
                                          'editor'::public.permission_level, 'record');
  v_field := platform.relation_field(p_organization_id, p_record_id, p_field_key);
  d := platform.relation_declaration(p_organization_id, v_field);

  if jsonb_typeof(p_targets) <> 'array' then
    raise exception 'the targets of a relation are a list, and this is %', jsonb_typeof(p_targets)
      using errcode = '22023',
            hint = 'REL-7: a relation points at at most one thing, or at many - both are written as a list, so the shape never has to change when the cardinality does. One target is a list of one.';
  end if;

  for t in select * from jsonb_array_elements(p_targets) loop
    i := i + 1;
    if jsonb_typeof(t) = 'string' then
      v_type := 'record'; v_id := (t #>> '{}')::uuid;
    else
      v_type := coalesce(nullif(t ->> 'entity', ''), 'record');
      v_id   := nullif(t ->> 'row_id', '')::uuid;
    end if;
    if v_id is null then
      raise exception 'target % of this relation names no row', i using errcode = '22004';
    end if;

    if v_type = 'record' then
      perform custom.assert_client_may_open(p_organization_id, v_id, 'platform.relation_set',
                                            'viewer'::public.permission_level, 'record');
      select r.table_id into v_tbl
        from custom.record r
       where r.organization_id = p_organization_id and r.id = v_id and r.deleted_at is null;
      if v_tbl is not null then
        perform custom.assert_may_know_table(p_organization_id, v_tbl, 'platform.relation_set');
      end if;
    end if;

    insert into platform.associations
      (source_type, source_id, target_type, target_id, organization_id, role, position,
       relation_field_id, origin, payload_kind, payload, created_by)
    values
      ('record', p_record_id, v_type, v_id, p_organization_id, p_field_key,
       case when (d ->> 'ordered')::boolean then i else null end,
       v_field, 'campaign',
       case when d ->> 'binding' = 'snapshot' then 'relation_snapshot' else null end,
       case when d ->> 'binding' = 'snapshot'
            then platform.relation_snapshot_of(p_organization_id, v_type, v_id) else null end,
       (select auth.uid()))
    on conflict (source_type, source_id, target_type, target_id, role) do update
      set position          = excluded.position,
          relation_field_id = excluded.relation_field_id,
          origin            = excluded.origin,
          payload_kind      = excluded.payload_kind,
          payload           = excluded.payload,
          deleted_at        = null;
    v_written := v_written + 1;
  end loop;
  return v_written;
end;
$function$

;

comment on function platform.relation_set(uuid, uuid, text, jsonb) is
  'Held by the knob custom/system_enabled, resolved for the organization through platform.assert_relations_door. While it is off this answers only the role that owns platform.associations.';

CREATE OR REPLACE FUNCTION platform.relation_unset(p_organization_id uuid, p_record_id uuid, p_field_key text, p_target_id uuid)
returns integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare v_n integer;
begin
  perform platform.assert_relations_door(p_organization_id);
  -- Unlinking changes the SOURCE record, so it is the same question as linking, at the same
  -- threshold. The target is not asked: removing a pointer tells you nothing about what it
  -- pointed at.
  perform custom.assert_client_may_change(p_organization_id, p_record_id, 'platform.relation_unset',
                                          'editor'::public.permission_level, 'record');
  -- A relation is UNMADE the way every edge in this platform is: soft, so the reverse end and
  -- the history both keep their record of it (REL-13).
  update platform.associations a
     set deleted_at = now()
   where a.organization_id = p_organization_id
     and a.source_type = 'record' and a.source_id = p_record_id
     and a.role = p_field_key and a.target_id = p_target_id
     and a.deleted_at is null;
  get diagnostics v_n = row_count;
  return v_n;
end;
$function$

;

comment on function platform.relation_unset(uuid, uuid, text, uuid) is null;

CREATE OR REPLACE FUNCTION custom.validate_values(p_organization_id uuid, p_fields custom.record[], p_values jsonb, p_record_type text DEFAULT NULL::text)
returns void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  f        custom.record;
  d        jsonb;
  v_label  text;
  v_key    text;
  v_type   text;
  v_multi  boolean;
  v_val    jsonb;
  v_one    jsonb;
  v_items  jsonb;
  v_n      integer;
  v_rule   jsonb;
  v_kind   text;
  v_other  jsonb;
  v_table  uuid;
  v_map    jsonb;
  v_field  jsonb;
  v_types  text[];
begin
  if p_fields is null or array_length(p_fields, 1) is null then
    return;
  end if;

  -- CHOICE-VALUE. The type field's value is the option's KEY now, and `applies_to_types` was
  -- written by whoever declared the Field or the Rule - in words, in keys, or (before this
  -- lane) in option ids. All three name the same choice, so all three are asked. This is what
  -- keeps T8's Square rule attached to the square.
  -- THE MAP IS BUILT FROM THE FIELDS THEMSELVES, not from a Table id. MEASURED 2026-09-20
  -- 07:27Z: the fields of a STANDARD entity's `custom_fields` (REC-40) carry `table_token` and
  -- no `entity_definition_id` at all, so asking `custom.choice_field_map` for a Table produced
  -- an empty map and every valid choice on `crm.party` was refused. Each list Field already
  -- names the Table its choices come from; that is the only thing this needs.
  select coalesce(jsonb_object_agg(f2.data ->> 'key', jsonb_build_object(
           'label',   coalesce(nullif(f2.data ->> 'label', ''), f2.data ->> 'key'),
           'options', custom.choice_options(p_organization_id,
                        (f2.data -> 'config' ->> 'options_table_id')::uuid))), '{}'::jsonb)
    into v_map
    from unnest(p_fields) f2
   where f2.data ->> 'type' = 'list'
     and nullif(f2.data -> 'config' ->> 'options_table_id', '') is not null;

  v_types := case when p_record_type is null then '{}'::text[]
                  else custom.choice_synonyms_in(v_map, p_record_type) end;

  foreach f in array p_fields loop
    d       := f.data;
    v_key   := d ->> 'key';
    v_label := coalesce(nullif(d ->> 'label', ''), v_key);
    v_type  := d ->> 'type';
    v_multi := coalesce((d ->> 'multi')::boolean, false);
    v_val   := p_values -> v_key;

    -- REQUIRED. An absent key and a null value are the same absence and are said the same way.
    if v_val is null or jsonb_typeof(v_val) = 'null'
       or (v_multi and jsonb_typeof(v_val) = 'array' and jsonb_array_length(v_val) = 0) then
      if coalesce((d ->> 'required')::boolean, false) then
        raise exception '% is required', v_label
          using errcode = '23514', hint = format('REC-51: the field %s of this table.', v_key);
      end if;
      continue;
    end if;

    -- A FORMULA IS NEVER WRITTEN BY HAND (FLD-9): the declaration says who computes it.
    if v_type = 'formula' then
      raise exception '% is worked out by the system, so it cannot be typed in', v_label
        using errcode = '23514',
              hint = format('FLD-9: this formula computes on %s.', coalesce(d ->> 'compute_on', 'write'));
    end if;

    -- MULTI (FLD-2) is about the SHAPE of the value, never about the behavior.
    if v_multi then
      if jsonb_typeof(v_val) <> 'array' then
        raise exception '% holds many values, so it takes a list', v_label
          using errcode = '23514', hint = 'FLD-2: the multi modifier.';
      end if;
      v_items := v_val;
    else
      if jsonb_typeof(v_val) = 'array' then
        raise exception '% holds one value, and it was given a list', v_label
          using errcode = '23514', hint = 'FLD-2: multi is off for this field.';
      end if;
      v_items := jsonb_build_array(v_val);
    end if;

    for v_one in select e from jsonb_array_elements(v_items) e loop
      -- TYPE.
      if v_type = 'boolean' then
        -- LIMITS-FIX: a tick is a REAL boolean. A record that never answered carries no key
        -- at all and left through the absence branch above, so `false` arriving here is a
        -- person SAYING no — a different fact from never having been asked, and the store
        -- keeps the two apart rather than flattening them into one empty box.
        if jsonb_typeof(v_one) <> 'boolean' then
          raise exception '% is ticked or left unticked, and it was given a %', v_label, jsonb_typeof(v_one)
            using errcode = '23514',
                  hint = 'FLD-1: boolean. Write true or false. The WORDS "Yes" and "No" are a choice list, which is a different kind of column.';
        end if;
      elsif v_type = 'text' then
        if jsonb_typeof(v_one) <> 'string' then
          raise exception '% takes words, and it was given a %', v_label, jsonb_typeof(v_one)
            using errcode = '23514', hint = 'FLD-1: text.';
        end if;
      elsif v_type = 'range' then
        if jsonb_typeof(v_one) = 'number' then
          null;
        elsif jsonb_typeof(v_one) = 'string'
              and coalesce(d -> 'config' ->> 'kind', 'number') in ('date', 'datetime') then
          begin
            perform (v_one #>> '{}')::timestamptz;
          exception when others then
            raise exception '% takes a date, and % is not one', v_label, v_one #>> '{}'
              using errcode = '23514', hint = 'FLD-1: range, of kind date.';
          end;
        else
          raise exception '% takes a number, and it was given a %', v_label, jsonb_typeof(v_one)
            using errcode = '23514', hint = 'FLD-1: range.';
        end if;
      elsif v_type = 'list' then
        if jsonb_typeof(v_one) <> 'string' then
          raise exception '% takes one of its choices, and it was given a %', v_label, jsonb_typeof(v_one)
            using errcode = '23514',
                  hint = 'FLD-5 / FLD-6: a list field stores the option''s own KEY - a short stable word - because every pick-list is already a Table.';
        end if;
        -- OPTION MEMBERSHIP. The value is the KEY of an option of this Field's own Table.
        -- A RETIRED option's key passes here ON PURPOSE: a record that already holds one has
        -- to stay editable when somebody changes a different column. Picking a retired choice
        -- ANEW is refused by custom._resolve_choice_words, which is the only place that can
        -- tell a new pick from a value that was already there.
        -- A TOKEN THAT NAMES ONE OF THE CHOICES. The KEY is the contract and is what
        -- `custom._resolve_choice_words` stores; the label and the option's own id are
        -- accepted too, because a surface with no normaliser in front of it (a standard
        -- entity's `custom_fields`) writes what its caller sent and must not be refused for
        -- naming the right choice a different way.
        v_field := v_map -> v_key;
        if v_field is null
           or custom.choice_key_of(v_field, v_one #>> '{}') is null then
          raise exception '% was given a choice that is not one of its choices', v_label
            using errcode = '23514',
                  hint = format('REC-51: option membership. The choices for %s are %s.', v_label,
                                coalesce(custom.choice_words(coalesce(v_field, '{}'::jsonb)),
                                         'the records of its own table, and it has none yet'));
        end if;
      elsif v_type = 'relation' then
        if jsonb_typeof(v_one) <> 'string' then
          raise exception '% points at a record, and it was given a %', v_label, jsonb_typeof(v_one)
            using errcode = '23514', hint = 'FLD-1: relation.';
        end if;
        -- RELATION RULES. The target exists, in this organization, in the declared table.
        -- The id SHAPE first, for the same reason as the list branch above.
        if (v_one #>> '{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
          raise exception '% points at something that is not there', v_label
            using errcode = '23514',
                  hint = format('REC-51: %s stores the id of a record, and what it was given is not an id at all.', v_label);
        end if;
        if not exists (
          select 1 from custom.record t
           where t.organization_id = p_organization_id
             and t.id = (v_one #>> '{}')::uuid
             and t.table_id = (d ->> 'relation_target')::uuid
             and t.deleted_at is null) then
          raise exception '% points at something that is not there', v_label
            using errcode = '23514',
                  hint = 'REC-51: a relation field points at a live record of the table it declared.';
        end if;
      end if;

      -- FLD-3: the attached validation Rules, read through the ONE seam.
      -- FLD-10 says the type field selects which Fields AND RULES apply, so a Rule carries
      -- its own applies_to_types: T8's Width applies to a rectangle and to a square, and the
      -- "the sides are equal" Rule attached to it applies to the SQUARE alone. A Rule with an
      -- empty list applies wherever its Field does.
      for v_rule in select r from jsonb_array_elements(coalesce(d -> 'rules', '[]'::jsonb)) r loop
        if jsonb_array_length(coalesce(v_rule -> 'applies_to_types', '[]'::jsonb)) > 0
           and not (p_record_type is not null and (v_rule -> 'applies_to_types') ?| v_types) then
          continue;
        end if;
        v_kind := v_rule ->> 'kind';
        if v_kind = 'min' and jsonb_typeof(v_one) = 'number'
           and (v_one #>> '{}')::numeric < (v_rule ->> 'value')::numeric then
          raise exception '% has to be at least %', v_label, v_rule ->> 'value'
            using errcode = '23514', hint = 'FLD-3: an attached validation Rule, not a behavior.';
        elsif v_kind = 'max' and jsonb_typeof(v_one) = 'number'
              and (v_one #>> '{}')::numeric > (v_rule ->> 'value')::numeric then
          raise exception '% cannot be more than %', v_label, v_rule ->> 'value'
            using errcode = '23514', hint = 'FLD-3: an attached validation Rule, not a behavior.';
        elsif v_kind = 'length' and jsonb_typeof(v_one) = 'string'
              and length(v_one #>> '{}') > (v_rule ->> 'value')::integer then
          raise exception '% is longer than % characters', v_label, v_rule ->> 'value'
            using errcode = '23514', hint = 'FLD-3.';
        elsif v_kind = 'pattern' and jsonb_typeof(v_one) = 'string'
              and (v_one #>> '{}') !~ (v_rule ->> 'value') then
          raise exception '% is not written the way this field expects', v_label
            using errcode = '23514', hint = 'FLD-3.';
        elsif v_kind = 'equals_field' then
          v_other := p_values -> (v_rule ->> 'value');
          if v_other is not null and jsonb_typeof(v_other) <> 'null' and v_other <> v_one then
            raise exception '% and % have to be the same', v_label, v_rule ->> 'value'
              using errcode = '23514',
                    hint = 'FLD-3 / T8: a constraint across two fields is a Rule attached to one of them, never a behavior.';
          end if;
        elsif v_kind = 'differs_from_field' then
          v_other := p_values -> (v_rule ->> 'value');
          if v_other is not null and v_other = v_one then
            raise exception '% and % have to be different', v_label, v_rule ->> 'value'
              using errcode = '23514', hint = 'FLD-3.';
          end if;
        end if;
      end loop;
    end loop;

    -- RELATION MAX, once per field rather than once per item.
    if v_type = 'relation' and v_multi then
      v_n := jsonb_array_length(v_items);
      if v_n > coalesce((d ->> 'relation_max')::integer, v_n) then
        raise exception '% points at % things, and it can point at % at most',
                        v_label, v_n, d ->> 'relation_max'
          using errcode = '23514', hint = 'REC-51: relation_max.';
      end if;
    end if;
  end loop;
end;
$function$;

-- The one grant the forward file added, taken back. On the clone only, as the header says.
revoke execute on function custom.migrate_purge_hard(uuid, uuid, text, integer, boolean)
  from authenticated;
