-- additive: yes
--
-- chair-step: it REPLACES `platform.memo_clear`, `custom.table_type_field`, `custom.table_rules`
--   and `platform.relation_declaration` — the last three being this lane's own bodies from an
--   hour earlier — and CREATES a third transaction-local memo for small answers. Nothing is
--   dropped, nothing is revoked, no row of anybody's data is touched. Every replaced body
--   carries a `-- based-on:` hash. The inverse is
--   `migrations/inverse/writeperf3_a_small_answer_is_not_read_out_of_a_big_blob_down.sql`.
--
-- based-on: platform.memo_clear() 395dbd07480809f4531c45a0e947250933a4c643f8156bf69a52b54feaa06502
-- based-on: custom.table_type_field(uuid, uuid) 2465e6afc20703bef020304fbec82645bfc669ef6a48653531e6d36a4520d7fb
-- based-on: custom.table_rules(uuid, uuid, text, text) 388caff6bee952955592b25c313e088760d290ed98469381743fd53f1f88adb7
-- based-on: platform.relation_declaration(uuid, uuid) d8b0a726b75261717f9deec9bb23c13c8c24b631d078dcda29a82b589e1879e4
--
-- WRITE-PERF-3 — A SECOND DEFECT OF MINE, AND THE COST OF READING A SMALL ANSWER OUT OF A BIG
-- BLOB.
--
-- 1. `custom.table_type_field` WAS NEVER ONCE MEMOISED. It answers NULL for every Table that has
--    no type field, which is almost all of them, and it stored that answer with
--    `to_jsonb(v_answer)::text` — which is SQL NULL for a null input, not the four characters
--    `null`. `platform.memo_b_put` returns on a null value by design, so nothing was ever
--    written and all five calls a row did the full read. PROVED, not reasoned: the memo blob
--    read back after each of six single-row writes held `cm:`, `rd:`, `af:` and two `tr:` keys
--    and no `tf:` key at all. It is `coalesce(to_jsonb(v_answer), 'null'::jsonb)` now, and the
--    suite asserts the key is there.
--
-- 2. FIFTEEN MEMO READS A ROW WERE PARSING A 7,682-CHARACTER BLOB TO FETCH A FOUR-CHARACTER
--    ANSWER. `mx_memo.b` holds a Table's field rows (`af:`) and its choice map (`cm:`) — kilobytes,
--    rightly — next to its type field (`tf:`), its "this Table has no Rule of this use" markers
--    (`tr:`) and a Field's relation declaration (`rd:`), which are tens of bytes. Every read of a
--    memo parses the whole blob, so the cheap answers were paying for the expensive ones: that
--    is the same mistake, one level down, that `mx_memo.b` was created to avoid making against
--    `mx_memo.v`.
--
-- SO THERE ARE THREE MEMOS, AND THE RULE FOR WHICH IS WHICH IS SIZE, NOT SUBJECT:
--
--     mx_memo.v   seat-exact       knob values, and the three door verdicts     small
--     mx_memo.s   client-fenced    a Table's type field, its Rule markers,      small
--                                  a Field's relation declaration
--     mx_memo.b   client-fenced    a Table's field rows and its choice map      kilobytes
--
-- `mx_memo.s` and `mx_memo.b` share `platform.memo_b_seat()` — `role`, the JWT claims and
-- `session_user`, and deliberately not `current_user`, for the SECURITY DEFINER reason written
-- at the head of writeperf3_the_table_is_read_once_per_statement.sql. `platform.memo_clear()`
-- empties all three, so every statement trigger this lane installed still empties everything it
-- always emptied, and nothing new needs a trigger of its own.

CREATE OR REPLACE FUNCTION platform.memo_s_ceiling() RETURNS integer
 LANGUAGE sql IMMUTABLE SET search_path TO '' AS $function$ select 64; $function$;

CREATE OR REPLACE FUNCTION platform.memo_s_bytes() RETURNS integer
 LANGUAGE sql IMMUTABLE SET search_path TO '' AS $function$ select 8192; $function$;

CREATE OR REPLACE FUNCTION platform.memo_s_get(p_key text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_raw text := nullif(current_setting('mx_memo.s', true), '');
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

CREATE OR REPLACE FUNCTION platform.memo_s_put(p_key text, p_value text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_raw text := nullif(current_setting('mx_memo.s', true), '');
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
  if (select count(*) from jsonb_object_keys(v_e)) >= platform.memo_s_ceiling()
     or length(v_raw) + length(p_value) > platform.memo_s_bytes() then
    v_e := '{}'::jsonb;                -- a memo that has stopped being cheap stops being a memo
  end if;
  v_new := jsonb_build_object('_seat', platform.memo_b_seat(),
                              'e', v_e || jsonb_build_object(p_key, p_value))::text;
  if length(v_new) > platform.memo_s_bytes() then
    return;
  end if;
  perform set_config('mx_memo.s', v_new, true);
end;
$function$;

CREATE OR REPLACE FUNCTION platform.memo_clear()
 RETURNS void
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select set_config('mx_memo.v', '', true),
         set_config('mx_memo.s', '', true),
         set_config('mx_memo.b', '', true);
$function$;

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
  v_hit := platform.memo_s_get(v_key);
  if v_hit is not null then
    return v_hit::jsonb #>> '{}';
  end if;

  select t.data ->> 'type_field' into v_answer
    from custom.record t
   where t.organization_id = p_organization_id
     and t.id = p_table_id
     and t.table_id = custom.table_kernel_id()
     and t.deleted_at is null;
  perform platform.memo_s_put(v_key, coalesce(to_jsonb(v_answer), 'null'::jsonb)::text);
  return v_answer;
end;
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
  if platform.memo_s_get(v_key) = '0' then
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
    perform platform.memo_s_put(v_key, '0');
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
  v_hit := platform.memo_s_get(v_key)::jsonb;
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

  perform platform.memo_s_put(v_key, jsonb_build_object('table', v_table, 'class', v_class,
                                                        'out', v_hit)::text);
  return v_hit;
end;
$function$;
