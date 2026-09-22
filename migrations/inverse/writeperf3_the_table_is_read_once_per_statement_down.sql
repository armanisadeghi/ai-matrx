-- additive: yes
--
-- chair-step: THE INVERSE of writeperf3_the_table_is_read_once_per_statement.sql. It puts
--   `platform.memo_get`, `platform.memo_clear`, `custom.applicable_fields`,
--   `custom.table_type_field`, `custom.choice_field_map`, `custom.table_rules` and
--   `platform.relation_declaration` back exactly as the live catalogue held them before
--   WRITE-PERF-3 — each reading the Table again on every single row — and removes the second
--   memo. Run for real by scripts/campaign-tests/writeperf3_red.sql, writeperf3_parity.sql and
--   writeperf3_five_thousand.sql inside a rolled-back transaction.

CREATE OR REPLACE FUNCTION platform.memo_get(p_key text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
begin
  return (select platform.memo_all() ->> p_key);
end
$function$;

CREATE OR REPLACE FUNCTION platform.memo_clear()
 RETURNS void
 LANGUAGE sql
 SET search_path TO ''
AS $function$ select set_config('mx_memo.v', '', true); $function$;

CREATE OR REPLACE FUNCTION custom.applicable_fields(p_organization_id uuid, p_table_id uuid, p_record_type text DEFAULT NULL::text)
 RETURNS SETOF custom.record
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_types text[];
begin
  -- The decision comes BEFORE the read, so a foreign organization id and an invented one
  -- answer identically: both are refused, neither is told whether the table exists.
  perform custom.assert_store_door(p_organization_id, 'custom.applicable_fields');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.applicable_fields');
  perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.applicable_fields');

  -- T8. The record's type value is the option's KEY; whoever declared "Radius applies to a
  -- Circle" may have written the word, the key or the option's id. All of them name the same
  -- choice, so the question is asked with all of them. This is the clause the seventh pass
  -- failed: "asking what columns THIS record has answers without Radius".
  v_types := case when p_record_type is null then '{}'::text[]
                  else custom.choice_synonyms(p_organization_id, p_table_id, p_record_type) end;

  return query
    select f.*
      from custom.record f
     where f.organization_id = p_organization_id
       and f.table_id = custom.field_kernel_id()
       and f.deleted_at is null
       and (f.data ->> 'entity_definition_id')::uuid = p_table_id
       and (jsonb_array_length(coalesce(f.data -> 'applies_to_types', '[]'::jsonb)) = 0
            or (p_record_type is not null
                and coalesce(f.data -> 'applies_to_types', '[]'::jsonb) ?| v_types));
end $function$;

CREATE OR REPLACE FUNCTION custom.table_type_field(p_organization_id uuid, p_table_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_answer text;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.table_type_field');
  perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.table_type_field');
  select t.data ->> 'type_field' into v_answer
    from custom.record t
   where t.organization_id = p_organization_id
     and t.id = p_table_id
     and t.table_id = custom.table_kernel_id()
     and t.deleted_at is null;
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
begin
  -- LADDER-PERF's class, on the WRITE path. Everything between `begin` and `end`
  -- is this function's own SQL body, character for character; only the language
  -- moved, so a plan is cached for the session instead of built on every call.
  return (
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
end
$function$;

CREATE OR REPLACE FUNCTION custom.table_rules(p_organization_id uuid, p_table_id uuid, p_use text, p_record_type text DEFAULT NULL::text)
 RETURNS SETOF custom.record
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
begin
  if p_use is null or not (p_use = any (custom.rule_uses())) then
    raise exception 'there is no % use of a rule', coalesce(p_use, 'nameless')
      using errcode = '22023',
            hint = 'REC-15: the four uses are validate, compute, define membership and decide applicability — select unnest(custom.rule_uses()).';
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
begin
  perform platform.assert_relations_door(p_organization_id);
  -- THE CALLER, BEFORE THE FIRST READ. A field document describes a table's shape, so the
  -- wall comes first and the table second — and both are asked before this function admits
  -- that the field exists, so a foreign id and an invented one answer identically.
  perform custom.assert_client_may_reach(p_organization_id, 'platform.relation_declaration');

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

  return jsonb_build_object(
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
end;
$function$;

-- ── the second memo, dropped ONLY if nothing adopted it ───────────────────────────────
--
-- 🚨 WHY THIS IS A CONDITION AND NOT FIVE BARE DROPS (lane FIX-11B, 2026-09-22).
-- `platform.memo_b_*` outlived this lane. Bodies outside it adopted the big-answer memo and
-- live triggers RUN them right now — `zzzz_a_undeclared_key_guard` on `custom.record` (runs
-- `custom._undeclared_key_guard`) and `custom_fields_validation` on `crm.party` (runs
-- `custom._entity_custom_fields_guard`) both reach memo_b_get/memo_b_put. Five bare drops
-- would leave those triggers attached over functions that are gone, and the next write to the
-- record store or to a CRM party would explode. This lane's defect is put back by the seven
-- bodies restored above — each of them reading the Table again on every row, which is the
-- whole defect; the memo other lanes adopted is not this file's to take away.
-- depends-on: platform.memo_b_get/put are adopted by custom._undeclared_key_guard and
--   custom._entity_custom_fields_guard, both run by standing triggers.
-- ground-standing-ok: a, d — the drops below run only when the catalogue shows no body calling
--   platform.memo_b_get/platform.memo_b_put; an adopter outside this lane (a standing trigger's
--   body under clause (a), a later lane's body under clause (d)) leaves them standing, with a
--   notice. Same condition, both clauses: the object is never taken from under an adopter.
do $drops$
declare
  v_left text[];
begin
  select array_agg(pn.nspname || '.' || p.proname order by pn.nspname, p.proname)
    into v_left
    from pg_proc p
    join pg_namespace pn on pn.oid = p.pronamespace
   where p.prokind = 'f'
     and pn.nspname not in ('pg_catalog', 'information_schema')
     and p.proname not like 'memo\_b\_%'
     and (pg_get_functiondef(p.oid) like '%platform.memo_b_get%'
       or pg_get_functiondef(p.oid) like '%platform.memo_b_put%');

  if v_left is not null then
    raise notice
      'platform.memo_b_* is still called by % - leaving the second memo standing. This lane''s defect is back (the seven bodies restored above read the Table on every row again); the memo a later lane adopted is not this file''s to take away.',
      array_to_string(v_left, ', ');
    return;
  end if;

  execute 'drop function if exists platform.memo_b_put(text, text)';
  execute 'drop function if exists platform.memo_b_get(text)';
  execute 'drop function if exists platform.memo_b_seat()';
  execute 'drop function if exists platform.memo_b_bytes()';
  execute 'drop function if exists platform.memo_b_ceiling()';
end;
$drops$;
