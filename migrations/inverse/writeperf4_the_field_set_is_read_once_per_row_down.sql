-- additive: yes
--
-- chair-step: the inverse of migrations/campaign/writeperf4_the_field_set_is_read_once_per_row.sql
--   — it restores the nine function bodies to the exact bytes that file replaced, then removes the
--   door row and drops `custom.applicable_fields_json`. THE ORDER IS LOAD-BEARING: the bodies come
--   back FIRST, because `door_follows_its_function` re-reads every function body when a function
--   is dropped and refuses one that names something no longer there. This file takes no table lock
--   at all. Everything above the `-- ── THE OBJECTS THIS WAVE ADDED ──` rule is a complete,
--   self-sufficient revert of the BEHAVIOUR, and that half is what
--   `scripts/campaign-tests/writeperf4_ab.sql` uses to measure the before column.
--
-- based-on: custom.applicable_fields(uuid, uuid, text) 5c71e6afc2c753936e685b29b2c7d717ac236f8b6f1d8694270349f85fee2d59
-- based-on: custom._dated_values_guard() b3443fad9f9dbb67f1a9ca09ab647b1aaca70b207f47bd5d7ea29e9ad3fdec35
-- based-on: custom._derived_fields() a21ab1d5913e5684148d0fc7e15ccffd30acfe57e06a8a9062b9e247e512085e
-- based-on: custom._record_field_validation() f8a7e9fd1b690b73b6d6c84f61b44826829656c448ef650de0268776f9c2533e
-- based-on: custom._value_envelope() 64636bd3ea717ed36cb6e91f022f5c4328c310f7886baf435461a35350372b11
-- based-on: custom.computed_provenance(uuid, uuid) f4ca6edfd8e561a3090e4f769dc8bc28416df282ad457c983c1bea07a1385e91
-- based-on: custom.derived_values_of(custom.record) 87f895dbf0aeee51c3460dec727a19ef1a204bf493e26f2ea1673cd6aa5431f9
-- based-on: custom.io_changed_field_ids(uuid, uuid, jsonb, jsonb) 11644b2b292a2bfa1ee9904736271760636e66ceac25d70db8ccea76cba02c2d
-- based-on: custom.io_record_changed_stmt_insert() 94898d08cbbb77b261ebf3f6a1902ecdacf4d70927fe1b2b09011d7006f3b187

CREATE OR REPLACE FUNCTION custom.applicable_fields(p_organization_id uuid, p_table_id uuid, p_record_type text DEFAULT NULL::text)
 RETURNS SETOF custom.record
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_types text[];
  v_key   text;
  v_json  jsonb;
  v_hit   text;
begin
  -- The decision comes BEFORE the read, so a foreign organization id and an invented one
  -- answer identically: both are refused, neither is told whether the table exists.
  perform custom.assert_store_door(p_organization_id, 'custom.applicable_fields');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.applicable_fields');
  perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.applicable_fields');

  -- THE SAME TABLE, ALREADY READ IN THIS TRANSACTION. The three lines above ran first, so this
  -- is a shortcut through the READ and never through the DECISION.
  --
  -- WRITE-PERF-4: its own slot, not a corner of a 37 KB blob. Measured on the main database,
  -- a 17-field table: 427 us a call out of the shared blob, 254 us out of its own key. The
  -- value is `jsonb_strip_nulls`ed before it is stored — `jsonb_populate_recordset` reads an
  -- absent key and a null key identically, and a `custom.record` row is mostly nulls, so this
  -- is the same 17 rows out of a much smaller text.
  v_key := 'af:' || coalesce(p_organization_id::text, '-') || ':' ||
                    coalesce(p_table_id::text, '-') || ':' || coalesce(p_record_type, '');
  v_hit := platform.memo_k_get(v_key);
  if v_hit is not null then
    return query select * from jsonb_populate_recordset(null::custom.record, v_hit::jsonb);
    return;
  end if;

  -- T8. The record's type value is the option's KEY; whoever declared "Radius applies to a
  -- Circle" may have written the word, the key or the option's id. All of them name the same
  -- choice, so the question is asked with all of them. This is the clause the seventh pass
  -- failed: "asking what columns THIS record has answers without Radius".
  v_types := case when p_record_type is null then '{}'::text[]
                  else custom.choice_synonyms(p_organization_id, p_table_id, p_record_type) end;

  select coalesce(jsonb_agg(jsonb_strip_nulls(to_jsonb(q))), '[]'::jsonb) into v_json from (
    select f.*
      from custom.record f
     where f.organization_id = p_organization_id
       and f.table_id = custom.field_kernel_id()
       and f.deleted_at is null
       and (f.data ->> 'entity_definition_id')::uuid = p_table_id
       and (jsonb_array_length(coalesce(f.data -> 'applies_to_types', '[]'::jsonb)) = 0
            or (p_record_type is not null
                and coalesce(f.data -> 'applies_to_types', '[]'::jsonb) ?| v_types))) q;

  perform platform.memo_k_put(v_key, v_json::text);
  return query select * from jsonb_populate_recordset(null::custom.record, v_json);
end $function$

;

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
$function$

;

CREATE OR REPLACE FUNCTION custom._derived_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_rtype    text;
  v_tf       text;
  f          custom.record;
  v_derived  jsonb := '{}'::jsonb;
  v_prior    jsonb;
  v_stale    text;
  v_retired  jsonb;
begin
  -- THE DOOR. One call to the ONE predicate (`custom.assert_store_door`), which
  -- judges `custom.caller_role()` - the identity the caller actually held - and not
  -- `current_user`, which a SECURITY DEFINER door has already rewritten to itself.
  -- The switch never removes a check: everything below runs exactly as before.
  perform custom.assert_store_door(new.organization_id, 'custom.record');

  if new.data_class in ('kernel', 'relation')
     or new.table_id is null
     or new.table_id = custom.table_kernel_id()
     or new.table_id = custom.field_kernel_id()
     or new.table_id = custom.rule_kernel_id()
     or new.table_id = custom.merge_field_kernel_id() then
    return new;
  end if;

  v_tf := custom.table_type_field(new.organization_id, new.table_id);
  if v_tf is not null then
    v_rtype := new.data ->> v_tf;
  end if;

  for f in select * from custom.applicable_fields(new.organization_id, new.table_id, v_rtype) loop
    if custom.parity_type(f.data) in ('lookup', 'rollup', 'formula')
       and coalesce(f.data ->> 'compute_on', '') = 'write' then
      v_derived := v_derived || jsonb_build_object(f.data ->> 'key', jsonb_build_object(
        'value',    custom.derived_value(new.organization_id, new.id, f.data,
                                         new.data - '_computed' - '_retired' - '_values'
                                                  - '_sources' - '_derived'),
        'field_id', f.id,
        'parity',   custom.parity_type(f.data),
        'at',       to_jsonb(now())));
    end if;
  end loop;

  -- A WORKED-OUT ANSWER NOBODY WORKS OUT is told apart the same two ways W1-RULE tells
  -- them apart, because a reader cannot tell a forged one from a real one and would serve
  -- both. ARRIVING IN THIS WRITE is a forgery and is refused by name; ALREADY THERE and no
  -- longer applicable is a retype and is RETIRED with its reason (a stand-in for History,
  -- announced: W3-HIST owns the real store).
  if jsonb_typeof(new.data -> '_derived') = 'object' then
    v_prior := case when tg_op = 'UPDATE' then coalesce(old.data -> '_derived', '{}'::jsonb)
                    else '{}'::jsonb end;
    for v_stale in
      select k from jsonb_object_keys(new.data -> '_derived') k where not (v_derived ? k)
    loop
      if (v_prior -> v_stale) is distinct from (new.data -> '_derived' -> v_stale) then
        raise exception 'this record carries a worked-out answer for % that nothing works out', v_stale
          using errcode = '23514',
                hint = 'FLD-9 / FLD-11: a worked-out Value belongs to the field that works it out and carries that field''s id and the moment. A value written here by hand would be served as if the system had worked it out.';
      end if;
      v_retired := coalesce(new.data -> '_retired', '[]'::jsonb) || jsonb_build_object(
        'key',    v_stale,
        'value',  v_prior -> v_stale -> 'value',
        'reason', format('this record changed, and nothing works out %s for it any more', v_stale),
        'field_id', v_prior -> v_stale -> 'field_id',
        'at',     to_jsonb(now()));
      new.data := jsonb_set(new.data, '{_retired}', v_retired);
    end loop;
  end if;

  if v_derived = '{}'::jsonb then
    new.data := new.data - '_derived';
  else
    new.data := jsonb_set(new.data, '{_derived}', v_derived);
  end if;
  return new;
end;
$function$

;

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
                             custom.said(v_rtype, 'different kind of thing'),
                             coalesce(nullif(g.data ->> 'label', ''), g.data ->> 'key'),
                             custom.said(v_rtype, 'record of that kind')),
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
$function$

;

CREATE OR REPLACE FUNCTION custom._value_envelope()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_data     jsonb := coalesce(new.data, '{}'::jsonb);
  v_actor    text;
  v_obo      text;
  v_refusal  text;
  v_values   jsonb;
  v_key      text;
  v_declared boolean;
  v_type_fld text;
  v_rtype    text;
  v_src      text;
  v_agent    text[] := '{}'::text[];   -- ENRICH: the keys of this Table a model owns
begin
  -- THE DOOR. The thirteenth and last RETURNS trigger in this schema to read the ONE
  -- predicate, which judges custom.caller_role() and never current_user. custom/system_enabled
  -- decides WHO may write and never which check runs.
  perform custom.assert_store_door(new.organization_id, 'custom.record');

  -- A WRITE THAT ASSERTS NO VALUE HAS NO AUTHOR TO JUDGE (lane AGENT, 2026-09-19).
  -- MEASURED: a real agent turn wrote twenty records and could not delete ONE of them.
  -- custom.record_delete does `update custom.record set deleted_at = now()`, which fires
  -- this trigger over the UNCHANGED document; the document names no `_actor`, so
  -- custom.actor_word falls back to the connection's declaration ('agent'), and the
  -- forward arm below then refuses because nothing names the person the agent acts for —
  -- and nothing CAN, because a delete carries no document to put `_on_behalf_of` in and
  -- there is no GUC for it. So every agent delete, restore and reparent of a business
  -- record was refused, by a check about authorship, on a statement that authors nothing.
  --
  -- The condition is exactly that: an UPDATE whose `data` is not distinct from the row's
  -- existing `data` asserts no Value, so there is no new authorship to record and the
  -- authorship already stored stays exactly as it was. Every check below still runs, in
  -- full, on every statement that DOES change the document. This cannot widen anything:
  -- a write that changes no data could not have carried a value to mis-author.
  if TG_OP = 'UPDATE' and old.data is not distinct from new.data then
    return new;
  end if;

  -- THE CEILING (finding 4), over what the WRITER supplied, before anything else touches
  -- the document.
  v_refusal := custom.size_refusal(new.organization_id, v_data);
  if v_refusal is not null then
    raise exception '%', v_refusal
      using errcode = '23514',
            hint = 'The ceilings are custom/value_max_bytes and custom/document_max_bytes - organization-settable knobs with published defaults, not constants. A value too big to live in the record lives as a record of this store''s File table, and the value points at it.';
  end if;

  v_declared := v_data ? '_values' or v_data ? '_sources' or v_data ? '_actor' or v_data ? '_on_behalf_of';

  -- WHO OPENS THE ENVELOPE (finding 2). A business document always gets one, whether or not
  -- its writer opened it; a DEFINITION row (kernel, table, field, rule, merge_field,
  -- relation) is the shape of the store rather than a set of asserted Values, and keeps its
  -- prior behaviour exactly - nothing to do unless it declared something itself.
  if new.data_class is distinct from 'record' and not v_declared then
    return new;
  end if;

  v_actor := custom.actor_word(v_data ->> '_actor');
  v_obo   := nullif(btrim(coalesce(v_data ->> '_on_behalf_of', '')), '');
  if v_obo is not null and v_actor <> 'agent' then
    raise exception 'This write says it is on behalf of somebody, and its author is a %. Only an agent acts on behalf of a person.', v_actor
      using errcode = '22023';
  end if;
  -- THE FORWARD ARM (finding 3). The converse above was built; this one was not, so an agent
  -- write naming nobody landed unremarked.
  if v_actor = 'agent' and v_obo is null then
    raise exception 'This write says an agent wrote it, and does not say who the agent is acting for. An agent always acts on behalf of a person.'
      using errcode = '22004',
            hint = 'Put "_on_behalf_of" in the record with that person''s id. Work the platform does for nobody in particular is written by "system" - that is what the third word in the vocabulary is for. The vocabulary is exactly user, agent, system.';
  end if;

  -- The declaration is a fact about the WRITE, not content of the record.
  v_data := v_data - '_actor' - '_on_behalf_of';

  -- A VALUE IS A FIELD'S VALUE. The envelope is opened over the APPLICABLE FIELDS of this
  -- record's Table - the same set custom._record_field_validation validates against, chosen
  -- by the record's own type field where the Table has one - and never over the document's
  -- other keys, which carry structure rather than assertions. custom.validate_value_envelope
  -- refuses an envelope on a key that is not a declared Field, and it is right to.
  if new.data_class = 'record'
     and new.table_id is not null
     and new.table_id <> custom.table_kernel_id()
     and new.table_id <> custom.field_kernel_id() then
    v_type_fld := custom.table_type_field(new.organization_id, new.table_id);
    if v_type_fld is not null then
      v_rtype := v_data ->> v_type_fld;
    end if;
    v_values := coalesce(v_data -> '_values', '{}'::jsonb);
    if jsonb_typeof(v_values) <> 'object' then
      v_values := '{}'::jsonb;        -- the envelope law below refuses the malformed block by name
    end if;
    -- ENRICH, 2026-09-20: THE SAME LOOP NOW ALSO ANSWERS "WHO OWNS THIS COLUMN".
    -- A Field whose `source` is `agent` is a column an enrichment fills (AGT-6). Reading it
    -- here costs nothing - the Field rows are already being walked - and it is what lets the
    -- rule below pin a cell the moment a PERSON types over one of them.
    for v_key, v_src in select f.data ->> 'key', f.data ->> 'source'
                          from custom.applicable_fields(new.organization_id, new.table_id, v_rtype) f
    loop
      if v_key is not null and v_data ? v_key and not (v_values ? v_key) then
        v_values := v_values || jsonb_build_object(v_key, '{}'::jsonb);
      end if;
      if v_key is not null and v_src = 'agent' then
        v_agent := v_agent || v_key;
      end if;
    end loop;
    if v_values <> '{}'::jsonb or v_data ? '_values' then
      v_data := jsonb_set(v_data, '{_values}', v_values);
    end if;
  end if;

  v_data := custom.intern_provenance(v_data);
  v_data := custom.stamp_value_envelopes(v_data, v_actor, v_obo, now());
  v_data := custom.value_versions(case when tg_op = 'UPDATE' then old.data else '{}'::jsonb end, v_data);
  -- ENRICH: A PERSON'S EDIT OF AN AGENT-OWNED CELL PINS IT, THROUGH EVERY DOOR AT ONCE —
  -- AND ONLY THE CELL THEY ACTUALLY EDITED. This runs AFTER custom.value_versions on
  -- purpose: `custom.stamp_value_envelopes` puts the writer's word on EVERY envelope in the
  -- document, so before the version is decided there is no way to tell the value a person
  -- just typed from the forty others the same write left alone. The version IS that
  -- distinction, already computed, and asking it a second way is how the two would drift.
  v_data := custom.pin_agent_cells(v_data,
              case when tg_op = 'UPDATE' then old.data else '{}'::jsonb end, v_agent);
  -- ENRICH: AND A VALUE NOBODY RE-ASSERTED KEEPS ITS OWN MOMENT AND ITS OWN AUTHOR.
  v_data := custom.carry_unchanged_value_stamps(
              case when tg_op = 'UPDATE' then old.data else '{}'::jsonb end, v_data);

  v_refusal := custom.value_envelope_refusal(v_data);
  if v_refusal is not null then
    raise exception '%', v_refusal
      using errcode = '23514', hint = 'VAL-1..VAL-8: a value carries its source, its author, its reason for being missing and its other candidates, inside this record''s one document.';
  end if;

  new.data := v_data;
  return new;
end;
$function$

;

CREATE OR REPLACE FUNCTION custom.computed_provenance(p_organization_id uuid, p_record_id uuid)
 RETURNS TABLE(field_key text, field_id uuid, value jsonb, rule_id uuid, rule_version integer, computed_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_mask jsonb;
  v_rec  custom.record;
  v_type text;
  v_key  text;
begin
  -- THE SAME ORDER AS EVERY OTHER DOOR IN THIS STORE: the organization wall, then the row.
  perform custom.assert_client_may_reach(p_organization_id, 'custom.computed_provenance');
  perform custom.assert_client_may_open(p_organization_id, p_record_id,
                                        'custom.computed_provenance',
                                        'viewer'::public.permission_level, 'record');

  select r.* into v_rec from custom.record r
   where r.organization_id = p_organization_id and r.id = p_record_id;
  if not found then
    return;
  end if;

  v_mask := custom.read_mask(p_organization_id, p_record_id, 'read');

  v_key := custom.table_type_field(p_organization_id, v_rec.table_id);
  if v_key is not null then
    v_type := v_rec.data ->> v_key;
  end if;

  return query
    with blocks as (
      -- 1. A RULE produced it: the most specific account there is, so it answers first.
      select 1 as rank, e.key as k,
             (e.value ->> 'field_id')::uuid            as fid,
             e.value -> 'value'                        as val,
             (e.value ->> 'rule_id')::uuid             as rid,
             (e.value ->> 'rule_version')::integer     as rver,
             (e.value ->> 'at')::timestamptz           as at
        from jsonb_each(coalesce(v_rec.data -> '_computed', '{}'::jsonb)) e
      union all
      -- 2. The FIELD produced it at write time and the store stamped it then.
      select 2, e.key,
             (e.value ->> 'field_id')::uuid,
             e.value -> 'value',
             null::uuid, null::integer,
             (e.value ->> 'at')::timestamptz
        from jsonb_each(coalesce(v_rec.data -> '_derived', '{}'::jsonb)) e
      union all
      -- 3. The FIELD produces it on every read — the store's own default for a formula,
      --    a lookup and every rollup. Worked out HERE, NOW, by the one evaluator.
      select 3, f.data ->> 'key',
             f.id,
             custom.derived_value(p_organization_id, p_record_id, f.data,
                                  v_rec.data - '_computed' - '_retired' - '_values'
                                             - '_sources' - '_derived'),
             null::uuid, null::integer,
             now()
        from custom.applicable_fields(p_organization_id, v_rec.table_id, v_type) f
       where custom.parity_type(f.data) in ('lookup', 'rollup', 'formula')
         and coalesce(f.data ->> 'compute_on', '') = 'read'
    ),
    one_per_key as (
      select distinct on (k) k, fid, val, rid, rver, at from blocks order by k, rank
    )
    select b.k,
           b.fid,
           -- THE MASK. The rule ran and that fact is not a secret; the value it produced
           -- for a field this reader may not see is.
           case when custom.mask_says_withheld(v_mask, b.k)
                then custom.withheld_marker(v_mask, b.k)
                else b.val end,
           b.rid,
           b.rver,
           b.at
      from one_per_key b;
end;
$function$

;

CREATE OR REPLACE FUNCTION custom.derived_values_of(v_rec custom.record)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_out   jsonb := '{}'::jsonb;
  f       custom.record;
  v_rtype text;
  v_key   text;
  v_plain jsonb;
begin
  if v_rec.id is null or v_rec.table_id is null
     or v_rec.data_class in ('kernel', 'relation') then
    return '{}'::jsonb;
  end if;

  -- WHAT WAS STAMPED AT WRITE TIME comes back exactly as it was stamped (FLD-9: the
  -- declaration says WHEN it is worked out, and a `write` formula is a fact about the
  -- moment it was saved).
  v_out := custom.computed_block(v_rec.data -> '_derived');

  -- 🚨 THE VALUES A READ-TIME FORMULA IS EVALUATED AGAINST ARE ASSEMBLED HERE AND PASSED
  -- IN, never fetched by the evaluator. `custom.record_values` calls THIS body, so a
  -- formula that re-entered it for its own record's values would recurse until the stack
  -- ran out — a crash instead of an answer. The values are the document, plus W1-RULE's
  -- computed block, plus what was stamped at write time: everything that is knowable
  -- without asking this function again.
  v_plain := (v_rec.data - '_computed' - '_retired' - '_values' - '_sources' - '_derived')
             || custom.computed_block(v_rec.data -> '_computed')
             || v_out;

  v_key := custom.table_type_field(v_rec.organization_id, v_rec.table_id);
  if v_key is not null then
    v_rtype := v_rec.data ->> v_key;
  end if;

  -- AND WHAT IS WORKED OUT ON READ is worked out now, every time, from what is there now.
  for f in select * from custom.applicable_fields(v_rec.organization_id, v_rec.table_id, v_rtype) loop
    if custom.parity_type(f.data) in ('lookup', 'rollup', 'formula')
       and coalesce(f.data ->> 'compute_on', '') = 'read' then
      v_out := v_out || jsonb_build_object(f.data ->> 'key',
                          custom.derived_value(v_rec.organization_id, v_rec.id, f.data, v_plain));
    end if;
  end loop;
  return v_out;
end;
$function$

;

CREATE OR REPLACE FUNCTION custom.io_changed_field_ids(p_organization_id uuid, p_table_id uuid, p_old jsonb, p_new jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
#variable_conflict use_column
begin
  -- WRITE-PERF / LADDER-PERF's class, on the WRITE path. Everything between `begin`
  -- and `end` is this function's own SQL body, character for character; only the
  -- language moved, so its plan is cached for the session instead of being built
  -- again on every single call.
  return (
    -- `custom.applicable_fields` is the platform's one answer to "which Fields does this Table
    -- have". Joining on key alone matched every Table's Field of the same name.
    select coalesce(jsonb_agg(distinct f.id), '[]'::jsonb)
      from unnest(custom.io_changed_keys(p_old, p_new)) k
      join custom.applicable_fields(p_organization_id, p_table_id, null) f
        on (f.data ->> 'key') = k
  );
    -- It reads no knob of its own: it is payload for an event the trigger above only writes
    -- after custom.assert_store_door has resolved custom/system_enabled.
end
$function$

;

CREATE OR REPLACE FUNCTION custom.io_record_changed_stmt_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_org   uuid;
  v_actor jsonb;
  v_op    uuid;
begin
  for v_org in select distinct n.organization_id from new_rows n loop
    perform custom.assert_store_door(v_org, 'custom.io_record_changed');
  end loop;

  -- WHO IS WRITING. A fact about the connection, not about the row.
  v_actor := jsonb_build_object(
               'user_id', custom.query_principal(),
               'role',    custom.caller_role()::text,
               'tier',    coalesce(platform.declared_actor_tier(), platform.actor_tier()));
  v_op := nullif(current_setting('custom.op_id', true), '')::uuid;

  insert into custom.io_outbox (organization_id, event_key, record_id, table_id, operation,
                                changed_field_ids, actor, dedupe_key, op_id)
  with changed as (
    select n.organization_id, n.id, n.table_id, n.data, n.version,
           custom.io_changed_keys('{}'::jsonb, n.data) as keys
      from new_rows n
  )
  select c.organization_id, 'records.changed', c.id, c.table_id, 'created',
         case when coalesce(array_length(c.keys, 1), 0) = 0
              then '[]'::jsonb
              else coalesce((select coalesce(jsonb_agg(distinct f.id), '[]'::jsonb)
                               from unnest(c.keys) k
                               join custom.applicable_fields(c.organization_id, c.table_id, null) f
                                 on (f.data ->> 'key') = k), '[]'::jsonb) end,
         v_actor || jsonb_build_object('declared', coalesce(c.data, '{}'::jsonb) ->> '_actor'),
         c.organization_id::text || ':' || c.id::text || ':' || coalesce(c.version, 0)::text || ':created',
         v_op
    from changed c
   order by c.id
  on conflict do nothing;

  return null;
end;
$function$

;

-- ── THE OBJECTS THIS WAVE ADDED ──────────────────────────────────────────────────────────
delete from platform.client_callable_door where schema_name='custom' and function_name='applicable_fields_json';
drop function if exists custom.applicable_fields_json(uuid, uuid, text);
