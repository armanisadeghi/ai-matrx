-- chair-step: lane LIST-COPY-PERMISSIVE (chair rulings of 2026-09-26). (1) THE COPY NEVER INVENTS A CHOICE. REPLACES custom._resolve_choice_words() and custom.validate_values(uuid,custom.record[],jsonb,text): a list column that takes other values (config.allow_other) now KEEPS a word that is none of its choices as typed (an other value) instead of adding it to the list, which is what the older grid's allowOther always did. REPLACES platform.cutover_older_removal_rows / cutover_older_removals / cutover_carry_removals and platform._cutover_seam_readiness: a choice the mover invented from a live row's off-list value (moved_from = a row's cell) and no older choice backs is a difference the settings card counts and Copy again clears — the columns choosing from that list take other values, the choice is archived (never deleted), the cells hold the words. (2) SWITCH BACK TAKES A SHARE BACK. REPLACES platform._cutover_carry_back: a share the new table no longer holds is removed from the older table through the older Share dialog's own door (public.revoke_resource_access / revoke_resource_org_access) instead of being marked archived, which still opened the table. No row of any table is written by this file. No lock beyond seven function definitions.
-- based-on: custom._resolve_choice_words() 9e2a72906d752c2dcc4b25eedfc471830e0e527d51e3544de948d034f0949ed5
-- based-on: custom.validate_values(uuid, custom.record[], jsonb, text) 2ff3f10c613cba5eb796d0c8c8a136bb21a3a396521379c7a543acca268d5dac
-- based-on: platform.cutover_older_removal_rows(uuid, uuid[]) 4682463c5693cd70063364b414cef4449af018bfc5afde8b749721fb0eec146f
-- based-on: platform.cutover_older_removals(uuid, uuid[]) 78afc29b90b5b21471e469c9cb59e5cbac33b4b2819f5741dfd7b5fed61f4b48
-- based-on: platform.cutover_carry_removals(uuid, uuid[]) 937db30d4b982028340e7970a65c705e4ef271f84b6ca5b857f7c6a568e44119
-- based-on: platform._cutover_seam_readiness(text, uuid) 80acae47616b8990ca172e56f53ce448bb321deaea566317ee21b1621a324f91
-- based-on: platform._cutover_carry_back(uuid, platform.cutover_seam_press, boolean, uuid, uuid, boolean) 3d06be012cec4bacdc07f5554b0955be909a3ae0bb031e403d1b11c1e63ce380
-- lane: LIST-COPY-PERMISSIVE
-- INVERSE: migrations/inverse/listcopypermissive_the_copy_never_invents_a_choice_down.sql

CREATE OR REPLACE FUNCTION custom._resolve_choice_words()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_on      boolean;
  v_map     jsonb;
  v_field   jsonb;
  v_key     text;
  v_label   text;
  v_val     jsonb;
  v_items   jsonb;
  v_one     jsonb;
  v_word    text;
  v_hit     text;
  v_out     jsonb;
  v_new     jsonb;
  v_before  text[];
  v_title   text;
  e         record;
  v_allow   boolean;
begin
  -- THE SWITCH, BY NAME, BEFORE ANYTHING. While `custom/system_enabled` resolves false for this
  -- organization nothing of this store's product behaviour runs and the value is left exactly as
  -- the writer sent it. `custom._record_field_validation` already refuses a CLIENT write while
  -- the switch is off; this is the same rule for the owner-role writes it lets through — a
  -- backfill, a migration, a repair — so an organization whose store is off is byte-untouched by
  -- this lane. The read is the established one (`custom.store_is_open`,
  -- `custom._entity_custom_fields_guard` and `custom.containment_depth_ceiling` all make it):
  -- `platform.knob_resolve` answers jsonb and a switch this writer cannot read is CLOSED.
  begin
    v_on := custom.store_is_open(new.organization_id);
  exception when others then
    v_on := false;
  end;
  if not v_on then
    return new;
  end if;

  if new.data is null or jsonb_typeof(new.data) <> 'object' then
    return new;
  end if;

  -- ── AN OPTION RECORD IS BORN WITH ITS KEY ───────────────────────────────────────────
  -- The store's own bookkeeping, done where every write arrives — the panel, the import,
  -- the agent and the ordinary write door all pass through here. A RENAME NEVER TOUCHES IT:
  -- the key is set when it is missing and never recomputed, which is the whole point.
  -- IT LIVES IN `metadata`, WHICH IS WHAT THAT COLUMN IS FOR: system-owned, keyed system
  -- state, judged by `platform._metadata_guard` against a registry no client may add to. Two
  -- consequences, both deliberate. FLD-5 stays byte-true - a category is still a Record of a
  -- Table with ONE title field, and `w1_field_t4_t8.sql` asserts exactly that of the kernel's
  -- own choice tables. And a client CANNOT forge one: `_metadata_guard` sorts before
  -- `custom_record_choice_words`, so it judges what the CALLER sent (an unregistered key, which
  -- it refuses) and never what this trigger sets afterwards.
  -- ON UPDATE THE EXISTING KEY IS CARRIED, never recomputed: renaming an option must rewrite no
  -- row, and recomputing from the new title is exactly how that promise would be broken.
  if new.table_id is not null
     and coalesce(new.data_class, '') not in ('kernel', 'relation', 'field', 'table', 'rule')
     and custom.table_is_options_table(new.organization_id, new.table_id) then
    -- WHAT THE CALLER SENT IS NEVER TRUSTED. `option_key` is a registered metadata key, which
    -- means `platform._metadata_guard` lets it through - so a client could put a word of their
    -- own in it. On a NEW option the key is always derived here and whatever arrived is
    -- overwritten; on an UPDATE the key the option was born with is carried, whatever arrived.
    -- Either way the caller has no say, which is what makes it stable.
    if tg_op = 'UPDATE' and coalesce(old.metadata ->> 'option_key', '') <> '' then
      new.metadata := coalesce(new.metadata, '{}'::jsonb)
                        || jsonb_build_object('option_key', old.metadata ->> 'option_key');
    else
      v_title := coalesce(nullif(new.data ->> 'title', ''), nullif(new.data ->> 'name', ''));
      if v_title is not null then
        new.metadata := coalesce(new.metadata, '{}'::jsonb)
                          || jsonb_build_object('option_key',
                               custom.choice_key_for(new.organization_id, new.table_id, v_title, new.id));
      else
        new.metadata := coalesce(new.metadata, '{}'::jsonb) - 'option_key';
      end if;
    end if;
  end if;

  -- Only ordinary records of an ordinary Table have choices of their own to resolve.
  if new.table_id is null or new.data_class = 'kernel'
     or new.table_id in (custom.field_kernel_id(), custom.table_kernel_id(),
                         custom.rule_kernel_id(), custom.merge_field_kernel_id()) then
    return new;
  end if;

  v_map := custom.choice_field_map(new.organization_id, new.table_id);
  if v_map = '{}'::jsonb then
    return new;
  end if;

  for e in select key as k, value as v from jsonb_each(v_map) loop
    v_key   := e.k;
    v_field := e.v;
    v_label := coalesce(nullif(v_field ->> 'label', ''), v_key);
    v_val   := new.data -> v_key;
    if v_val is null or jsonb_typeof(v_val) = 'null' then
      continue;
    end if;

    -- The keys this cell already held, so that a record carrying a RETIRED choice can still
    -- be saved when somebody edits a different column. Only a NEW retired choice is refused.
    if tg_op = 'UPDATE' then
      select coalesce(array_agg(x #>> '{}'), '{}'::text[]) into v_before
        from jsonb_array_elements(
               case when jsonb_typeof(old.data -> v_key) = 'array' then old.data -> v_key
                    when old.data -> v_key is null then '[]'::jsonb
                    else jsonb_build_array(old.data -> v_key) end) x
       where jsonb_typeof(x) = 'string';
    else
      v_before := '{}'::text[];
    end if;

    v_items := case when jsonb_typeof(v_val) = 'array' then v_val else jsonb_build_array(v_val) end;
    v_out   := '[]'::jsonb;

    for v_one in select x from jsonb_array_elements(v_items) x loop
      if jsonb_typeof(v_one) <> 'string' then
        v_out := v_out || jsonb_build_array(v_one);
        continue;
      end if;
      v_word := btrim(v_one #>> '{}');
      if v_word = '' then
        v_out := v_out || jsonb_build_array(v_one);
        continue;
      end if;

      v_hit := custom.choice_key_of(v_field, v_word);

      -- ── LIST-COPY-PERMISSIVE, 2026-09-26: A COLUMN THAT TAKES OTHER VALUES KEEPS THEM. ────
      -- The older grid's `allowOther` never touched the list: the typed word was stored in the
      -- cell exactly as typed and drawn as an "other" value, and adding it to the list was the
      -- person's own separate act (the grid's "Add as option" nudge). STORE-RULE-GAPS (2) made
      -- the store ADD such a word to the column's choices instead, which is how a copy grew
      -- choices its older list never had (Table 1 · 2nd's "Russia" became a 16th country). Now,
      -- when the column says so (`config.allow_other`, off unless declared), a word that is none
      -- of its choices is KEPT AS TYPED - an other value - and the list is not written. So is a
      -- word that names a RETIRED choice by its words: nothing retired is picked anew, the word
      -- is simply kept. The retired choice's own KEY, already held by this cell, stays the key
      -- (a record that holds a retired choice can still be saved when somebody edits a different
      -- column). Without the setting, both are refused below exactly as before.
      if v_hit is null
         or (coalesce((v_field -> 'options' -> v_hit ->> 'retired')::boolean, false)
             and not (v_word = v_hit and v_hit = any (v_before))) then
        select coalesce((f.data -> 'config' ->> 'allow_other')::boolean, false)
          into v_allow
          from custom.record f
         where f.organization_id = new.organization_id
           and f.id = (v_field ->> 'field_id')::uuid
           and f.table_id = custom.field_kernel_id()
           and f.deleted_at is null;
        if coalesce(v_allow, false) then
          v_out := v_out || jsonb_build_array(to_jsonb(v_word));
          continue;
        end if;
      end if;

      if v_hit is null then
        -- REFUSED WITH THE CHOICES THEMSELVES, in the words a person reads.
        raise exception '% does not have a choice called "%".', v_label, v_word
          using errcode = '23514',
                hint = format('The choices for %s are %s. Pick one of those, or add "%s" to the column''s list of choices first.',
                              v_label,
                              coalesce(custom.choice_words(v_field), 'not set up yet'),
                              v_word);
      end if;

      if coalesce((v_field -> 'options' -> v_hit ->> 'retired')::boolean, false)
         and not (v_hit = any (v_before)) then
        raise exception '% is no longer one of the choices for %.',
                        coalesce(v_field -> 'options' -> v_hit ->> 'label', v_hit), v_label
          using errcode = '23514',
                hint = format('It was retired, so it can no longer be picked. Records that already hold it keep it and still read as "%s". The choices now are %s.',
                              coalesce(v_field -> 'options' -> v_hit ->> 'label', v_hit),
                              coalesce(custom.choice_words(v_field), 'none — add one first'));
      end if;

      v_out := v_out || jsonb_build_array(to_jsonb(v_hit));
    end loop;

    v_new := case when jsonb_typeof(v_val) = 'array' then v_out else v_out -> 0 end;
    if v_new is distinct from v_val then
      new.data := new.data || jsonb_build_object(v_key, v_new);
    end if;
  end loop;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.validate_values(p_organization_id uuid, p_fields custom.record[], p_values jsonb, p_record_type text DEFAULT NULL::text)
 RETURNS void
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

    -- A RELATION'S CARDINALITY IS `relation_max`, AND ONE TARGET IS A LIST OF ONE (REL-7,
    -- lane STORE-TXN-3 2026-09-22). FLD-2's `multi` and FLD-13's `relation_max` are two words
    -- for one fact and the store let them disagree: `custom._field_document_for` DERIVES
    -- relation_max from multi but never the reverse, so a caller that declared
    -- `relation_max: 50` and said nothing about multi got a column whose declaration reads
    -- "many" (`platform.relation_declaration` answers cardinality `many` off relation_max) and
    -- whose value shape was refused as "holds one value, and it was given a list". Measured
    -- 2026-09-22 on the field `matrx_records`' own `field_propose` declares for the keyword
    -- research graph. REL-7 already settles it in words — *"a relation points at at most one
    -- thing, or at many — both are written as a list, so the shape never has to change when
    -- the cardinality does. One target is a list of one."* — so for a relation the shape is
    -- read here, a scalar is a list of one, and the CEILING below is the only limit.
    if v_type = 'relation' then
      v_items := case when jsonb_typeof(v_val) = 'array'
                      then v_val else jsonb_build_array(v_val) end;
    elsif v_multi then
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
        -- LIST-COPY-PERMISSIVE (2026-09-26): a column that takes other values
        -- (`config.allow_other`) holds a word that is none of its choices as an other value;
        -- custom._resolve_choice_words keeps it as typed, and it passes here.
        if v_field is null
           or (custom.choice_key_of(v_field, v_one #>> '{}') is null
               and not coalesce((d -> 'config' ->> 'allow_other')::boolean, false)) then
          raise exception '% was given a choice that is not one of its choices', v_label
            using errcode = '23514',
                  hint = format('REC-51: option membership. The choices for %s are %s.', v_label,
                                coalesce(custom.choice_words(coalesce(v_field, '{}'::jsonb)),
                                         'the records of its own table, and it has none yet'));
        end if;
      elsif v_type = 'relation'
            and jsonb_typeof(d -> 'config' -> 'allowed_types') = 'array'
            and jsonb_array_length(d -> 'config' -> 'allowed_types') > 0 then
        -- ── SC-R / P12: AN ENTITY REFERENCE. Each value is {token, id}: which kind of platform
        -- thing, and which one. The kind is one this Field allows; the thing is live and the
        -- writer may open it (custom._entity_reference_target_ok, the relation rule asked of a
        -- platform entity). Missing and forbidden say the same sentence.
        if jsonb_typeof(v_one) <> 'object'
           or nullif(btrim(coalesce(v_one ->> 'token', '')), '') is null
           or coalesce(v_one ->> 'id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
          raise exception '% points at something on the platform, and it was given %', v_label,
                          case when jsonb_typeof(v_one) = 'object' then 'something with no kind or no id'
                               else 'a ' || jsonb_typeof(v_one) end
            using errcode = '23514',
                  hint = format('SC-R / P12: each value of %s is {"token": "<kind>", "id": "<uuid>"} — the kind is one of %s.',
                                v_label, (select string_agg(x #>> '{}', ', ') from jsonb_array_elements(d -> 'config' -> 'allowed_types') x));
        end if;
        if not ((d -> 'config' -> 'allowed_types') ? lower(btrim(v_one ->> 'token'))) then
          raise exception '% points at %, and it can only point at %', v_label,
                          coalesce((select e.label from platform.entity_types e where e.token = lower(btrim(v_one ->> 'token'))),
                                   v_one ->> 'token'),
                          (select string_agg(coalesce(e.label, x #>> '{}'), ', ' order by o)
                             from jsonb_array_elements(d -> 'config' -> 'allowed_types') with ordinality as a(x, o)
                             left join platform.entity_types e on e.token = x #>> '{}')
            using errcode = '23514',
                  hint = 'SC-R / P12: config.allowed_types is what this column may name. Point it at one of those, or widen the column.';
        end if;
        if not custom._entity_reference_target_ok(p_organization_id, lower(btrim(v_one ->> 'token')), (v_one ->> 'id')::uuid) then
          raise exception '% points at something that is not there', v_label
            using errcode = '23514',
                  hint = 'SC-R / P12 / REC-51: an entity reference points at a live thing the person writing it may open. It was deleted, it never existed, or it has not been shared with you.';
        end if;
        continue;   -- an entity reference carries no value Rules; its ceiling is asked below
      elsif v_type = 'relation' then
        if jsonb_typeof(v_one) <> 'string' then
          raise exception '% points at a record, and it was given a %', v_label, jsonb_typeof(v_one)
            using errcode = '23514', hint = 'FLD-1: relation.';
        end if;
        -- RELATION RULES. The target is a live record the relation's DECLARATION allows —
        -- `custom.relation_value_target_ok`, which asks what platform.enforce_relation_edge
        -- asks of the association beside it: the declared table (or `several`'s list, or
        -- `any`), and another organization only through the REC-29 opening both have made.
        -- The id SHAPE first, for the same reason as the list branch above.
        if (v_one #>> '{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
          raise exception '% points at something that is not there', v_label
            using errcode = '23514',
                  hint = format('REC-51: %s stores the id of a record, and what it was given is not an id at all.', v_label);
        end if;
        if not custom.relation_value_target_ok(p_organization_id, f.id, d, (v_one #>> '{}')::uuid) then
          raise exception '% points at something that is not there', v_label
            using errcode = '23514',
                  hint = 'REC-51 / REL-8 / REC-29: a relation field points at a live record of a table it declares — or, across organizations, only where the table allows it and both organizations have turned on links to other organizations.';
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
              and coalesce(v_rule ->> 'value', '') <> ''
              and length(v_one #>> '{}') > (v_rule ->> 'value')::integer then
          raise exception '% is longer than % characters', v_label, v_rule ->> 'value'
            using errcode = '23514', hint = 'FLD-3.';
        -- STORE-RULE-GAPS (3): the SHORTEST, beside the longest. An empty string is a blank,
        -- not a short answer - whether a blank is allowed is `required`'s question, as it
        -- was in the older grid, so it is not asked twice.
        elsif v_kind = 'length' and jsonb_typeof(v_one) = 'string'
              and coalesce(v_rule ->> 'min', '') <> ''
              and (v_one #>> '{}') <> ''
              and length(v_one #>> '{}') < (v_rule ->> 'min')::integer then
          raise exception '% has to be at least % characters long', v_label, v_rule ->> 'min'
            using errcode = '23514', hint = 'FLD-3.',
                  detail = jsonb_build_object('field_key', v_key, 'rule', 'length',
                                              'min', (v_rule ->> 'min')::integer)::text;
        -- STORE-RULE-GAPS (1): a pattern that carries an example SAYS it — the remedy is the
        -- shape a person should type, and the example travels in `detail` as well so the one
        -- refusal builder reads it as data rather than fishing it out of a sentence.
        elsif v_kind = 'pattern' and jsonb_typeof(v_one) = 'string'
              and (v_one #>> '{}') !~ (v_rule ->> 'value') then
          if coalesce(btrim(v_rule ->> 'example'), '') <> '' then
            raise exception '% is not written the way this field expects', v_label
              using errcode = '23514',
                    hint = format('Enter it like %s.', btrim(v_rule ->> 'example')),
                    detail = jsonb_build_object('field_key', v_key, 'rule', 'pattern',
                                                'example', btrim(v_rule ->> 'example'))::text;
          end if;
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

    -- RELATION MAX, once per field rather than once per item. Asked of EVERY relation now,
    -- not only of the ones that also said `multi`: it is the cardinality, so a single relation
    -- handed two targets is refused here by the column's own name rather than being let
    -- through because a second word was missing.
    if v_type = 'relation' then
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

CREATE OR REPLACE FUNCTION platform.cutover_older_removal_rows(p_org uuid, p_tables uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(kind text, record_id uuid, table_id uuid, table_name text, what text, principal_kind text, kept_image boolean)
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
  with truth as (
    -- The older tables are the truth only until the organization presses its switch.
    select (platform._cutover_seam_last_done('older_tables', p_org)).direction is distinct from 'new' as older_is_truth
  ), ev as (
    select e.record_id, e.created, e.pre_image
      from platform.cutover_evaluation_write e
     where e.organization_id = p_org and e.replaced_at is null
  ), copied as (
    select d.id, coalesce(nullif(d.table_name, ''), 'Untitled table') as table_name
      from workbench.udt_datasets d
      join custom.record t on t.organization_id = p_org and t.id = d.id and t.data_class = 'table'
                          and t.deleted_at is null
                          and not coalesce((t.data ->> 'kept_by_the_app')::boolean, false)
     where d.organization_id = p_org and d.deleted_at is null
       and (p_tables is null or d.id = any (p_tables))
       and (select older_is_truth from truth)
  ), lists as (
    -- The live older lists whose copy is in the store: every one with a whole-organization run, and
    -- with a table run the lists its columns choose from.
    select l.id, coalesce(nullif(btrim(l.list_name), ''), 'Untitled list') as table_name
      from workbench.udt_structured_lists l
      join custom.record t on t.organization_id = p_org and t.id = l.id and t.data_class = 'table' and t.deleted_at is null
     where l.organization_id = p_org and l.deleted_at is null
       and (select older_is_truth from truth)
       and (p_tables is null
            or exists (select 1 from custom.record f
                        where f.organization_id = p_org and f.data_class = 'field' and f.deleted_at is null
                          and f.data ->> 'entity_definition_id' = any (p_tables::text[])
                          and f.data -> 'config' ->> 'options_table_id' = l.id::text))
  )
  -- rows
  select 'row', r.id, c.id, c.table_name, 'row ' || left(r.id::text, 8), null::text,
         (ev.record_id is not null)
    from copied c
    join custom.record r on r.organization_id = p_org and r.table_id = c.id and r.data_class = 'record'
    left join ev on ev.record_id = r.id
   where case when ev.record_id is not null then not ev.created and (ev.pre_image ->> 'deleted_at') is null
              else r.deleted_at is null end
     and not exists (select 1 from workbench.udt_dataset_rows w where w.id = r.id and w.deleted_at is null)
  union all
  -- columns
  select 'column', f.id, c.id, c.table_name, 'the column ' || coalesce(nullif(f.data ->> 'label', ''), f.data ->> 'key'), null, false
    from copied c
    join custom.record f on f.organization_id = p_org and f.data_class = 'field' and f.deleted_at is null
                        and f.data ->> 'entity_definition_id' = c.id::text
   where not exists (select 1 from ev where ev.record_id = f.id and ev.created)
     and not exists (select 1 from workbench.udt_dataset_fields o where o.id = f.id and o.deleted_at is null)
  union all
  -- choices
  select 'choice', r.id, l.id, l.table_name, 'the choice ' || coalesce(nullif(r.data ->> 'name', ''), left(r.id::text, 8)), null,
         (ev.record_id is not null)
    from lists l
    join custom.record r on r.organization_id = p_org and r.table_id = l.id and r.data_class = 'record'
    left join ev on ev.record_id = r.id
   where case when ev.record_id is not null then not ev.created and (ev.pre_image ->> 'deleted_at') is null
              else r.deleted_at is null end
     and coalesce(r.metadata #>> '{moved_from,table}', '') <> 'workbench.udt_dataset_rows'
     and not exists (select 1 from workbench.udt_structured_list_items i where i.id = r.id and i.deleted_at is null)
  union all
  -- LIST-COPY-PERMISSIVE: choices the MOVER invented. An earlier copy added a live row's off-list
  -- value to the column's choices (its `moved_from` names that row's cell, not an older choice).
  -- The older list never had it; the copy keeps the value as an other value instead, so the rerun
  -- takes the invented choice off the copy - unless an older choice with the same words now backs it.
  select 'invented_choice', r.id, r.table_id,
         coalesce(nullif(t.data ->> 'name', ''), 'Untitled list'),
         'the choice ' || coalesce(nullif(r.data ->> 'name', ''), nullif(r.data ->> 'title', ''), left(r.id::text, 8)),
         null, false
    from custom.record r
    join custom.record t on t.organization_id = p_org and t.id = r.table_id and t.data_class = 'table' and t.deleted_at is null
   where (select older_is_truth from truth)
     and r.organization_id = p_org and r.data_class = 'record' and r.deleted_at is null
     and r.metadata #>> '{moved_from,table}' = 'workbench.udt_dataset_rows'
     and not exists (select 1 from ev where ev.record_id = r.id and ev.created)
     and (p_tables is null
          or exists (select 1 from custom.record f
                      where f.organization_id = p_org and f.data_class = 'field' and f.deleted_at is null
                        and f.data ->> 'entity_definition_id' = any (p_tables::text[])
                        and f.data -> 'config' ->> 'options_table_id' = r.table_id::text))
     and not exists (select 1 from workbench.udt_structured_list_items i
                      where i.list_id = r.table_id and i.deleted_at is null
                        and lower(btrim(i.label)) = lower(btrim(coalesce(r.data ->> 'name', r.data ->> 'title', ''))))
     and not exists (select 1 from custom.record f
                       join workbench.udt_dataset_fields o on o.id = f.id and o.deleted_at is null
                       cross join lateral jsonb_array_elements(
                         case when jsonb_typeof(o.metadata #> '{format,options,choices}') = 'array'
                              then o.metadata #> '{format,options,choices}' else '[]'::jsonb end) c
                      where f.organization_id = p_org and f.data_class = 'field'
                        and f.data -> 'config' ->> 'options_table_id' = r.table_id::text
                        and lower(btrim(coalesce(case when jsonb_typeof(c) = 'object' then coalesce(c ->> 'value', c ->> 'label') else c #>> '{}' end, '')))
                            = lower(btrim(coalesce(r.data ->> 'name', r.data ->> 'title', ''))))
  union all
  -- whole tables a person archived on the older side
  select 'table', t.id, t.id, coalesce(nullif(d.table_name, ''), 'Untitled table'), 'the whole table', null, false
    from workbench.udt_datasets d
    join custom.record t on t.organization_id = p_org and t.id = d.id and t.data_class = 'table' and t.deleted_at is null
                        and not coalesce((t.data ->> 'kept_by_the_app')::boolean, false)
   where p_tables is null and (select older_is_truth from truth)
     and d.organization_id = p_org and d.deleted_at is not null and not (coalesce(d.metadata, '{}'::jsonb) ? 'moved_to')
  union all
  -- whole lists a person archived or deleted on the older side
  select 'list', t.id, t.id, coalesce(nullif(t.data ->> 'name', ''), 'Untitled list'), 'the whole list', null, false
    from custom.record t
   where p_tables is null and (select older_is_truth from truth)
     and t.organization_id = p_org and t.data_class = 'table' and t.deleted_at is null
     and t.metadata #>> '{moved_from,table}' = 'workbench.udt_structured_lists'
     and not exists (select 1 from workbench.udt_structured_lists l
                      where l.id = t.id and (l.deleted_at is null or platform._older_list_moved_by_switch(l.id)))
  union all
  -- shares the mover carried whose older share is gone
  select 'share', p.id, c.id, c.table_name,
         coalesce((select u.email from auth.users u where u.id = p.granted_to_user_id),
                  (select g.name from iam.organizations g where g.id = p.granted_to_organization_id), 'someone')
           || '''s share', case when p.granted_to_user_id is not null then 'person' else 'organization' end, false
    from copied c
    join custom.record t on t.organization_id = p_org and t.id = c.id and t.data_class = 'table'
    join iam.permissions p on p.resource_type = 'record' and p.resource_id = c.id and p.status = 'active'
                          and not coalesce(p.is_public, false)
   where jsonb_typeof(t.metadata -> 'older_shares_seen') = 'array'
     and t.metadata -> 'older_shares_seen' ? coalesce(p.granted_to_user_id, p.granted_to_organization_id)::text
     and not exists (select 1 from iam.permissions q
                      where q.resource_type = 'dataset' and q.resource_id = c.id and q.status = 'active'
                        and coalesce(q.granted_to_user_id, q.granted_to_organization_id)
                            = coalesce(p.granted_to_user_id, p.granted_to_organization_id))
  union all
  -- THE OTHER DIRECTION: what the rerun archived because the older one was gone, now live again.
  select r.metadata #>> '{removed_on_older,kind}' || '_back', r.id,
         case when r.data_class in ('table') then r.id
              when r.data_class = 'field' then nullif(r.data ->> 'entity_definition_id', '')::uuid
              else r.table_id end,
         null, coalesce(nullif(r.data ->> 'name', ''), nullif(r.data ->> 'label', ''), left(r.id::text, 8)), null, false
    from custom.record r
   where (select older_is_truth from truth)
     and r.organization_id = p_org and r.deleted_at is not null
     and jsonb_typeof(r.metadata -> 'removed_on_older') = 'object'
     and (case r.metadata #>> '{removed_on_older,kind}'
            when 'row'    then exists (select 1 from workbench.udt_dataset_rows w where w.id = r.id and w.deleted_at is null)
                               and (p_tables is null or r.table_id = any (p_tables))
                               and exists (select 1 from workbench.udt_datasets d where d.id = r.table_id and d.deleted_at is null)
            when 'column' then exists (select 1 from workbench.udt_dataset_fields o where o.id = r.id and o.deleted_at is null)
                               and (p_tables is null or r.data ->> 'entity_definition_id' = any (p_tables::text[]))
                               and exists (select 1 from workbench.udt_datasets d where d.id::text = r.data ->> 'entity_definition_id' and d.deleted_at is null)
            when 'choice' then exists (select 1 from workbench.udt_structured_list_items i where i.id = r.id and i.deleted_at is null)
                               and exists (select 1 from workbench.udt_structured_lists l where l.id = r.table_id and l.deleted_at is null)
            when 'table'  then p_tables is null and exists (select 1 from workbench.udt_datasets d where d.id = r.id and d.deleted_at is null)
            when 'list'   then p_tables is null and exists (select 1 from workbench.udt_structured_lists l where l.id = r.id and l.deleted_at is null)
            else false end);
$function$;

CREATE OR REPLACE FUNCTION platform.cutover_older_removals(p_org uuid, p_tables uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
  with x as (select * from platform.cutover_older_removal_rows(p_org, p_tables))
  select jsonb_build_object(
    'count',   (select count(*) from x where kind <> 'share'),
    'clears',  (select count(*) from x where kind <> 'share'),
    'shares',  (select count(*) from x where kind = 'share'),
    'by_kind', coalesce((select jsonb_object_agg(k, n) from (select kind as k, count(*) as n from x group by kind) g), '{}'::jsonb),
    'examples', coalesce((select jsonb_agg(e.says) from (
        select format('%s: %s', coalesce(x.table_name, 'a table'),
                      case when x.kind like '%\_back' escape '\'
                           then x.what || ' is back on the older side and archived on the copy'
                           when x.kind in ('table', 'list') then x.what || ' is archived on the older side and live on the copy'
                           when x.kind = 'invented_choice' then x.what || ' was never on the older list and is on the copy; the value it came from is kept as an other value'
                           else x.what || ' was removed on the older side and is still on the copy' end) as says
          from x where x.kind <> 'share' order by x.table_name, x.kind, x.what limit 5) e), '[]'::jsonb));
$function$;

CREATE OR REPLACE FUNCTION platform.cutover_carry_removals(p_org uuid, p_tables uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_r       record;
  v_done    jsonb := '{}'::jsonb;
  v_refused text[] := '{}';
  v_at      timestamptz := clock_timestamp();
  v_mark    jsonb;
  v_grant   jsonb;
  v_n       integer := 0;
  v_f       record;
  v_word    jsonb;
  v_key     text;
begin
  for v_r in select * from platform.cutover_older_removal_rows(p_org, p_tables)
              order by case when kind like '%\_back' escape '\' then 1 when kind in ('table', 'list') then 2 else 3 end, table_name, kind, record_id
  loop
    begin
      v_mark := jsonb_build_object('removed_on_older', jsonb_build_object(
                  'kind', v_r.kind, 'at', v_at,
                  'why', 'removed on the older side while it was the truth; copying again archived it here (lane MOVER-DELETIONS)'));
      if v_r.kind in ('row', 'choice') and v_r.kept_image then
        update platform.cutover_evaluation_write e
           set pre_image = jsonb_set(jsonb_set(e.pre_image, '{deleted_at}', to_jsonb(v_at)),
                                     '{metadata}', coalesce(e.pre_image -> 'metadata', '{}'::jsonb) || v_mark)
         where e.organization_id = p_org and e.record_id = v_r.record_id and e.replaced_at is null and not e.created;
      elsif v_r.kind in ('row', 'choice', 'table', 'list', 'column') then
        -- The mark goes on FIRST, while the record is live and its table still declares it: a retired
        -- column's record is no longer declared by its Table, and the field guard refuses any later
        -- write to it ("the table does not declare a field called truck" — the clone test, 2026-09-26).
        -- The savepoint takes the mark back if the door refuses.
        update custom.record set metadata = coalesce(metadata, '{}'::jsonb) || v_mark
         where organization_id = p_org and id = v_r.record_id;
        if v_r.kind = 'column' then
          perform custom.field_retire(p_org, v_r.record_id);
        else
          -- A table or list is archived with what it holds, as one archive event.
          perform custom.record_delete(p_org, v_r.record_id);
        end if;
      elsif v_r.kind = 'invented_choice' then
        -- LIST-COPY-PERMISSIVE. The copy never invents a choice: every column choosing from this
        -- list takes other values (the older lists did), the choice is archived (restorable, never
        -- deleted), and each cell that held it holds the words it came from, as an other value.
        -- Order matters: the setting first, so the rewritten cell is kept; the archive before the
        -- rewrite, so the words no longer resolve to a live choice.
        select coalesce(nullif(r.metadata ->> 'option_key', ''), '') , to_jsonb(coalesce(nullif(r.data ->> 'name', ''), r.data ->> 'title'))
          into v_key, v_word
          from custom.record r where r.organization_id = p_org and r.id = v_r.record_id;
        for v_f in
          select f.id, f.data ->> 'key' as k, (f.data ->> 'entity_definition_id')::uuid as tbl,
                 coalesce((f.data -> 'config' ->> 'allow_other')::boolean, false) as allows
            from custom.record f
           where f.organization_id = p_org and f.data_class = 'field' and f.deleted_at is null
             and f.data ->> 'type' = 'list'
             and f.data -> 'config' ->> 'options_table_id' = v_r.table_id::text
        loop
          if not v_f.allows then
            perform custom.field_update(p_org, v_f.id, jsonb_build_object('allow_other', true));
          end if;
        end loop;
        update custom.record set metadata = coalesce(metadata, '{}'::jsonb) || v_mark
         where organization_id = p_org and id = v_r.record_id;
        perform custom.record_delete(p_org, v_r.record_id);
        for v_f in
          select f.data ->> 'key' as k, (f.data ->> 'entity_definition_id')::uuid as tbl
            from custom.record f
           where f.organization_id = p_org and f.data_class = 'field' and f.deleted_at is null
             and f.data ->> 'type' = 'list'
             and f.data -> 'config' ->> 'options_table_id' = v_r.table_id::text
        loop
          update custom.record c
             set data = jsonb_set(c.data, array[v_f.k],
                   case when jsonb_typeof(c.data -> v_f.k) = 'array'
                        then (select jsonb_agg(case when e = to_jsonb(v_key) or e = to_jsonb(v_r.record_id::text) then v_word else e end order by o)
                                from jsonb_array_elements(c.data -> v_f.k) with ordinality x(e, o))
                        else v_word end)
           where c.organization_id = p_org and c.table_id = v_f.tbl and c.data_class = 'record'
             and v_key <> ''
             and (c.data -> v_f.k = to_jsonb(v_key) or c.data -> v_f.k = to_jsonb(v_r.record_id::text)
                  or (jsonb_typeof(c.data -> v_f.k) = 'array'
                      and (c.data -> v_f.k @> jsonb_build_array(v_key) or c.data -> v_f.k @> jsonb_build_array(v_r.record_id::text))));
        end loop;
      elsif v_r.kind = 'share' then
        select to_jsonb(p) into v_grant from iam.permissions p where p.id = v_r.record_id;
        perform custom.share_revoke(p_org, v_r.table_id, v_r.principal_kind,
                                    coalesce((v_grant ->> 'granted_to_user_id')::uuid, (v_grant ->> 'granted_to_organization_id')::uuid));
        update custom.record
           set metadata = jsonb_set(coalesce(metadata, '{}'::jsonb), '{shares_taken_back}',
                                    coalesce(metadata -> 'shares_taken_back', '[]'::jsonb)
                                    || jsonb_build_array(v_grant || jsonb_build_object('taken_back_at', v_at,
                                         'why', 'the older table no longer shares with them (lane MOVER-DELETIONS)')))
         where organization_id = p_org and id = v_r.table_id and data_class = 'table';
      elsif v_r.kind = 'column_back' then
        perform custom.field_restore(p_org, v_r.record_id);
        update custom.record set metadata = metadata - 'removed_on_older' where organization_id = p_org and id = v_r.record_id;
      elsif v_r.kind like '%\_back' escape '\' then
        perform custom.record_restore(p_org, v_r.record_id);
        update custom.record set metadata = metadata - 'removed_on_older' where organization_id = p_org and id = v_r.record_id;
      end if;
      v_done := jsonb_set(v_done, array[v_r.kind], to_jsonb(coalesce((v_done ->> v_r.kind)::int, 0) + 1));
    exception when others then
      v_refused := v_refused || format('%s — %s: %s', coalesce(v_r.table_name, 'a table'), v_r.what, sqlerrm);
    end;
  end loop;

  -- Whom each copied table's older table shares with, now: what the next run compares against.
  update custom.record t
     set metadata = jsonb_set(coalesce(t.metadata, '{}'::jsonb), '{older_shares_seen}', coalesce((
           select jsonb_agg(distinct coalesce(q.granted_to_user_id, q.granted_to_organization_id)::text)
             from iam.permissions q
            where q.resource_type = 'dataset' and q.resource_id = t.id and q.status = 'active'
              and not coalesce(q.is_public, false)), '[]'::jsonb))
    from workbench.udt_datasets d
   where t.organization_id = p_org and t.id = d.id and t.data_class = 'table' and t.deleted_at is null
     and d.organization_id = p_org and d.deleted_at is null
     and (p_tables is null or d.id = any (p_tables))
     and (platform._cutover_seam_last_done('older_tables', p_org)).direction is distinct from 'new'
     and t.metadata -> 'older_shares_seen' is distinct from coalesce((
           select jsonb_agg(distinct coalesce(q.granted_to_user_id, q.granted_to_organization_id)::text)
             from iam.permissions q
            where q.resource_type = 'dataset' and q.resource_id = t.id and q.status = 'active'
              and not coalesce(q.is_public, false)), '[]'::jsonb);
  get diagnostics v_n = row_count;

  return jsonb_build_object('carried', v_done, 'refused', to_jsonb(v_refused), 'share_marks', v_n, 'at', v_at);
end;
$function$;

CREATE OR REPLACE FUNCTION platform._cutover_seam_readiness(p_seam text, p_org uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  s platform.cutover_seam;
  v_checks jsonb := '[]'::jsonb;
  v_n bigint; v_c bigint; v_missing bigint; v_stale bigint; v_lag bigint;
  v_tn bigint; v_tc bigint; v_sn bigint; v_sc bigint; v_in bigint; v_ic bigint;
  v_names text;
  v_pre jsonb;
  v_count jsonb;
  v_any bigint; v_hooks bigint;
  v_ev jsonb;
  v_diff jsonb;
  v_part jsonb;
  v_rest text;
  v_ln bigint; v_lc bigint; v_lmiss bigint; v_lnames text;
  v_rm jsonb; v_rmn bigint;
begin
  select * into s from platform.cutover_seam where seam_key = p_seam and retired_at is null;
  if s.seam_key is null then
    return jsonb_build_object('ready', false, 'checked_at', now(), 'checks', jsonb_build_array(
      jsonb_build_object('key', 'known', 'says', 'This switch exists', 'met', false,
                         'detail', format('There is no switch called %s.', p_seam))));
  end if;

  if s.press_kind = 'platform_switch' then
    return jsonb_build_object('ready', false, 'checked_at', now(), 'checks', jsonb_build_array(
      jsonb_build_object('key', 'pressed_here', 'says', 'Switched for one organization', 'met', false,
                         'detail', 'This one switches for everyone at once, in its own rehearsed step, not from an organization''s settings.')));
  elsif s.press_kind = 'already_switched' then
    return jsonb_build_object('ready', false, 'checked_at', now(), 'checks', jsonb_build_array(
      jsonb_build_object('key', 'already', 'says', 'Already on the new system', 'met', true,
                         'detail', s.flip_does)));
  end if;

  if p_seam = 'older_tables' then
    -- ONE COUNT, shared with the mover's census (lane CUTOVER-CENSUS): the organization's live
    -- older tables against their live same-id copies; archived older tables and the option lists
    -- the app keeps are never counted on either side.
    v_count := platform.cutover_tables_copied(p_org);
    v_n := (v_count ->> 'older_live')::bigint;
    v_c := (v_count ->> 'copied')::bigint;
    v_missing := (v_count ->> 'rows_missing')::bigint;
    v_stale := (v_count ->> 'rows_stale')::bigint;
    select string_agg(x, ', ' order by x) into v_names
      from jsonb_array_elements_text(v_count -> 'not_yet') x;

    -- MOVER-CARRY-TAILS: every check of this switch says how many of its differences copying again
    -- clears (copy_again_clears) and how many it leaves (copy_again_leaves); the settings card offers
    -- "Copy again" only when one unmet check has something it clears, and each sentence says what to
    -- do about the rest instead.
    v_checks := v_checks || jsonb_build_object(
      'key', 'copied', 'says', 'Every table is copied into the new system', 'met', v_c = v_n,
      'copy_again_clears', greatest(v_n - v_c, 0), 'copy_again_leaves', 0,
      'detail', case when v_n = 0 then 'This organization has no older tables left.'
                     else format('%s of %s tables copied.', v_c, v_n)
                          || case when v_c < v_n then ' Not yet: ' || v_names || case when v_n - v_c > 5 then format(' and %s more', v_n - v_c - 5) else '' end || '.' else '' end end);

    -- LISTS-AFTER-SWITCH: the press archives the organization's live older pick lists too, and
    -- refuses (rolled back whole) when a list's Table-of-choices copy or any live choice is not in
    -- the store. Said here, before the press, with Copy again offered to bring them.
    select count(*), count(t.id),
           coalesce(sum(greatest(
             (select count(*) from workbench.udt_structured_list_items i where i.list_id = l.id and i.deleted_at is null)
             - coalesce((select count(*) from custom.record c
                          where c.organization_id = l.organization_id and c.table_id = l.id
                            and c.data_class = 'record' and c.deleted_at is null), 0), 0)), 0),
           string_agg(case when t.id is null then coalesce(nullif(btrim(l.list_name), ''), 'Untitled list') end, ', '
                      order by l.list_name)
      into v_ln, v_lc, v_lmiss, v_lnames
      from workbench.udt_structured_lists l
      left join custom.record t
        on t.organization_id = l.organization_id and t.id = l.id and t.data_class = 'table' and t.deleted_at is null
     where l.organization_id = p_org and l.deleted_at is null;

    v_checks := v_checks || jsonb_build_object(
      'key', 'lists_copied', 'says', 'Every pick list is copied into the new system',
      'met', v_lc = v_ln and v_lmiss = 0,
      'copy_again_clears', greatest(v_ln - v_lc, 0) + v_lmiss, 'copy_again_leaves', 0,
      'detail', case when v_ln = 0 then 'This organization has no older pick lists left.'
                     when v_lc = v_ln and v_lmiss = 0 then format('%s of %s pick lists copied, every choice in its copy.', v_lc, v_ln)
                     else format('%s of %s pick lists copied.', v_lc, v_ln)
                          || case when v_lnames is not null then ' Not yet: ' || v_lnames || '.' else '' end
                          || case when v_lmiss > 0 then format(' %s choices are not in their copies yet.', v_lmiss) else '' end
                          || ' Copying again brings them.' end);

    -- MOVER-DELETIONS: what the older side REMOVED since the copy — a row, a column, a list's choice,
    -- a whole table or list — that its copy still holds, and what the rerun archived whose older
    -- original is back. The rerun (platform.cutover_carry_removals) archives each on the copy, never a
    -- hard delete; until it runs, the switch would bring each one back to life.
    v_rm := platform.cutover_older_removals(p_org);
    v_rmn := coalesce((v_rm ->> 'count')::bigint, 0);
    v_checks := v_checks || jsonb_build_object(
      'key', 'removals_carried', 'says', 'Nothing removed from an older table or list is still on its copy',
      'met', v_rmn = 0, 'counts', v_rm -> 'by_kind',
      'copy_again_clears', v_rmn, 'copy_again_leaves', 0,
      'detail', case when v_rmn = 0
                     then 'Every row, column, choice, table and list removed on the older side is gone from its copy too, and no copy has a choice its older list never had.'
                     else format('%s %s the older side does not have %s still on the copies: %s. Copying again archives %s on the copies (restorable, never deleted).',
                                 v_rmn, case when v_rmn = 1 then 'thing' else 'things' end,
                                 case when v_rmn = 1 then 'is' else 'are' end,
                                 (select string_agg(x, '; ') from jsonb_array_elements_text(v_rm -> 'examples') x)
                                   || case when v_rmn > 5 then format(' and %s more', v_rmn - 5) else '' end,
                                 case when v_rmn = 1 then 'it' else 'them' end) end);

    v_checks := v_checks
      || jsonb_build_object('key', 'rows_present', 'says', 'No row is missing from a copy',
           'met', v_missing = 0, 'copy_again_clears', v_missing, 'copy_again_leaves', 0,
           'detail', case when v_missing = 0 then 'Every row of every copied table is in its copy.'
                          else format('%s rows are not in their copies yet. Copying the table again brings them.', v_missing) end)
      || jsonb_build_object('key', 'rows_current', 'says', 'No row was edited in an older table after it was copied',
           'met', v_stale = 0, 'copy_again_clears', v_stale, 'copy_again_leaves', 0,
           'detail', case when v_stale = 0 then 'Every copy is as current as its older table.'
                          else format('%s rows were edited in the older tables after they were copied. Copying again brings the edits.', v_stale) end);

    -- WHAT THE COPIES WOULD SHOW DIFFERENTLY (CUTOVER-READINESS). The rows checks above never looked
    -- at a table's colours, its columns' checks and formats, or who it is shared with, so the switch
    -- could show a copy that looks, refuses and opens differently from the older table while saying
    -- "ready". Each is compared here as the switch will leave the copy, and each difference is named.
    v_diff := platform.cutover_copy_differences(p_org);
    foreach v_rest in array array['colours', 'checks', 'formats', 'shares'] loop
      v_part := coalesce(v_diff -> v_rest, '{}'::jsonb);
      v_checks := v_checks || jsonb_build_object(
        'key', v_rest || '_match',
        'says', case v_rest when 'colours' then 'Every copy shows the colours its older table shows'
                            when 'checks' then 'No copy refuses a write its older table takes'
                            when 'formats' then 'Every column means on its copy what it means on its older table'
                            else 'Every copy is shared exactly as its older table' end,
        'met', coalesce((v_part ->> 'count')::int, 0) = 0,
        'counts', v_diff -> v_rest,
        'copy_again_clears', coalesce((v_part ->> 'clears')::int, 0),
        'copy_again_leaves', greatest(coalesce((v_part ->> 'count')::int, 0) - coalesce((v_part ->> 'clears')::int, 0), 0),
        'detail', platform.cutover_difference_sentence(v_rest, v_part));
    end loop;

    -- WHAT THE SWITCH REPLACES FIRST (COPY-WRITABLE). People may test the copies while the switch
    -- is off; the switch puts every row they changed back to the older table's version and
    -- archives the rows they added, and logs the counts. Always met: it is what the press does,
    -- said before it is pressed.
    v_ev := v_count -> 'evaluation';
    v_checks := v_checks
      || jsonb_build_object('key', 'test_edits_replaced', 'says', 'Test edits on the copies are replaced by the older tables first',
           'met', true,
           'counts', v_ev,
           'detail', case when coalesce((v_ev ->> 'rows')::bigint, 0) = 0
                          then 'Nobody has changed a copy while testing; nothing is replaced.'
                          else format('%s %s changed while testing, in %s %s: %s edited %s put back to the older table''s version, %s added %s archived (never deleted), %s table or column %s put back. Each table''s counts are kept in a log.',
                                      v_ev ->> 'rows', case when (v_ev ->> 'rows')::bigint = 1 then 'row was' else 'rows were' end,
                                      v_ev ->> 'tables', case when (v_ev ->> 'tables')::bigint = 1 then 'table' else 'tables' end,
                                      v_ev ->> 'edited', case when (v_ev ->> 'edited')::bigint = 1 then 'row is' else 'rows are' end,
                                      v_ev ->> 'added', case when (v_ev ->> 'added')::bigint = 1 then 'row is' else 'rows are' end,
                                      v_ev ->> 'settings', case when (v_ev ->> 'settings')::bigint = 1 then 'setting is' else 'settings are' end) end);

    -- What the switch cannot carry by itself (CUTOVER-PLAN D8, F19): an automation on "any older
    -- table" names no table to follow, and an outbound webhook subscribed to older row events has
    -- no copy to listen to. Either would go silent at the switch, so each holds it back, named.
    select count(*) into v_any from scheduler.sch_trigger t
     where t.organization_id = p_org and t.deleted_at is null and t.enabled and t.type = 'event'
       and t.config ->> 'entity_type' = 'user_table_row' and coalesce(t.config ->> 'table_id', '') = '';
    select count(*) into v_hooks from files.webhooks w
     where w.organization_id = p_org and w.is_active
       and w.event_types && array['row.created','row.updated','row.deleted','row.archived','row.restored']::text[];
    v_checks := v_checks
      || jsonb_build_object('key', 'automations_follow', 'says', 'Every "when a row changes" automation names its table',
           'met', v_any = 0, 'copy_again_clears', 0, 'copy_again_leaves', v_any,
           'detail', case when v_any = 0 then 'Each one moves to its table''s copy at the switch and back with Switch back.'
                          else format('%s automations run on a change to any older table. Pick the table each one watches first, so it can follow it.', v_any) end)
      || jsonb_build_object('key', 'webhooks_follow', 'says', 'No outbound webhook listens for older-table row changes',
           'met', v_hooks = 0, 'copy_again_clears', 0, 'copy_again_leaves', v_hooks,
           'detail', case when v_hooks = 0 then 'Nothing outside the platform is waiting on older-table changes.'
                          else format('%s outbound webhooks still listen for older-table row changes. Point each at its table''s changes in the new system first.', v_hooks) end);

  elsif p_seam = 'agent_context' then
    select count(*), count(*) filter (where r.id is not null and r.deleted_at is null)
      into v_tn, v_tc
      from context.scope_types t
      left join custom.record r on r.organization_id = p_org and r.id = t.id
     where t.organization_id = p_org and t.deleted_at is null;
    select count(*), count(*) filter (where r.id is not null and r.deleted_at is null)
      into v_sn, v_sc
      from context.scopes x
      join context.scope_types t on t.id = x.scope_type_id and t.deleted_at is null
      left join custom.record r on r.organization_id = p_org and r.id = x.id
     where x.organization_id = p_org and x.deleted_at is null;
    select count(*), count(*) filter (where r.id is not null and r.deleted_at is null)
      into v_in, v_ic
      from context.context_items i
      join context.scope_types t on t.id = i.scope_type_id and t.deleted_at is null
      left join custom.record r on r.organization_id = p_org and r.id = i.id
     where t.organization_id = p_org and i.deleted_at is null and i.is_active;

    v_checks := v_checks || jsonb_build_object(
      'key', 'copied', 'says', 'Every scope type, scope and context field is copied',
      'met', v_tc = v_tn and v_sc = v_sn and v_ic = v_in,
      'detail', case when v_tn = 0 then 'This organization has no scopes.'
                     else format('%s of %s scope types, %s of %s scopes, %s of %s context fields copied.',
                                 v_tc, v_tn, v_sc, v_sn, v_ic, v_in) end);

    select count(*) into v_lag
      from custom.io_outbox x
     where x.organization_id = p_org and x.event_key = 'context.follow'
       and x.consumed_at is null and x.deleted_at is null;

    v_checks := v_checks || jsonb_build_object(
      'key', 'follow_current', 'says', 'No edit is waiting to be copied', 'met', v_lag = 0,
      'detail', case when v_lag = 0 then 'The copy has every edit made in the current screens.'
                     else format('%s edits made in the current screens are waiting for the copy.', v_lag) end);
  end if;

  for v_pre in select * from jsonb_array_elements(s.prerequisites) loop
    v_checks := v_checks || jsonb_build_object(
      'key', v_pre ->> 'key', 'says', v_pre ->> 'says',
      'met', coalesce((v_pre ->> 'met')::boolean, false),
      'detail', v_pre ->> 'evidence',
      -- When a measured fact was last measured (the census writes it; every release re-runs it).
      'measured_at', v_pre ->> 'measured_at');
  end loop;

  return jsonb_build_object(
    'ready', not exists (select 1 from jsonb_array_elements(v_checks) c where not (c ->> 'met')::boolean),
    'checked_at', now(),
    'checks', v_checks);
end;
$function$;

CREATE OR REPLACE FUNCTION platform._cutover_carry_back(p_org uuid, p_last platform.cutover_seam_press, p_apply boolean, p_press uuid DEFAULT NULL::uuid, p_actor uuid DEFAULT NULL::uuid, p_accepted boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_at        timestamptz := p_last.pressed_at;
  v_ids       uuid[];
  v_t         record;
  v_r         record;
  v_f         record;
  v_s         record;
  v_w_id      uuid;
  v_w_data    jsonb;
  v_w_del     timestamptz;
  v_q         iam.permissions;
  v_revoke    jsonb;
  v_tr        custom.record;
  v_cols      jsonb;
  v_then      jsonb;
  v_then_data jsonb;
  v_patch     jsonb;
  v_arch      boolean;
  v_rest      boolean;
  v_style     jsonb;
  v_meta      jsonb;
  v_label     text;
  v_fmt_now   text;
  v_fmt_then  text;
  v_req       boolean;
  v_changed   boolean;
  v_name      text;
  v_desc      text;
  v_n         bigint;
  n_upd int; n_new int; n_arch int; n_rest int; n_col int; n_share int;
  b_colour boolean; b_renamed boolean;
  v_rows      jsonb;
  v_fields    jsonb;
  v_perms     jsonb;
  v_table_before jsonb;
  v_parts     text[];
  v_tnot      text[];
  v_says      text[] := '{}';
  v_not       text[] := '{}';
  v_tables    jsonb := '[]'::jsonb;
  v_born      jsonb;
  v_sentence  text;
  v_keep      text;
begin
  if p_last.id is null or p_last.direction <> 'new' or p_last.seam_key <> 'older_tables' then
    return jsonb_build_object('tables', '[]'::jsonb, 'says', '[]'::jsonb, 'not_carried', '[]'::jsonb,
                              'born', '[]'::jsonb, 'needs_confirm', false);
  end if;
  select coalesce(array_agg(x::uuid), '{}') into v_ids
    from jsonb_array_elements_text(coalesce(p_last.did -> 'archived', '[]'::jsonb)) x;

  if p_apply then
    v_keep := current_setting('app.relabel_keeps_updated_at', true);
    perform set_config('app.relabel_keeps_updated_at', 'on', true);
  end if;

  for v_t in
    select d.id, d.table_name::text as table_name, d.description, d.metadata, d.user_id, d.created_by
      from workbench.udt_datasets d
     where d.id = any (v_ids) and d.organization_id = p_org
     order by d.table_name, d.id
  loop
    n_upd := 0; n_new := 0; n_arch := 0; n_rest := 0; n_col := 0; n_share := 0;
    b_colour := false; b_renamed := false;
    v_rows := '[]'::jsonb; v_fields := '[]'::jsonb; v_perms := '[]'::jsonb; v_table_before := null;
    v_parts := '{}'; v_tnot := '{}';
    v_name := v_t.table_name;

    -- The columns both sides hold (same id: the mover kept it), keyed as each side keys its cells.
    select coalesce(jsonb_agg(jsonb_build_object(
             'name', f.field_name, 'key', cf.data ->> 'key', 'st', cf.data ->> 'type',
             'opt', cf.data -> 'config' ->> 'options_table_id', 'ot', f.data_type::text)), '[]'::jsonb)
      into v_cols
      from workbench.udt_dataset_fields f
      join custom.record cf on cf.organization_id = p_org and cf.id = f.id and cf.data_class = 'field'
     where f.table_id = v_t.id and f.deleted_at is null and cf.data ->> 'key' is not null;

    -- A. ROWS — each record the new system touched since the switch, against itself AT the switch.
    for v_r in
      select r.id, r.data, r.created_at, r.updated_at, r.deleted_at, r.created_by
        from custom.record r
       where r.organization_id = p_org and r.table_id = v_t.id and r.data_class = 'record'
         and greatest(r.created_at, r.updated_at, coalesce(r.deleted_at, r.created_at)) > v_at
       order by r.created_at, r.id
    loop
      v_then := null;
      select s.state into v_then from custom.record_state_as_of(v_r.id, v_at) s;
      v_then_data := coalesce(v_then -> 'data', '{}'::jsonb);
      v_w_id := null; v_w_data := null; v_w_del := null;
      select w.id, w.data, w.deleted_at into v_w_id, v_w_data, v_w_del from workbench.udt_dataset_rows w where w.id = v_r.id;

      select coalesce(jsonb_object_agg(c ->> 'name',
               coalesce(platform._carried_back_value(p_org, c ->> 'st', nullif(c ->> 'opt', '')::uuid, c ->> 'ot',
                                                    v_r.data -> (c ->> 'key')), 'null'::jsonb)), '{}'::jsonb)
        into v_patch
        from jsonb_array_elements(v_cols) c
       where (v_then is null and v_r.data ? (c ->> 'key'))
          or (v_then is not null and (v_r.data -> (c ->> 'key')) is distinct from (v_then_data -> (c ->> 'key')));

      if v_w_id is null then
        -- Made in the new system. Made and archived there: nobody ever saw it here; nothing to bring.
        continue when v_r.deleted_at is not null;
        n_new := n_new + 1;
        if p_apply then
          insert into workbench.udt_dataset_rows
            (id, table_id, organization_id, data, user_id, created_by, created_at, updated_at)
          values
            (v_r.id, v_t.id, p_org, v_patch, coalesce(v_r.created_by, v_t.user_id),
             coalesce(v_r.created_by, v_t.created_by, v_t.user_id), v_r.created_at, v_r.updated_at);
          v_rows := v_rows || jsonb_build_object('id', v_r.id, 'existed', false);
        end if;
        continue;
      end if;

      -- Only what the older row does not already say (compared as words: 12 and "12" are the same).
      select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) into v_patch
        from jsonb_each(v_patch) e
       where (v_w_data ->> e.key) is distinct from (e.value #>> '{}');
      v_arch := v_r.deleted_at is not null and v_r.deleted_at > v_at and v_w_del is null;
      v_rest := v_r.deleted_at is null and v_w_del is not null and (v_then ->> 'deleted_at') is not null;
      continue when v_patch = '{}'::jsonb and not v_arch and not v_rest;

      if v_patch <> '{}'::jsonb then n_upd := n_upd + 1; end if;
      if v_arch then n_arch := n_arch + 1; end if;
      if v_rest then n_rest := n_rest + 1; end if;
      if p_apply then
        v_rows := v_rows || jsonb_build_object('id', v_r.id, 'existed', true, 'data', v_w_data, 'deleted_at', v_w_del);
        update workbench.udt_dataset_rows
           set data = coalesce(data, '{}'::jsonb) || v_patch,
               deleted_at = case when v_arch then v_r.deleted_at when v_rest then null else deleted_at end,
               updated_at = v_r.updated_at,
               updated_by = coalesce(p_actor, updated_by)
         where id = v_r.id;
      end if;
    end loop;

    -- B. COLUMNS the new system changed since the switch: name, format and required carry; a
    -- column archived there is archived here; checks and kind are the older table's own and are named.
    for v_f in
      select f.id, f.field_name::text as field_name, coalesce(f.display_name, f.field_name)::text as label,
             f.metadata, f.is_required, f.deleted_at as fdel, cf.data as cdoc, cf.deleted_at as cdel
        from workbench.udt_dataset_fields f
        join custom.record cf on cf.organization_id = p_org and cf.id = f.id and cf.data_class = 'field'
       where f.table_id = v_t.id and f.deleted_at is null
         and greatest(cf.updated_at, coalesce(cf.deleted_at, cf.updated_at)) > v_at
       order by f.field_order, f.id
    loop
      v_then := null;
      select s.state into v_then from custom.record_state_as_of(v_f.id, v_at) s;
      continue when v_then is null;
      v_then_data := coalesce(v_then -> 'data', '{}'::jsonb);
      v_changed := false;
      v_label := v_f.label;
      v_meta := coalesce(v_f.metadata, '{}'::jsonb);
      v_req := v_f.is_required;

      if (v_f.cdoc ->> 'label') is distinct from (v_then_data ->> 'label')
         and nullif(btrim(v_f.cdoc ->> 'label'), '') is not null and (v_f.cdoc ->> 'label') <> v_f.label then
        v_label := v_f.cdoc ->> 'label'; v_changed := true;
      end if;
      v_fmt_now  := coalesce(v_f.cdoc ->> 'format', v_f.cdoc -> 'display_format' ->> 'id');
      v_fmt_then := coalesce(v_then_data ->> 'format', v_then_data -> 'display_format' ->> 'id');
      if v_fmt_now is distinct from v_fmt_then and v_fmt_now is distinct from (v_meta -> 'format' ->> 'id') then
        v_meta := case when v_fmt_now is null then v_meta - 'format'
                       else v_meta || jsonb_build_object('format',
                              coalesce(case when jsonb_typeof(v_meta -> 'format') = 'object' then v_meta -> 'format' end, '{}'::jsonb)
                              || jsonb_build_object('id', v_fmt_now)) end;
        v_changed := true;
      end if;
      if coalesce((v_f.cdoc ->> 'required')::boolean, false) is distinct from coalesce((v_then_data ->> 'required')::boolean, false)
         and coalesce((v_f.cdoc ->> 'required')::boolean, false) is distinct from coalesce(v_f.is_required, false) then
        v_req := coalesce((v_f.cdoc ->> 'required')::boolean, false); v_changed := true;
      end if;
      if (v_f.cdoc -> 'rules') is distinct from (v_then_data -> 'rules') then
        v_tnot := v_tnot || format('%s: the checks on the column %s changed in the new system. The older table keeps the checks it had.',
                                   v_name, v_f.label);
      end if;
      if (v_f.cdoc ->> 'type') is distinct from (v_then_data ->> 'type') then
        v_tnot := v_tnot || format('%s: the column %s became a different kind of column in the new system. The older table keeps it as the kind it was.',
                                   v_name, v_f.label);
      end if;
      if v_f.cdel is not null and (v_then ->> 'deleted_at') is null then
        v_changed := true;
      end if;
      continue when not v_changed;
      n_col := n_col + 1;
      if p_apply then
        v_fields := v_fields || jsonb_build_object('id', v_f.id, 'display_name', v_f.label, 'metadata', v_f.metadata,
                                                   'is_required', v_f.is_required, 'deleted_at', v_f.fdel);
        update workbench.udt_dataset_fields
           set display_name = v_label, metadata = v_meta, is_required = v_req,
               deleted_at = case when v_f.cdel is not null and (v_then ->> 'deleted_at') is null then v_f.cdel else deleted_at end
         where id = v_f.id;
      end if;
    end loop;

    -- C. COLUMNS ADDED IN THE NEW SYSTEM: the older table has no column for them. Named, never guessed.
    for v_f in
      select cf.id, coalesce(nullif(cf.data ->> 'label', ''), cf.data ->> 'key') as label, cf.data ->> 'key' as key
        from custom.record cf
       where cf.organization_id = p_org and cf.data_class = 'field' and cf.deleted_at is null
         and cf.data ->> 'entity_definition_id' = v_t.id::text and cf.created_at > v_at
         and not exists (select 1 from workbench.udt_dataset_fields f where f.id = cf.id)
       order by cf.created_at, cf.id
    loop
      select count(*) into v_n from custom.record r
       where r.organization_id = p_org and r.table_id = v_t.id and r.data_class = 'record' and r.deleted_at is null
         and r.data ? v_f.key and (r.data -> v_f.key) not in ('null'::jsonb, '""'::jsonb, '[]'::jsonb);
      v_tnot := v_tnot || format('%s: the column %s was added in the new system. It and its %s stay in the new table and are not carried back.',
                                 v_name, v_f.label, case v_n when 1 then '1 value' else v_n || ' values' end);
    end loop;

    -- D. THE TABLE ITSELF: name, description, colours — against the copy at the switch.
    v_tr := null;
    select * into v_tr from custom.record
     where organization_id = p_org and id = v_t.id and data_class = 'table';
    if v_tr.id is not null and greatest(v_tr.updated_at, coalesce(v_tr.deleted_at, v_tr.updated_at)) > v_at then
      v_then := null;
      select s.state into v_then from custom.record_state_as_of(v_t.id, v_at) s;
      if v_then is not null then
        v_then_data := coalesce(v_then -> 'data', '{}'::jsonb);
        v_desc := v_t.description;
        if (v_tr.data ->> 'name') is distinct from (v_then_data ->> 'name')
           and nullif(btrim(v_tr.data ->> 'name'), '') is not null and (v_tr.data ->> 'name') <> v_t.table_name then
          v_name := v_tr.data ->> 'name'; b_renamed := true;
        end if;
        if (v_tr.data ->> 'description') is distinct from (v_then_data ->> 'description')
           and (v_tr.data ->> 'description') is distinct from v_t.description then
          v_desc := v_tr.data ->> 'description'; b_renamed := true;
        end if;
        v_style := v_t.metadata -> 'style';
        if (v_tr.data -> 'decorations') is distinct from (v_then_data -> 'decorations') then
          v_style := platform._decorations_in_older_words(v_t.id, v_tr.data -> 'decorations', v_t.metadata -> 'style');
          b_colour := v_style is distinct from (v_t.metadata -> 'style');
        end if;
        if p_apply and (b_renamed or b_colour) then
          v_table_before := jsonb_build_object('table_name', v_t.table_name, 'description', v_t.description,
                                               'style', v_t.metadata -> 'style');
          update workbench.udt_datasets
             set table_name = v_name, description = v_desc,
                 metadata = case when b_colour then jsonb_set(coalesce(metadata, '{}'::jsonb), '{style}', coalesce(v_style, '{}'::jsonb))
                                 else metadata end
           where id = v_t.id;
        end if;
      end if;
    end if;

    -- E. SHARES: the copy's people and organization lane, at the copy's level, on the older table;
    -- a share the copy no longer holds is TAKEN BACK here through the older Share dialog's own door
    -- (public.revoke_resource_access / revoke_resource_org_access, as the person pressing), which
    -- removes the grant: an archived grant still opened the table (iam.accessible_entity_ids admits
    -- every status but rejected), so marking it archived left the person seeing it (lane
    -- LIST-COPY-PERMISSIVE, 2026-09-26). The grant as it was is kept in this carry's history
    -- (before.shares) so the carry can be undone. A refusal by the door is named, never skipped.
    -- A share to someone outside the organization rides on an outside invitation on the copy and is
    -- left as it is.
    for v_s in
      select p.granted_to_user_id as u, p.granted_to_organization_id as o, p.permission_level as lvl
        from iam.permissions p
       where p.resource_type = 'record' and p.resource_id = v_t.id and p.status = 'active'
         and not coalesce(p.is_public, false)
    loop
      v_q := null;
      select q.* into v_q from iam.permissions q
       where q.resource_type = 'dataset' and q.resource_id = v_t.id
         and ((v_s.u is not null and q.granted_to_user_id = v_s.u) or (v_s.o is not null and q.granted_to_organization_id = v_s.o))
       limit 1;
      if v_q.id is null then
        n_share := n_share + 1;
        if p_apply then
          insert into iam.permissions (resource_type, resource_id, granted_to_user_id, granted_to_organization_id,
                                       is_public, permission_level, created_by, status, granted_via)
          values ('dataset', v_t.id, v_s.u, v_s.o, false, v_s.lvl, p_actor, 'active', 'share');
          v_perms := v_perms || jsonb_build_object('user', v_s.u, 'organization', v_s.o, 'existed', false);
        end if;
      elsif v_q.status <> 'active' or v_q.permission_level <> v_s.lvl then
        n_share := n_share + 1;
        if p_apply then
          v_perms := v_perms || jsonb_build_object('id', v_q.id, 'existed', true, 'status', v_q.status, 'level', v_q.permission_level);
          update iam.permissions set status = 'active', permission_level = v_s.lvl where id = v_q.id;
        end if;
      end if;
    end loop;
    for v_q in
      select q.* from iam.permissions q
       where q.resource_type = 'dataset' and q.resource_id = v_t.id and q.status = 'active'
         and not coalesce(q.is_public, false)
         and not exists (select 1 from iam.permissions p
                          where p.resource_type = 'record' and p.resource_id = v_t.id and p.status = 'active'
                            and (p.granted_to_user_id = q.granted_to_user_id or p.granted_to_organization_id = q.granted_to_organization_id))
         and not exists (select 1 from iam.invitations i
                          where i.target_type = 'custom_table' and i.target_id = v_t.id and i.deleted_at is null
                            and i.status in ('pending', 'accepted')
                            and (i.invited_user_id = q.granted_to_user_id
                                 or lower(i.email) = (select lower(u.email) from auth.users u where u.id = q.granted_to_user_id)))
    loop
      n_share := n_share + 1;
      if p_apply then
        v_revoke := case when v_q.granted_to_user_id is not null
                         then public.revoke_resource_access('dataset', v_t.id, v_q.granted_to_user_id)
                         else public.revoke_resource_org_access('dataset', v_t.id, v_q.granted_to_organization_id) end;
        if coalesce((v_revoke ->> 'success')::boolean, false) then
          v_perms := v_perms || jsonb_build_object('id', v_q.id, 'existed', true, 'status', v_q.status, 'level', v_q.permission_level,
                                                   'taken_back', true, 'grant', to_jsonb(v_q));
        else
          n_share := n_share - 1;
          v_tnot := v_tnot || format('%s: a share the new table no longer holds is still on the older table (%s).',
                                     v_name, coalesce(v_revoke ->> 'error', 'the Share door refused'));
        end if;
      end if;
    end loop;

    -- The sentence for this table.
    if n_upd > 0 then v_parts := v_parts || format('%s edited %s', n_upd, case n_upd when 1 then 'row' else 'rows' end); end if;
    if n_new > 0 then v_parts := v_parts || format('%s new %s', n_new, case n_new when 1 then 'row' else 'rows' end); end if;
    if n_arch > 0 then v_parts := v_parts || format('%s archived %s', n_arch, case n_arch when 1 then 'row' else 'rows' end); end if;
    if n_rest > 0 then v_parts := v_parts || format('%s restored %s', n_rest, case n_rest when 1 then 'row' else 'rows' end); end if;
    if n_col > 0 then v_parts := v_parts || format('%s changed %s', n_col, case n_col when 1 then 'column' else 'columns' end); end if;
    if b_renamed then v_parts := v_parts || 'its new name'::text; end if;
    if b_colour then v_parts := v_parts || 'its colours'::text; end if;
    if n_share > 0 then v_parts := v_parts || format('%s changed %s', n_share, case n_share when 1 then 'share' else 'shares' end); end if;

    continue when cardinality(v_parts) = 0 and cardinality(v_tnot) = 0;
    v_sentence := case when cardinality(v_parts) = 0 then null
                       else format('%s: %s %s carried back into the older table.', v_name,
                              case cardinality(v_parts) when 1 then v_parts[1]
                                   else array_to_string(v_parts[1:cardinality(v_parts) - 1], ', ') || ' and ' || v_parts[cardinality(v_parts)] end,
                              case when cardinality(v_parts) = 1 and (v_parts[1] like '1 %' or v_parts[1] = 'its new name')
                                   then 'is' else 'are' end) end;
    if v_sentence is not null then v_says := v_says || v_sentence; end if;
    v_not := v_not || v_tnot;
    v_tables := v_tables || jsonb_build_object(
      'table_id', v_t.id, 'table_name', v_name, 'rows_updated', n_upd, 'rows_created', n_new,
      'rows_archived', n_arch, 'rows_restored', n_rest, 'columns_changed', n_col, 'colours_changed', b_colour,
      'renamed', b_renamed, 'shares_changed', n_share, 'says', v_sentence, 'not_carried', to_jsonb(v_tnot));

    if p_apply then
      perform history.migration_record(
        p_org, 'carried back from the new tables at Switch back', 'udt_dataset', v_t.id,
        jsonb_build_object(
          'kind', 'none',
          'why', 'the older table''s rows are not store records, so the store''s own undo cannot write them; '
                 || 'before holds each carried older row, column, table and share exactly as it was — writing those back undoes this carry',
          'before', jsonb_build_object('rows', v_rows, 'fields', v_fields, 'table', v_table_before, 'shares', v_perms),
          'press', p_press, 'undid_press', p_last.id,
          'counts', jsonb_build_object('rows_updated', n_upd, 'rows_created', n_new, 'rows_archived', n_arch,
                                       'rows_restored', n_rest, 'columns_changed', n_col, 'colours_changed', b_colour,
                                       'renamed', b_renamed, 'shares_changed', n_share),
          'not_carried', to_jsonb(v_tnot),
          'not_carried_accepted', cardinality(v_tnot) > 0 and coalesce(p_accepted, false)),
        concat_ws(' ', v_sentence, array_to_string(v_tnot, ' ')));
    end if;
  end loop;

  -- F. TABLES MADE IN THE NEW SYSTEM while switched: they stay there, and the /data home lists them.
  select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'name', coalesce(nullif(t.data ->> 'name', ''), '(unnamed table)'))
                            order by t.data ->> 'name', t.id), '[]'::jsonb)
    into v_born
    from custom.record t
   where t.organization_id = p_org and t.data_class = 'table' and t.deleted_at is null
     and not coalesce((t.data ->> 'kept_by_the_app')::boolean, false)
     and t.created_at > v_at
     and not exists (select 1 from workbench.udt_datasets d where d.id = t.id);
  if jsonb_array_length(v_born) > 0 then
    v_says := v_says || format('%s made in the new system %s there and on /data: %s.',
                               case jsonb_array_length(v_born) when 1 then '1 table' else jsonb_array_length(v_born) || ' tables' end,
                               case jsonb_array_length(v_born) when 1 then 'stays' else 'stay' end,
                               (select string_agg(b ->> 'name', ', ') from jsonb_array_elements(v_born) b));
  end if;
  if cardinality(v_says) = 0 and cardinality(v_not) = 0 then
    v_says := array['Nothing was written in the new tables since the switch, so the older tables come back exactly as they were.'];
  end if;

  if p_apply then
    perform set_config('app.relabel_keeps_updated_at', coalesce(v_keep, ''), true);
  end if;

  return jsonb_build_object('since', v_at, 'undoes', p_last.id, 'tables', v_tables,
                            'says', to_jsonb(v_says), 'not_carried', to_jsonb(v_not), 'born', v_born,
                            'needs_confirm', cardinality(v_not) > 0);
end;
$function$;

