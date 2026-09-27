-- chair-step: lane SCOPES-WRITE-THROUGH — the record store becomes the writer of record for an organization's scopes and context. Adds the switch's setting custom/scopes_written_in_the_store (default off; an organization made after this file is applied answers "store" through custom.context_writer without any row written), the mover's words in SQL, one store half per concept (scope type → Table, context item → Field, scope → Record, value → Value, tag → its store copy), and the write-through: in an organization whose store is the writer, the old context tables' follow trigger and the tag follow trigger carry each row into the record store in the same statement (outside their exception handlers, so a store refusal refuses the write); the copy fence and the tag fence admit the write-through and keep refusing every other writer of a context Table there with the address to edit it. In every other organization nothing changes. custom.context_tag_copy's loop body moves into custom._ctx_store_tag so the organization-wide copy and the per-edge write-through share one body.
-- based-on: context._follow_to_the_copy() df00eaa7b7072912fbd1decce0cd7ba012662328911ae40b5b9310b102344a65
-- based-on: custom._context_copy_fence() e3cca8feb92f9e1607064b03d5e67eea40a1e4360dacb683a6764769bacc0517
-- based-on: platform._context_tag_copy_fence() fa508b5022b3338ff6e4de936b7c86e083d71811d56feb18e66fea3dbf8f923a
-- based-on: platform._context_tag_follow_to_the_copy() cbe41eb1c473e5414185b4f9dddaa06b809fc42804a6b419f832250fc4806e03
-- based-on: custom.context_tag_copy(uuid) 1bfa902d1df904519d68a64bd758e3e28ac9e13619a9c10d66cf097e1fdefc92
-- lane: SCOPES-WRITE-THROUGH
-- INVERSE: migrations/inverse/scopeswt_scopes_are_written_in_the_store_first_down.sql
-- window-class: function bodies and new functions only; no table DDL, no row rewrite. Applied directly (owner, 2026-09-24).
--
-- THE USE CASE. Bayfront Family Dentistry, made today, keeps its patients in the scopes screens.
-- Every patient, field, value and tag it writes lands in the record store in the same save, under
-- the same id, by the store's rules; the old context tables are written in that save too, so every
-- screen and server path that still reads them sees the same thing. An organization that existed
-- before tonight keeps the old tables as its writer until the scopes switch is pressed for it
-- (scopeswt_the_scopes_switch_presses_for_one_organization_or_all.sql).

-- ── 1. THE SEAM'S SETTING ─────────────────────────────────────────────────────────────────────────
insert into platform.feature_knob
  (feature, key, value, default_value, value_type, label, description,
   set_by, basis, overridable_by, override_direction, propagation, public_read, ui)
values
  ('custom', 'scopes_written_in_the_store', 'false'::jsonb, 'false'::jsonb, 'boolean',
   'Scopes and context are written in the record store first',
   'On: every scope type, scope, context field, value and tag this organization writes goes into the '
   'record store first, and the current context tables are kept exact in the same step for every '
   'screen and server path that still reads them. Off: the current context tables are the writer and '
   'the record store keeps a copy that follows them. An organization created after this switch was '
   'installed starts on (written in the store); every organization that existed before it starts off. '
   'Switched only through the scopes switch (platform.cutover_seam_press, seam scopes_screens), for one '
   'organization or for all at once.',
   'agent', 'Unified data program, lane SCOPES-WRITE-THROUGH, 2026-09-27: the scopes and context transition — the store becomes the writer of record; the old tables become its image until the final switch.',
   '{organization}'::text[], 'any', 'next_load', false, '{}'::jsonb)
on conflict do nothing;

insert into platform.knob_write_door
  (feature_prefix, set_door, clear_door, authority_kind, reason, organization_id)
select 'custom.scopes_written_in_the_store', 'platform.cutover_seam_press', 'platform.cutover_seam_press', 'cutover_seam',
       'The "scope and context screens" switch (seam scopes_screens): which system writes this organization''s scopes. Pressed through platform.cutover_seam_press for one organization, or platform.cutover_seam_press_everyone for all at once, which records who pressed it and when (lane SCOPES-WRITE-THROUGH).',
       '39c38960-d30c-4840-b0c1-c9960de95582'
 where not exists (select 1 from platform.knob_write_door d where d.feature_prefix = 'custom.scopes_written_in_the_store');

-- ── 2. WHICH SYSTEM WRITES THIS ORGANIZATION'S SCOPES — the ONE question every writer asks ────────
create or replace function custom.context_writer(p_organization_id uuid)
 returns text
 language plpgsql
 stable
 security definer
 set search_path to 'pg_catalog'
as $function$
declare
  v_on   boolean;
  v_set  boolean;
  v_born timestamptz;
begin
  if p_organization_id is null then
    return 'old';
  end if;
  -- THE STORE MUST BE OPEN FOR IT. An organization whose record store is switched off cannot have
  -- the store as its writer, whatever this switch says — the old tables stay the writer.
  if not custom.store_is_open(p_organization_id) then
    return 'old';
  end if;
  select (o.value #>> '{}')::boolean into v_set
    from platform.knob_override o
   where o.feature = 'custom' and o.key = 'scopes_written_in_the_store'
     and o.scope_kind = 'organization' and o.scope_id = p_organization_id
     and o.organization_id = p_organization_id;
  if v_set is not null then
    return case when v_set then 'store' else 'old' end;
  end if;
  -- NO ROW, AS store_is_open DOES IT (a default is how the question is answered, never a row
  -- written at birth that every suite's own INSERT collides with). An organization born after this
  -- switch was installed writes in the store; every organization that existed before it keeps the
  -- old tables as its writer until it is switched.
  v_on := coalesce((platform.knob_resolve('custom', 'scopes_written_in_the_store', null) #>> '{}')::boolean, false);
  if v_on then
    return 'store';
  end if;
  select k.created_at into v_born from platform.feature_knob k
   where k.feature = 'custom' and k.key = 'scopes_written_in_the_store';
  if v_born is not null and exists (select 1 from iam.organizations o
                                     where o.id = p_organization_id and o.created_at > v_born) then
    return 'store';
  end if;
  return 'old';
end;
$function$;
comment on function custom.context_writer(uuid) is
  'SCOPES-WRITE-THROUGH: ''store'' when this organization''s scopes and context are written in the record store first (the old context tables are its same-transaction image), ''old'' when the old context tables are the writer and the store follows. One reader for the fence, the follow triggers, the scope doors, the seam and the server.';
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, signed_in_callers, anonymous_callers)
values ('custom', 'context_writer', 'p_organization_id uuid', array['uuid'::regtype]::oid[],
        'Read-only: answers store or old for the organization named. The copy fence (custom._context_copy_fence, SECURITY INVOKER, running as the signed-in writer) asks it on every write into a context Table, and the web app''s scopes service asks it to say which system writes; it reveals no row and changes nothing.',
        'scopeswt_scopes_are_written_in_the_store_first.sql', true, false)
on conflict do nothing;
grant execute on function custom.context_writer(uuid) to authenticated, service_role;

-- The transaction marker the scope doors and the bridge set while they write both sides: the fence
-- admits it, and the old tables' follow trigger does not carry a row the door already carried.
create or replace function custom._ctx_marked()
 returns boolean
 language sql
 stable
 set search_path to 'pg_catalog'
as $function$
  select coalesce(current_setting('custom.context_write', true), '') in ('door', 'bridge')
$function$;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, signed_in_callers, anonymous_callers)
values ('custom', '_ctx_marked', '', array[]::oid[],
        'Read-only: whether this transaction is inside a scope door or the scopes write-through (a transaction-local marker only those SECURITY DEFINER functions set). The copy fence and the tag fence, which run as the signed-in writer, ask it; it reveals nothing about any row.',
        'scopeswt_scopes_are_written_in_the_store_first.sql', true, false)
on conflict do nothing;
grant execute on function custom._ctx_marked() to authenticated, service_role;

-- A Record the write-through writes carries its image's address in metadata.moved_from, exactly as
-- the scopes mover and the Python follow stamp it (their re-plan after a switch back reads it).
insert into platform.metadata_reserved_keys (table_token, key, reason)
select 'record', 'moved_from', 'SCOPES-WRITE-THROUGH / SC-2'': the address of the old context row a record-store row is the same thing as (scope type, context item, scope). Stamped by the scopes mover, the context follow and the scopes write-through, which run as the signed-in writer in an organization whose store is the writer; the follow''s re-plan after a switch back reads it.'
 where not exists (select 1 from platform.metadata_reserved_keys where table_token = 'record' and key = 'moved_from');

create or replace function custom._ctx_mark(p_who text)
 returns text
 language plpgsql
 set search_path to 'pg_catalog'
as $function$
declare v_was text := coalesce(current_setting('custom.context_write', true), '');
begin
  perform set_config('custom.context_write', coalesce(p_who, ''), true);
  return v_was;
end;
$function$;
revoke all on function custom._ctx_mark(text) from public, anon, authenticated;

-- ── 3. THE MOVER'S OWN WORDS, IN SQL (matrx_records.movers.typemap / common / scopes) ────────────
-- Derived ids: uuid5 over the mover's namespace, parts joined by chr(31) — typemap.derived_id.
create or replace function custom._ctx_id(variadic p_parts text[])
 returns uuid
 language sql
 immutable
 set search_path to 'pg_catalog'
as $function$
  select extensions.uuid_generate_v5('6d0b5a2e-3f47-4d41-9c8a-5f1e2b7d0c93'::uuid, array_to_string(p_parts, chr(31)))
$function$;

-- typemap.slug: ^[a-z][a-z0-9_]*$, at most 63.
create or replace function custom._ctx_slug(p_name text, p_fallback text default 'field')
 returns text
 language plpgsql
 immutable
 set search_path to 'pg_catalog'
as $function$
declare t text;
begin
  t := regexp_replace(lower(btrim(coalesce(p_name, ''))), '[^a-z0-9]', '_', 'g');
  t := regexp_replace(t, '_{2,}', '_', 'g');
  t := btrim(t, '_');
  if t = '' then
    t := p_fallback;
  elsif t !~ '^[a-z]' then
    t := p_fallback || '_' || t;
  end if;
  return left(t, 63);
end;
$function$;

-- source.iso: a timestamp as Python's isoformat writes it (UTC, microseconds only when non-zero).
create or replace function custom._ctx_iso(p_at timestamptz)
 returns text
 language sql
 immutable
 set search_path to 'pg_catalog'
as $function$
  select case when p_at is null then null
              when extract(microseconds from p_at)::bigint % 1000000 = 0
                then to_char(p_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS') || '+00:00'
              else to_char(p_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') || '+00:00' end
$function$;

-- json.dumps(v, sort_keys=True, ensure_ascii=False): the words a text Field holds for a non-string.
create or replace function custom._ctx_py_json(p_v jsonb)
 returns text
 language plpgsql
 immutable
 set search_path to 'pg_catalog'
as $function$
begin
  if p_v is null then return 'null'; end if;
  case jsonb_typeof(p_v)
    when 'object' then
      return '{' || coalesce((select string_agg(to_jsonb(e.key)::text || ': ' || custom._ctx_py_json(e.value), ', ' order by e.key collate "C")
                                 from jsonb_each(p_v) e), '') || '}';
    when 'array' then
      return '[' || coalesce((select string_agg(custom._ctx_py_json(a.value), ', ' order by a.ord)
                                 from jsonb_array_elements(p_v) with ordinality a(value, ord)), '') || ']';
    else
      return p_v::text;
  end case;
end;
$function$;

-- typemap.words_for_a_text_field: a text Field holds words; a multi text Field a list of words.
create or replace function custom._ctx_words(p_multi boolean, p_v jsonb)
 returns jsonb
 language plpgsql
 immutable
 set search_path to 'pg_catalog'
as $function$
begin
  if p_v is null or jsonb_typeof(p_v) = 'null' then return p_v; end if;
  if p_multi then
    if jsonb_typeof(p_v) = 'array' then
      return (select coalesce(jsonb_agg(case when jsonb_typeof(a.value) in ('string', 'null') then a.value
                                             else to_jsonb(custom._ctx_py_json(a.value)) end order by a.ord), '[]'::jsonb)
                from jsonb_array_elements(p_v) with ordinality a(value, ord));
    end if;
  end if;
  if jsonb_typeof(p_v) = 'string' then return p_v; end if;
  return to_jsonb(custom._ctx_py_json(p_v));
end;
$function$;

-- The Field shape one context item takes (typemap.CONTEXT_VALUE_TYPES + scopes.plan's reference arms).
-- Returns {behavior, config, format, unit, multi, parity, relation_target, as_text}.
create or replace function custom._ctx_item_shape(p_item jsonb, p_as_text boolean default false)
 returns jsonb
 language plpgsql
 immutable
 set search_path to 'pg_catalog'
as $function$
declare
  vt      text := coalesce(p_item ->> 'value_type', 'string');
  s       jsonb;
  allowed jsonb := coalesce(p_item -> 'allowed_scope_type_ids', '[]'::jsonb);
  kinds   text[];
  tokens  text[];
  v_multi boolean;
begin
  if p_as_text or (p_item -> 'reference_source') is not null and jsonb_typeof(p_item -> 'reference_source') <> 'null' then
    return jsonb_build_object('behavior', 'text', 'config', '{}'::jsonb, 'multi', false, 'as_text', true);
  end if;
  s := case vt
    when 'string'   then '{"behavior":"text"}'
    when 'number'   then '{"behavior":"range","config":{"kind":"number"}}'
    when 'boolean'  then '{"behavior":"boolean","parity":"checkbox"}'
    when 'object'   then '{"behavior":"text","format":"json"}'
    when 'array'    then '{"behavior":"text","multi":true}'
    when 'document' then '{"behavior":"relation","needs_target":true,"parity":"attachment"}'
    when 'reference' then '{"behavior":"relation","needs_target":true,"parity":"select"}'
    when 'date'     then '{"behavior":"range","config":{"kind":"date"},"format":"date"}'
    when 'datetime' then '{"behavior":"range","config":{"kind":"datetime"},"format":"datetime","parity":"datetime"}'
    when 'time'     then '{"behavior":"text","format":"time"}'
    when 'email'    then '{"behavior":"text","format":"email","parity":"email"}'
    when 'url'      then '{"behavior":"text","format":"url","parity":"url"}'
    when 'phone'    then '{"behavior":"text","format":"phone","parity":"phone"}'
    when 'percent'  then '{"behavior":"range","config":{"kind":"number"},"format":"percent","unit":"%","parity":"percent"}'
    when 'color'    then '{"behavior":"text","format":"color"}'
    when 'markdown' then '{"behavior":"text","format":"markdown"}'
    when 'currency' then '{"behavior":"range","config":{"kind":"number"},"format":"currency","unit":"USD","parity":"currency"}'
    else null end::jsonb;
  if s is null then
    return jsonb_build_object('behavior', 'text', 'config', '{}'::jsonb, 'multi', false, 'as_text', true);
  end if;
  s := jsonb_build_object('config', '{}'::jsonb, 'multi', false) || s;

  -- SC-R / P12: a reference that names no scope type points at platform things.
  if vt = 'reference' and jsonb_array_length(allowed) = 0 then
    select array_agg(lower(btrim(k))) filter (where btrim(k) <> '') into kinds
      from jsonb_array_elements_text(coalesce(p_item -> 'allowed_reference_types', '[]'::jsonb)) k;
    if kinds is not null and not (kinds && array['scope', 'url']) then
      v_multi := coalesce((p_item ->> 'max_items')::int, 1) > 1;
      if kinds <@ array['file', 'document'] then
        return jsonb_build_object('behavior', 'relation', 'config', '{}'::jsonb, 'multi', v_multi,
                                  'parity', 'attachment', 'relation_target', '11111111-0000-4000-8000-000000000006');
      elsif not (kinds && array['file', 'document']) then
        select array_agg(t order by min_ord) into tokens from (
          select case k when 'table' then 'dataset' else k end as t, min(ord) as min_ord
            from unnest(kinds) with ordinality u(k, ord) group by 1) x;
        return jsonb_build_object('behavior', 'relation',
                                  'config', jsonb_build_object('target_mode', 'any', 'allowed_types', to_jsonb(tokens)),
                                  'multi', v_multi, 'entity', true);
      end if;
    end if;
  end if;

  if coalesce((s ->> 'needs_target')::boolean, false) then
    if vt = 'document' then
      s := s || jsonb_build_object('relation_target', '11111111-0000-4000-8000-000000000006');
    elsif jsonb_array_length(allowed) = 1 then
      s := s || jsonb_build_object('relation_target', allowed ->> 0);
    else
      return jsonb_build_object('behavior', 'text', 'config', '{}'::jsonb, 'multi', false, 'as_text', true);
    end if;
  end if;
  return s - 'needs_target';
end;
$function$;

-- common.field_document, for the context case.
create or replace function custom._ctx_field_doc(
  p_key text, p_label text, p_shape jsonb, p_table uuid, p_required boolean, p_sort int,
  p_sensitivity text, p_policy text, p_source text, p_review int, p_depends jsonb, p_display_bare boolean)
 returns jsonb
 language plpgsql
 immutable
 set search_path to 'pg_catalog'
as $function$
declare
  d   jsonb;
  fmt text := p_shape ->> 'format';
begin
  d := jsonb_build_object(
    'key', p_key, 'label', p_label, 'type', p_shape ->> 'behavior',
    'config', coalesce(p_shape -> 'config', '{}'::jsonb),
    'required', coalesce(p_required, false), 'sort', coalesce(p_sort, 0),
    'multi', coalesce((p_shape ->> 'multi')::boolean, false), 'dated', false, 'rules', '[]'::jsonb,
    'source', coalesce(p_source, 'manual'), 'sensitivity', coalesce(p_sensitivity, 'internal'),
    'context_policy', coalesce(p_policy, 'include'),
    'depends_on', coalesce(p_depends, '[]'::jsonb), 'applies_to_types', '[]'::jsonb);
  if fmt is not null then
    if p_display_bare and fmt in ('percent', 'email', 'url', 'phone') then
      d := d || jsonb_build_object('display_format', jsonb_build_object('id', fmt, 'options', '{}'::jsonb));
    else
      d := d || jsonb_build_object('format', fmt);
    end if;
  end if;
  if p_shape ->> 'unit' is not null then
    d := d || jsonb_build_object('unit', p_shape ->> 'unit');
  end if;
  if coalesce(p_review, 0) <> 0 then
    d := d || jsonb_build_object('review_interval_days', p_review);
  end if;
  if p_table is not null then
    d := d || jsonb_build_object('entity_definition_id', p_table::text);
  end if;
  if p_shape ->> 'behavior' = 'relation' then
    d := d || jsonb_build_object('relation_target', p_shape -> 'relation_target',
                                 'relation_max', case when coalesce((p_shape ->> 'multi')::boolean, false) then 100 else 1 end,
                                 'on_target_delete', 'set_null');
  end if;
  if p_shape ->> 'behavior' = 'boolean' then
    d := d || jsonb_build_object('parity_type', 'checkbox');
  end if;
  return d;
end;
$function$;

-- typemap.SENSITIVITY / CONTEXT_POLICY / SOURCE / ACTOR.
create or replace function custom._ctx_word(p_map text, p_word text)
 returns text
 language sql
 immutable
 set search_path to 'pg_catalog'
as $function$
  select case p_map
    when 'sensitivity' then case coalesce(p_word, 'internal') when 'public' then 'public' when 'internal' then 'internal'
                            when 'restricted' then 'confidential' when 'privileged' then 'restricted' else 'internal' end
    when 'policy' then case coalesce(p_word, 'always') when 'always' then 'include' when 'on_demand' then 'on_request'
                       when 'batch_related' then 'include' when 'lazy' then 'on_request' when 'never' then 'exclude' else 'include' end
    when 'source' then case coalesce(p_word, 'manual') when 'manual' then 'manual' when 'ai_generated' then 'agent'
                       when 'ai_enriched' then 'agent' else 'synced' end
    when 'actor' then case coalesce(p_word, 'manual') when 'manual' then 'user' when 'ai_generated' then 'agent'
                      when 'ai_enriched' then 'agent' else 'system' end
  end
$function$;
-- ── 4. THE STORE HALVES — one per concept, deciding from the store's own state ────────────────────

-- The Table's field list, as the mover writes it: name, the description column, then every other
-- Field by (sort, key). A Field is refused unless its Table declares it, so this is rewritten before
-- any Field is added.
create or replace function custom._ctx_table_fields(p_org uuid, p_type uuid)
 returns jsonb
 language sql
 stable
 set search_path to 'pg_catalog'
as $function$
  select coalesce(jsonb_agg(jsonb_build_object('name', f.data ->> 'key')
                            order by case when f.id = custom._ctx_id('scope-column-field', p_type::text, 'name') then 0
                                          when f.id = custom._ctx_id('scope-column-field', p_type::text, 'description') then 1
                                          else 2 end,
                                     coalesce((f.data ->> 'sort')::int, 0), f.data ->> 'key'), '[]'::jsonb)
    from custom.record f
   where f.organization_id = p_org
     and f.table_id = custom.field_kernel_id()
     and f.data ->> 'entity_definition_id' = p_type::text
$function$;

-- Move one key of every Record of a Table to another key (the value and its envelope).
create or replace function custom._ctx_rekey(p_org uuid, p_type uuid, p_from text, p_to text)
 returns integer
 language plpgsql
 set search_path to 'pg_catalog'
as $function$
declare v_n integer;
begin
  if p_from = p_to then return 0; end if;
  update custom.record r
     set data = (r.data - p_from)
                || jsonb_build_object(p_to, r.data -> p_from)
                || case when r.data -> '_values' ? p_from
                        then jsonb_build_object('_values', (r.data -> '_values' - p_from)
                                                           || jsonb_build_object(p_to, r.data -> '_values' -> p_from))
                        else '{}'::jsonb end
   where r.organization_id = p_org and r.table_id = p_type and r.data_class = 'record'
     and r.data ? p_from;
  get diagnostics v_n = row_count;
  return v_n;
end;
$function$;

-- Old side wins key by key, the follow's own statement (context_follow._old_wins_documents).
create or replace function custom._ctx_upsert_doc(
  p_org uuid, p_id uuid, p_kernel uuid, p_class text, p_doc jsonb, p_stamp jsonb, p_deleted timestamptz,
  p_created_by uuid default null)
 returns text
 language plpgsql
 set search_path to 'pg_catalog'
as $function$
declare
  v_dropped text[] := array(select k from unnest(array['format', 'display_format', 'unit', 'default', 'review_interval_days',
                                                        'relation_target', 'relation_max', 'on_target_delete', 'compute_on',
                                                        'parity_type', 'table_token']) k
                            where not (p_doc ? k));
  v_touched boolean;
begin
  if exists (select 1 from custom.record r where r.organization_id = p_org and r.id = p_id) then
    update custom.record r
       set data = (r.data - v_dropped) || p_doc,
           deleted_at = p_deleted,
           metadata = r.metadata || p_stamp
     where r.organization_id = p_org and r.id = p_id
       and (not (r.data @> p_doc) or r.deleted_at is distinct from p_deleted
            or not (r.metadata @> p_stamp) or r.data ?| v_dropped)
    returning true into v_touched;
    return case when v_touched then 'updated' else 'current' end;
  end if;
  insert into custom.record (id, organization_id, table_id, data_class, data, metadata, deleted_at, created_by)
  values (p_id, p_org, p_kernel, p_class, p_doc, p_stamp, p_deleted, coalesce(p_created_by, auth.uid()));
  return 'made';
end;
$function$;

-- A SCOPE TYPE → its Table (mover: scopes.plan "scope types → Tables").
create or replace function custom._ctx_store_type(p_org uuid, p_type uuid, p_spec jsonb)
 returns jsonb
 language plpgsql
 set search_path to 'pg_catalog'
as $function$
declare
  v_home     uuid := custom._ctx_id('organization-home', p_org::text);
  v_singular text := coalesce(nullif(p_spec ->> 'label_singular', ''), nullif(p_spec ->> 'label_plural', ''), 'Record');
  v_deleted  timestamptz := nullif(p_spec ->> 'deleted_at', '')::timestamptz;
  v_carried  jsonb := '{}'::jsonb;
  v_stamp    jsonb;
  v_doc      jsonb;
  v_fields   jsonb;
  v_desc     text;
  v_live     boolean;
  v_did      text;
begin
  -- THE ORGANIZATION'S HOME (common.home_record): every Table of the context copy lives inside it.
  insert into custom.record (id, organization_id, table_id, data_class, data, metadata)
  select v_home, p_org, '11111111-0000-4000-8000-000000000004'::uuid, 'record',
         jsonb_build_object('name', coalesce(nullif(o.name, ''), 'This organization')),
         jsonb_build_object('moved_from', jsonb_build_object('table', 'iam.organizations', 'id', p_org::text,
                            'note', 'the organization''s own home for everything moved out of the old stores'))
    from iam.organizations o where o.id = p_org
  on conflict do nothing;

  if (p_spec -> 'max_assignments_per_entity') is not null and jsonb_typeof(p_spec -> 'max_assignments_per_entity') <> 'null' then
    v_carried := v_carried || jsonb_build_object('max_assignments_per_entity', p_spec -> 'max_assignments_per_entity');
  end if;
  if jsonb_typeof(p_spec -> 'default_variable_keys') = 'array' and jsonb_array_length(p_spec -> 'default_variable_keys') > 0 then
    v_carried := v_carried || jsonb_build_object('default_variable_keys', p_spec -> 'default_variable_keys');
  end if;
  v_stamp := jsonb_build_object('moved_from', jsonb_build_object('table', 'context.scope_types', 'id', p_type::text)
                                || case when v_carried <> '{}'::jsonb then jsonb_build_object('carried', v_carried) else '{}'::jsonb end);

  v_live := exists (select 1 from custom.record r where r.organization_id = p_org and r.id = p_type);
  v_fields := case when v_live then custom._ctx_table_fields(p_org, p_type) else '[]'::jsonb end;
  if jsonb_array_length(v_fields) = 0 then
    v_fields := '[{"name": "name"}, {"name": "description"}]'::jsonb;
  end if;

  v_doc := jsonb_build_object(
    'name', v_singular,
    'slug', custom._ctx_slug(coalesce(nullif(p_spec ->> 'slug', ''), v_singular), 'table'),
    'label_singular', v_singular,
    'label_plural', coalesce(nullif(p_spec ->> 'label_plural', ''), v_singular || 's'),
    'icon', p_spec -> 'icon', 'color', p_spec -> 'color',
    'type', 'entity', 'display', 'page', 'ordered', false, 'weight', 'light',
    'retention_days', greatest(30, coalesce(history.retention_floor_days(p_org), 0)),
    'default_sort', '[{"field": "name", "direction": "asc"}]'::jsonb,
    'row_order', 'sorted', 'agent_writable', true,
    'fields', v_fields, 'title_field', 'name', 'parent_id', v_home::text,
    'kept_by_the_app', true, 'kept_for', 'context', 'offered_as_context', true);
  if v_doc -> 'icon' is null then v_doc := v_doc || '{"icon": null}'::jsonb; end if;
  if v_doc -> 'color' is null then v_doc := v_doc || '{"color": null}'::jsonb; end if;

  -- A LIVE TABLE BEFORE ITS FIELDS; an archived one after them (a Field is judged against its Table).
  if v_deleted is null then
    v_did := custom._ctx_upsert_doc(p_org, p_type, custom.table_kernel_id(), 'table', v_doc, v_stamp, null,
                                    nullif(p_spec ->> 'created_by', '')::uuid);
  end if;

  -- THE TWO FIELDS EVERY SCOPE RECORD HAS AS COLUMNS (name, and description or scope_description).
  select case when exists (select 1 from custom.record f
                            where f.organization_id = p_org and f.table_id = custom.field_kernel_id()
                              and f.data ->> 'entity_definition_id' = p_type::text
                              and f.metadata -> 'moved_from' ->> 'table' = 'context.context_items'
                              and f.data ->> 'key' = 'description')
              then 'scope_description' else 'description' end into v_desc;
  if v_deleted is null then
    perform custom._ctx_upsert_doc(p_org, custom._ctx_id('scope-column-field', p_type::text, 'name'),
      custom.field_kernel_id(), 'field',
      custom._ctx_field_doc('name', 'Name', '{"behavior":"text"}'::jsonb, p_type, true, 0, 'internal', 'exclude', 'manual', null, null, false),
      jsonb_build_object('moved_from', jsonb_build_object('table', 'context.scopes', 'id', p_type::text,
                         'note', 'the name column, which was never a context item')), null);
    perform custom._ctx_upsert_doc(p_org, custom._ctx_id('scope-column-field', p_type::text, 'description'),
      custom.field_kernel_id(), 'field',
      custom._ctx_field_doc(v_desc, 'Description', '{"behavior":"text"}'::jsonb, p_type, false, 1, 'internal', 'exclude', 'manual', null, null, false),
      jsonb_build_object('moved_from', jsonb_build_object('table', 'context.scopes', 'id', p_type::text,
                         'note', format('the %s column, which was never a context item', v_desc))), null);
    -- The field list, now that every Field exists.
    v_doc := v_doc || jsonb_build_object('fields', custom._ctx_table_fields(p_org, p_type));
    perform custom._ctx_upsert_doc(p_org, p_type, custom.table_kernel_id(), 'table', v_doc, v_stamp, null);
  else
    -- ARCHIVED: what the old side's cascade took with it is archived by its own rows; the Table last.
    update custom.record f set deleted_at = v_deleted
     where f.organization_id = p_org and f.table_id = custom.field_kernel_id()
       and f.data ->> 'entity_definition_id' = p_type::text
       and f.id in (custom._ctx_id('scope-column-field', p_type::text, 'name'),
                    custom._ctx_id('scope-column-field', p_type::text, 'description'))
       and f.deleted_at is null;
    v_did := custom._ctx_upsert_doc(p_org, p_type, custom.table_kernel_id(), 'table',
                                    v_doc || jsonb_build_object('fields', case when v_live then custom._ctx_table_fields(p_org, p_type) else v_fields end),
                                    v_stamp, v_deleted);
  end if;
  return jsonb_build_object('table', p_type, 'did', v_did);
end;
$function$;

-- The store Table must be live before its Fields or Records are touched: a child written while its
-- parent is being restored brings the parent back first, from the image the old row already holds.
create or replace function custom._ctx_table_live(p_org uuid, p_type uuid)
 returns boolean
 language plpgsql
 set search_path to 'pg_catalog'
as $function$
declare
  v_row jsonb;
begin
  if exists (select 1 from custom.record r where r.organization_id = p_org and r.id = p_type and r.deleted_at is null) then
    return true;
  end if;
  select to_jsonb(t) into v_row from context.scope_types t where t.id = p_type and t.deleted_at is null;
  if v_row is null then
    return false;
  end if;
  perform custom._ctx_store_type(p_org, p_type, v_row);
  return true;
end;
$function$;

-- A CONTEXT ITEM → its Field (mover: scopes.plan "context items → Fields").
create or replace function custom._ctx_store_item(p_org uuid, p_type uuid, p_item uuid, p_spec jsonb)
 returns jsonb
 language plpgsql
 set search_path to 'pg_catalog'
as $function$
declare
  v_old      custom.record;
  v_as_text  boolean;
  v_shape    jsonb;
  v_base     text := custom._ctx_slug(coalesce(nullif(p_spec ->> 'key', ''), nullif(p_spec ->> 'slug', ''), 'field'));
  v_key      text;
  v_n        int;
  v_used     text[];
  v_carried  jsonb := '{}'::jsonb;
  v_active   boolean := coalesce((p_spec ->> 'is_active')::boolean, true);
  v_archived timestamptz;
  v_doc      jsonb;
  v_did      text;
  v_col      uuid := custom._ctx_id('scope-column-field', p_type::text, 'description');
  v_colkey   text;
  v_tdoc     jsonb;
begin
  if not custom._ctx_table_live(p_org, p_type) then
    -- A Field of an archived Table is left as it was archived (context_follow._old_wins_documents).
    return jsonb_build_object('field', p_item, 'did', 'table_archived');
  end if;
  select * into v_old from custom.record r where r.organization_id = p_org and r.id = p_item;
  v_as_text := coalesce((v_old.metadata -> 'moved_from' -> 'carried' ->> 'as_text')::boolean, false);
  v_shape := custom._ctx_item_shape(p_spec, v_as_text);

  -- ONE KEY PER FIELD IN A TABLE (scopes._item_keys). A Field keeps the key it has — a key is how
  -- every saved value finds it — unless the item's own key changed.
  if v_old.id is not null and (v_old.data ->> 'key' = v_base or v_old.data ->> 'key' ~ ('^' || v_base || '_[0-9]+$')) then
    v_key := v_old.data ->> 'key';
  else
    select array_agg(f.data ->> 'key') into v_used
      from custom.record f
     where f.organization_id = p_org and f.table_id = custom.field_kernel_id()
       and f.data ->> 'entity_definition_id' = p_type::text and f.id <> p_item
       and f.id <> v_col;
    v_used := coalesce(v_used, '{}') || array['name'];
    v_key := v_base; v_n := 2;
    while v_key = any (v_used) loop
      v_key := v_base || '_' || v_n; v_n := v_n + 1;
    end loop;
  end if;

  -- AN ITEM CALLED "description" KEEPS ITS KEY; the scope's own column steps aside to
  -- scope_description on that Table, and every Record's value moves with it.
  select f.data ->> 'key' into v_colkey from custom.record f where f.organization_id = p_org and f.id = v_col;
  if v_key = 'description' and v_colkey = 'description' then
    select r.data into v_tdoc from custom.record r where r.organization_id = p_org and r.id = p_type;
    update custom.record set data = data || jsonb_build_object('fields',
             (data -> 'fields') || '[{"name": "scope_description"}]'::jsonb)
     where organization_id = p_org and id = p_type;
    update custom.record set data = data || '{"key": "scope_description"}'::jsonb,
                             metadata = metadata || jsonb_build_object('moved_from', jsonb_build_object('table', 'context.scopes', 'id', p_type::text,
                                        'note', 'the scope_description column, which was never a context item'))
     where organization_id = p_org and id = v_col;
    perform custom._ctx_rekey(p_org, p_type, 'description', 'scope_description');
  end if;

  if coalesce(p_spec ->> 'status', 'active') <> 'active' then
    v_carried := v_carried || jsonb_build_object('status', p_spec ->> 'status');
  end if;
  if not v_active then
    v_carried := v_carried || '{"is_active": false}'::jsonb;
  end if;
  if coalesce((v_shape ->> 'as_text')::boolean, false) then
    v_carried := v_carried || jsonb_build_object('as_text', true, 'value_type', coalesce(p_spec ->> 'value_type', 'string'));
  end if;
  v_archived := nullif(p_spec ->> 'deleted_at', '')::timestamptz;
  if v_archived is null and not v_active then
    v_archived := coalesce(v_old.deleted_at, nullif(p_spec ->> 'updated_at', '')::timestamptz, now());
  end if;

  v_doc := custom._ctx_field_doc(
    v_key, coalesce(nullif(p_spec ->> 'display_name', ''), v_key), v_shape, p_type, false,
    coalesce((p_spec ->> 'sort_order')::int, 0) + 2,
    custom._ctx_word('sensitivity', p_spec ->> 'sensitivity'),
    custom._ctx_word('policy', p_spec ->> 'fetch_hint'),
    custom._ctx_word('source', p_spec ->> 'source_type'),
    nullif(p_spec ->> 'review_interval_days', '')::int,
    coalesce((select jsonb_agg(d) from jsonb_array_elements_text(coalesce(p_spec -> 'depends_on', '[]'::jsonb)) d), '[]'::jsonb),
    true);

  -- THE TABLE DECLARES THE KEY FIRST.
  update custom.record t
     set data = t.data || jsonb_build_object('fields', (t.data -> 'fields') || jsonb_build_array(jsonb_build_object('name', v_key)))
   where t.organization_id = p_org and t.id = p_type
     and not exists (select 1 from jsonb_array_elements(t.data -> 'fields') e where e ->> 'name' = v_key);

  v_did := custom._ctx_upsert_doc(p_org, p_item, custom.field_kernel_id(), 'field', v_doc,
             jsonb_build_object('moved_from', jsonb_build_object('table', 'context.context_items', 'id', p_item::text)
                                || case when v_carried <> '{}'::jsonb then jsonb_build_object('carried', v_carried) else '{}'::jsonb end),
             v_archived, nullif(p_spec ->> 'created_by', '')::uuid);

  -- A KEY THE ITEM STOPPED USING: its values move with it.
  if v_old.id is not null and v_old.data ->> 'key' is distinct from v_key then
    perform custom._ctx_rekey(p_org, p_type, v_old.data ->> 'key', v_key);
  end if;

  -- The field list in the mover's order, now that the Field exists.
  update custom.record t set data = t.data || jsonb_build_object('fields', custom._ctx_table_fields(p_org, p_type))
   where t.organization_id = p_org and t.id = p_type
     and t.data -> 'fields' is distinct from custom._ctx_table_fields(p_org, p_type);
  return jsonb_build_object('field', p_item, 'key', v_key, 'did', v_did);
end;
$function$;

-- A SCOPE → its Record (mover: scopes.plan "scopes → Records"; every settings key a declared Field).
create or replace function custom._ctx_store_scope(p_org uuid, p_type uuid, p_scope uuid, p_spec jsonb)
 returns jsonb
 language plpgsql
 set search_path to 'pg_catalog'
as $function$
declare
  v_desc     text;
  v_data     jsonb;
  v_set      record;
  v_fid      uuid;
  v_fkey     text;
  v_shape    jsonb;
  v_taken    text[];
  v_existing custom.record;
  v_patch    jsonb := '{}'::jsonb;
  v_deleted  timestamptz := nullif(p_spec ->> 'deleted_at', '')::timestamptz;
  v_vis      text := coalesce(nullif(p_spec ->> 'visibility', ''), 'internal');
  v_k        text;
  v_v        jsonb;
  v_did      text;
begin
  if not custom._ctx_table_live(p_org, p_type) then
    return jsonb_build_object('record', p_scope, 'did', 'table_archived');
  end if;
  select f.data ->> 'key' into v_desc from custom.record f
   where f.organization_id = p_org and f.id = custom._ctx_id('scope-column-field', p_type::text, 'description');
  v_desc := coalesce(v_desc, 'description');

  v_data := jsonb_build_object('name', p_spec -> 'name', v_desc, p_spec -> 'description');
  if nullif(p_spec ->> 'parent_scope_id', '') is not null then
    v_data := v_data || jsonb_build_object('parent_id', p_spec ->> 'parent_scope_id');
  end if;

  -- EVERY SETTINGS KEY IS A DECLARED FIELD (SC-2', attack H2): the class checkout reads them.
  if jsonb_typeof(p_spec -> 'settings') = 'object' then
    for v_set in select e.key, e.value from jsonb_each(p_spec -> 'settings') e order by e.key loop
      continue when v_set.value is null or jsonb_typeof(v_set.value) = 'null';
      v_fid := custom._ctx_id('scope-setting-field', p_type::text, v_set.key);
      select f.data ->> 'key', jsonb_build_object('behavior', f.data ->> 'type', 'multi', coalesce((f.data ->> 'multi')::boolean, false))
        into v_fkey, v_shape
        from custom.record f where f.organization_id = p_org and f.id = v_fid;
      if v_fkey is null then
        select array_agg(f.data ->> 'key') into v_taken from custom.record f
         where f.organization_id = p_org and f.table_id = custom.field_kernel_id()
           and f.data ->> 'entity_definition_id' = p_type::text;
        v_taken := coalesce(v_taken, '{}') || array['name', 'description'];
        v_fkey := custom._ctx_slug(v_set.key);
        if v_fkey = any (v_taken) then
          v_fkey := custom._ctx_slug('setting_' || v_set.key);
        end if;
        -- typemap.infer_shape, from the value this write carries.
        v_shape := case jsonb_typeof(v_set.value)
                     when 'boolean' then '{"behavior":"boolean","parity":"checkbox","multi":false}'
                     when 'number'  then '{"behavior":"range","config":{"kind":"number"},"multi":false}'
                     when 'array'   then '{"behavior":"text","multi":true}'
                     when 'object'  then '{"behavior":"text","format":"json","multi":false}'
                     else '{"behavior":"text","multi":false}' end::jsonb;
        update custom.record t
           set data = t.data || jsonb_build_object('fields', (t.data -> 'fields') || jsonb_build_array(jsonb_build_object('name', v_fkey)))
         where t.organization_id = p_org and t.id = p_type;
        perform custom._ctx_upsert_doc(p_org, v_fid, custom.field_kernel_id(), 'field',
          custom._ctx_field_doc(v_fkey,
                                coalesce(nullif(upper(left(btrim(replace(v_set.key, '_', ' ')), 1)) || lower(substr(btrim(replace(v_set.key, '_', ' ')), 2)), ''), v_fkey),
                                v_shape, p_type, false,
                                1000 + (select count(*)::int from custom.record f where f.organization_id = p_org
                                          and f.table_id = custom.field_kernel_id() and f.data ->> 'entity_definition_id' = p_type::text
                                          and f.metadata -> 'moved_from' ->> 'note' like 'the % key of this type''s scopes'' settings%'),
                                'internal', 'exclude', 'manual', null, null, false),
          jsonb_build_object('moved_from', jsonb_build_object('table', 'context.scopes', 'id', p_type::text,
                             'note', format('the ''%s'' key of this type''s scopes'' settings, which was never a context item', v_set.key))),
          null);
      end if;
      v_data := v_data || jsonb_build_object(v_fkey,
                  case when v_shape ->> 'behavior' = 'text' then custom._ctx_words(coalesce((v_shape ->> 'multi')::boolean, false), v_set.value)
                       else v_set.value end);
    end loop;
  end if;

  select * into v_existing from custom.record r where r.organization_id = p_org and r.id = p_scope;
  if v_existing.id is null then
    insert into custom.record (id, organization_id, table_id, data_class, data, created_by, visibility, metadata, deleted_at)
    values (p_scope, p_org, p_type, 'record', v_data, coalesce(nullif(p_spec ->> 'created_by', '')::uuid, auth.uid()),
            v_vis::platform.visibility,
            jsonb_build_object('moved_from', jsonb_build_object('table', 'context.scopes', 'id', p_scope::text)),
            v_deleted);
    v_did := 'made';
  else
    if (v_existing.deleted_at is null) <> (v_deleted is null) or v_existing.visibility::text <> v_vis then
      update custom.record set deleted_at = v_deleted, visibility = v_vis::platform.visibility
       where organization_id = p_org and id = p_scope;
      v_did := case when v_deleted is null then 'restored' else 'archived' end;
    end if;
    for v_k, v_v in select e.key, e.value from jsonb_each(v_data) e loop
      if (v_existing.data -> v_k) is distinct from v_v then
        v_patch := v_patch || jsonb_build_object(v_k, v_v);
      end if;
    end loop;
    if v_patch <> '{}'::jsonb then
      update custom.record set data = data || v_patch where organization_id = p_org and id = p_scope;
      v_did := coalesce(v_did, 'updated');
    end if;
  end if;
  return jsonb_build_object('record', p_scope, 'did', coalesce(v_did, 'current'));
end;
$function$;

-- One old value row → the value the store holds (scopes._one_value + the shape's conversion).
create or replace function custom._ctx_value_of(p_row jsonb, p_field jsonb)
 returns jsonb
 language plpgsql
 immutable
 set search_path to 'pg_catalog'
as $function$
declare
  v        jsonb;
  v_type   text := p_field ->> 'type';
  v_multi  boolean := coalesce((p_field ->> 'multi')::boolean, false);
  v_fence  text;
  v_doc    jsonb;
  v_ids    jsonb := '[]'::jsonb;
  v_it     jsonb;
  v_ident  text;
  v_allowed jsonb := coalesce(p_field -> 'config' -> 'allowed_types', '[]'::jsonb);
  v_kind   text;
  v_attach boolean := p_field ->> 'relation_target' = '11111111-0000-4000-8000-000000000006';
  v_entity boolean := jsonb_array_length(coalesce(p_field -> 'config' -> 'allowed_types', '[]'::jsonb)) > 0;
  v_uuid   text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
begin
  -- The first set column, in the store's own order (scopes.VALUE_COLUMNS).
  v := case
    when p_row ->> 'value_text' is not null then p_row -> 'value_text'
    when p_row ->> 'value_number' is not null then
      (case when (p_row ->> 'value_number')::float8::text ~ '[.eEn]' then (p_row ->> 'value_number')::float8::text
            else (p_row ->> 'value_number')::float8::text || '.0' end)::jsonb
    when p_row ->> 'value_boolean' is not null then p_row -> 'value_boolean'
    when p_row -> 'value_json' is not null and jsonb_typeof(p_row -> 'value_json') <> 'null' then p_row -> 'value_json'
    when p_row ->> 'value_date' is not null then to_jsonb(p_row ->> 'value_date')
    when p_row ->> 'value_timestamp' is not null then to_jsonb(custom._ctx_iso((p_row ->> 'value_timestamp')::timestamptz))
    when p_row ->> 'value_time' is not null then to_jsonb(p_row ->> 'value_time')
    when p_row ->> 'value_document_url' is not null then p_row -> 'value_document_url'
    when p_row ->> 'value_reference_id' is not null then p_row -> 'value_reference_id'
    else null end;

  if v_type = 'relation' and (v_entity or v_attach) then
    -- SC-R: a reference fence becomes [{token, id}] (or file ids for a File column).
    if p_row ->> 'value_reference_id' is not null then
      v_kind := coalesce(nullif(lower(btrim(p_row ->> 'value_reference_type')), ''),
                         case when jsonb_array_length(v_allowed) = 1 then v_allowed ->> 0 else '' end);
      v_ids := v_ids || jsonb_build_array(jsonb_build_object('token', case v_kind when 'table' then 'dataset' else v_kind end,
                                                             'id', p_row ->> 'value_reference_id'));
    end if;
    if jsonb_typeof(v) = 'string' then
      v_fence := substring(v #>> '{}' from '```matrx\s*(\{.*?\})\s*```');
      begin
        v_doc := v_fence::jsonb;
      exception when others then
        v_doc := null;
      end;
      if jsonb_typeof(v_doc -> 'items') = 'array' then
        for v_it in select * from jsonb_array_elements(v_doc -> 'items') loop
          continue when jsonb_typeof(v_it) <> 'object';
          v_ident := coalesce(v_it ->> 'id', v_it ->> 'file_id', v_it ->> 'table_id');
          continue when v_ident is null or v_ident !~ v_uuid;
          v_kind := lower(coalesce(v_it ->> 'type', v_doc ->> 'type', case when jsonb_array_length(v_allowed) = 1 then v_allowed ->> 0 else '' end));
          v_ids := v_ids || jsonb_build_array(jsonb_build_object('token', case v_kind when 'table' then 'dataset' else v_kind end, 'id', v_ident));
        end loop;
      end if;
    end if;
    if v_attach then
      return (select case when count(*) = 0 then null else jsonb_agg(distinct x ->> 'id') end from jsonb_array_elements(v_ids) x);
    end if;
    return (select case when count(*) = 0 then null else jsonb_agg(y order by o) end
              from (select distinct on (x ->> 'token', lower(x ->> 'id')) x as y, o
                      from jsonb_array_elements(v_ids) with ordinality e(x, o)
                     order by x ->> 'token', lower(x ->> 'id'), o) z);
  elsif v_type = 'relation' then
    -- A reference to another scope holds that scope's id.
    if p_row ->> 'value_reference_id' is not null then
      v_ids := v_ids || to_jsonb(p_row ->> 'value_reference_id');
    end if;
    if jsonb_typeof(v) = 'string' then
      v_fence := substring(v #>> '{}' from '```matrx\s*(\{.*?\})\s*```');
      begin v_doc := v_fence::jsonb; exception when others then v_doc := null; end;
      if jsonb_typeof(v_doc -> 'items') = 'array' then
        for v_it in select * from jsonb_array_elements(v_doc -> 'items') loop
          v_ident := v_it ->> 'id';
          if v_ident ~ v_uuid and not (v_ids @> to_jsonb(v_ident)) then
            v_ids := v_ids || to_jsonb(v_ident);
          end if;
        end loop;
      end if;
      if jsonb_array_length(v_ids) = 0 and (v #>> '{}') ~ v_uuid then
        v_ids := v_ids || v;
      end if;
    end if;
    if v_multi then
      return case when jsonb_array_length(v_ids) = 0 then null else v_ids end;
    end if;
    return v_ids -> 0;
  end if;

  if v is null then return null; end if;
  if v_multi and jsonb_typeof(v) <> 'array' then
    v := jsonb_build_array(v);
  end if;
  if v_type = 'text' then
    return custom._ctx_words(v_multi, v);
  end if;
  return v;
end;
$function$;

-- A VALUE → one version of the Record's value, with the follow's own envelope (scopes.plan
-- "context item values → Values"): the old row it came from is named, so a later re-plan by the
-- Python follow finds it held and appends nothing.
create or replace function custom._ctx_store_value(p_org uuid, p_row jsonb)
 returns jsonb
 language plpgsql
 set search_path to 'pg_catalog'
as $function$
declare
  v_field  custom.record;
  v_rec    custom.record;
  v_value  jsonb;
  v_src    jsonb;
  v_env    jsonb;
  v_actor  text := custom._ctx_word('actor', p_row ->> 'source_type');
begin
  if not coalesce((p_row ->> 'is_current')::boolean, true) then
    return jsonb_build_object('did', 'not_current');
  end if;
  select * into v_field from custom.record f
   where f.organization_id = p_org and f.id = (p_row ->> 'context_item_id')::uuid and f.data_class = 'field';
  select * into v_rec from custom.record r
   where r.organization_id = p_org and r.id = (p_row ->> 'scope_id')::uuid and r.data_class = 'record';
  if v_field.id is null or v_rec.id is null then
    raise exception 'The record store has no % for this value yet, so it cannot hold it.',
                    case when v_field.id is null then 'field' else 'record' end
      using errcode = '23503',
            hint = 'SCOPES-WRITE-THROUGH: a value is written after its scope and its context field. Nothing was written.';
  end if;
  if v_field.deleted_at is not null or v_rec.deleted_at is not null then
    -- An archived field or scope keeps its values as they were archived (the copy never writes them).
    return jsonb_build_object('did', 'archived');
  end if;

  v_value := custom._ctx_value_of(p_row, v_field.data);
  v_src := jsonb_build_object('kind', 'move', 'store', 'context.context_item_values',
                              'source_type', coalesce(p_row ->> 'source_type', 'manual'),
                              'feed', custom._ctx_word('source', p_row ->> 'source_type'),
                              'old_value_id', p_row ->> 'id',
                              'old_version', coalesce((p_row ->> 'version')::int, 1));
  if p_row ->> 'authored_by' is not null then
    v_src := v_src || jsonb_build_object('authored_by', p_row ->> 'authored_by');
  end if;
  if nullif(p_row ->> 'change_summary', '') is not null then
    v_src := v_src || jsonb_build_object('change_summary', p_row ->> 'change_summary');
  end if;
  v_env := jsonb_build_object('src', v_src, 'actor', v_actor,
                              'at', custom._ctx_iso(coalesce(nullif(p_row ->> 'created_at', '')::timestamptz, now())));
  if v_actor = 'agent' and p_row ->> 'authored_by' is not null then
    v_env := v_env || jsonb_build_object('on_behalf_of', p_row ->> 'authored_by');
  end if;
  if v_value is null then
    v_env := v_env || '{"absent": "none"}'::jsonb;
  end if;

  update custom.record r
     set data = (coalesce(r.data, '{}'::jsonb) || jsonb_build_object(v_field.data ->> 'key', coalesce(v_value, 'null'::jsonb)))
                || jsonb_build_object('_values', coalesce(r.data -> '_values', '{}'::jsonb)
                                                 || jsonb_build_object(v_field.data ->> 'key', v_env))
   where r.organization_id = p_org and r.id = v_rec.id;
  return jsonb_build_object('did', 'written', 'key', v_field.data ->> 'key');
end;
$function$;
-- ── 5. ONE COPIED TAG, BROUGHT CURRENT (the loop body of custom.context_tag_copy, factored out so the
--      organization-wide copy and the per-edge write-through share one body) ─────────────────────
create or replace function custom._ctx_store_tag(p_organization_id uuid, p_source_type text, p_source_id uuid, p_target_id uuid)
 returns text
 language plpgsql
 set search_path to 'pg_catalog'
as $function$
declare
  g       record;
  o       platform.associations%rowtype;
  v_twin  platform.associations%rowtype;
  v_other boolean;
  v_want  boolean;
  v_meta  jsonb;
  v_via_t text;
  v_via_id uuid;
begin
  if not exists (select 1 from custom.record r
                  where r.organization_id = p_organization_id and r.id = p_target_id and r.data_class = 'record') then
    return 'waiting_for_the_record';
  end if;
  select bool_or(x.deleted_at is null) as live,
         (array_agg(x.id order by (x.deleted_at is null) desc, x.created_at, x.id))[1] as pick_id
    into g
    from platform.associations x
   where x.target_type = 'scope' and x.target_id = p_target_id
     and x.source_type = p_source_type and x.source_id = p_source_id;
  if g.pick_id is null then
    -- The old edge is gone altogether (hard-deleted): its copy is archived, never deleted.
    update platform.associations t
       set deleted_at = now(), deleted_via_type = null, deleted_via_id = null
     where t.source_type = p_source_type and t.source_id = p_source_id
       and t.target_type = 'record' and t.target_id = p_target_id and t.role = 'context_tag'
       and t.deleted_at is null;
    return case when found then 'archived' else 'none' end;
  end if;
  select * into o from platform.associations where id = g.pick_id;

  select exists (
    select 1 from platform.associations e
     where e.source_type = p_source_type and e.source_id = p_source_id
       and e.target_type in ('record', 'custom_record') and e.target_id = p_target_id
       and e.deleted_at is null
       and not (e.target_type = 'record' and e.role is not distinct from 'context_tag')
  ) into v_other;

  select * into v_twin
    from platform.associations t
   where t.source_type = p_source_type and t.source_id = p_source_id
     and t.target_type = 'record' and t.target_id = p_target_id and t.role = 'context_tag';

  v_want := g.live and not v_other;
  v_meta := coalesce(o.metadata, '{}'::jsonb)
            || jsonb_build_object('moved_from', jsonb_build_object(
                 'table', 'platform.associations', 'id', o.id, 'target_type', 'scope',
                 'role', o.role, 'lane', 'SC-4'));

  if v_twin.id is null then
    if v_want then
      insert into platform.associations
        (source_type, source_id, target_type, target_id, organization_id, label, metadata,
         created_by, created_at, role, position, updated_by_system)
      values (p_source_type, p_source_id, 'record', p_target_id, o.organization_id, o.label, v_meta,
              o.created_by, o.created_at, 'context_tag', o.position, 'matrx_records.context_follow');
      return 'made';
    elsif g.live and v_other then
      return 'same_edge_already_there';
    end if;
    return 'none';
  elsif v_want then
    if v_twin.deleted_at is not null then
      update platform.associations
         set deleted_at = null, deleted_via_type = null, deleted_via_id = null,
             organization_id = o.organization_id, label = o.label, metadata = v_meta, position = o.position
       where id = v_twin.id;
      return 'revived';
    elsif v_twin.metadata is distinct from v_meta or v_twin.position is distinct from o.position
          or v_twin.label is distinct from o.label or v_twin.organization_id is distinct from o.organization_id then
      update platform.associations
         set metadata = v_meta, position = o.position, label = o.label, organization_id = o.organization_id
       where id = v_twin.id;
      return 'updated';
    end if;
    return 'current';
  else
    if v_twin.deleted_at is null then
      v_via_t  := case when v_other then 'record'
                       when o.deleted_via_type = 'scope' then 'record'
                       else o.deleted_via_type end;
      v_via_id := case when v_other then p_target_id else o.deleted_via_id end;
      update platform.associations
         set deleted_at = coalesce(o.deleted_at, now()), deleted_via_type = v_via_t, deleted_via_id = v_via_id
       where id = v_twin.id;
      return 'archived';
    elsif v_other and g.live then
      return 'same_edge_already_there';
    end if;
    return 'none';
  end if;
end;
$function$;
revoke all on function custom._ctx_store_tag(uuid, text, uuid, uuid) from public, anon, authenticated;

-- ── 6. THE BRIDGE: a row an old door or a direct write changed, carried into the store in the same
--      statement (store organizations only; the scope doors carry their own rows and mark them) ────
create or replace function custom._ctx_bridge(p_table text, p_op text, p_row jsonb, p_org uuid, p_type uuid)
 returns void
 language plpgsql
 set search_path to 'pg_catalog'
as $function$
declare
  v_was text := custom._ctx_mark('bridge');
  v_row jsonb := case when p_op = 'DELETE' then p_row || jsonb_build_object('deleted_at', coalesce(p_row ->> 'deleted_at', now()::text))
                      else p_row end;
  v_id  uuid := (p_row ->> 'id')::uuid;
begin
  -- WHO IS WRITING, NAMED (the associations provenance stamp refuses an automated write that does not say).
  if coalesce(current_setting('app.actor_system', true), '') = '' then
    perform set_config('app.actor_system', 'custom.context_write_through', true);
  end if;
  if p_table = 'scope_types' then
    perform custom._ctx_store_type(p_org, v_id, v_row);
  elsif p_table = 'context_items' then
    perform custom._ctx_store_item(p_org, p_type, v_id, v_row);
  elsif p_table = 'scopes' then
    perform custom._ctx_store_scope(p_org, p_type, v_id, v_row);
  elsif p_table = 'context_item_values' then
    if p_op <> 'DELETE' then
      perform custom._ctx_store_value(p_org, p_row);
    end if;
  end if;
  perform custom._ctx_mark(v_was);
end;
$function$;
revoke all on function custom._ctx_bridge(text, text, jsonb, uuid, uuid) from public, anon, authenticated;
-- ── 7. THE OLD TABLES' FOLLOW TRIGGER: store organizations are carried in the same statement ──────
CREATE OR REPLACE FUNCTION context._follow_to_the_copy()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_row  jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_id   uuid  := (v_row ->> 'id')::uuid;
  v_org  uuid;
  v_type uuid;
  v_on   boolean;
begin
  -- WHICH ORGANIZATION AND WHICH SCOPE TYPE (the copy's Table) this row belongs to.
  if tg_table_name = 'scope_types' then
    v_org  := (v_row ->> 'organization_id')::uuid;
    v_type := v_id;
  elsif tg_table_name = 'scopes' then
    v_org  := (v_row ->> 'organization_id')::uuid;
    v_type := (v_row ->> 'scope_type_id')::uuid;
  elsif tg_table_name = 'context_items' then
    v_type := (v_row ->> 'scope_type_id')::uuid;
    select t.organization_id into v_org from context.scope_types t where t.id = v_type;
  elsif tg_table_name = 'context_item_values' then
    select s.organization_id, s.scope_type_id into v_org, v_type
      from context.scopes s where s.id = (v_row ->> 'scope_id')::uuid;
  end if;
  if v_org is null then
    return null;
  end if;

  -- SCOPES-WRITE-THROUGH: IN AN ORGANIZATION WHOSE STORE IS THE WRITER, the record store is written
  -- in this same statement and its rules govern — a store refusal refuses the write. OUTSIDE the
  -- exception handler below on purpose: swallowing a refusal here would commit the old row and leave
  -- the store behind, silently. A scope door has already written the store for its own rows (marked).
  if custom.context_writer(v_org) = 'store' then
    if not custom._ctx_marked() then
      perform custom._ctx_bridge(tg_table_name, tg_op, v_row, v_org, v_type);
    end if;
    return null;
  end if;

  begin
    v_on := coalesce((platform.knob_resolve('custom', 'context_copy_following', v_org) #>> '{}')::boolean, true);
    if not v_on then
      return null;
    end if;

    insert into custom.io_outbox (event_key, record_id, table_id, operation, dedupe_key, organization_id, actor)
    values ('context.follow', v_id, v_type,
            case tg_op when 'INSERT' then 'created' when 'DELETE' then 'deleted' else 'updated' end,
            'context.follow:' || tg_table_name || ':' || v_id::text,
            v_org,
            jsonb_build_object('declared', 'context.' || tg_table_name, 'user_id', auth.uid()))
    on conflict (organization_id, dedupe_key) where deleted_at is null
    do update set consumed_at = null,
                  consumer    = null,
                  operation   = excluded.operation,
                  actor       = excluded.actor;
    -- A RE-ARMED ROW IS NEWS TOO. custom.io_outbox_announce fires on INSERT only, so the second
    -- edit of the same old row (an update of the outbox row) would wake nobody; say it here, in the
    -- announce's own shape (a pointer, never the row). The follow debounces, so a duplicate on the
    -- first insert costs nothing.
    perform pg_notify('records_changed',
                      jsonb_build_object('organization_id', v_org, 'record_id', v_id, 'table_id', v_type,
                                         'operation', 'updated', 'event_key', 'context.follow')::text);
  exception when others then
    -- NEVER FAIL THE OLD SIDE'S EDIT, NEVER FAIL IN SILENCE. The current screens are the writer;
    -- an edit there must land whether or not the copy could be told. The miss is recorded with its
    -- remedy, and the next change to the same organization (or any follow drain run for it)
    -- re-plans the whole organization, so nothing is lost for good.
    begin
      insert into ops.system_error (kind, organization_id, source_app, source_feature, route, error_type, error_text, context)
      values ('context_follow_enqueue_failure', v_org, 'database', 'context-follow',
              'context._follow_to_the_copy', sqlstate, sqlerrm,
              jsonb_build_object('table', 'context.' || tg_table_name, 'row_id', v_id, 'operation', tg_op,
                                 'remedy', 'run the follow for this organization: python -m matrx_records.movers.runner --follow-context --organization <id> --apply --i-know-this-writes'));
    exception when others then
      raise warning 'context._follow_to_the_copy: could not tell the copy about %.% (%), and could not record it: %',
        'context', tg_table_name, v_id, sqlerrm;
    end;
  end;
  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION custom._context_copy_fence()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_role   name := custom.caller_role();
  v_table  uuid;
  v_key    text;
  v_hit    text;
  v_kept   text;
  v_name   text;
  v_on     boolean;
  v_where  text;
  v_older  text;
  v_copyof uuid;
begin
  v_copyof := case when new.data_class = 'table' then new.id
                   when new.data_class = 'field' then nullif(new.data ->> 'entity_definition_id', '')::uuid
                   else new.table_id end;

  -- THE ONE WRITER. The store owner's own connection — the scopes mover, the follow worker and
  -- the older-tables mover's rerun — may write any copy. Read from the catalogue, never a role
  -- literal, exactly as custom._store_door's operator lane is. When it rewrites a test-copy row a
  -- person had touched, what it writes is the image the switch will put back (COPY-WRITABLE).
  if pg_has_role(v_role, (select c.relowner from pg_class c where c.oid = 'custom.record'::regclass), 'member') then
    if tg_op = 'UPDATE' and custom._copy_evaluation_is_open(new.organization_id, new.id) then
      perform custom._copy_evaluation_reimage(new.organization_id, new.id, to_jsonb(new));
    end if;
    return new;
  end if;

  -- THE OLDER TABLE IS THE WRITER UNTIL THE SWITCH — FOR AGENTS, AUTOMATIONS AND INTEGRATIONS
  -- (WHERE-LIVES-SWITCH, amended by COPY-WRITABLE 2026-09-25). COPY mode keeps every older table
  -- live beside its same-id copy until an owner presses the organization's Data tables switch.
  -- A PERSON's own write to the copy (the new table page, the record page) is a test: allowed,
  -- and noted with the row as the mover left it, so the switch can replace it with the older
  -- table's truth. Any other writer is refused with the older table's address.
  v_older := custom._older_table_copy_refusal(v_copyof);
  if v_older is null and v_copyof is not null then
    perform custom._copy_evaluation_note(new.organization_id, v_copyof, new.id, new.data_class);   -- notes only a person's write to a test copy
  elsif v_older is not null then
    raise exception '%', v_older
      using errcode = '42501',
            hint = 'WHERE-LIVES-SWITCH / COPY-WRITABLE: platform.table_lives_in answers ''older'' for this table (its older table is live and the organization''s older_tables switch is off), and this write declares an agent, automation or integration (or is not a signed-in person''s own). Nothing was written. Write the older table; after the switch the copy is the table.';
  end if;

  -- WHICH TABLE THIS ROW BELONGS TO: a Table record is itself; a Field names its Table; every
  -- other row is a record of new.table_id.
  -- A scope's OWN table (G11, tied to its scope by `scope_binding`) is not a copy: the store is
  -- its writer, and people keep rows in it. Only the Tables the scopes mover lands — one per
  -- scope type, carrying no binding — are the copy.
  if new.data_class = 'table' then
    v_kept := case when new.data ? 'scope_binding' then '' else coalesce(new.data ->> 'kept_for', '') end;
    if tg_op = 'UPDATE' and v_kept <> 'context' and not (old.data ? 'scope_binding') then
      v_kept := coalesce(old.data ->> 'kept_for', '');   -- taking the word off is a write too
    end if;
    v_name := coalesce(nullif(new.data ->> 'name', ''), 'this table');
  else
    v_table := v_copyof;
    if v_table is null then
      return new;
    end if;
    -- ONE PRIMARY-KEY READ, NO MEMO. The store's memo (platform.memo_k_*) is WRITE-PERF-4's, and
    -- its inverse takes it away; a trigger that reached it would stand over a missing body after
    -- that rollback (check:inverses-leave-the-ground-standing, clause a). The read is the
    -- (organization_id, id) primary key of one partition.
    select case when t.data ? 'scope_binding' then '' else coalesce(t.data ->> 'kept_for', '') end
           || chr(31) || coalesce(nullif(t.data ->> 'name', ''), 'this table')
      into v_hit
      from custom.record t
     where t.organization_id = new.organization_id
       and t.id = v_table
       and t.table_id = custom.table_kernel_id();
    v_hit := coalesce(v_hit, chr(31));
    v_kept := split_part(v_hit, chr(31), 1);
    v_name := split_part(v_hit, chr(31), 2);
  end if;

  if v_kept is distinct from 'context' then
    return new;
  end if;

  -- SCOPES-WRITE-THROUGH: IN AN ORGANIZATION WHOSE STORE IS THE WRITER, the scope doors and the
  -- write-through (both marked for this transaction) write a context Table, and nothing else does:
  -- a generic store write (the grid, the records tool, a sync client) would leave the current
  -- context tables, which every not-yet-moved reader still reads, behind.
  if custom.context_writer(new.organization_id) = 'store' then
    if custom._ctx_marked() then
      return new;
    end if;
    v_where := case when new.data_class = 'record' then '/scopes/s/' || new.id::text else '/scopes/manage' end;
    raise exception '% is written through the scopes screens (or an agent''s context tools), so the current context system stays exact while it is still read. Edit it on %.',
                    case when new.data_class = 'record' then 'This scope' else 'This scope type' end, v_where
      using errcode = '42501',
            hint = 'SCOPES-WRITE-THROUGH: this organization''s scopes are written in the record store first (custom.context_writer = store), through the scope doors (custom.context_*), which keep the old context tables exact in the same transaction. A write through any other door is refused until the final switch lifts this. Nothing was written.';
  end if;

  v_on := coalesce((platform.knob_resolve('custom', 'context_copy_following', new.organization_id) #>> '{}')::boolean, true);
  if not v_on then
    return new;
  end if;

  -- WHERE TO EDIT IT INSTEAD. A copied Record keeps its scope's id, so its scope page is known;
  -- a change to the Table or its Fields is a change to the scope type, made on the scopes screen.
  v_where := case when new.data_class = 'record' then '/scopes/s/' || new.id::text else '/scopes/manage' end;

  raise exception 'This is the new system''s copy of %; it follows the current screens until the switch. Edit it on %.',
                  v_name, v_where
    using errcode = '42501',
          hint = 'SC-1'' P13: while custom/context_copy_following is on for this organization, only the follow of the current scope screens writes the record store''s copy of the context system. Nothing was written. The switch to the new system turns this off; an organization where the store is the writer turns it off for itself.';
end;
$function$;

CREATE OR REPLACE FUNCTION platform._context_tag_copy_fence()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_org  uuid;
  v_on   boolean;
  v_what text;
begin
  -- THE ONE WRITER: the store owner's own connection (the scopes mover and the follow), read
  -- from the catalogue exactly as custom._context_copy_fence does. (SECURITY DEFINER so the
  -- scope's organization and its knob are read whoever writes; custom.caller_role() reads the
  -- role GUC and session_user, which the definer boundary does not move.) A hard delete is
  -- never fenced: the old side's delete of an entity sweeps its edges, copies included.
  if pg_has_role(custom.caller_role(), (select c.relowner from pg_class c where c.oid = 'custom.record'::regclass), 'member') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.role is distinct from 'context_tag' or new.target_type <> 'record' then
      return new;
    end if;
    v_what := 'make';
  else
    if coalesce(old.role, '') <> 'context_tag' and coalesce(new.role, '') <> 'context_tag' then
      return new;
    end if;
    if old.role is distinct from new.role then
      v_what := 'change the role of';
    elsif old.deleted_at is not null and new.deleted_at is null
          and old.deleted_via_id is not null and new.deleted_via_id is null
          and pg_trigger_depth() > 1 then
      -- lane TRASH-COVERAGE-2: the tagged item's own restore (platform._gc_entity_associations,
      -- running as a trigger on the item's table) bringing back exactly the edges its archive
      -- tombstoned — the mirror of the tombstone let through below. Without it no tagged file,
      -- conversation, note, project, task or war room could come back from Trash (42501 on
      -- every restore). A direct revive (trigger depth 1) is still refused.
      return new;
    elsif old.deleted_at is not null and new.deleted_at is null then
      v_what := 'revive';
    elsif new.target_type is distinct from old.target_type or new.target_id is distinct from old.target_id then
      v_what := 're-point';
    elsif new.deleted_at is null and (new.metadata is distinct from old.metadata
                                      or new.position is distinct from old.position
                                      or new.label is distinct from old.label) then
      v_what := 'edit';
    else
      -- A tombstone, or a source moved by a merge: the old side's own cascades, carried; the
      -- follow re-arms on it and puts the old side's word back at the next drain.
      return new;
    end if;
  end if;

  select s.organization_id into v_org from context.scopes s where s.id = new.target_id;
  if v_org is null then
    return new;
  end if;
  -- SCOPES-WRITE-THROUGH: in an organization whose store is the writer, the write-through (marked)
  -- carries each tag in the same statement as the tag itself.
  if custom._ctx_marked() and custom.context_writer(v_org) = 'store' then
    return new;
  end if;
  v_on := coalesce((platform.knob_resolve('custom', 'context_copy_following', v_org) #>> '{}')::boolean, true);
  if not v_on then
    return new;
  end if;

  raise exception 'This is the new system''s copy of a context tag; it follows the current tags until the switch, so nobody may % it here. Tag or untag the item in its Context section.', v_what
    using errcode = '42501',
          hint = 'SC-4 P4: while custom/context_copy_following is on for the scope''s organization, only the follow of the current screens writes the record store''s copied tags (role context_tag). Nothing was written.';
end;
$function$;

CREATE OR REPLACE FUNCTION platform._context_tag_follow_to_the_copy()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_row  platform.associations%rowtype := case when tg_op = 'DELETE' then old else new end;
  v_org  uuid;
  v_type uuid;
  v_on   boolean;
begin
  -- The follow's own write to a copy is not news (it would wake the follow to re-copy itself), and
  -- neither is the write-through's (SCOPES-WRITE-THROUGH, marked for its transaction).
  if v_row.target_type = 'record' and custom._ctx_marked() then
    return null;
  end if;
  if v_row.target_type = 'record'
     and pg_has_role(custom.caller_role(), (select c.relowner from pg_class c where c.oid = 'custom.record'::regclass), 'member') then
    return null;
  end if;

  select s.organization_id, s.scope_type_id into v_org, v_type
    from context.scopes s where s.id = v_row.target_id;
  if v_org is null and tg_op = 'UPDATE' then
    select s.organization_id, s.scope_type_id into v_org, v_type
      from context.scopes s where s.id = old.target_id;
  end if;
  if v_org is null then
    return null;
  end if;
  -- SCOPES-WRITE-THROUGH: in an organization whose store is the writer, this tag's copy is brought
  -- current in the same statement (outside the handler below, so a store refusal refuses the tag).
  if custom.context_writer(v_org) = 'store' then
    declare
      v_was text := custom._ctx_mark('bridge');
    begin
      if coalesce(current_setting('app.actor_system', true), '') = '' then
        perform set_config('app.actor_system', 'custom.context_write_through', true);
      end if;
      perform custom._ctx_store_tag(v_org, v_row.source_type, v_row.source_id, v_row.target_id);
      if tg_op = 'UPDATE' and old.target_id is distinct from new.target_id and old.target_type = 'scope' then
        perform custom._ctx_store_tag(v_org, old.source_type, old.source_id, old.target_id);
      end if;
      perform custom._ctx_mark(v_was);
    end;
    return null;
  end if;
  begin
  v_on := coalesce((platform.knob_resolve('custom', 'context_copy_following', v_org) #>> '{}')::boolean, true);
  if not v_on then
    return null;
  end if;

  insert into custom.io_outbox (event_key, record_id, table_id, operation, dedupe_key, organization_id, actor)
  values ('context.follow', v_row.id, v_type,
          case tg_op when 'INSERT' then 'created' when 'DELETE' then 'deleted' else 'updated' end,
          'context.follow:associations:' || v_row.id::text,
          v_org,
          jsonb_build_object('declared', 'platform.associations', 'user_id', auth.uid(),
                             'source_type', v_row.source_type, 'target_type', v_row.target_type))
  on conflict (organization_id, dedupe_key) where deleted_at is null
  do update set consumed_at = null,
                consumer    = null,
                operation   = excluded.operation,
                actor       = excluded.actor;
  perform pg_notify('records_changed',
                    jsonb_build_object('organization_id', v_org, 'record_id', v_row.id, 'table_id', v_type,
                                       'operation', 'updated', 'event_key', 'context.follow')::text);
  return null;
  exception when others then
  -- NEVER FAIL THE OLD SIDE'S TAG, NEVER FAIL IN SILENCE (same rule as context._follow_to_the_copy).
  begin
    insert into ops.system_error (kind, organization_id, source_app, source_feature, route, error_type, error_text, context)
    values ('context_follow_enqueue_failure', v_org, 'database', 'context-follow',
            'platform._context_tag_follow_to_the_copy', sqlstate, sqlerrm,
            jsonb_build_object('table', 'platform.associations', 'row_id', v_row.id, 'operation', tg_op,
                               'remedy', 'run the follow for this organization: python -m matrx_records.movers.runner --follow-context --organization <id> --apply --i-know-this-writes'));
  exception when others then
    raise warning 'platform._context_tag_follow_to_the_copy: could not tell the copy about tag % (%), and could not record it: %',
      v_row.id, tg_op, sqlerrm;
  end;
  return null;
  end;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.context_tag_copy(p_organization_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  g         record;
  v_twin    platform.associations%rowtype;
  v_other   boolean;
  v_want    boolean;
  v_meta    jsonb;
  v_via_t   text;
  v_via_id  uuid;
  n_made    int := 0;
  n_revived int := 0;
  n_archived int := 0;
  n_updated int := 0;
  n_same    int := 0;
  n_current int := 0;
  n_waiting int := 0;
  n_refused int := 0;
  v_refused jsonb := '[]'::jsonb;
  v_did     text;
begin
  if p_organization_id is null then
    raise exception 'custom.context_tag_copy: name the organization whose tags to copy'
      using errcode = '22004';
  end if;
  -- WHO IS WRITING, NAMED (the provenance stamp refuses an automated write that does not say).
  if coalesce(current_setting('app.actor_system', true), '') = '' then
    perform set_config('app.actor_system', 'matrx_records.context_follow', true);
  end if;

  -- EVERY SCOPE TAG TYPE HAS ITS STORE TWIN (lane PROOF-DEFECTS, D3). SC-4 P4 registered the
  -- `<kind> -> record` twins once; a `<kind> -> scope` type registered after it (app, 2026-09-25;
  -- processed_document "about", 2026-09-25) had none, the direction guard refused its copy, and the
  -- whole organization's follow stopped. The twin is registered here, the moment a copy needs it:
  -- same label, container side and conveyance. A row already there is never changed.
  insert into platform.association_types (source_type, target_type, label, container_side, conveys_max, is_active, notes)
  select a.source_type, 'record', a.label, a.container_side, a.conveys_max, true,
         'SC-4 P4: the record store''s copy of a context tag (role context_tag), twin of '
         || a.source_type || ' -> scope; same label, container side and conveyance. Written only by the context follow until the switch.'
    from platform.association_types a
   where a.target_type = 'scope' and a.is_active
     and not exists (select 1 from platform.association_types t
                      where t.source_type = a.source_type and t.target_type = 'record')
  on conflict (source_type, target_type) do nothing;

  -- A scope whose copy Record has not landed yet waits for the copy (counted, never guessed).
  select count(distinct a.id) into n_waiting
    from platform.associations a
    join context.scopes s on s.id = a.target_id
   where a.target_type = 'scope' and s.organization_id = p_organization_id
     and not exists (select 1 from custom.record r
                      where r.organization_id = p_organization_id and r.id = a.target_id
                        and r.data_class = 'record');

  -- ONE TAG PER (source, scope): two old edges between the same two ends (a plain tag and a
  -- class assignment) are one copied tag, live while either is, shaped by the live one.
  for g in
    select distinct x.source_type, x.source_id, x.target_id
      from platform.associations x
      join context.scopes s on s.id = x.target_id
     where x.target_type = 'scope'
       and s.organization_id = p_organization_id
       and exists (select 1 from custom.record r
                    where r.organization_id = p_organization_id and r.id = x.target_id
                      and r.data_class = 'record')
  loop
    begin
      -- ONE BODY FOR ONE TAG (SCOPES-WRITE-THROUGH): the per-edge write-through calls the same.
      v_did := custom._ctx_store_tag(p_organization_id, g.source_type, g.source_id, g.target_id);
      case v_did
        when 'made' then n_made := n_made + 1;
        when 'revived' then n_revived := n_revived + 1;
        when 'updated' then n_updated := n_updated + 1;
        when 'current' then n_current := n_current + 1;
        when 'archived' then n_archived := n_archived + 1;
        when 'same_edge_already_there' then n_same := n_same + 1;
        else null;
      end case;
    exception
      when check_violation or foreign_key_violation or insufficient_privilege or raise_exception then
        -- ONE TAG THE STORE REFUSES IS NAMED, AND THE REST OF THE ORGANIZATION IS COPIED
        -- (lane PROOF-DEFECTS, D3). The follow files ops.system_error for every refused tag.
        n_refused := n_refused + 1;
        if jsonb_array_length(v_refused) < 20 then
          v_refused := v_refused || jsonb_build_array(jsonb_build_object(
            'pair', g.source_type || ' -> record',
            'source_id', g.source_id,
            'scope_id', g.target_id,
            'sqlstate', sqlstate,
            'says', left(split_part(sqlerrm, E'\n', 1), 300)));
        end if;
    end;
  end loop;

  -- A COPIED TAG WHOSE OLD EDGE IS GONE ALTOGETHER (hard-deleted on the old side) is archived.
  with gone as (
    update platform.associations t
       set deleted_at = now(), deleted_via_type = null, deleted_via_id = null
     where t.target_type = 'record' and t.role = 'context_tag' and t.deleted_at is null
       and exists (select 1 from context.scopes s where s.id = t.target_id and s.organization_id = p_organization_id)
       and not exists (select 1 from platform.associations x
                        where x.target_type = 'scope' and x.target_id = t.target_id
                          and x.source_type = t.source_type and x.source_id = t.source_id)
    returning 1)
  select n_archived + count(*) into n_archived from gone;

  return jsonb_build_object(
    'organization_id', p_organization_id,
    'made', n_made, 'revived', n_revived, 'archived', n_archived, 'updated', n_updated,
    'current', n_current, 'same_edge_already_there', n_same, 'waiting_for_the_record', n_waiting,
    'refused', n_refused, 'refused_tags', v_refused);
end;
$function$;
