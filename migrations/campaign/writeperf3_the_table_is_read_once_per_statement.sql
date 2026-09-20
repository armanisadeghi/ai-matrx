-- additive: yes
--
-- chair-step: it REPLACES the live bodies of `platform.memo_get`, `platform.memo_clear`,
--   `custom.applicable_fields`, `custom.table_type_field`, `custom.choice_field_map`,
--   `custom.table_rules` and `platform.relation_declaration`, and CREATES a second
--   transaction-local memo for answers too big to sit next to the small ones. Nothing is
--   dropped, nothing is revoked, no row of anybody's data is touched. Every replaced body
--   carries a `-- based-on:` hash. The inverse is
--   `migrations/inverse/writeperf3_the_table_is_read_once_per_statement_down.sql`.
--
-- based-on: platform.memo_get(text) c62ce21703ac7ce8addea8b1b9a1e387b56ab4e7e8bbc40bdb444b58550e24fe
-- based-on: platform.memo_clear() 814a244e07e7ea7ef0adc800bc4b275e125087a990eb7b75afd1e7f94b411ee8
-- based-on: custom.applicable_fields(uuid, uuid, text) faff2fed54153599eb0bb3a734c707f4cdd1ea791ca626159559f1642f07b27f
-- based-on: custom.table_type_field(uuid, uuid) b04b785408fa3143df1916a43b04cb701eb1ab96d9abe62fce59a8c049c3530c
-- based-on: custom.choice_field_map(uuid, uuid) 414557878c6f9efacae9522d4eadcd6913543d14d9ad20dff97f7e9f87040df8
-- based-on: custom.table_rules(uuid, uuid, text, text) d67a688bcfcba3eef8e082105ab9ad6c5c861222df65d9871a7e4e87ea52066b
-- based-on: platform.relation_declaration(uuid, uuid) 303f6de56b01cbb5d6f9c515f349c4c3dd017ba96f3a56711680d376ab72df96
--
-- WRITE-PERF-3 — WHAT A TABLE LOOKS LIKE IS READ ONCE PER STATEMENT, NOT FIVE TIMES PER ROW.
--
-- MEASURED ON THE MAIN DATABASE 2026-09-20, 2,000 rows through `custom.record_write_many` with
-- `track_functions = all`, AFTER writeperf3_the_write_path_asks_the_ladder_once.sql. PER ROW:
--
--     custom.applicable_fields    5.00 calls   3.543 ms self    <- the largest item left
--     custom.table_type_field     5.00 calls   1.298 ms self
--     custom.table_rules          2.50 calls   1.797 ms self    (on a Table with no Rule at all)
--     custom.choice_options       2.50 calls   1.648 ms self
--     custom.choice_field_map     1.25 calls   0.966 ms self
--     platform.relation_declaration 1.20 calls 0.631 ms self
--     platform.memo_get          62.03 calls   0.599 ms self  (1.746 more in memo_all/memo_seat)
--
-- FIVE OF THE THIRTY BEFORE-ROW GUARDS ASK WHAT COLUMNS THIS TABLE HAS, ON EVERY ROW —
-- `_value_envelope`, `_record_field_validation`, `_derived_fields`, `_record_rule_uses` and
-- `_entity_custom_fields_guard`. A Table's columns, its type field, its choices and its Rules
-- do not change between row 1 and row 500 of one statement, and none of them is about the row
-- being written.
--
-- THREE THINGS THIS FILE DOES.
--
-- 1. A SECOND MEMO FOR BULKY ANSWERS, `mx_memo.b`, separate from `mx_memo.v` ON PURPOSE. Every
--    read of a memo parses the whole blob, so putting a Table's field rows into the blob that
--    `platform.knob_resolve` reads sixty times a row would make every cheap lookup pay for the
--    expensive one. `mx_memo.b` holds at most `platform.memo_b_ceiling()` (8) entries and at
--    most `platform.memo_b_bytes()` (65536) characters, and empties itself the moment either
--    would be passed. Same fence as `mx_memo.v`: ONE transaction-local GUC, `is_local => true`,
--    which Postgres reverts at the end of the transaction whether it commits or rolls back.
--
-- 2. ITS SEAT FINGERPRINT DELIBERATELY LEAVES OUT `current_user`, AND THAT IS THE WHOLE REASON
--    IT IS A SECOND MEMO RATHER THAN A PREFIX IN THE FIRST. `custom.applicable_fields`,
--    `custom.table_type_field` and `platform.relation_declaration` are SECURITY DEFINER, so
--    inside them `current_user` is the OWNER, not the person — while `custom.assert_may_know_table`
--    runs as the person. Sharing one blob would mean one of them silently wiping the other's
--    entries every time it wrote, because `platform.memo_all` treats a different `_seat` as an
--    empty memo. So: `mx_memo.v` keeps its seat-exact fence for answers ABOUT A PERSON, and
--    `mx_memo.b` fences on `role`, the JWT claims and `session_user` — which do not change
--    across a SECURITY DEFINER boundary — for answers about a TABLE, which are the same
--    whoever is asking. Who may ask remains decided by the guards, every one of which still
--    runs before the memo is read.
--
-- 3. `platform.memo_get` IS ONE FUNCTION INSTEAD OF THREE. It used to call `platform.memo_all`,
--    which called `platform.memo_seat`; sixty-two lookups a row paid for a hundred and ninety
--    plpgsql invocations. The body is the same three steps in one frame and answers the same
--    thing. `platform.memo_all` and `platform.memo_seat` are untouched and still exported.
--
-- WHAT EMPTIES IT. `platform.memo_clear()` now empties BOTH GUCs, so every statement trigger
-- writeperf3_the_write_path_asks_the_ladder_once.sql installed — on all fourteen tables the
-- ladder reads, including a `custom.record` insert that carries a Table, a Field or a Rule —
-- and the three knob triggers `platform.memo_bump` already sat on, empty the structure memo too.
-- That is why `custom.table_rules` may remember that a Table has NO Rule: a Rule arriving is an
-- insert of a `custom.rule_kernel_id()` row, which empties the memo before the next statement.
--
-- WHAT IS NEVER REMEMBERED: a refusal, an empty organization id, and any answer computed before
-- its guards passed. Every one of the five doors below runs its guards on EVERY call, hit or
-- miss — the memo saves the READ, never the DECISION.

-- ---------------------------------------------------------------------------------------------
-- 1. THE SECOND MEMO.
-- ---------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION platform.memo_b_ceiling() RETURNS integer
 LANGUAGE sql IMMUTABLE SET search_path TO '' AS $function$ select 8; $function$;

CREATE OR REPLACE FUNCTION platform.memo_b_bytes() RETURNS integer
 LANGUAGE sql IMMUTABLE SET search_path TO '' AS $function$ select 65536; $function$;

CREATE OR REPLACE FUNCTION platform.memo_b_seat()
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
begin
  -- `session_user` and not `current_user`: see head of file, point 2.
  return (
    select md5(coalesce(current_setting('role', true), '') || '|' ||
               coalesce(current_setting('request.jwt.claims', true), '') || '|' ||
               session_user)
  );
end
$function$;

CREATE OR REPLACE FUNCTION platform.memo_b_get(p_key text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_raw text := nullif(current_setting('mx_memo.b', true), '');
  v     jsonb;
begin
  if v_raw is null then
    return null;
  end if;
  begin
    v := v_raw::jsonb;
  exception when others then
    return null;                       -- a blob that will not parse is a miss, never an error
  end;
  if (v ->> '_seat') is distinct from platform.memo_b_seat() then
    return null;
  end if;
  return v -> 'e' ->> p_key;
end;
$function$;

CREATE OR REPLACE FUNCTION platform.memo_b_put(p_key text, p_value text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_raw text := nullif(current_setting('mx_memo.b', true), '');
  v_e   jsonb := '{}'::jsonb;
  v_new text;
begin
  if p_value is null then
    return;
  end if;
  if v_raw is not null then
    begin
      if (v_raw::jsonb ->> '_seat') is not distinct from platform.memo_b_seat() then
        v_e := coalesce(v_raw::jsonb -> 'e', '{}'::jsonb);
      end if;
    exception when others then
      v_e := '{}'::jsonb;
    end;
  end if;
  if (select count(*) from jsonb_object_keys(v_e)) >= platform.memo_b_ceiling()
     or length(v_raw) + length(p_value) > platform.memo_b_bytes() then
    v_e := '{}'::jsonb;                -- a memo that has stopped being cheap stops being a memo
  end if;
  v_new := jsonb_build_object('_seat', platform.memo_b_seat(),
                              'e', v_e || jsonb_build_object(p_key, p_value))::text;
  if length(v_new) > platform.memo_b_bytes() then
    return;                            -- one answer too big for the memo is simply not memoised
  end if;
  perform set_config('mx_memo.b', v_new, true);
end;
$function$;

CREATE OR REPLACE FUNCTION platform.memo_clear()
 RETURNS void
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select set_config('mx_memo.v', '', true), set_config('mx_memo.b', '', true);
$function$;

CREATE OR REPLACE FUNCTION platform.memo_get(p_key text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_raw text := nullif(current_setting('mx_memo.v', true), '');
  v     jsonb;
begin
  -- `platform.memo_all()` and `platform.memo_seat()`, in one frame. Same three steps, same
  -- answer; the two functions are untouched and still exported for every other caller.
  if v_raw is null then
    return null;
  end if;
  begin
    v := v_raw::jsonb;
  exception when others then
    return null;
  end;
  if (v ->> '_seat') is distinct from
     md5(coalesce(current_setting('role', true), '') || '|' ||
         coalesce(current_setting('request.jwt.claims', true), '') || '|' ||
         current_user) then
    return null;
  end if;
  return v -> 'e' ->> p_key;
end;
$function$;

-- ---------------------------------------------------------------------------------------------
-- 2. THE FIVE READS. Guards first, every time; only the READ is remembered.
-- ---------------------------------------------------------------------------------------------

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
begin
  -- The decision comes BEFORE the read, so a foreign organization id and an invented one
  -- answer identically: both are refused, neither is told whether the table exists.
  perform custom.assert_store_door(p_organization_id, 'custom.applicable_fields');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.applicable_fields');
  perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.applicable_fields');

  -- THE SAME TABLE, ALREADY READ IN THIS TRANSACTION. The three lines above ran first, so this
  -- is a shortcut through the READ and never through the DECISION.
  v_key := 'af:' || coalesce(p_organization_id::text, '-') || ':' ||
                    coalesce(p_table_id::text, '-') || ':' || coalesce(p_record_type, '');
  v_json := platform.memo_b_get(v_key)::jsonb;
  if v_json is not null then
    return query select * from jsonb_populate_recordset(null::custom.record, v_json);
    return;
  end if;

  -- T8. The record's type value is the option's KEY; whoever declared "Radius applies to a
  -- Circle" may have written the word, the key or the option's id. All of them name the same
  -- choice, so the question is asked with all of them. This is the clause the seventh pass
  -- failed: "asking what columns THIS record has answers without Radius".
  v_types := case when p_record_type is null then '{}'::text[]
                  else custom.choice_synonyms(p_organization_id, p_table_id, p_record_type) end;

  select coalesce(jsonb_agg(to_jsonb(q)), '[]'::jsonb) into v_json from (
    select f.*
      from custom.record f
     where f.organization_id = p_organization_id
       and f.table_id = custom.field_kernel_id()
       and f.deleted_at is null
       and (f.data ->> 'entity_definition_id')::uuid = p_table_id
       and (jsonb_array_length(coalesce(f.data -> 'applies_to_types', '[]'::jsonb)) = 0
            or (p_record_type is not null
                and coalesce(f.data -> 'applies_to_types', '[]'::jsonb) ?| v_types))) q;

  perform platform.memo_b_put(v_key, v_json::text);
  return query select * from jsonb_populate_recordset(null::custom.record, v_json);
end $function$;

CREATE OR REPLACE FUNCTION custom.table_type_field(p_organization_id uuid, p_table_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_answer text;
  v_key    text;
  v_hit    text;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.table_type_field');
  perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.table_type_field');

  -- `to_jsonb`/`#>> '{}'` and not the bare text, so a Table that HAS no type field — a null
  -- answer, which is the common one — is a hit rather than a miss forever.
  v_key := 'tf:' || coalesce(p_organization_id::text, '-') || ':' || coalesce(p_table_id::text, '-');
  v_hit := platform.memo_b_get(v_key);
  if v_hit is not null then
    return v_hit::jsonb #>> '{}';
  end if;

  select t.data ->> 'type_field' into v_answer
    from custom.record t
   where t.organization_id = p_organization_id
     and t.id = p_table_id
     and t.table_id = custom.table_kernel_id()
     and t.deleted_at is null;
  perform platform.memo_b_put(v_key, to_jsonb(v_answer)::text);
  return v_answer;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.choice_field_map(p_organization_id uuid, p_table_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
#variable_conflict use_column
declare
  v_key text := 'cm:' || coalesce(p_organization_id::text, '-') || ':' || coalesce(p_table_id::text, '-');
  v_hit text := platform.memo_b_get(v_key);
  v_out jsonb;
begin
  if v_hit is not null then
    return v_hit::jsonb;
  end if;
  -- LADDER-PERF's class, on the WRITE path. Everything between `begin` and `end`
  -- is this function's own SQL body, character for character; only the language
  -- moved, so a plan is cached for the session instead of built on every call.
  v_out := (
  -- field key -> {label, multi, options_table_id, options}. ONE call per table per request is
    -- what every door below is built on; a table with no list Field answers '{}' and every
    -- caller short-circuits on that.
    select coalesce(jsonb_object_agg(f.data ->> 'key', jsonb_build_object(
             'label',            coalesce(nullif(f.data ->> 'label', ''), f.data ->> 'key'),
             'multi',            coalesce((f.data ->> 'multi')::boolean, false),
             'field_id',         f.id::text,
             'options_table_id', f.data -> 'config' ->> 'options_table_id',
             'options',          custom.choice_options(p_organization_id,
                                   (f.data -> 'config' ->> 'options_table_id')::uuid))), '{}'::jsonb)
      from custom.record f
     where f.organization_id = p_organization_id
       and f.table_id = custom.field_kernel_id()
       and f.deleted_at is null
       and coalesce(f.data_class, '') <> 'kernel'
       and (f.data ->> 'entity_definition_id')::uuid = p_table_id
       and f.data ->> 'type' = 'list'
       and nullif(f.data -> 'config' ->> 'options_table_id', '') is not null
  );
  perform platform.memo_b_put(v_key, v_out::text);
  return v_out;
end
$function$;

CREATE OR REPLACE FUNCTION custom.table_rules(p_organization_id uuid, p_table_id uuid, p_use text, p_record_type text DEFAULT NULL::text)
 RETURNS SETOF custom.record
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_key text;
begin
  if p_use is null or not (p_use = any (custom.rule_uses())) then
    raise exception 'there is no % use of a rule', coalesce(p_use, 'nameless')
      using errcode = '22023',
            hint = 'REC-15: the four uses are validate, compute, define membership and decide applicability — select unnest(custom.rule_uses()).';
  end if;

  -- ONLY "THIS TABLE HAS NO RULE OF THIS USE" IS REMEMBERED, and that is the answer for almost
  -- every Table in the platform. A Table that HAS Rules reads them from the rows on every call,
  -- exactly as before — the rows are what `custom.rule_run` then executes, and a remembered
  -- copy of them would be a second place a Rule could live.
  v_key := 'tr:' || coalesce(p_organization_id::text, '-') || ':' || coalesce(p_table_id::text, '-')
           || ':' || p_use || ':' || coalesce(p_record_type, '');
  if platform.memo_b_get(v_key) = '0' then
    return;
  end if;

  return query
    select r.*
      from custom.record r
     where r.organization_id = p_organization_id
       and r.table_id = custom.rule_kernel_id()
       and r.deleted_at is null
       and (r.data ->> 'scope_table_id')::uuid = p_table_id
       and coalesce(r.data -> 'uses', '[]'::jsonb) ? p_use
       and (jsonb_array_length(coalesce(r.data -> 'applies_to_types', '[]'::jsonb)) = 0
            or (p_record_type is not null
                and coalesce(r.data -> 'applies_to_types', '[]'::jsonb) ? p_record_type))
       -- REC-15's per-use narrowing. T8 is why it exists: the SAME truth about width and
       -- height is WORKED OUT for every quadrilateral and ENFORCED on a square alone. One
       -- Rule, one expression, four uses — and a use that speaks about fewer kinds of record
       -- than the Rule does says so here rather than being split into a second Rule that
       -- nothing keeps equal to the first.
       and (not (coalesce(r.data -> 'use_types', '{}'::jsonb) ? p_use)
            or (p_record_type is not null
                and (r.data -> 'use_types' -> p_use) ? p_record_type))
     order by coalesce((r.data ->> 'sort')::integer, 0), r.created_at, r.id;

  if not found then
    perform platform.memo_b_put(v_key, '0');
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION platform.relation_declaration(p_organization_id uuid, p_field_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  f         record;
  v_flavor  text;
  v_mode    text;
  v_card    text;
  v_on_del  text;
  v_bind    text;
  v_targets uuid[];
  v_owned   boolean;
  v_table   uuid;
  v_class   text;
  v_key     text;
  v_hit     jsonb;
begin
  perform platform.assert_relations_door(p_organization_id);
  -- THE CALLER, BEFORE THE FIRST READ. A field document describes a table's shape, so the
  -- wall comes first and the table second — and both are asked before this function admits
  -- that the field exists, so a foreign id and an invented one answer identically.
  perform custom.assert_client_may_reach(p_organization_id, 'platform.relation_declaration');

  -- THE SAME FIELD, ALREADY DECLARED IN THIS TRANSACTION. Every relation edge written by one
  -- statement points through the same Field, so this was asked once per edge and answered the
  -- same thing every time. The entry carries the Table this Field belongs to and its class, so
  -- the THIRD guard below still runs on a hit exactly as it runs on a miss: what is remembered
  -- is the READ, never the DECISION.
  v_key := 'rd:' || coalesce(p_organization_id::text, '-') || ':' || coalesce(p_field_id::text, '-');
  v_hit := platform.memo_b_get(v_key)::jsonb;
  if v_hit is not null then
    v_table := nullif(v_hit ->> 'table', '')::uuid;
    v_class := v_hit ->> 'class';
    if v_table is not null and coalesce(v_class, '') <> 'kernel' then
      perform custom.assert_may_know_table(p_organization_id, v_table, 'platform.relation_declaration');
    end if;
    return v_hit -> 'out';
  end if;

  select r.id, r.organization_id, r.data into f
    from custom.record r
   where r.id = p_field_id
     and (r.organization_id = p_organization_id or r.data_class = 'kernel')
     and r.deleted_at is null
   limit 1;
  if not found then
    raise exception 'there is no field % in this organization', p_field_id using errcode = '23503';
  end if;
  v_table := nullif(f.data ->> 'entity_definition_id', '')::uuid;
  select r.data_class into v_class from custom.record r
   where r.id = p_field_id and (r.organization_id = p_organization_id or r.data_class = 'kernel')
   limit 1;
  -- A kernel field belongs to a standard table nobody was shared; asking the table question
  -- of it would refuse every caller for a shape the platform itself declares.
  if v_table is not null and coalesce(v_class, '') <> 'kernel' then
    perform custom.assert_may_know_table(p_organization_id, v_table, 'platform.relation_declaration');
  end if;
  if coalesce(f.data ->> 'type', '') <> 'relation' then
    raise exception 'the field % behaves as %, so it declares no relation',
      coalesce(f.data ->> 'name', f.data ->> 'label', p_field_id::text),
      coalesce(nullif(f.data ->> 'type', ''), 'nothing')
      using errcode = '23514',
            hint = 'FLD-1 / REL-10: only a field whose behavior is `relation` carries a relation. A list field points at an options Table and is not this.';
  end if;

  -- REL-1. OWNERSHIP IS THE CONTAINED TABLE'S FACT, NOT THE FIELD'S.
  if f.data ? 'flavor' or f.data -> 'config' ? 'flavor' then
    raise exception 'the field % cannot declare whether the relation owns what it points at',
      coalesce(f.data ->> 'name', p_field_id::text)
      using errcode = '23514',
            hint = 'REL-1 / V-39: ownership is ONE fact, stored once - on the table being pointed at, as `contained_by_relation`, because it is that table''s records that are or are not contained. Every field pointing at it reads the same answer, so two fields can never disagree about it. Declare it on the table.';
  end if;

  v_mode := lower(coalesce(nullif(f.data -> 'config' ->> 'target_mode', ''), 'one'));
  if not (v_mode = any (platform.relation_target_modes())) then
    raise exception 'the field % points at "%", and a relation points at one table, several, or any',
      coalesce(f.data ->> 'name', p_field_id::text), v_mode
      using errcode = '23514',
            hint = 'REL-8: target_mode is one of ' || array_to_string(platform.relation_target_modes(), ', ') || '.';
  end if;

  if v_mode = 'one' then
    v_targets := array[nullif(f.data ->> 'relation_target', '')::uuid];
    if v_targets[1] is null then
      raise exception 'the field % points at one table and does not say which',
        coalesce(f.data ->> 'name', p_field_id::text) using errcode = '23514', hint = 'FLD-13 / REL-8: relation_target.';
    end if;
  elsif v_mode = 'several' then
    select array_agg((t #>> '{}')::uuid) into v_targets
      from jsonb_array_elements(coalesce(f.data -> 'config' -> 'target_tables', '[]'::jsonb)) t;
    if v_targets is null or array_length(v_targets, 1) is null then
      raise exception 'the field % points at several tables and names none of them',
        coalesce(f.data ->> 'name', p_field_id::text)
        using errcode = '23514',
              hint = 'REL-8: target_mode `several` carries config.target_tables, the list of tables it may point at. One table is target_mode `one`; no list at all is target_mode `any`.';
    end if;
  else
    v_targets := null;   -- `any`: polymorphic without restriction
  end if;

  v_owned := false;
  if v_mode = 'one' then
    select coalesce((t.data ->> 'contained_by_relation')::boolean, false) into v_owned
      from custom.record t
     where t.id = v_targets[1] and t.deleted_at is null
       and (t.organization_id = p_organization_id or t.data_class = 'kernel')
     limit 1;
  end if;
  v_flavor := case when coalesce(v_owned, false) then 'owned' else 'referenced' end;

  v_card := case when coalesce((f.data ->> 'relation_max')::integer, 0) = 1
                 then 'at_most_one' else 'many' end;

  v_on_del := lower(coalesce(nullif(f.data ->> 'on_target_delete', ''),
                             case when v_flavor = 'owned' then 'cascade' else 'set_null' end));
  if not (v_on_del = any (platform.relation_on_delete_actions())) then
    raise exception 'the field % says "%" happens when the thing it points at is deleted',
      coalesce(f.data ->> 'name', p_field_id::text), v_on_del
      using errcode = '23514',
            hint = 'REL-2: on_target_delete is one of ' || array_to_string(platform.relation_on_delete_actions(), ', ') || ', and it is a property of its own - an owned relation may restrict, and a referenced one may cascade.';
  end if;

  v_bind := lower(coalesce(nullif(f.data -> 'config' ->> 'binding', ''), 'live'));
  if not (v_bind = any (platform.relation_bindings())) then
    raise exception 'the field % is bound "%" to what it points at',
      coalesce(f.data ->> 'name', p_field_id::text), v_bind
      using errcode = '23514',
            hint = 'REL-3: binding is one of ' || array_to_string(platform.relation_bindings(), ', ') || '. `live` follows the target; `snapshot` freezes a copy in the relation''s own payload at write time.';
  end if;

  v_hit := jsonb_build_object(
    'field_id',    f.id,
    'key',         coalesce(nullif(f.data ->> 'key', ''), f.data ->> 'name'),
    'flavor',      v_flavor,
    'on_delete',   v_on_del,
    'binding',     v_bind,
    'ordered',     coalesce((f.data -> 'config' ->> 'ordered')::boolean, false),
    'loops',       coalesce((f.data -> 'config' ->> 'loops')::boolean, false),
    'carries',     coalesce((f.data -> 'config' ->> 'carries')::boolean, v_flavor = 'owned'),
    'carries_max', coalesce(nullif(f.data -> 'config' ->> 'carries_max', ''), 'editor'),
    'cardinality', v_card,
    'max',         greatest(coalesce((f.data ->> 'relation_max')::integer, 1), 1),
    'target_mode', v_mode,
    'target_tables', case when v_targets is null then null else to_jsonb(v_targets) end,
    'inverse_key', nullif(f.data ->> 'inverse_key', ''));

  perform platform.memo_b_put(v_key, jsonb_build_object('table', v_table, 'class', v_class,
                                                        'out', v_hit)::text);
  return v_hit;
end;
$function$;
