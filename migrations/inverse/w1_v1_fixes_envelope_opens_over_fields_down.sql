-- target: branch
-- based-on: custom._value_envelope() 481c32c95170c75f7a9e46d2266b3272de133b384367caeec6b3e1fc6a173073
-- based-on: custom.intern_provenance(jsonb) a4b0c0c8494f895237a3c6abeb38f6a7d7379ed8cb774b4a94ff6c6a3871eed4
-- based-on: custom.stamp_value_envelopes(jsonb,text,text,timestamp with time zone) cba8dc14212de91ba54e5dfc188b853203fabb0ad8f907d9325f91e5214cae91
-- based-on: custom.validate_value_envelope(uuid,custom.record[],jsonb) aa75202a64871992ede0f853b94a1c000a6eeca93b7e6896fe0f44e835786d90
-- based-on: custom.value_versions(jsonb,jsonb) 7137c1721a267a658444f8129406b48e3081569af12dea84a9cd7fdeb2663587
--
-- THE INVERSE of `migrations/campaign/w1_v1_fixes_envelope_opens_over_fields.sql` (rule 27).
-- It puts back exactly what that file superseded: the four NULL-BLIND guards as they were,
-- and `custom._value_envelope()` as `w1_v1_fixes_the_store_opens_the_envelope.sql` left it -
-- opening an envelope over every non-underscore key rather than over the Table's applicable
-- Fields. Applying it makes three of the eight green campaign suites go red again, which is
-- the point: the inverse restores the prior state, defect included.
--
-- Branch-only: schema `custom` does not exist on production (measured SELECT-only 2026-09-17).
--
-- ground-standing-ok: b — the four NULL-BLIND guards and `custom._value_envelope()` restored
-- below call `custom.assert_store_door`, `custom.size_refusal` and `custom.actor_word`, which
-- the sibling inverse `w1_v1_fixes_one_door_predicate_down.sql` drops. THIS FILE IS THE ONE
-- MEANT TO RUN: its own red twin executes it alone inside a rolled-back transaction to make
-- three green campaign suites go red again. `w1_v1_fixes_one_door_predicate_down.sql` takes the
-- ONE door predicate out from under the whole record store and is the last inverse of this
-- family to come off: in a full un-apply this file runs FIRST, while all three callees still
-- exist, and that one LAST. Running them the other way round leaves every guard in the store
-- calling a function that is gone.

set lock_timeout = '5s';
set statement_timeout = '300s';

create or replace function custom._value_envelope()
 returns trigger
 language plpgsql
 set search_path to 'pg_catalog'
as $function$
declare
  v_data     jsonb := coalesce(new.data, '{}'::jsonb);
  v_actor    text;
  v_obo      text;
  v_refusal  text;
  v_values   jsonb;
  v_key      text;
  v_declared boolean;
begin
  -- THE DOOR. The thirteenth and last RETURNS trigger in this schema to read the ONE
  -- predicate, which judges custom.caller_role() and never current_user. custom/system_enabled
  -- decides WHO may write and never which check runs.
  perform custom.assert_store_door(new.organization_id, 'custom.record');

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

  if new.data_class = 'record' then
    v_values := coalesce(v_data -> '_values', '{}'::jsonb);
    if jsonb_typeof(v_values) <> 'object' then
      v_values := '{}'::jsonb;        -- the envelope law below refuses it by name
    end if;
    for v_key in select k from jsonb_object_keys(v_data) k loop
      if left(v_key, 1) <> '_' and not (v_values ? v_key) then
        v_values := v_values || jsonb_build_object(v_key, '{}'::jsonb);
      end if;
    end loop;
    -- Never write an empty block onto a record that has no content keys at all: an empty
    -- _values says nothing and would appear on every relation stub in the store.
    if v_values <> '{}'::jsonb or v_data ? '_values' then
      v_data := jsonb_set(v_data, '{_values}', v_values);
    end if;
  end if;

  v_data := custom.intern_provenance(v_data);
  v_data := custom.stamp_value_envelopes(v_data, v_actor, v_obo, now());
  v_data := custom.value_versions(case when tg_op = 'UPDATE' then old.data else '{}'::jsonb end, v_data);

  v_refusal := custom.value_envelope_refusal(v_data);
  if v_refusal is not null then
    raise exception '%', v_refusal
      using errcode = '23514', hint = 'VAL-1..VAL-8: a value carries its source, its author, its reason for being missing and its other candidates, inside this record''s one document.';
  end if;

  new.data := v_data;
  return new;
end;
$function$;


CREATE OR REPLACE FUNCTION custom.intern_provenance(p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_sources jsonb := coalesce(p_data -> '_sources', '{}'::jsonb);
  v_values  jsonb;
  v_out     jsonb := '{}'::jsonb;
  v_key     text;
  v_env     jsonb;
  v_alts    jsonb;
  v_alt     jsonb;
  v_ptr     text;
begin
  if p_data is null or jsonb_typeof(p_data -> '_values') <> 'object' then
    return p_data;
  end if;
  if jsonb_typeof(v_sources) <> 'object' then
    return p_data;             -- a malformed block is the law's to refuse, not this one's to repair.
  end if;
  v_values := p_data -> '_values';

  for v_key, v_env in select * from jsonb_each(v_values) loop
    if jsonb_typeof(v_env) <> 'object' then
      v_out := v_out || jsonb_build_object(v_key, v_env);
      continue;
    end if;

    -- A writer names the SOURCE; this store hands back a pointer. An inline object is the
    -- ergonomic half of VAL-1 and the only reason a caller never has to know a pointer exists.
    if jsonb_typeof(v_env -> 'src') = 'object' then
      v_ptr := custom.source_pointer(v_sources, v_env -> 'src');
      if v_ptr is null then
        v_ptr := custom.source_next_pointer(v_sources);
        v_sources := jsonb_set(v_sources, array[v_ptr], v_env -> 'src');
      end if;
      v_env := jsonb_set(v_env, '{src}', to_jsonb(v_ptr));
    end if;

    if jsonb_typeof(v_env -> 'alternates') = 'array' then
      v_alts := '[]'::jsonb;
      for v_alt in select value from jsonb_array_elements(v_env -> 'alternates') loop
        if jsonb_typeof(v_alt) = 'object' and jsonb_typeof(v_alt -> 'src') = 'object' then
          v_ptr := custom.source_pointer(v_sources, v_alt -> 'src');
          if v_ptr is null then
            v_ptr := custom.source_next_pointer(v_sources);
            v_sources := jsonb_set(v_sources, array[v_ptr], v_alt -> 'src');
          end if;
          v_alt := jsonb_set(v_alt, '{src}', to_jsonb(v_ptr));
        end if;
        v_alts := v_alts || jsonb_build_array(v_alt);
      end loop;
      v_env := jsonb_set(v_env, '{alternates}', v_alts);
    end if;

    v_out := v_out || jsonb_build_object(v_key, v_env);
  end loop;

  p_data := jsonb_set(p_data, '{_values}', v_out);
  if v_sources = '{}'::jsonb then
    return p_data - '_sources';
  end if;
  return jsonb_set(p_data, '{_sources}', v_sources);
end;
$function$
;


CREATE OR REPLACE FUNCTION custom.stamp_value_envelopes(p_data jsonb, p_actor text, p_on_behalf_of text, p_at timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_out jsonb := '{}'::jsonb;
  v_key text;
  v_env jsonb;
begin
  if p_data is null or jsonb_typeof(p_data -> '_values') <> 'object' then
    return p_data;
  end if;
  for v_key, v_env in select * from jsonb_each(p_data -> '_values') loop
    if jsonb_typeof(v_env) = 'object' then
      v_env := v_env
               || jsonb_build_object('actor', p_actor)
               || jsonb_build_object('on_behalf_of', to_jsonb(p_on_behalf_of))
               || jsonb_build_object('at', to_jsonb(p_at));
    end if;
    v_out := v_out || jsonb_build_object(v_key, v_env);
  end loop;
  return jsonb_set(p_data, '{_values}', v_out);
end;
$function$
;


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
  f       custom.record;
begin
  if jsonb_typeof(p_data -> '_values') <> 'object' then
    return;
  end if;
  select array_agg(x.data ->> 'key') into v_keys from unnest(p_fields) x;

  for v_key in select k from jsonb_object_keys(p_data -> '_values') k loop
    if not (v_key = any (coalesce(v_keys, array[]::text[]))) then
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
$function$
;


CREATE OR REPLACE FUNCTION custom.value_versions(p_old jsonb, p_new jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_out   jsonb := '{}'::jsonb;
  v_key   text;
  v_env   jsonb;
  v_prior jsonb;
  v_ver   integer;
begin
  if p_new is null or jsonb_typeof(p_new -> '_values') <> 'object' then
    return p_new;
  end if;
  for v_key, v_env in select * from jsonb_each(p_new -> '_values') loop
    if jsonb_typeof(v_env) <> 'object' then
      v_out := v_out || jsonb_build_object(v_key, v_env);
      continue;
    end if;
    v_prior := coalesce(p_old, '{}'::jsonb) -> '_values' -> v_key;
    if v_prior is null or jsonb_typeof(v_prior) <> 'object' then
      v_ver := 1;
    elsif ((p_new -> v_key) is distinct from (coalesce(p_old, '{}'::jsonb) -> v_key))
       or ((v_env - 'ver' - 'at' - 'actor' - 'on_behalf_of')
            is distinct from (v_prior - 'ver' - 'at' - 'actor' - 'on_behalf_of')) then
      -- The VALUE moved, or its source, its reason for absence or its alternates did.
      v_ver := coalesce((v_prior ->> 'ver')::integer, 0) + 1;
    else
      -- Re-asserting the same value is not a new version of it, whoever asserted it.
      v_ver := coalesce((v_prior ->> 'ver')::integer, 1);
    end if;
    v_out := v_out || jsonb_build_object(v_key, jsonb_set(v_env, '{ver}', to_jsonb(v_ver)));
  end loop;
  return jsonb_set(p_new, '{_values}', v_out);
end;
$function$
;
