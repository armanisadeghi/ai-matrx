-- THE INVERSE of fieldguards_a_refusal_is_a_whole_sentence.sql — every guard body and
-- the field_retire door exactly as they were on the main database at 2026-09-19, and the
-- three new helper functions removed. Run this and the store refuses in mid-air again.
set lock_timeout = '5s';
set statement_timeout = '600s';


CREATE OR REPLACE FUNCTION custom._containment_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_parent   uuid;
  v_ceiling  integer;
  v_depth    integer;
  v_org_set  boolean;
  v_exists   boolean;
begin
  -- THE DOOR. One call to the ONE predicate (`custom.assert_store_door`), which
  -- judges `custom.caller_role()` - the identity the caller actually held - and not
  -- `current_user`, which a SECURITY DEFINER door has already rewritten to itself.
  -- The switch never removes a check: everything below runs exactly as before.
  perform custom.assert_store_door(new.organization_id, 'custom.record');

  v_parent := custom.containment_parent(new.data);   -- REC-7 refuses two parents in here
  if v_parent is null then
    return new;
  end if;

  -- REC-8, the shortest cycle there is.
  if v_parent = new.id then
    raise exception 'this would put it inside itself'
      using errcode = '23514',
            hint = 'REC-8: containment is a tree, and a record cannot be its own container.';
  end if;

  select true into v_exists
    from custom.record r
   where r.organization_id = new.organization_id and r.id = v_parent;
  if v_exists is not true then
    raise exception 'that container is not in this organization'
      using errcode = '23503',
            hint = 'REC-8 / T15: containment never crosses an organization. The route across organizations is a relation the Table allows, never a parent.';
  end if;

  -- REC-8 / T3: reparenting under one's own descendant. Walking UP from the new parent and
  -- meeting this record is exactly that, and it is the same walk the cycle check needs.
  if exists (select 1 from custom.containment_chain(new.organization_id, v_parent) c
              where c.ancestor_id = new.id) then
    raise exception 'this would put it inside itself'
      using errcode = '23514',
            hint = 'REC-8: that container is already inside this one, so containment would stop being a tree.';
  end if;

  -- REC-N-4: the ceiling, read out of the function.
  v_ceiling := custom.containment_depth_ceiling(new.organization_id);
  select coalesce(max(c.depth), 0) into v_depth
    from custom.containment_chain(new.organization_id, v_parent) c;
  v_depth := v_depth + 2;   -- + the parent itself, + this record
  if v_depth > v_ceiling then
    select platform.knob_resolve('custom', 'containment_depth_ceiling', new.organization_id) is distinct from
           platform.knob_resolve('custom', 'containment_depth_ceiling', null)
      into v_org_set;
    if v_org_set then
      raise exception 'that is more things inside things than this organization allows, which is %', v_ceiling
        using errcode = '23514',
              hint = 'REC-N-4: the organization set this limit and can raise it, up to the platform maximum.';
    else
      raise exception 'that is more things inside things than this organization allows'
        using errcode = '23514',
              hint = 'REC-N-4: no number is quoted because the organization did not set one. Move it somewhere less deeply nested, or raise the limit for this organization.';
    end if;
  end if;

  return new;
end;
$function$;


CREATE OR REPLACE FUNCTION custom._dated_values_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_values  jsonb := coalesce(new.data -> '_values', '{}'::jsonb);
  v_key     text;
  v_env     jsonb;
  v_periods jsonb;
  v_p       jsonb;
  v_k       text;
  v_from    date;
  v_to      date;
  v_prev_to date;
  v_field   jsonb;
  v_rtype   text;
  v_type_fld text;
  v_n       integer;
begin
  -- THE DOOR. One call to the ONE predicate, which judges custom.caller_role() and never
  -- current_user. The switch decides WHO may write and never which check runs.
  perform custom.assert_store_door(new.organization_id, 'custom.record');

  if jsonb_typeof(v_values) <> 'object' then
    return new;                      -- the envelope law refuses the malformed block by name
  end if;

  for v_key, v_env in select * from jsonb_each(v_values) loop
    if jsonb_typeof(v_env) <> 'object' or not (v_env ? 'dated') then
      continue;
    end if;
    v_periods := v_env -> 'dated';
    if jsonb_typeof(v_periods) = 'null' then
      continue;
    end if;

    -- HIS-5: the modifier is OPT-IN PER FIELD, so a period on a Field that did not declare
    -- `dated` is refused. Without this the modifier means nothing — every Field would be
    -- dated the moment anybody wrote a period into one.
    if new.data_class = 'record' and new.table_id is not null then
      v_type_fld := custom.table_type_field(new.organization_id, new.table_id);
      if v_type_fld is not null then
        v_rtype := new.data ->> v_type_fld;
      end if;
      select f.data into v_field
        from custom.applicable_fields(new.organization_id, new.table_id, v_rtype) f
       where f.data ->> 'key' = v_key
       limit 1;
      if v_field is not null and coalesce((v_field ->> 'dated')::boolean, false) is not true then
        raise exception '% keeps a single value, so it cannot be given dates it was true between.',
                        coalesce(v_field ->> 'label', v_key)
          using errcode = '23514',
                hint = format('HIS-5: only a field that says its values are dated carries a history of what was true when. Turn that on for %s first, and every value it already holds stays exactly as it is.',
                              coalesce(v_field ->> 'label', v_key));
      end if;
    end if;

    if jsonb_typeof(v_periods) <> 'array' then
      raise exception '% says when it was true, and that has to be a list of periods — it is a %.', v_key, jsonb_typeof(v_periods)
        using errcode = '23514',
              hint = 'HIS-5: each period is a from, a to and the value that held between them. Leave from or to out (write null) for "since forever" and "still true".';
    end if;

    v_n := 0;
    v_prev_to := null;
    for v_p in select value from jsonb_array_elements(v_periods) loop
      v_n := v_n + 1;
      if jsonb_typeof(v_p) <> 'object' then
        raise exception '% has a period that is a %, and a period is a from, a to and a value.', v_key, jsonb_typeof(v_p)
          using errcode = '23514', hint = 'HIS-5.';
      end if;
      for v_k in select k from jsonb_object_keys(v_p) k loop
        if v_k not in ('from', 'to', 'value') then
          raise exception '%: a period carries "%", which is not part of one. A period holds from, to and value.', v_key, v_k
            using errcode = '23514',
                  hint = 'HIS-5: who wrote it and when they wrote it are the RECORDED clock and live in History — never inside a period, or the two clocks would be one.';
        end if;
      end loop;
      if not (v_p ? 'value') then
        raise exception '%: a period with no value says nothing was true between those dates, which is not the same as a period.', v_key
          using errcode = '23514',
                hint = 'HIS-5: leave the gap out instead — the dates with no period covering them are the dates nothing was true.';
      end if;

      begin
        v_from := nullif(v_p ->> 'from', '')::date;
        v_to   := nullif(v_p ->> 'to', '')::date;
      exception when others then
        raise exception '%: a period runs between two dates, and one of "%" and "%" is not one.', v_key, v_p ->> 'from', v_p ->> 'to'
          using errcode = '23514', hint = 'HIS-5: write them as dates, such as 2024-06-01.';
      end;

      if v_from is not null and v_to is not null and v_to <= v_from then
        raise exception '%: a period cannot end on or before it starts (% to %).', v_key, v_from, v_to
          using errcode = '23514', hint = 'HIS-5: the period runs from the first date up to, but not including, the second.';
      end if;

      -- WITHOUT OVERLAPS, and it is why the list must be in order: two periods covering one
      -- day would make "what was true on that day" have two answers, which is the failure
      -- MariaDB's own constraint exists to prevent.
      if v_n > 1 then
        if v_from is null then
          raise exception '%: only the first period may run from the beginning of time, and this is period %.', v_key, v_n
            using errcode = '23514', hint = 'HIS-5: the periods are in order, oldest first.';
        end if;
        if v_prev_to is null then
          raise exception '%: period % is still true, so nothing can come after it.', v_key, v_n - 1
            using errcode = '23514', hint = 'HIS-5: give period ' || (v_n - 1) || ' the date it stopped being true.';
        end if;
        if v_from < v_prev_to then
          raise exception '%: two periods both cover %. A date has one answer.', v_key, v_from
            using errcode = '23514',
                  hint = 'HIS-5: the periods must not overlap — end the earlier one on or before the later one starts.';
        end if;
      end if;
      v_prev_to := v_to;
    end loop;
  end loop;

  return new;
end;
$function$;


CREATE OR REPLACE FUNCTION custom._field_shape_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
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
begin
  -- THE DOOR. One call to the ONE predicate (`custom.assert_store_door`), which
  -- judges `custom.caller_role()` - the identity the caller actually held - and not
  -- `current_user`, which a SECURITY DEFINER door has already rewritten to itself.
  -- The switch never removes a check: everything below runs exactly as before.
  perform custom.assert_store_door(new.organization_id, 'custom.record');

  -- ── TABLE-DELETE. A RETIREMENT IS NOT A CHANGE OF SHAPE. The only change in this update is
  --    `deleted_at` going from nothing to a time: the document is byte-for-byte what it was.
  --    Judging its shape here is how a Field whose Table has already gone became undeletable
  --    through every door in the store — the guard could never approve it and never would.
  --    Taking a row OUT of the store is the one write a shape check has nothing to say about.
  --    The store door above — custom.assert_store_door, which resolves custom/system_enabled
  --    and closes this store to every caller but its owner while that knob is off — still runs
  --    first, and the organization wall and every access check are untouched.
  if tg_op = 'UPDATE'
     and old.deleted_at is null and new.deleted_at is not null
     and new.data is not distinct from old.data
     and new.table_id is not distinct from old.table_id
     and new.organization_id = old.organization_id then
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
                    coalesce(v_key, 'nothing')
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
            hint = 'FLD-1: one of list, range, text, relation, formula. What looks like a second behavior is a modifier (FLD-2) or a Rule (FLD-3).';
  end if;
  v_type := d ->> 'type';
  if v_type is null or v_type not in ('list', 'range', 'text', 'relation', 'formula') then
    raise exception 'the field % says its behavior is %, and a field behaves as a list, a range, text, a relation or a formula',
                    v_label, coalesce(v_type, 'nothing')
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
    if v_kind is null or v_kind not in ('min', 'max', 'pattern', 'length', 'equals_field', 'differs_from_field') then
      raise exception 'the field % carries a rule of kind %, which this validator cannot execute',
                      v_label, coalesce(v_kind, 'nothing')
        using errcode = '23514',
              hint = 'FLD-3: an attached validation Rule declares its kind. The general Rule object, its versions and its four uses are W1-RULE''s (REC-15, REC-17, REC-19).';
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
                    v_label, coalesce(v_source, 'nothing')
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

  -- FLD-12 / FLD-13: the relation properties, and they belong to a relation.
  if v_type = 'relation' then
    if nullif(d ->> 'relation_target', '') is null then
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
                    v_label, coalesce(d ->> 'sensitivity', 'nothing')
      using errcode = '23514', hint = 'FLD-12: sensitivity is public, internal, confidential or restricted.';
  end if;
  if coalesce(d ->> 'context_policy', '') not in ('include', 'summarize', 'exclude', 'on_request') then
    raise exception 'the field % has to say whether an agent may see its values, and it says %',
                    v_label, coalesce(d ->> 'context_policy', 'nothing')
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
  if v_edef is not null then
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


CREATE OR REPLACE FUNCTION custom._field_type_converts_values()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_key       text;
  v_label     text;
  v_table     uuid;
  v_was       text;
  v_now       text;
  v_converted integer := 0;
  v_retired_n integer := 0;
  r           record;
  v_val       jsonb;
  v_new       jsonb;
  v_data      jsonb;
  v_retired   jsonb;
  v_alts      jsonb;
  v_keep_alts jsonb;
  v_alt       jsonb;
  v_conv_alt  jsonb;
  v_alts_retired integer := 0;
begin
  -- THE DOOR. custom.assert_store_door resolves custom/system_enabled and, while it is false,
  -- this store takes writes only from the role that owns custom.record. The switch never
  -- removes a check: everything below runs exactly as before.
  if not coalesce((platform.knob_resolve('custom', 'system_enabled', new.organization_id) #>> '{}')::boolean, false) then
    perform custom.assert_store_door(new.organization_id, 'custom.record');
  end if;

  if new.table_id is distinct from custom.field_kernel_id() or new.data_class = 'kernel' then
    return null;
  end if;

  v_was := custom.field_behaviour(old.data);
  v_now := custom.field_behaviour(new.data);
  if v_was is not distinct from v_now then
    return null;                          -- the Field still asks for the same thing
  end if;

  v_key   := new.data ->> 'key';
  v_label := coalesce(nullif(new.data ->> 'label', ''), v_key, 'this field');
  v_table := nullif(new.data ->> 'entity_definition_id', '')::uuid;
  if v_key is null or v_table is null then
    return null;
  end if;

  for r in
    select x.id, x.data from custom.record x
     where x.organization_id = new.organization_id
       and x.table_id = v_table
       and x.deleted_at is null
       and x.data ? v_key
  loop
    v_val := r.data -> v_key;
    if v_val is null or jsonb_typeof(v_val) = 'null' then
      continue;
    end if;
    v_new := custom.field_value_convert(new.data, v_val);

    if v_new is not null then
      -- THE ALTERNATES COME TOO. VAL-3: an alternate is a candidate for the SAME field, so
      -- custom.validate_value_envelope judges it by the SAME behaviour — and a converted value
      -- sitting beside an unconverted alternate is a document that cannot be written at all.
      -- (Measured: converting Phone to a number while a merge's "222" alternate stayed a
      -- string failed the very write that was doing the converting.) One that does not convert
      -- is kept in _retired as what it was, with its rank and its source.
      v_data := r.data;
      v_alts := coalesce(v_data -> '_values' -> v_key -> 'alternates', '[]'::jsonb);
      if jsonb_typeof(v_alts) = 'array' and jsonb_array_length(v_alts) > 0 then
        v_keep_alts := '[]'::jsonb;
        v_retired   := coalesce(v_data -> '_retired', '[]'::jsonb);
        if jsonb_typeof(v_retired) <> 'array' then
          v_retired := '[]'::jsonb;
        end if;
        for v_alt in select e from jsonb_array_elements(v_alts) e loop
          v_conv_alt := custom.field_value_convert(new.data, v_alt -> 'value');
          if v_conv_alt is not null then
            v_keep_alts := v_keep_alts || jsonb_build_array(v_alt || jsonb_build_object('value', v_conv_alt));
          else
            v_retired := v_retired || jsonb_build_object(
              'key', v_key, 'label', v_label, 'value', v_alt -> 'value',
              'was_an_alternate_ranked', v_alt -> 'rank', 'envelope', v_alt -> 'src',
              'reason', format('%s changed what it holds and this other candidate for it does not convert, so it is kept here as it was (FLD-4 / T12)', v_label),
              'at', to_jsonb(now()));
            v_alts_retired := v_alts_retired + 1;
          end if;
        end loop;
        if jsonb_array_length(v_keep_alts) > 0 then
          v_data := jsonb_set(v_data, array['_values', v_key, 'alternates'], v_keep_alts);
        else
          v_data := jsonb_set(v_data, array['_values', v_key],
                              (v_data -> '_values' -> v_key) - 'alternates');
        end if;
        if jsonb_array_length(v_retired) > 0 then
          v_data := v_data || jsonb_build_object('_retired', v_retired);
        end if;
      end if;
      if v_new is distinct from v_val then
        v_data := v_data || jsonb_build_object(v_key, v_new);
        v_converted := v_converted + 1;
      end if;
      if v_data is distinct from r.data then
        update custom.record x set data = v_data
         where x.organization_id = new.organization_id and x.id = r.id;
      end if;
    else
      -- IT DOES NOT CONVERT. The same place, the same shape and the same reason T8's retype
      -- already uses: the value and its envelope are kept in `_retired`, and the key leaves
      -- the document so the record can be written again.
      v_data    := r.data;
      v_retired := coalesce(v_data -> '_retired', '[]'::jsonb);
      if jsonb_typeof(v_retired) <> 'array' then
        v_retired := '[]'::jsonb;
      end if;
      v_retired := v_retired || jsonb_build_object(
        'key',      v_key,
        'label',    v_label,
        'value',    v_val,
        'envelope', v_data -> '_values' -> v_key,
        'reason',   format('%s now holds %s, and %s is not one — this value was kept here when the field changed, neither coerced nor deleted (FLD-4 / T12)',
                           v_label,
                           case when new.data ->> 'type' = 'range'
                                     and coalesce(new.data -> 'config' ->> 'kind', 'number') in ('date','datetime')
                                then 'dates'
                                when new.data ->> 'type' = 'range' then 'numbers'
                                when new.data ->> 'type' = 'text' then 'words'
                                when new.data ->> 'type' = 'list' then 'one of its choices'
                                when new.data ->> 'type' = 'relation' then 'a link to a record'
                                else coalesce(new.data ->> 'type', 'something else') end,
                           coalesce('"' || (v_val #>> '{}') || '"', 'that value')),
        'at',       to_jsonb(now()));
      v_data := v_data - v_key;
      if jsonb_typeof(v_data -> '_values') = 'object' then
        v_data := jsonb_set(v_data, '{_values}', (v_data -> '_values') - v_key);
      end if;
      v_data := v_data || jsonb_build_object('_retired', v_retired);
      update custom.record x set data = v_data
       where x.organization_id = new.organization_id and x.id = r.id;
      v_retired_n := v_retired_n + 1;
    end if;
  end loop;

  -- 🚨 VIS-2 (2026-09-19) — AND IT WRITES ITS MIGRATION ROW, IN THIS SAME TRANSACTION.
  -- MEASURED: `custom.migrate_retype` records a `history.migration_log` row before it patches
  -- the Field, but the CONVERSION is this trigger's, and this trigger is what runs when the
  -- same Field is retyped through the ordinary write door. So a type change made the normal
  -- way rewrote every value of the table, moved what would not convert into `_retired`, and
  -- left NOTHING in the migration log: HIS-8's undo did not exist for it and the Migrations
  -- screen did not know it had happened. The row is written here, where the rewrite is, so
  -- both routes leave the same trace.
  --
  -- The inverse is the Field's own previous shape, which is a `patch` on the Field record -
  -- the identical inverse `custom.migrate_retype` stores, and `custom.record_update` on the
  -- Field is what puts it back, firing this trigger again to convert the values the other way.
  --
  -- ONE ROW, NOT TWO. When `custom.migrate_retype` is the caller it has already recorded its
  -- row a few statements earlier IN THIS TRANSACTION, and `now()` is the transaction
  -- timestamp, so `applied_at >= now()` is exactly "recorded by this transaction" - it cannot
  -- match an older row and there are no newer ones.
  if not exists (select 1 from history.migration_log m
                  where m.organization_id = new.organization_id
                    and m.verb = 'retype'
                    and m.target_kind = 'field'
                    and m.target_id = new.id
                    and m.applied_at >= now()) then
    perform history.migration_record(
      new.organization_id, 'retype', 'field', new.id,
      jsonb_build_object(
        'kind', 'patch',
        'record_id', new.id::text,
        'patch', jsonb_strip_nulls(jsonb_build_object(
                   'type',   old.data ->> 'type',
                   'config', old.data -> 'config'))),
      format('%s behaves as %s instead of %s; %s value(s) converted, %s kept in _retired with the reason, %s other candidate(s) kept too. Recorded by the conversion itself, so a retype through the ordinary write door leaves the same trace as one through custom.migrate_retype (FLD-4 / T12 / HIS-8).',
             v_label, v_now, v_was, v_converted, v_retired_n, v_alts_retired));
  end if;

  if v_converted > 0 or v_retired_n > 0 or v_alts_retired > 0 then
    raise notice 'custom: "%" changed what it holds (% -> %): % value(s) converted, % kept in _retired with the reason, % other candidate(s) kept too.',
      v_label, v_was, v_now, v_converted, v_retired_n, v_alts_retired;
  end if;
  return null;
end;
$function$;


CREATE OR REPLACE FUNCTION custom._field_type_parity_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  d          jsonb := new.data;
  v_label    text;
  v_declared text;
  v_derived  text;
  v_type     text;
  v_edef     uuid;
  v_via      text;
  v_via_fld  jsonb;
begin
  -- THE DOOR. One call to the ONE predicate (`custom.assert_store_door`), which
  -- judges `custom.caller_role()` - the identity the caller actually held - and not
  -- `current_user`, which a SECURITY DEFINER door has already rewritten to itself.
  -- The switch never removes a check: everything below runs exactly as before.
  perform custom.assert_store_door(new.organization_id, 'custom.record');

  -- Only field definitions, and never the kernel `Field` row itself (REC-27).
  if new.table_id is distinct from custom.field_kernel_id() or new.data_class = 'kernel' then
    return new;
  end if;

  v_label    := coalesce(nullif(d ->> 'label', ''), d ->> 'key', 'this field');
  v_type     := d ->> 'type';
  v_declared := nullif(d ->> 'parity_type', '');
  v_derived  := custom.parity_type(d);
  v_edef     := nullif(d ->> 'entity_definition_id', '')::uuid;

  -- (a) A NAME NOBODY SHIPS. Refused with the list, so a typo is not a silent plain field.
  if v_declared is not null
     and not exists (select 1 from custom.parity_field_types() t
                      where t.parity_type = v_declared) then
    raise exception 'the field % says it is a % and that is not one of the field types this system ships',
                    v_label, v_declared
      using errcode = '23514',
            hint = 'FLD-11: select parity_type from custom.parity_field_types() - select, multi_select, member, attachment, lookup, rollup, formula, url, email, phone, currency, percent, datetime.';
  end if;

  -- A Field that CALLS itself the formula parity type and carries no expression of its own.
  -- (A behaviour-`formula` Field whose answer comes from a compute Rule derives NULL above
  -- and never reaches here — it is W1-RULE's, and this lane does not demand anything of it.)
  if v_declared = 'formula' and jsonb_typeof(d -> 'config' -> 'expr') is distinct from 'object' then
    raise exception 'the field % is worked out and does not say how', v_label
      using errcode = '23514',
            hint = 'FLD-11 / REC-15: config.expr is a Rule expression - the same shape and the same evaluator a Rule uses (select node from custom.rule_node_kinds()).';
  end if;

  -- (b) THE DECLARATION AND WHAT IT ACTUALLY DECLARES HAVE TO AGREE. This is the whole of
  -- ruling 1 as a refusal: a parity type is made of a behaviour and its modifiers, so a
  -- field that CALLS itself a currency while declaring no unit is refused naming BOTH words.
  if v_declared is not null and v_derived is distinct from v_declared then
    raise exception 'the field % calls itself a %, and what it actually says it is is %',
                    v_label, v_declared, coalesce(v_derived, 'a plain ' || coalesce(v_type, 'field'))
      using errcode = '23514',
            hint = format('FLD-11: %s is made of %s. A parity type is a behaviour plus its modifiers, never a behaviour of its own - fix the declaration, not the name.',
                          v_declared,
                          coalesce((select t.made_of from custom.parity_field_types() t
                                     where t.parity_type = v_declared), 'a behaviour'));
  end if;

  -- (c) THE FOUR WITH NO LIVE IMPLEMENTATION have declarations of their own, and each one
  -- is refused BY THE FIELD'S NAME rather than by an evaluator failing later.
  if v_derived in ('lookup', 'rollup') then
    v_via := nullif(d -> 'config' ->> 'via', '');
    if v_via is null then
      raise exception 'the field % has to say which relation it reads through', v_label
        using errcode = '23514',
              hint = 'FLD-11: a lookup and a rollup both travel along a relation. config.via names a relation Field of this same table, by its key.';
    end if;
    if v_edef is not null then
      select f.data into v_via_fld
        from custom.record f
       where f.organization_id = new.organization_id
         and f.table_id = custom.field_kernel_id()
         and f.deleted_at is null
         and (f.data ->> 'entity_definition_id')::uuid = v_edef
         and f.data ->> 'key' = v_via
       limit 1;
      if v_via_fld is null then
        raise exception 'the field % reads through a relation called %, and this table has no field called %',
                        v_label, v_via, v_via
          using errcode = '23514', hint = 'FLD-11: config.via names a field of the SAME table, by key.';
      end if;
      if v_via_fld ->> 'type' <> 'relation' then
        raise exception 'the field % reads through %, and % is not a relation - it is a %',
                        v_label, v_via, v_via, v_via_fld ->> 'type'
          using errcode = '23514',
                hint = 'FLD-11: a lookup reads a value through a RELATION and a rollup aggregates along one. A value on this same record is a formula, not a lookup.';
      end if;
      if v_derived = 'rollup' and not coalesce((v_via_fld ->> 'multi')::boolean, false) then
        raise exception 'the field % adds up % and % points at one thing at a time', v_label, v_via, v_via
          using errcode = '23514',
                hint = 'FLD-11: a rollup aggregates MANY records. Give the relation the multi modifier, or read the one value with a lookup.';
      end if;
    end if;
  end if;

  if v_derived = 'lookup' and nullif(d -> 'config' ->> 'pick', '') is null then
    raise exception 'the field % has to say which value it reads on the other side', v_label
      using errcode = '23514', hint = 'FLD-11: config.pick names a field key of the related record.';
  end if;

  if v_derived = 'rollup' then
    if nullif(d -> 'config' ->> 'agg', '') not in ('sum', 'count', 'min', 'max', 'avg') then
      raise exception 'the field % says it works out % of the records it points at, and it adds them up, counts them, or takes the smallest, the largest or the average',
                      v_label, coalesce(d -> 'config' ->> 'agg', 'nothing')
        using errcode = '23514', hint = 'FLD-11: config.agg is sum, count, min, max or avg.';
    end if;
    if (d -> 'config' ->> 'agg') <> 'count'
       and nullif(d -> 'config' ->> 'of', '') is null then
      raise exception 'the field % has to say which value of the records it points at it works out', v_label
        using errcode = '23514',
              hint = 'FLD-11: config.of names a field key on the far side. Only count needs no field, because it counts the records themselves.';
    end if;
    -- ANNOUNCED, NOT SILENT (rule 16). A rollup stamped at write time goes stale the moment
    -- a contained record moves, and nothing in this campaign yet propagates a child's write
    -- to its parents. So the declaration is refused rather than quietly wrong.
    if (d ->> 'compute_on') = 'write' then
      raise exception 'the field % adds up other records and says it works itself out when this record is saved, and it would then be out of date the moment one of them changed',
                      v_label
        using errcode = '23514',
              hint = 'FLD-11 / FLD-9: declare compute_on read for a rollup - it is then worked out from the contained records every time it is read, and is never stale. Stamping one at write time needs a child-to-parent recompute that no lane has built; W3-MIG/W3-HIST is where it belongs when somebody wants the cache.';
    end if;
  end if;

  -- (d) THE NINE THAT DO EXIST, each refused on the one thing that makes it that type.
  if v_derived = 'attachment'
     and coalesce(d ->> 'on_target_delete', '') = 'cascade' then
    raise exception 'the field % says deleting the file deletes the record that shows it', v_label
      using errcode = '23514',
            hint = 'REC-31: a picture is a File record reached through a relation. Removing the file removes the attachment, never the record it was attached to - set_null or restrict.';
  end if;

  if v_derived in ('url', 'email', 'phone')
     and not exists (select 1 from custom.field_rules(d) r where r.kind = 'pattern') then
    raise exception 'the field % holds a % and nothing says what a % looks like', v_label, v_derived, v_derived
      using errcode = '23514',
            hint = 'FLD-3 / FLD-11: the format says how to SHOW it; what makes it enforceable is an attached validation Rule of kind pattern. A format with no rule is a label on an empty box.';
  end if;

  if v_derived = 'percent'
     and not exists (select 1 from custom.field_rules(d) r where r.kind in ('min', 'max')) then
    raise exception 'the field % holds a percentage and nothing says the range it lives in', v_label
      using errcode = '23514',
            hint = 'FLD-3 / FLD-11: attach min and max Rules. A percent field that takes -40 is a percent in name only.';
  end if;

  return new;
end;
$function$;


CREATE OR REPLACE FUNCTION custom._merge_field_shape_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  d          jsonb := new.data;
  v_name     text;
  v_mod      text;
  c_sources  constant text[] := array['literal','record','state','actor','platform','user_input','tool','derived'];
  c_semantic constant text[] := array['value','reference','resolver','computed','collection'];
  c_mods     constant text[] := array['scoped','temporal','collection','live','fallback','formatted','required'];
  c_policies constant text[] := array['must_supply','shown_overridable','shown_locked','server_fixed','derived'];
begin
  -- THE DOOR. One call to the ONE predicate (`custom.assert_store_door`), which
  -- judges `custom.caller_role()` - the identity the caller actually held - and not
  -- `current_user`, which a SECURITY DEFINER door has already rewritten to itself.
  -- The switch never removes a check: everything below runs exactly as before.
  perform custom.assert_store_door(new.organization_id, 'custom.record');

  if new.table_id is distinct from custom.merge_field_kernel_id() or new.data_class = 'kernel' then
    return new;
  end if;

  v_name := coalesce(nullif(d ->> 'key', ''), 'this merge field');

  -- DYN-2, the whole law in one refusal: no combination is ever its own type.
  if d ? 'type' then
    raise exception '% tries to be one kind of thing, and a merge field is three separate answers', v_name
      using errcode = '23514',
            hint = 'DYN-2: say where the value comes FROM (source), what it resolves INTO (semantic_type), and how it behaves (modifiers). Fusing them makes an enum like overrideable_state_person_reference_variable.';
  end if;

  if jsonb_typeof(d -> 'source') = 'array' then
    raise exception '% names more than one source, and a merge field has exactly one', v_name
      using errcode = '23514', hint = 'DYN-2: an ordered list of alternatives is the fallback modifier, not a second source.';
  end if;
  if coalesce(d ->> 'source', '') <> all (c_sources) then
    raise exception '% says its value comes from %, and the list of places a value may come from is closed',
                    v_name, coalesce(d ->> 'source', 'nothing')
      using errcode = '23514',
            hint = 'DYN-2: literal, record, state, actor, platform, user_input, tool, derived.';
  end if;

  if jsonb_typeof(d -> 'semantic_type') = 'array' then
    raise exception '% resolves into more than one kind of thing, and a merge field resolves into exactly one', v_name
      using errcode = '23514', hint = 'DYN-2: exactly one semantic type.';
  end if;
  if coalesce(d ->> 'semantic_type', '') <> all (c_semantic) then
    raise exception '% says it resolves into %, and it resolves into a value, a reference, a resolver, something computed, or a collection',
                    v_name, coalesce(d ->> 'semantic_type', 'nothing')
      using errcode = '23514', hint = 'DYN-2: value, reference, resolver, computed, collection.';
  end if;

  if jsonb_typeof(d -> 'modifiers') is distinct from 'array' then
    raise exception '% has to list how it behaves, even when the list is empty', v_name
      using errcode = '23514', hint = 'DYN-2: any number of modifiers.';
  end if;
  for v_mod in select m #>> '{}' from jsonb_array_elements(d -> 'modifiers') m loop
    if v_mod <> all (c_mods) then
      raise exception '% behaves as %, and that is not one of the ways a merge field can behave', v_name, v_mod
        using errcode = '23514',
              hint = 'DYN-2: scoped, temporal, collection, live, fallback, formatted, required.';
    end if;
  end loop;

  if d ? 'override_policy'
     and coalesce(d ->> 'override_policy', '') <> all (c_policies) then
    raise exception '% says a person may change it by %, and that is not one of the five ways',
                    v_name, coalesce(d ->> 'override_policy', 'nothing')
      using errcode = '23514',
            hint = 'DYN-2: must_supply, shown_overridable, shown_locked, server_fixed, derived. Who may override is a separate permission (override_requires), never the same knob.';
  end if;

  return new;
end;
$function$;


CREATE OR REPLACE FUNCTION custom._merge_field_temporal_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  d      jsonb := new.data;
  v_name text;
  v_t    jsonb;
  v_mode text;
  v_clk  text;
  v_temporal boolean;
begin
  -- THE DOOR, the one predicate, exactly as every other RETURNS trigger in this schema.
  perform custom.assert_store_door(new.organization_id, 'custom.record');

  if new.table_id is distinct from custom.merge_field_kernel_id() or new.data_class = 'kernel' then
    return new;
  end if;

  v_name := coalesce(nullif(d ->> 'key', ''), 'this merge field');
  v_temporal := exists (select 1 from jsonb_array_elements(coalesce(d -> 'modifiers', '[]'::jsonb)) m
                         where m #>> '{}' = 'temporal');
  v_t := d -> 'temporal';

  if not v_temporal then
    if v_t is not null and jsonb_typeof(v_t) <> 'null' then
      raise exception '% says which moment to read, and it does not behave as something that reads a moment.', v_name
        using errcode = '23514',
              hint = 'DYN-19: add "temporal" to its modifiers, or take the temporal block out. A declaration nothing reads is the silent kind of wrong.';
    end if;
    return new;
  end if;

  if v_t is null or jsonb_typeof(v_t) <> 'object' then
    raise exception '% reads a moment, and it does not say which one.', v_name
      using errcode = '23514',
            hint = 'DYN-19: say {"mode": "live"} for whatever it is now, {"mode": "as_of", "clock": "world"|"recorded", "at": "<date>"} for a moment, or {"mode": "snapshot"} to freeze what it read when it was set.';
  end if;

  v_mode := v_t ->> 'mode';
  if coalesce(v_mode, '') not in ('live', 'as_of', 'snapshot') then
    raise exception '% reads its value %, and a merge field reads it live, as of a moment, or as a snapshot.', v_name, coalesce(v_mode, 'nobody said how')
      using errcode = '23514', hint = 'DYN-19: live, as_of, snapshot.';
  end if;

  if v_mode = 'as_of' then
    v_clk := v_t ->> 'clock';
    if coalesce(v_clk, '') not in ('world', 'recorded') then
      raise exception '% reads a past moment and does not say on which clock.', v_name
        using errcode = '23514',
              hint = 'DYN-19 / HIS-5: "world" asks what was TRUE then; "recorded" asks what this store SAID then. They are different questions and neither answers the other.';
    end if;
    if nullif(v_t ->> 'at', '') is null then
      raise exception '% reads a past moment and does not say which moment.', v_name
        using errcode = '23514', hint = 'DYN-19: "at" is the date, such as 2024-03-01.';
    end if;
    begin
      if v_clk = 'world' then
        perform (v_t ->> 'at')::date;
      else
        perform (v_t ->> 'at')::timestamptz;
      end if;
    exception when others then
      raise exception '% reads as of "%", and that is not a moment.', v_name, v_t ->> 'at'
        using errcode = '23514', hint = 'DYN-19: a date for the world clock, a date and time for the recorded one.';
    end;
  elsif v_t ? 'at' and jsonb_typeof(v_t -> 'at') <> 'null' then
    raise exception '% reads its value %, so naming a moment changes nothing.', v_name, v_mode
      using errcode = '23514',
            hint = 'DYN-19: only as_of reads a moment. A setting nothing reads is how a person comes to believe they pinned something they did not.';
  end if;

  return new;
end;
$function$;


CREATE OR REPLACE FUNCTION custom._promoted_field_cap_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_table uuid;
  v_n     integer;
  v_open  boolean;
begin
  -- THE SWITCH NEVER REMOVES A CHECK (the `w1_val_validation_reads_its_switch.sql` pattern).
  -- `custom/field_index_guard` is READ here and named in the refusal, so a person who meets
  -- the cap knows which switch governs promotion — but the cap is refused whether it is on
  -- or off. A cap that lifts when a flag is off is not a cap; it is a cap-shaped comment.
  -- B1: the switch this cap NAMES is the organization's own system switch
  -- (custom/system_enabled), read through custom.store_is_open. The cap is refused whether it
  -- is on or off — a cap that lifts when a switch is off is not a cap, it is a cap-shaped
  -- comment — and the refusal says which switch governs promotion so a person meeting the cap
  -- is not sent hunting for a knob that does not decide anything.

  if new.table_id is distinct from custom.field_kernel_id()
     or new.data_class = 'kernel'
     or not coalesce((new.data ->> 'promoted')::boolean, false) then
    return new;
  end if;

  v_table := nullif(new.data ->> 'entity_definition_id', '')::uuid;
  if v_table is null then
    return new;   -- a Field of a STANDARD table (FLD-8's table_token) has no custom Table cap
  end if;

  select count(*) into v_n
    from custom.record f
   where f.organization_id = new.organization_id
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null
     and f.id is distinct from new.id
     and coalesce((f.data ->> 'promoted')::boolean, false)
     and nullif(f.data ->> 'entity_definition_id', '')::uuid = v_table;

  if v_n >= custom.promoted_field_cap() then
    raise exception 'this table already has % fields set up for fast sorting and searching, which is as many as it can have',
                    custom.promoted_field_cap()
      using errcode = '23514',
            hint = format('REC-N-5: %s promoted fields per table, published rather than discovered. Take one off another field first. (The switch that governs promotion here is the organization''s own custom/system_enabled, and it is currently %s — the cap holds either way.)',
                          custom.promoted_field_cap(), case when v_open then 'on' else 'off' end);
  end if;

  return new;
end $function$;


CREATE OR REPLACE FUNCTION custom._record_field_validation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_type_field text;
  v_rtype      text;
  v_fields     custom.record[];
  v_gone       custom.record[];
  g            custom.record;
  v_retired    jsonb;
begin
  -- THE DOOR. One call to the ONE predicate (`custom.assert_store_door`), which
  -- judges `custom.caller_role()` - the identity the caller actually held - and not
  -- `current_user`, which a SECURITY DEFINER door has already rewritten to itself.
  -- The switch never removes a check: everything below runs exactly as before.
  perform custom.assert_store_door(new.organization_id, 'custom.record');
  -- THE SWITCH, by name: custom.assert_store_door resolves custom/system_enabled through
  -- custom.store_is_open, and while it is off this store takes writes only from the role
  -- that owns custom.record.

  -- The kernel is defined in code, the Tables and the Fields and the merge fields have their
  -- own shape guards, and a relation row carries an edge rather than a document.
  if new.data_class in ('kernel', 'relation')
     or new.table_id is null
     or new.table_id = custom.table_kernel_id()
     or new.table_id = custom.field_kernel_id() then
    return new;
  end if;

  -- A RETIREMENT IS NOT A CHANGE OF SHAPE. The same sentence `custom._field_shape_guard`
  -- already carries (lane TABLE-DELETE, 2026-09-19), in the other guard that judges a soft
  -- delete as a write. An update whose ONLY change is `deleted_at` going from nothing to a
  -- time is a record leaving, and re-validating its values refuses the delete for something
  -- the delete ITSELF is causing: REC-51 says a relation field points at a LIVE record, and a
  -- cascade deletes the target FIRST — so the record going with it could never be deleted at
  -- all, and T7's `cascade` and `set_null` arms both died here. Nothing else is waived: a
  -- write that changes the document, the table or the data class is validated exactly as
  -- before, and so is a restore (deleted_at going back to nothing).
  if tg_op = 'UPDATE'
     and old.deleted_at is null and new.deleted_at is not null
     and old.data       is not distinct from new.data
     and old.table_id   is not distinct from new.table_id
     and old.data_class is not distinct from new.data_class then
    return new;
  end if;

  v_type_field := custom.table_type_field(new.organization_id, new.table_id);
  if v_type_field is not null then
    v_rtype := new.data ->> v_type_field;
  end if;

  select array_agg(f) into v_fields
    from custom.applicable_fields(new.organization_id, new.table_id, v_rtype) f;
  if v_fields is null then
    return new;               -- a Table that declared no definitions validates nothing.
  end if;

  -- T8's retype: a Value that stops applying is neither coerced nor deleted. It is moved,
  -- WITH ITS REASON, and the field is then hidden by custom.applicable_fields. This is a
  -- STAND-IN for History and says so: W3-HIST (HIS-*) owns the real store, and when it
  -- lands this block writes there instead. Until then the value is in the document, not gone.
  if tg_op = 'UPDATE' and v_type_field is not null
     and (old.data ->> v_type_field) is distinct from v_rtype then
    select array_agg(f) into v_gone
      from custom.applicable_fields(new.organization_id, new.table_id,
                                    old.data ->> v_type_field) f
     where not exists (select 1
                         from custom.applicable_fields(new.organization_id, new.table_id, v_rtype) a
                        where a.id = f.id);
    v_retired := coalesce(new.data -> '_retired', '[]'::jsonb);
    if v_gone is not null then
      foreach g in array v_gone loop
        if old.data ? (g.data ->> 'key') and jsonb_typeof(old.data -> (g.data ->> 'key')) <> 'null' then
          v_retired := v_retired || jsonb_build_object(
            'key',   g.data ->> 'key',
            'label', g.data ->> 'label',
            'value', old.data -> (g.data ->> 'key'),
            -- W1-VAL (1 of 2): a retired Value takes its ENVELOPE with it. Where a value came
            -- from, who wrote it and its other candidates are facts about that value, so they
            -- belong beside it in _retired and not orphaned in _values pointing at nothing.
            'envelope', old.data -> '_values' -> (g.data ->> 'key'),
            'reason', format('this record became a %s, and %s does not apply to a %s',
                             coalesce(v_rtype, 'different kind of thing'),
                             coalesce(nullif(g.data ->> 'label', ''), g.data ->> 'key'),
                             coalesce(v_rtype, 'record of that kind')),
            'at', to_jsonb(now()));
          new.data := new.data - (g.data ->> 'key');
          if jsonb_typeof(new.data -> '_values') = 'object' then
            new.data := jsonb_set(new.data, '{_values}',
                                  (new.data -> '_values') - (g.data ->> 'key'));
          end if;
        end if;
      end loop;
      if jsonb_array_length(v_retired) > 0 then
        new.data := jsonb_set(new.data, '{_retired}', v_retired);
      end if;
    end if;
  end if;

  perform custom.validate_values(new.organization_id, v_fields, new.data, v_rtype);
  -- W1-VAL (2 of 2): the half of the envelope law that needs the definitions.
  perform custom.validate_value_envelope(new.organization_id, v_fields, new.data);
  return new;
end;
$function$;


CREATE OR REPLACE FUNCTION custom._rule_shape_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  d        jsonb := new.data;
  v_name   text;
  v_kind   text;
  v_uses   jsonb;
  v_scope  uuid;
  v_use    text;
  v_leaf   jsonb;
  v_fid    uuid;
  v_fkey   text;
  v_tgt    uuid;
  v_names  text[];
begin
  -- THE DOOR. One call to the ONE predicate (`custom.assert_store_door`), which
  -- judges `custom.caller_role()` - the identity the caller actually held - and not
  -- `current_user`, which a SECURITY DEFINER door has already rewritten to itself.
  -- The switch never removes a check: everything below runs exactly as before.
  perform custom.assert_store_door(new.organization_id, 'custom.record');

  -- Only Rules an organization DECLARED. The kernel `Rule` row is the kernel Table itself
  -- (REC-27: defined in code, not data) and is exempt, exactly as W1-TABLE and W1-FIELD
  -- exempt theirs.
  if new.table_id is distinct from custom.rule_kernel_id() or new.data_class = 'kernel' then
    return new;
  end if;

  v_name := nullif(d ->> 'name', '');
  if v_name is null then
    raise exception 'a rule needs a name - it is what a person reads when it stops them'
      using errcode = '23514', hint = 'REC-15: name.';
  end if;

  -- A Rule''s KIND is what its test ANSWERS, and it is a closed set of two. A predicate can
  -- serve all four uses; an expression can only be computed, because there is nothing for
  -- validate, membership or applicability to be true about.
  v_kind := d ->> 'kind';
  if v_kind is null or v_kind not in ('predicate', 'expression') then
    raise exception 'the rule % has to say whether it answers yes-or-no or works out a value, and it says %',
                    v_name, coalesce(v_kind, 'nothing')
      using errcode = '23514',
            hint = 'REC-15: kind is `predicate` (a truth, usable by all four uses) or `expression` (a value, usable by compute alone).';
  end if;

  -- REC-15: the four uses, as a non-empty subset of the closed set.
  v_uses := d -> 'uses';
  if jsonb_typeof(v_uses) is distinct from 'array' or jsonb_array_length(v_uses) = 0 then
    raise exception 'the rule % has to say what it is for', v_name
      using errcode = '23514',
            hint = 'REC-15: uses is a non-empty list drawn from validate, compute, membership and applicability. One Rule object, four uses.';
  end if;
  for v_use in select u #>> '{}' from jsonb_array_elements(v_uses) u loop
    if v_use is null or not (v_use = any (custom.rule_uses())) then
      raise exception 'the rule % says it is used to %, and there is no such use',
                      v_name, coalesce(v_use, 'do nothing')
        using errcode = '23514',
              hint = 'REC-15: select unnest(custom.rule_uses()) is the whole list, and it is closed.';
    end if;
    if v_kind = 'expression' and v_use <> 'compute' then
      raise exception 'the rule % works out a value, so it cannot also decide %', v_name, v_use
        using errcode = '23514',
              hint = 'REC-15: only a `predicate` can be true or false. To use this test for validate, membership or applicability, write it as a yes-or-no question.';
    end if;
  end loop;

  -- The Table it speaks about. A Rule is scoped to a Table and names that Table''s Fields by
  -- id, which is what lets ONE object serve four uses (a use that speaks about a RECORD
  -- cannot hang off a single column).
  v_scope := nullif(d ->> 'scope_table_id', '')::uuid;
  if v_scope is null then
    raise exception 'the rule % has to say what it is a rule about', v_name
      using errcode = '23514',
            hint = 'REC-15: scope_table_id names the Table record whose records this Rule speaks about.';
  end if;
  select array_agg(f ->> 'name') into v_names
    from custom.record t, jsonb_array_elements(coalesce(t.data -> 'fields', '[]'::jsonb)) f
   where t.organization_id = new.organization_id
     and t.id = v_scope
     and t.table_id = custom.table_kernel_id()
     and t.deleted_at is null;
  if v_names is null then
    raise exception 'the rule % says it is about a table this organization does not have', v_name
      using errcode = '23514', hint = 'REC-15: scope_table_id names a Table record of the same organization.';
  end if;

  if jsonb_typeof(d -> 'applies_to_types') is distinct from 'array' then
    raise exception 'the rule % has to say which kinds of record it applies to, even when that is all of them',
                    v_name
      using errcode = '23514',
            hint = 'FLD-10 / T8: a type field selects which Fields AND RULES apply. An empty list means every kind.';
  end if;

  -- REC-15's per-use narrowing, checked rather than trusted: a key that is not one of this
  -- Rule's own uses, or a kind the Rule does not apply to at all, is refused by name.
  if d ? 'use_types' then
    if jsonb_typeof(d -> 'use_types') <> 'object' then
      raise exception 'the rule % has to say its narrower uses as a set of lists, one per use', v_name
        using errcode = '23514',
              hint = 'REC-15: use_types is {"<use>": ["<kind>", …]} and narrows ONE use of this Rule.';
    end if;
    for v_use in select k from jsonb_object_keys(d -> 'use_types') k loop
      if not (v_uses ? v_use) then
        raise exception 'the rule % narrows its % use, and it is not used to % at all', v_name, v_use, v_use
          using errcode = '23514',
                hint = 'REC-15: a narrowing belongs to a use the Rule declares. Add the use, or drop the narrowing.';
      end if;
      if jsonb_typeof(d -> 'use_types' -> v_use) <> 'array'
         or jsonb_array_length(d -> 'use_types' -> v_use) = 0 then
        raise exception 'the rule % narrows its % use to nothing at all', v_name, v_use
          using errcode = '23514',
                hint = 'REC-15: a narrowing lists the kinds of record that use applies to. To switch the use off, remove it from uses.';
      end if;
      if jsonb_array_length(coalesce(d -> 'applies_to_types', '[]'::jsonb)) > 0
         and exists (select 1 from jsonb_array_elements_text(d -> 'use_types' -> v_use) t
                      where not (d -> 'applies_to_types') ? t) then
        raise exception 'the rule % narrows its % use to a kind of record the rule does not apply to', v_name, v_use
          using errcode = '23514',
                hint = 'REC-15: a narrowing can only ever be smaller than the Rule itself. Widen applies_to_types first.';
      end if;
    end loop;
  end if;

  if jsonb_typeof(d -> 'expr') is distinct from 'object' then
    raise exception 'the rule % has to carry the test it makes', v_name
      using errcode = '23514',
            hint = 'REC-15: expr is one expression node — select * from custom.rule_node_kinds().';
  end if;

  -- REC-17, AT SAVE TIME. Every Field a Rule reaches for is checked to be a live Field OF
  -- THE SCOPE TABLE, by id. A name-shaped reference anywhere in the expression is refused
  -- here as well as at evaluation, so a Rule that breaks REC-17 cannot be STORED.
  for v_leaf in
    select jsonb_path_query(d -> 'expr',
             '$.**{0 to 12} ? (exists(@.field) || exists(@.parent_field) || exists(@.field_name) || exists(@.field_key) || exists(@.field_label))')
  loop
    if v_leaf ?| array['field_name', 'field_key', 'field_label'] then
      raise exception 'the rule % names a field instead of pointing at it', v_name
        using errcode = '23514',
              hint = 'REC-17: a Rule references Fields by id, never by name — {"field": "<the field''s id>"}. A name changes and the rule would stop resolving; an id does not.';
    end if;
    v_fid := null;
    if jsonb_typeof(v_leaf -> 'field') = 'string' then
      if (v_leaf ->> 'field') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        raise exception 'the rule % points at a field with % instead of with its id', v_name, v_leaf ->> 'field'
          using errcode = '23514',
                hint = 'REC-17: {"field": "<the field''s id>"}. What is written here is not an id at all, so it is a name by another route.';
      end if;
      v_fid := (v_leaf ->> 'field')::uuid;
    elsif jsonb_typeof(v_leaf -> 'parent_field') = 'string' then
      -- REC-16 is W1-RULE-APPLY's: the node is STORABLE today (so an applicability Rule can
      -- be written before its evaluator lands) and refused by name when evaluated.
      continue;
    end if;
    if v_fid is null then
      continue;
    end if;
    select f.data ->> 'key' into v_fkey
      from custom.record f
     where f.organization_id = new.organization_id
       and f.id = v_fid
       and f.table_id = custom.field_kernel_id()
       and f.deleted_at is null
       and (f.data ->> 'entity_definition_id')::uuid = v_scope;
    if v_fkey is null then
      raise exception 'the rule % points at a field that is not one of that table''s fields', v_name
        using errcode = '23514',
              hint = 'REC-17 / FLD-8: a Rule reaches a Field by its id, and the Field has to be a live field OF the table the Rule is about. One source of truth, checked at save time rather than discovered at evaluation.';
    end if;
  end loop;

  -- THE VOCABULARY IS CHECKED AT SAVE TIME TOO, not only at evaluation. A Rule nobody can
  -- work out is refused when it is written, in the words of the person writing it, rather
  -- than at three in the morning on somebody else's record. `parent_field` IS in the
  -- vocabulary, so REC-16's Rules stay storable tonight (W1-RULE-APPLY evaluates them).
  for v_leaf in
    select jsonb_path_query(d -> 'expr', '$.**{0 to 12} ? (exists(@.op))')
  loop
    if not (v_leaf ->> 'op' = any (select n.node from custom.rule_node_kinds() n)) then
      raise exception 'the rule % asks the system to %, and it does not know how',
                      v_name, v_leaf ->> 'op'
        using errcode = '23514',
              hint = 'REC-15: select * from custom.rule_node_kinds() is the closed list of what a Rule can do. A node outside it is refused when the Rule is SAVED, not discovered when it runs.';
    end if;
  end loop;

  -- The compute use has to say WHICH Field receives the Value, by id, and that Field has to
  -- be a formula - a computed Value landing on a hand-filled field is how two writers end up
  -- fighting over one column.
  v_tgt := nullif(d ->> 'target_field_id', '')::uuid;
  if v_uses ? 'compute' then
    if v_tgt is null then
      raise exception 'the rule % works something out, so it has to say which field holds the answer', v_name
        using errcode = '23514',
              hint = 'REC-15 / FLD-9: target_field_id names the Field, by id, that this Rule computes.';
    end if;
    select f.data ->> 'type' into v_fkey
      from custom.record f
     where f.organization_id = new.organization_id
       and f.id = v_tgt
       and f.table_id = custom.field_kernel_id()
       and f.deleted_at is null
       and (f.data ->> 'entity_definition_id')::uuid = v_scope;
    if v_fkey is null then
      raise exception 'the rule % puts its answer in a field that is not one of that table''s fields', v_name
        using errcode = '23514', hint = 'REC-17: target_field_id is a Field id of the scope table.';
    end if;
    if v_fkey <> 'formula' then
      raise exception 'the rule % puts its answer in %, and that field is filled in by hand',
                      v_name, custom.rule_field_label(new.organization_id, v_tgt)
        using errcode = '23514',
              hint = 'FLD-9: a Rule computes a formula field. A field somebody types into cannot also be worked out by the system, or the two would overwrite each other with nobody told.';
    end if;
  elsif v_tgt is not null then
    raise exception 'the rule % is not used to work anything out, so it has nothing to put anywhere', v_name
      using errcode = '23514', hint = 'REC-15: target_field_id belongs to the compute use and to nothing else.';
  end if;

  return new;
end;
$function$;


CREATE OR REPLACE FUNCTION custom._rule_topology_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_path   text[];
  v_self   text;
  v_back   text;
  v_leaf   jsonb;
  v_name   text;
  v_steps  text;
begin
  -- THE DOOR. One call to the ONE predicate (`custom.assert_store_door`), which
  -- judges `custom.caller_role()` - the identity the caller actually held - and not
  -- `current_user`, which a SECURITY DEFINER door has already rewritten to itself.
  -- The switch never removes a check: everything below runs exactly as before.
  perform custom.assert_store_door(new.organization_id, 'custom.record');

  if new.data_class = 'kernel'
     or new.table_id is null
     or new.table_id not in (custom.rule_kernel_id(), custom.merge_field_kernel_id()) then
    return new;
  end if;

  -- ── REC-16 AT SAVE TIME, NAMING THE RULE. A Rule that asks for two ancestor levels is
  -- refused when it is WRITTEN, in the words of the person writing it, rather than at three
  -- in the morning on somebody else's record - the same standard W1-RULE set for the rest of
  -- the vocabulary. The three shapes are the three a person actually writes.
  if new.table_id = custom.rule_kernel_id() then
    v_name := coalesce(nullif(new.data ->> 'name', ''), 'this rule');
    for v_leaf in
      select jsonb_path_query(coalesce(new.data -> 'expr', '{}'::jsonb),
               '$.**{0 to 12} ? (exists(@.parent_field) || exists(@.grandparent_field) || exists(@.ancestor_field))')
    loop
      if v_leaf ?| array['grandparent_field', 'ancestor_field'] then
        raise exception 'the rule % reads an answer two steps up, and a rule reads its own record and the one it is inside', v_name
          using errcode = '23514',
                hint = 'REC-16: one level up and no further. To reach further, give the record a relation to the thing it needs and read that.';
      end if;
      if jsonb_typeof(v_leaf -> 'parent_field') = 'object' then
        raise exception 'the rule % reads the answer of the thing its parent is inside, and a rule reads its own record and the one it is inside', v_name
          using errcode = '23514',
                hint = 'REC-16: one level up and no further. {"parent_field": "<a field id>"} reads the parent; it cannot be wrapped around another parent_field.';
      end if;
      v_steps := coalesce(v_leaf ->> 'levels', v_leaf ->> 'up');
      if v_steps is not null and v_steps <> '1' then
        raise exception 'the rule % asks to go % steps up, and a rule reads its own record and the one it is inside', v_name, v_steps
          using errcode = '23514',
                hint = 'REC-16: one level up and no further. There is no number to raise here.';
      end if;
      if jsonb_typeof(v_leaf -> 'parent_field') <> 'string'
         or (v_leaf ->> 'parent_field') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        raise exception 'the rule % points at the parent''s field with % instead of with its id',
                        v_name, coalesce(v_leaf ->> 'parent_field', 'something that is not there')
          using errcode = '23514',
                hint = 'REC-17 applies to the parent''s Fields too: {"parent_field": "<the field''s id>"}.';
      end if;
      -- The parent may be a record of ANY Table (containment is a tree over records, not
      -- over tables), so the id is checked to be a live Field OF THIS ORGANIZATION - which
      -- is everything that can be known at save time, and it is checked rather than assumed.
      if custom.rule_field_key(new.organization_id, (v_leaf ->> 'parent_field')::uuid) is null then
        raise exception 'the rule % points at a field of the parent that this organization does not have', v_name
          using errcode = '23514',
                hint = 'REC-16 / REC-17: parent_field holds the id of a live Field. Which Table the parent belongs to is known only when the rule runs, so the id is what is checked here.';
      end if;
    end loop;
  end if;

  v_path := custom.dependency_cycle(new.organization_id, new);
  if v_path is null then
    return new;
  end if;

  -- BOTH SIDES, BY NAME. The thing being saved, and the nearest Rule or merge field in the
  -- circle that is already waiting for it - a refusal that named only one of them leaves the
  -- reader hunting for the other half, and one that named the FIELD between two Rules names
  -- the rope rather than either end of it.
  --
  -- 🚨 THE SAVED ROW'S NAME COMES OUT OF THE ROW, NOT OUT OF THE CATALOGUE. On an INSERT it
  -- is not in `custom.record` yet, so a lookup answers NULL and the refusal reads `saving
  -- "<NULL>"` - which is how this was caught, by its own suite, before it left the branch.
  v_self := coalesce(nullif(new.data ->> 'name', ''), nullif(new.data ->> 'key', ''),
                     custom.dependency_label(new.organization_id, v_path[1]), 'this rule');
  select custom.dependency_label(new.organization_id, u.n) into v_back
    from unnest(v_path) with ordinality as u(n, o)
   where u.o between 2 and array_length(v_path, 1) - 1
     and split_part(u.n, ':', 1) in ('rule', 'merge')
   order by u.o desc
   limit 1;
  v_back := coalesce(v_back,
                     custom.dependency_label(new.organization_id, v_path[array_length(v_path, 1) - 1]),
                     'something in the same circle');
  raise exception 'saving "%" would make it wait for "%", and "%" is already waiting for "%"',
                  v_self, v_back, v_back, v_self
    using errcode = '23514',
          hint = format('DYN-9 / REC-15: rules and merge fields work each other''s answers out, so they cannot wait on each other in a circle. The circle is: %s.',
                        (select string_agg(case when u.n = v_path[1] then v_self
                                                else custom.dependency_label(new.organization_id, u.n) end,
                                           ' -> ' order by u.o)
                           from unnest(v_path) with ordinality as u(n, o)));
end;
$function$;


CREATE OR REPLACE FUNCTION custom._store_relation_edge_names_its_field()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
  -- Only edges OUT OF the record store. Every other subsystem's associations are none of
  -- this store's business, and they are the 85,354 rows that legitimately name no field.
  if new.source_type <> 'record' then
    return new;
  end if;
  if new.relation_field_id is not null then
    return new;
  end if;
  -- The STRUCTURAL roles are not relation fields: `contains` is REC-7's parent, `home` is
  -- REC-26's placement and `references` is REL-6's carrying link. They are declared in
  -- custom.carrying_rule, which is the one table that says what a role conveys, so this
  -- reads that table rather than keeping a second list of the same three words.
  if exists (select 1 from custom.carrying_rule cr where cr.role = new.role) then
    return new;
  end if;

  raise exception 'a relation on a record has to say which field it came from, and "%" does not',
    coalesce(new.role, '<no role>')
    using errcode = '23514',
          hint = 'REL-10 / T7: a relation is an association whose `role` IS the field key and whose relation_field_id IS that field. Without the field, nothing can read what the relation does when its target is deleted, how many targets it allows, or which tables it may point at — so the delete rules, the cardinality and the organization wall all silently do nothing. Write the relation value through the record store (custom.record_write / custom.record_update) and the edge is written for you, or call platform.relation_set, which names the field itself.';
end;
$function$;


CREATE OR REPLACE FUNCTION custom._table_shape_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  d            jsonb := new.data;
  v_type       text;
  v_title      text;
  v_fields     jsonb;
  v_home       uuid;
  v_home_type  text;
  v_names      text[];
begin
  -- THE DOOR. One call to the ONE predicate (`custom.assert_store_door`), which
  -- judges `custom.caller_role()` - the identity the caller actually held - and not
  -- `current_user`, which a SECURITY DEFINER door has already rewritten to itself.
  -- The switch never removes a check: everything below runs exactly as before.
  perform custom.assert_store_door(new.organization_id, 'custom.record');

  -- Only Tables, and only Tables an organization DECLARED. REC-27: the kernel's nine are
  -- "defined in code, not data" — W1-STORE wrote eight of them before this guard existed
  -- and W1-FIELD adds the ninth, so a `kernel` row is exempt and the view supplies its
  -- defaults. THE BOUND OF THAT EXEMPTION, named rather than left implied: the only writer
  -- that can set data_class at all is the schema owner, because schema `custom` is revoked
  -- from PUBLIC, anon, authenticated and service_role and the one client door
  -- (custom.record_write) cannot set data_class. A tenant cannot reach this branch.
  if new.table_id is distinct from custom.table_kernel_id() or new.data_class = 'kernel' then
    return new;
  end if;

  v_type := d ->> 'type';
  if v_type is null or v_type not in ('entity', 'detail') then
    raise exception 'a table is an entity or a detail, and this one says %', coalesce(v_type, 'nothing')
      using errcode = '23514', hint = 'REC-66: type ∈ {entity, detail}.';
  end if;
  if v_type = 'detail' and coalesce(d ->> 'parent_token', '') = '' then
    raise exception 'a detail table has to say what it is a detail of'
      using errcode = '23514', hint = 'REC-66: parent_token is required when type is detail.';
  end if;
  if v_type <> 'detail' and d ? 'parent_token' then
    raise exception 'only a detail table has a parent table'
      using errcode = '23514', hint = 'REC-66: parent_token belongs to type detail and to nothing else.';
  end if;

  if coalesce(d ->> 'name', '') = '' then
    raise exception 'a table needs a name' using errcode = '23514', hint = 'REC-1.';
  end if;
  if coalesce(d ->> 'slug', '') !~ '^[a-z][a-z0-9_]*$' then
    raise exception 'a table needs a slug made of lower-case letters, digits and underscores'
      using errcode = '23514', hint = 'REC-66: slug.';
  end if;
  if coalesce(d ->> 'label_singular', '') = '' or coalesce(d ->> 'label_plural', '') = '' then
    raise exception 'a table needs both of its labels - one thing and many things'
      using errcode = '23514', hint = 'REC-66: label_singular and label_plural.';
  end if;

  if coalesce(d ->> 'display', '') not in ('list', 'page') then
    raise exception 'a table shows its records as a list or as a page, and this one says %',
                    coalesce(d ->> 'display', 'nothing')
      using errcode = '23514', hint = 'REC-1: display. T4 turns a list into a page and migrates nothing.';
  end if;
  if jsonb_typeof(d -> 'ordered') is distinct from 'boolean' then
    raise exception 'a table has to say whether its records are ordered'
      using errcode = '23514', hint = 'REC-1: ordered.';
  end if;
  if coalesce(d ->> 'weight', '') not in ('heavy', 'light') then
    raise exception 'a table is heavy or light, and this one says %', coalesce(d ->> 'weight', 'nothing')
      using errcode = '23514', hint = 'REC-1: heavy|light.';
  end if;
  if jsonb_typeof(d -> 'retention_days') is distinct from 'number' then
    raise exception 'a table has to say how long it keeps its history'
      using errcode = '23514', hint = 'REC-1: retention.';
  end if;
  -- W3-HIST (HIS-3): the floor is READ, never a literal (rule 15). Thirty days is the
  -- PLATFORM floor, and an organization that raised its own is entitled to have that
  -- honoured here too — the knob is `extensibility / user_tables.history_retention_floor_days`,
  -- raise-only, min 30. With a literal here an organization at sixty days could still declare
  -- a thirty-day table and lose thirty days of history it had already decided to keep.
  -- This body's own switch is `custom/system_enabled`, read through custom.assert_store_door
  -- above; the history writer's is `custom/row_versions_guard`.
  declare
    v_floor integer;
  begin
    -- THE GUARD, READ IN THE BODY. While `custom/system_enabled` resolves false this
    -- comparison is byte-for-byte the behaviour it has always had — the literal thirty — so
    -- the OFF path answers identically and §6.6's requirement for touching a live body is
    -- something a verifier can execute rather than something this lane asserts. Switched ON,
    -- the organization's own floor is honoured here too.
    if coalesce((platform.knob_resolve('custom', 'system_enabled', new.organization_id) #>> '{}')::boolean, false) then
      v_floor := history.retention_floor_days(new.organization_id);
    else
      v_floor := 30;
    end if;
    if (d ->> 'retention_days')::numeric < v_floor then
      raise exception 'History here is kept for at least % days, so this table cannot keep only %.',
                      v_floor, d ->> 'retention_days'
        using errcode = '23514',
              hint = format('REC-1 / T14 / HIS-3: %s days is the retention floor — thirty is the platform minimum and an organization may only ever raise it. Give this table %s or more.', v_floor, v_floor);
    end if;
  end;

  -- REC-N-17: a default sort AND a manual row order, both load-bearing.
  if jsonb_typeof(d -> 'default_sort') is distinct from 'array' then
    raise exception 'a table has to say how its records are sorted by default'
      using errcode = '23514', hint = 'REC-N-17: default_sort is an array of {field, direction}.';
  end if;
  if coalesce(d ->> 'row_order', '') not in ('manual', 'sorted') then
    raise exception 'a table orders its rows by hand or by its sort, and this one says %',
                    coalesce(d ->> 'row_order', 'nothing')
      using errcode = '23514', hint = 'REC-N-17: manual row order.';
  end if;

  if jsonb_typeof(d -> 'agent_writable') is distinct from 'boolean' then
    raise exception 'a table has to say whether an agent may write to it'
      using errcode = '23514', hint = 'REC-66: agent_writable, default true, is declared rather than guessed.';
  end if;

  -- REC-1: its fields. REC-2: exactly one of them is the title.
  v_fields := d -> 'fields';
  if jsonb_typeof(v_fields) is distinct from 'array' or jsonb_array_length(v_fields) = 0 then
    raise exception 'a table has to declare its fields'
      using errcode = '23514', hint = 'REC-1: fields.';
  end if;
  select array_agg(f ->> 'name') into v_names from jsonb_array_elements(v_fields) f;
  if array_position(v_names, null) is not null then
    raise exception 'every field of a table needs a name'
      using errcode = '23514', hint = 'REC-1: fields.';
  end if;
  v_title := d ->> 'title_field';
  if v_title is null then
    raise exception 'a table needs a title field, or its records cannot be shown as chips'
      using errcode = '23514', hint = 'REC-2.';
  end if;
  if not (v_title = any (v_names)) then
    raise exception 'the title field % is not one of this table''s fields', v_title
      using errcode = '23514', hint = 'REC-2: the title field names one of the table''s own fields.';
  end if;

  -- REC-1 and REC-14: exactly ONE Home, and the Home IS the parent, so "exactly one Home"
  -- and "zero or one parent" are ONE stored fact and the Home tree is REC-7's tree.
  v_home := custom.containment_parent(d);
  if v_home is null then
    raise exception 'a table has to live somewhere - give it a home'
      using errcode = '23514',
            hint = 'REC-1: exactly one Home, stored as this record''s parent_id. Additional Homes are relations (REC-3, REC-26).';
  end if;
  -- REC-11: a detail Table's records inherit only and cannot be Homes.
  select t.data ->> 'type' into v_home_type
    from custom.record h
    join custom.record t
      on t.organization_id = h.organization_id and t.id = h.table_id
   where h.organization_id = new.organization_id and h.id = v_home;
  if v_home_type = 'detail' then
    raise exception 'a detail record cannot be a home'
      using errcode = '23514',
            hint = 'REC-11: a detail table inherits only - its records take no direct shares and cannot be Homes.';
  end if;

  return new;
end;
$function$;


CREATE OR REPLACE FUNCTION custom._work_shape_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  d       jsonb := new.data;
  v_why   text;
  v_kind  text;
  v_until timestamptz;
begin
  -- THE DOOR. One call to the ONE predicate (`custom.assert_store_door`), which judges
  -- `custom.caller_role()` - the identity the caller actually held - and not `current_user`,
  -- which a SECURITY DEFINER door has already rewritten to itself.
  perform custom.assert_store_door(new.organization_id, 'custom.record');

  if new.data_class = 'work_template' then
    v_why := custom.work_template_refusal(d -> 'graph');
    if v_why is not null then
      raise exception '%', v_why
        using errcode = '23514',
              hint = 'REC-70: a template is judged when it is written, not when somebody runs it.';
    end if;
    return new;
  end if;

  if new.data_class = 'work_instantiation' then
    if nullif(d ->> 'template_id', '') is null
       or jsonb_typeof(d -> 'records') is distinct from 'array' then
      raise exception 'a record of an instantiation has to name its template and the records it made'
        using errcode = '23514',
              hint = 'REC-70: the act is logged, and a log that cannot say what it made is not one.';
    end if;
    return new;
  end if;

  if new.table_id is null or new.data_class in ('kernel', 'table', 'field', 'rule', 'relation', 'merge_field') then
    return new;
  end if;

  -- REC-69 — THE ACTION STATES. A move the model forbids is refused, naming both states and
  -- saying where the record CAN go instead. The cheap test is first: this costs a `jsonb ->>`
  -- on every write to the store and a query only on a write that actually moves a status.
  if tg_op = 'UPDATE'
     and nullif(new.data ->> 'status', '') is distinct from nullif(old.data ->> 'status', '')
     and nullif(old.data ->> 'status', '') is not null
     and nullif(new.data ->> 'status', '') is not null then
    v_why := custom.work_transition_refusal(new.organization_id,
                                            (old.data ->> 'status')::uuid,
                                            (new.data ->> 'status')::uuid);
    if v_why is not null then
      raise exception '%', v_why
        using errcode = '23514',
              hint = 'REC-69: the states a record can move to are declared on the state it is in. Change the state records if this organization works differently.';
    end if;
  end if;

  -- A HOLD. Its Table says so; nothing here guesses from a field name.
  select t.data ->> 'work_kind' into v_kind
    from custom.record t
   where t.organization_id = new.organization_id
     and t.id = new.table_id
     and t.table_id = custom.table_kernel_id()
     and t.deleted_at is null;
  if v_kind is distinct from 'slot' then
    return new;
  end if;

  if nullif(d ->> 'slot_key', '') is null then
    raise exception 'a hold has to say which slot it is on'
      using errcode = '23514', hint = 'REC-71: slot_key is what the unique index keeps single.';
  end if;
  if nullif(d ->> 'holder', '') is null then
    raise exception 'a hold has to say who is holding it'
      using errcode = '23514', hint = 'REC-71: a reservation nobody holds is not a reservation.';
  end if;
  begin
    v_until := (nullif(d ->> 'expires_at', ''))::timestamptz;
  exception when others then
    v_until := null;
  end;
  if v_until is null then
    raise exception 'a hold has to say when it runs out'
      using errcode = '23514',
            hint = 'REC-71: a slot hold is a reservation WITH an expiry - a hold with no expiry would keep the slot forever.';
  end if;
  if tg_op = 'INSERT' and v_until <= now() then
    raise exception 'a hold that has already expired is not a hold'
      using errcode = '22023', hint = 'REC-71: the expiry is in the future when the hold is taken.';
  end if;

  return new;
end
$function$;


CREATE OR REPLACE FUNCTION custom.field_retire(p_organization_id uuid, p_field_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_field jsonb;
  v_table uuid;
  v_spec  jsonb;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.field_retire');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.field_retire');

  select r.data, (r.data ->> 'entity_definition_id')::uuid into v_field, v_table
    from custom.record r
   where r.organization_id = p_organization_id
     and r.id = p_field_id
     and r.table_id = custom.field_kernel_id()
     and r.deleted_at is null;
  if v_field is null then
    raise exception 'There is no such field in this organization, so nothing was removed.'
      using errcode = '23514', hint = 'REC-29: organizations are hard walls.';
  end if;
  if v_table is null then
    raise exception 'The field "%" belongs to a standard table, and this door removes a field from a table somebody made.',
                    v_field ->> 'label'
      using errcode = '23514',
            hint = 'FLD-8: a field on a standard table is part of that table''s own definition.';
  end if;

  perform custom.assert_client_may_change(p_organization_id, v_table, 'custom.field_retire',
                                          'admin'::public.permission_level, 'table');

  select r.data into v_spec
    from custom.record r
   where r.organization_id = p_organization_id and r.id = v_table
     and r.table_id = custom.table_kernel_id() and r.deleted_at is null;

  if (v_spec ->> 'title_field') = (v_field ->> 'key') then
    raise exception '"%" is what every record of this table is called, so it cannot be removed.',
                    v_field ->> 'label'
      using errcode = '23514',
            hint = 'REC-2: a record is shown as a chip with the value of its title field. Make another field the title first, then remove this one.';
  end if;
  if jsonb_array_length(coalesce(v_spec -> 'fields', '[]'::jsonb)) <= 1 then
    raise exception 'A table keeps at least one field, and "%" is the last one.', v_field ->> 'label'
      using errcode = '23514', hint = 'REC-1: a table has to declare its fields. Add another field first.';
  end if;
  if exists (
      select 1 from custom.record f
       where f.organization_id = p_organization_id
         and f.table_id = custom.field_kernel_id()
         and f.deleted_at is null
         and f.id <> p_field_id
         and (f.data ->> 'entity_definition_id')::uuid = v_table
         and (f.data -> 'config' ->> 'via' = (v_field ->> 'key')
              or f.data -> 'config' ->> 'of' = (v_field ->> 'key')
              or f.data -> 'config' ->> 'pick' = (v_field ->> 'key'))) then
    raise exception 'Another field on this table works out its answer from "%", so removing it would break that one.',
                    v_field ->> 'label'
      using errcode = '23514',
            hint = 'Remove or re-point the field that reads through this one first. The store names it in the table''s field list.';
  end if;

  -- The field record goes first: a retirement is not a change of shape, so its
  -- own guard lets it through, and the table is then left declaring only fields
  -- that exist.
  update custom.record
     set deleted_at = now()
   where organization_id = p_organization_id and id = p_field_id
     and table_id = custom.field_kernel_id();

  update custom.record
     set data = jsonb_set(data, '{fields}', (
           select coalesce(jsonb_agg(f), '[]'::jsonb)
             from jsonb_array_elements(coalesce(data -> 'fields', '[]'::jsonb)) f
            where f ->> 'name' is distinct from (v_field ->> 'key'))),
         updated_at = now(), version = version + 1
   where organization_id = p_organization_id and id = v_table
     and table_id = custom.table_kernel_id();

  return true;
end
$function$;


drop function if exists custom.guard_refusals_are_complete();
drop function if exists custom.is_a_retirement(timestamptz,timestamptz,jsonb,jsonb,uuid,uuid,uuid,uuid,text,text);
drop function if exists custom.said(text, text);
