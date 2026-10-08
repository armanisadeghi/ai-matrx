-- chair-step: puts the eight function bodies installspeed2_a_write_path_asks_once.sql replaced back to what they held before it (read from the catalogue with pg_get_functiondef), then drops custom._field_readers_within, which nothing else calls.

CREATE OR REPLACE FUNCTION custom._field_sensitivity_reaches_its_readers()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  r record;
begin
  if custom.sensitivity_rank(new.data ->> 'sensitivity')
     <= custom.sensitivity_rank(old.data ->> 'sensitivity') then
    return null;                        -- only a rise travels; a lowered input lowers nothing
  end if;
  for r in
    select f.organization_id, f.id
      from custom.record f
     where f.organization_id = new.organization_id
       and f.table_id = custom.field_kernel_id()
       and f.data_class <> 'kernel'
       and f.id <> new.id
       and f.data ->> 'type' = 'formula'
       and coalesce(f.data -> 'config', '{}'::jsonb) ?| array['expr', 'pick', 'agg']
       and custom.sensitivity_rank(f.data ->> 'sensitivity') < custom.sensitivity_rank(new.data ->> 'sensitivity')
       and exists (select 1 from custom.field_input_closure(f.organization_id, f.data, f.id) c
                    where c.input_id = new.id)
  loop
    -- The reader's own trigger (half 1) re-derives it, and its own rise travels on in turn.
    update custom.record
       set data = jsonb_set(data, '{sensitivity}', to_jsonb(new.data ->> 'sensitivity'))
     where organization_id = r.organization_id
       and id = r.id;
  end loop;
  return null;
end;
$function$
;

CREATE OR REPLACE FUNCTION custom._field_reads_what_it_reads()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_deps  jsonb;
  v_floor record;
  v_path  text[];                      -- STORE-TAILS-3: a circle this definition would close
  v_cp    record;                      -- STORE-TAILS-3: the agent-visibility floor
  r       record;
begin
  if new.table_id is distinct from custom.field_kernel_id() or new.data_class = 'kernel' then
    return new;
  end if;

  -- STORE-TAILS-3: A COLUMN AN AGENT IS NOW KEPT FROM MORE FIRMLY TAKES ITS READERS WITH IT
  -- (any column, worked out or not — Budget is a plain number). Every formula, lookup and rollup
  -- that reads it, directly or through another, is given at least the same word, here, in the
  -- write that raised it; each reader's own write passes this same trigger and carries it on.
  if tg_op = 'UPDATE'
     and custom.context_policy_rank(new.data ->> 'context_policy')
         > custom.context_policy_rank(old.data ->> 'context_policy') then
    for r in
      select f.organization_id, f.id
        from custom.record f
       where f.organization_id = new.organization_id
         and f.table_id = custom.field_kernel_id()
         and f.data_class <> 'kernel'
         and f.id <> new.id
         and f.data ->> 'type' = 'formula'
         and coalesce(f.data -> 'config', '{}'::jsonb) ?| array['expr', 'pick', 'agg']
         and custom.context_policy_rank(f.data ->> 'context_policy') < custom.context_policy_rank(new.data ->> 'context_policy')
         and exists (select 1 from custom.field_input_closure(f.organization_id, f.data, f.id) c
                      where c.input_id = new.id)
    loop
      update custom.record
         set data = jsonb_set(data, '{context_policy}', to_jsonb(new.data ->> 'context_policy'))
       where organization_id = r.organization_id
         and id = r.id;
    end loop;
  end if;
  if coalesce(new.data ->> 'type', '') <> 'formula'
     or not (coalesce(new.data -> 'config', '{}'::jsonb) ?| array['expr', 'pick', 'agg']) then
    return new;
  end if;
  -- A retirement is not a change of shape (the shared rule): the document stays byte-for-byte
  -- what it was, so every guard after this one still sees a retirement.
  if tg_op = 'UPDATE'
     and custom.is_a_retirement(old.deleted_at, new.deleted_at, old.data, new.data,
                                old.table_id, new.table_id, old.organization_id,
                                new.organization_id, old.data_class, new.data_class) then
    return new;
  end if;

  -- TAIL-FIX: A LITERAL SPELLED {"value": x} IS THE LITERAL {"const": x}. The evaluator knows only
  -- `const`; a column stored with `value` read "could not be worked out" on every row. The store keeps
  -- the canonical spelling (and says so) instead of refusing: validation offers, it never blocks.
  if (custom.store_is_open(new.organization_id)
      or coalesce((platform.knob_resolve('custom', 'system_enabled', new.organization_id) #>> '{}')::boolean, false))
     and jsonb_typeof(new.data -> 'config' -> 'expr') = 'object'
     and custom._formula_literal_normalised(new.data -> 'config' -> 'expr') is distinct from new.data -> 'config' -> 'expr' then
    raise notice 'the column "%" wrote a number or word as {"value": …}; the store reads that as {"const": …} and kept it that way',
      coalesce(nullif(new.data ->> 'label', ''), new.data ->> 'key');
    new.data := jsonb_set(new.data, '{config,expr}', custom._formula_literal_normalised(new.data -> 'config' -> 'expr'));
  end if;

  -- STORE-TAILS-3: A COLUMN THAT WOULD READ ITSELF IS NOT SAVED. The walk starts from the
  -- definition being written (not the stored one) and comes back to this column's id through
  -- whatever reads it — by id, or by key for a lookup's far column and the older formula shape.
  -- TABLE-ACTIONS: a column custom.table_duplicate copies is not walked for a circle. The graph
  -- is the source's, already proven acyclic when its columns were saved, and the copy remaps it
  -- one to one (every id it reads becomes the copy's own), so the walk could only say "no" —
  -- at 5-6 s a computed column in a large organization. Marked by the copy's own transaction-
  -- local setting, which no client can set (set_config is no client door).
  if new.deleted_at is null
     and coalesce(current_setting('custom.table_duplicate_into', true), '') is distinct from new.data ->> 'entity_definition_id' then
    v_path := custom.field_cycle(new.organization_id, new.data, new.id);
    if v_path is not null then
      raise exception 'The column "%" would be worked out from itself: % — so it was not saved.',
        coalesce(nullif(new.data ->> 'label', ''), new.data ->> 'key'),
        array_to_string(v_path, ' reads ')
        using errcode = '42P17',
              hint = 'STORE-TAILS-3: a formula, lookup or rollup that reads itself round a circle has no answer. Point one of the columns in that circle at something outside it, and save again.';
    end if;
  end if;

  -- depends_on: the columns of THIS table it reads, by key (the list custom.field_dependants
  -- and REC-18's "this field is used by …" read). Worked out from the definition, never typed.
  select coalesce(jsonb_agg(distinct i.input_key order by i.input_key), '[]'::jsonb)
    into v_deps
    from custom.field_inputs_of(new.organization_id, new.data) i
   where i.input_table::text = new.data ->> 'entity_definition_id'
     and not i.retired;
  if new.data -> 'depends_on' is distinct from v_deps then
    new.data := jsonb_set(new.data, '{depends_on}', v_deps);
  end if;

  select * into v_floor
    from custom.field_sensitivity_floor(new.organization_id, new.data, new.id);
  if v_floor.sensitivity is not null
     and custom.sensitivity_rank(new.data ->> 'sensitivity') < custom.sensitivity_rank(v_floor.sensitivity) then
    raise notice 'the column "%" reads %, which is %, so it is % too (it was %)',
      coalesce(nullif(new.data ->> 'label', ''), new.data ->> 'key'),
      (select string_agg(format('"%s"', e ->> 'label'), ', ') from jsonb_array_elements(v_floor.reads) e),
      v_floor.sensitivity, v_floor.sensitivity, coalesce(new.data ->> 'sensitivity', 'nothing');
    new.data := jsonb_set(new.data, '{sensitivity}', to_jsonb(v_floor.sensitivity));
  end if;

  -- STORE-TAILS-3: WHAT AN AGENT MAY SEE FOLLOWS WHAT THE COLUMN READS, the same way sensitivity
  -- does. A column worked out from one the organization keeps out of conversations (`exclude`),
  -- gives an agent only on request, or only as a summary, is kept from an agent at least as
  -- firmly — raised to the strictest word among everything it reads, never lowered here.
  select * into v_cp
    from custom.field_context_policy_floor(new.organization_id, new.data, new.id);
  if v_cp.context_policy is not null
     and custom.context_policy_rank(new.data ->> 'context_policy') < custom.context_policy_rank(v_cp.context_policy) then
    raise notice 'the column "%" reads %, which an agent is given as "%", so an agent is given it as "%" too (it was "%")',
      coalesce(nullif(new.data ->> 'label', ''), new.data ->> 'key'),
      (select string_agg(format('"%s"', e ->> 'label'), ', ') from jsonb_array_elements(v_cp.reads) e),
      v_cp.context_policy, v_cp.context_policy, coalesce(new.data ->> 'context_policy', 'nothing');
    new.data := jsonb_set(new.data, '{context_policy}', to_jsonb(v_cp.context_policy));
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION custom.io_changed_keys(p_old jsonb, p_new jsonb)
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
  -- Envelope bookkeeping is not a value: `_values`, `_sources`, `_computed`, `_derived`,
  -- `_retired`, `_actor` and anything else the store keeps under a leading underscore is
  -- never itself a changed key.
  --
  -- MERGE-HISTORY: BUT WHAT THEY HOLD IS. A merge keeps the losing record's phone number
  -- as a ranked alternate under `_values.phone.alternates`, a retype files a value it
  -- could not carry under `_retired`, and a dated correction rewrites
  -- `_values.address.periods`. In every one of those the field changed and the document's
  -- top level did not, so asking only the top level answered "nothing moved" about the
  -- operations people most want to see. The keys are therefore gathered from three places
  -- and judged in all three.
  --
  -- HISTORY-SCREENS: AND THREE OF THE ENVELOPE'S KEYS DESCRIBE THE WRITE, NOT THE VALUE.
  -- `custom.stamp_value_envelopes` puts `at`, `actor` and `on_behalf_of` on EVERY value
  -- on EVERY write, so comparing whole envelopes made every field of every version read
  -- as changed. They are dropped from both sides before the comparison; everything that
  -- says what the value IS stays.
  with keys as (
    select k from jsonb_object_keys(coalesce(p_old, '{}'::jsonb)) k
    union select k from jsonb_object_keys(coalesce(p_new, '{}'::jsonb)) k
    union select k from jsonb_object_keys(case when jsonb_typeof(p_old -> '_values') = 'object'
                                               then p_old -> '_values' else '{}'::jsonb end) k
    union select k from jsonb_object_keys(case when jsonb_typeof(p_new -> '_values') = 'object'
                                               then p_new -> '_values' else '{}'::jsonb end) k
    union select e ->> 'key' from jsonb_array_elements(
                 case when jsonb_typeof(p_old -> '_retired') = 'array'
                      then p_old -> '_retired' else '[]'::jsonb end) e
    union select e ->> 'key' from jsonb_array_elements(
                 case when jsonb_typeof(p_new -> '_retired') = 'array'
                      then p_new -> '_retired' else '[]'::jsonb end) e
  )
  select coalesce(array_agg(k order by k), array[]::text[])
    from keys
   where k is not null
     and left(k, 1) <> '_'
     and ((coalesce(p_old, '{}'::jsonb) -> k) is distinct from (coalesce(p_new, '{}'::jsonb) -> k)
          or custom.io_value_shape(p_old -> '_values' -> k)
             is distinct from custom.io_value_shape(p_new -> '_values' -> k)
          or (select jsonb_agg(e order by e::text) from jsonb_array_elements(
                 case when jsonb_typeof(p_old -> '_retired') = 'array'
                      then p_old -> '_retired' else '[]'::jsonb end) e where e ->> 'key' = k)
             is distinct from
             (select jsonb_agg(e order by e::text) from jsonb_array_elements(
                 case when jsonb_typeof(p_new -> '_retired') = 'array'
                      then p_new -> '_retired' else '[]'::jsonb end) e where e ->> 'key' = k));
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
  v_via   text;
  v_op    uuid;
begin
  for v_org in select distinct n.organization_id from new_rows n loop
    perform custom.assert_store_door(v_org, 'custom.io_record_changed');
  end loop;

  -- WHO IS WRITING. A fact about the connection, not about the row.
  v_actor := custom.io_change_actor();
  -- THE DOOR IT CAME THROUGH (CHAIR-DOORS-4): once per statement, like the actor.
  v_via   := custom.io_change_via();
  v_op := nullif(current_setting('custom.op_id', true), '')::uuid;

  insert into custom.io_outbox (organization_id, event_key, record_id, table_id, operation,
                                changed_field_ids, actor, dedupe_key, op_id, metadata)
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
         v_op,
         jsonb_build_object('change', jsonb_build_object(
           'kind',    'create',
           'version', c.version,
           'fields',  custom.io_change_fields(c.keys, '{}'::jsonb, c.data),
           'via',     v_via))
    from changed c
   order by c.id
  on conflict do nothing;

  return null;
end;
$function$
;

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

CREATE OR REPLACE FUNCTION custom._stage_field_key(p_organization_id uuid, p_table_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
#variable_conflict use_column
begin
  -- WRITE-PERF-2, LADDER-PERF's class on the rest of the write path. Everything between
  -- `begin` and `end` is this function's own SQL body, character for character; only the
  -- language moved, so its plan is cached for the session instead of being rebuilt on
  -- every single call.
  return (
  select t.data ->> 'stage_field'
    from custom.record t
   where t.organization_id = p_organization_id
     and t.id = p_table_id
     and t.table_id = custom.table_kernel_id()
     and t.deleted_at is null
  );
end
$function$
;

CREATE OR REPLACE FUNCTION custom._table_row_defaults(p_organization_id uuid, p_table_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
  -- A Table's own row defaults, keys it never set left out. '{}' for a Table that names none.
  select coalesce(jsonb_strip_nulls(case when jsonb_typeof(t.data -> 'row_defaults') = 'object'
                                         then t.data -> 'row_defaults' end), '{}'::jsonb)
    from custom.record t
   where t.organization_id = p_organization_id
     and t.id = p_table_id
     and t.table_id = custom.table_kernel_id()
     and t.deleted_at is null
$function$
;

CREATE OR REPLACE FUNCTION custom._record_defaults_filled(p_organization_id uuid, p_table_id uuid, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_out  jsonb := case when p_data is not null and jsonb_typeof(p_data) = 'object' then p_data else '{}'::jsonb end;
  f      record;
  v_key  text;
  v_type text;
  v_def  jsonb;
  v_fit  jsonb;
  v_opts uuid;
  v_word text;
  v_ok   boolean;
begin
  if p_organization_id is null or p_table_id is null then
    return v_out;
  end if;
  for f in
    select x.data
      from custom.record x
     where x.organization_id = p_organization_id
       and x.table_id = custom.field_kernel_id()
       and x.data_class = 'field'
       and x.deleted_at is null
       and x.data ->> 'entity_definition_id' = p_table_id::text
       and x.data ? 'default'
  loop
    v_key  := f.data ->> 'key';
    v_type := f.data ->> 'type';
    v_def  := f.data -> 'default';
    -- NAMED BY THE CALLER — a value or an explicit null — is the caller's, never the default's.
    if v_key is null or v_out ? v_key then
      continue;
    end if;
    -- NOTHING TO FILL: an absent default, and the empty containers the older system stored as
    -- "no value" ([] on a list, {} on a text column).
    if v_def is null or jsonb_typeof(v_def) = 'null'
       or v_def = '[]'::jsonb or v_def = '{}'::jsonb or v_def = '""'::jsonb then
      continue;
    end if;
    -- A FIELD NOBODY TYPES INTO never takes a default: it is worked out, linked or applies only to
    -- some types of record.
    if v_type in ('formula', 'rollup', 'lookup', 'relation', 'attachment', 'autonumber')
       or coalesce(f.data ->> 'source', '') in ('formula', 'rollup', 'lookup', 'computed')
       or (jsonb_typeof(f.data -> 'applies_to_types') = 'array' and jsonb_array_length(f.data -> 'applies_to_types') > 0) then
      continue;
    end if;

    if v_type = 'list' then
      -- A CHOICE: an option's id, or a word the choice-words trigger resolves to one. A closed
      -- column takes it only when it names one of its choices.
      v_ok := true;
      if coalesce((f.data -> 'config' ->> 'allow_other')::boolean, false) is not true then
        v_opts := nullif(coalesce(f.data ->> 'options_table_id', f.data -> 'config' ->> 'options_table_id'), '')::uuid;
        for v_word in
          select e #>> '{}' from jsonb_array_elements(case when jsonb_typeof(v_def) = 'array' then v_def else jsonb_build_array(v_def) end) e
        loop
          if v_word is null or v_opts is null or not exists (
               select 1 from custom.record o
                where o.organization_id = p_organization_id
                  and o.table_id = v_opts
                  and o.deleted_at is null
                  and (o.id::text = v_word
                       or lower(coalesce(o.data ->> 'name', o.data ->> 'title', '')) = lower(btrim(v_word))
                       or o.metadata ->> 'option_key' = v_word)) then
            v_ok := false;
          end if;
        end loop;
      end if;
      if not v_ok then
        continue;
      end if;
      v_fit := case when coalesce((f.data ->> 'multi')::boolean, false) and jsonb_typeof(v_def) <> 'array'
                    then jsonb_build_array(v_def) else v_def end;
    else
      v_fit := custom.field_value_convert(f.data, v_def);
      if v_fit is null then
        continue;
      end if;
    end if;
    v_out := v_out || jsonb_build_object(v_key, v_fit);
  end loop;
  return v_out;
end;
$function$
;

DELETE FROM platform.client_callable_door WHERE schema_name = 'custom' AND function_name = '_field_readers_within' AND identity_args = 'p_organization_id uuid, p_field_id uuid';
DROP FUNCTION custom._field_readers_within(uuid, uuid);
