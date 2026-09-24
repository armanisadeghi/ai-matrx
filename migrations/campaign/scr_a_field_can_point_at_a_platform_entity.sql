-- additive: yes
--
-- chair-step: it REPLACES eight live bodies — custom.field_kinds, custom._field_document_for,
--   custom._field_shape_guard, custom.validate_values, the two statement-level relation-association
--   trigger functions custom._relation_associations_stmt_insert / _stmt_update, custom.choice_render
--   and custom.field_words — each by ADDING one arm and changing nothing it already answered;
--   CREATES six functions (custom.entity_reference_kinds, custom.entity_reference_fields,
--   custom._entity_reference_target_ok, custom.record_entity_edges,
--   custom.entity_reference_render, custom.entity_reference_words); INSERTS the registry rows
--   `record → <token>` into platform.association_types (container_side 'none': no access is
--   conveyed) and three platform.client_callable_door rows. Nothing is dropped, granted or
--   revoked; no row of anybody's data is written; no trigger, policy, table or column is
--   touched, so `create or replace function` locks no table. Not window-class. The inverse is
--   `migrations/inverse/scr_a_field_can_point_at_a_platform_entity_down.sql`; the signed-in
--   grant is the separate chair step `scr_a_signed_in_person_may_name_platform_entities.sql`.
-- lock: custom,platform
-- lane: SC-R
-- based-on: custom._field_document_for(uuid, uuid, jsonb) f6264d02d8688e997919a0395bf666fb78e1a65a9fc941452ff1f07e8e93f808
-- based-on: custom._field_shape_guard() 5cc471610e426fa065a07239451dc222f21059e819638eea73e7d1f5ba051b5f
-- based-on: custom._relation_associations_stmt_insert() 69c85956d7f2fda696de7457ab268269a898b6a1c04afb9bf824f68af75e76cf
-- based-on: custom._relation_associations_stmt_update() 56bf9b0d91a4f1c754fe9783ee21670d35e6b0a952d28778dec4806c9c641191
-- based-on: custom.choice_render(uuid, uuid, jsonb) 9c6a3d8374a74d9dd3f02dcfd10b6ead7a7430e4f4d2112b990862aed0418d3a
-- based-on: custom.field_kinds() a542af762200849227b2e2dc5c4bdb66e4a201ef46684f48fe6d70497e7e94d5
-- based-on: custom.field_words(uuid, uuid, jsonb) 4ba4f598516495c7a85d9fee98071f85e87ba94bee9b7846334cc72a838801da
-- based-on: custom.validate_values(uuid, custom.record[], jsonb, text) 7ce2ca83693b372ff9f3980a6d40286630760cf93c9df555c7893673233c6624
--
-- SC-R · REFERENCE-FIELD (P12) — A RECORD CAN POINT AT A PLATFORM ENTITY.
--
-- THE USE CASE. Whitfield & Ames LLP is a two-partner workers'-compensation and personal-injury
-- firm. Its Clients table keeps one record per client matter; each matter points at the intake
-- note the paralegal took on the first call and at the client's own web site (the firm reads a
-- business client's site before a deposition). In the scope system those were reference items
-- (`allowed_reference_types = {note}`, `{web_site}`); 16 such items are live on the main
-- database — file 4, dataset 3, dataset-template 3, web site 2, agent, note, web brand and
-- workbook 1 each — and the store could hold none of them: a relation reached a Table of this
-- organization or the kernel File / Person Table and nothing else.
--
-- THE SHAPE, decided against the contract (FLD-1 keeps its closed set of five behaviours):
--   · the Field is a RELATION whose config.target_mode is `any` (REL-8: "polymorphic without
--     restriction") restricted by config.allowed_types, the entity tokens it may name — the
--     scope system's allowed_reference_types, same words; relation_max and on_target_delete as
--     every relation. Declared with `type: entity_reference` (published by custom.field_kinds).
--   · each value is `{token, id}` (REL-N-1's reference shape), a list like every relation's
--     (REL-7); the edge beside it is ONE platform.associations row record → <token>, role = the
--     field key, relation_field_id = the field — the one association system, never a second
--     link table. The two statement-level relation-association triggers write, withdraw and
--     revive it in the same statements as the record → record edges, so a soft delete tombstones it and a
--     restore brings it back exactly as it does a relation's.
--   · the write rule is the relation rule asked of a platform entity: the kind is one the Field
--     allows, the thing is live, and the writer may open it (iam.has_access … viewer);
--     missing and forbidden say the same sentence.
--   · every read door renders `{token, id, label}` — the label from platform.relation_label,
--     which asks the entity's own access resolver before reading its title and answers the
--     withheld label to a reader who may not open the thing (REL-14: read, never stored).
--   · history: the value lives in the record's document, so custom.value_versions, the record
--     history and a restore carry it like any value; the edge is captured by the associations'
--     own version capture.
--   · File and Person stay relations to their kernel Tables (RELATION-TARGETS): the Field guard
--     refuses `file` and the people in allowed_types and says which column to use instead.

set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- ═══ 1 · WHICH PLATFORM ENTITIES A RECORD MAY POINT AT ═════════════════════════════════════
-- One registered association type `record → <token>` per entity kind, never linking access
-- (container_side 'none': pointing at a note from a client's record shows the note's NAME to
-- somebody who may already open the note, and never opens it for somebody who may not). The
-- kinds are the registry's own reference-pickable entities that carry a title and a uuid id,
-- MINUS the three a record already reaches another way: `record` (a relation), `file` (the
-- kernel File Table — an attachment) and the people (`user`, `person`, `user_profile` — the
-- kernel Person Table). `agent_surface_binding` is an edge, not a thing, and a kind whose
-- REVERSE pair is already registered (`message → record`) keeps its one direction.
insert into platform.association_types
  (source_type, target_type, label, container_side, conveys_max, is_active, notes)
select 'record', e.token, null, 'none', 'viewer'::public.permission_level, true,
       'SC-R (2026-09-24): an entity-reference Field on a record points at this kind of thing. '
       || 'The edge carries the field (relation_field_id, role = field key) and conveys no access.'
  from platform.entity_types e
 where e.is_active
   and e.reference_pickable
   and not e.is_component
   and nullif(e.title_column, '') is not null
   and e.token not in ('record', 'custom_record', 'file', 'user', 'person', 'user_profile',
                       'agent_surface_binding')
   and not exists (select 1 from platform.association_types r
                    where r.source_type = e.token and r.target_type = 'record')
   and exists (select 1 from pg_catalog.pg_attribute a
                 join pg_catalog.pg_class c on c.oid = a.attrelid
                 join pg_catalog.pg_namespace n on n.oid = c.relnamespace
                where n.nspname = e.schema_name and c.relname = e.table_name
                  and a.attname = 'id' and a.atttypid = 'uuid'::regtype and not a.attisdropped)
   and exists (select 1 from pg_catalog.pg_attribute a
                 join pg_catalog.pg_class c on c.oid = a.attrelid
                 join pg_catalog.pg_namespace n on n.oid = c.relnamespace
                where n.nspname = e.schema_name and c.relname = e.table_name
                  and a.attname = e.title_column and not a.attisdropped)
on conflict do nothing;

create or replace function custom.entity_reference_kinds()
returns table(token text, label text, category text)
language sql
stable
security definer
set search_path to 'pg_catalog'
as $fn$
  -- The kinds of platform thing an entity-reference Field may name: exactly the registered
  -- `record → <token>` association types, so the list a person picks from, the list the Field
  -- guard accepts and the list the edge trigger accepts are ONE list.
  select e.token, e.label, coalesce(nullif(e.reference_category, ''), e.schema_name)
    from platform.association_types r
    join platform.entity_types e on e.token = r.target_type
   where r.source_type = 'record'
     and r.target_type <> 'record'
     and r.is_active
     and e.is_active
   order by e.label;
$fn$;

comment on function custom.entity_reference_kinds() is
  'SC-R / P12: the kinds of platform thing (agent, note, web site, workbook, dataset, conversation …) an entity-reference Field may point at — the registered record → <token> association types. File and Person are not here: they are relations to their kernel Tables.';

-- ═══ 2 · THIS TABLE'S ENTITY-REFERENCE FIELDS, READ ONCE ═════════════════════════════════
-- An entity reference is a RELATION (FLD-1's closed set holds) whose target mode is `any`
-- (REL-8: "polymorphic without restriction") restricted by `config.allowed_types`, the
-- entity tokens it may name (REL-N-1's reference shape: which kind, which id). Its value is a
-- list of `{token, id}`; the edge beside it is a `platform.associations` row
-- record → <token>, role = the field key, relation_field_id = the field.
create or replace function custom.entity_reference_fields(p_organization_id uuid, p_table_id uuid)
returns jsonb
language plpgsql
stable
set search_path to 'pg_catalog'
as $fn$
declare
  v_key text := 'erf:' || coalesce(p_organization_id::text, '-') || ':' || coalesce(p_table_id::text, '-');
  v_hit text;
  v_out jsonb;
begin
  if p_organization_id is null or p_table_id is null then
    return '{}'::jsonb;
  end if;
  -- The structure memo: a Field row written anywhere empties it, so a Table that gains or
  -- loses an entity reference is read afresh on the next statement.
  v_hit := platform.memo_k_get(v_key);
  if v_hit is not null then
    return v_hit::jsonb;
  end if;
  select coalesce(jsonb_object_agg(coalesce(nullif(f.data ->> 'key', ''), f.data ->> 'name'),
           jsonb_build_object(
             'field_id', f.id::text,
             'label',    coalesce(nullif(f.data ->> 'label', ''), f.data ->> 'key'),
             'allowed',  f.data -> 'config' -> 'allowed_types',
             'ordered',  coalesce((f.data -> 'config' ->> 'ordered')::boolean, false))), '{}'::jsonb)
    into v_out
    from custom.record f
   where f.organization_id = p_organization_id
     and f.table_id = custom.field_kernel_id()
     and f.data_class <> 'kernel'
     and f.deleted_at is null
     and nullif(f.data ->> 'entity_definition_id', '')::uuid = p_table_id
     and f.data ->> 'type' = 'relation'
     and jsonb_typeof(f.data -> 'config' -> 'allowed_types') = 'array'
     and jsonb_array_length(f.data -> 'config' -> 'allowed_types') > 0;
  perform platform.memo_k_put(v_key, v_out::text);
  return v_out;
end
$fn$;

comment on function custom.entity_reference_fields(uuid, uuid) is
  'SC-R / P12: the entity-reference Fields of one Table, key → {field_id, label, allowed, ordered}, memoised on the structure memo. Server-side helper of the edge triggers, the value validator and the read render.';

-- ═══ 3 · MAY THIS WRITER POINT AT THAT THING ═════════════════════════════════════════════
-- The relation rule, asked of a platform entity: the thing is there (live, not in the trash),
-- its kind is one this store registers, and the person writing may open it
-- (`iam.has_access … viewer`, the same resolver every other door asks). A server lane with no
-- person (the mover, a workflow) is asked only the first two, exactly as platform.relation_label
-- answers it. A thing that is not there and a thing the writer may not open answer the SAME
-- false, so the refusal says nothing about what exists.
create or replace function custom._entity_reference_target_ok(p_organization_id uuid, p_token text, p_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_sch  text;
  v_tab  text;
  v_sd   boolean;
  v_live boolean;
  v_me   uuid;
begin
  if p_organization_id is null or nullif(p_token, '') is null or p_id is null then
    return false;
  end if;
  if not exists (select 1 from platform.association_types r
                  where r.source_type = 'record' and r.target_type = p_token
                    and r.target_type <> 'record' and r.is_active) then
    return false;
  end if;
  select e.schema_name, e.table_name into v_sch, v_tab
    from platform.entity_types e where e.token = p_token and e.is_active;
  if v_sch is null then
    return false;
  end if;
  select exists (select 1 from pg_attribute a
                  where a.attrelid = format('%I.%I', v_sch, v_tab)::regclass
                    and a.attname = 'deleted_at' and not a.attisdropped)
    into v_sd;
  execute format('select exists (select 1 from %I.%I where id = $1%s)', v_sch, v_tab,
                 case when v_sd then ' and deleted_at is null' else '' end)
     into v_live using p_id;
  if not coalesce(v_live, false) then
    return false;
  end if;
  v_me := custom.query_principal();
  if v_me is not null and not custom.query_is_store_owner() then
    return coalesce(iam.has_access(p_token, p_id, 'viewer'::public.permission_level), false);
  end if;
  return true;
end
$fn$;

comment on function custom._entity_reference_target_ok(uuid, text, uuid) is
  'SC-R / P12: may this writer point an entity-reference Field at (token, id)? The kind is registered, the thing is live, and the signed-in writer holds viewer on it (iam.has_access); a server lane is asked only the first two. Missing and forbidden answer the same false.';

-- ═══ 4 · THE EDGES A RECORD'S DOCUMENT IMPLIES ═══════════════════════════════════════════
-- The entity twin of custom.record_relation_edges: one row per (kind, id) named under each
-- entity-reference key, the FIRST mention kept (a repeat states one fact twice, and one
-- statement may not touch the same association twice).
create or replace function custom.record_entity_edges(
  p_organization_id uuid, p_id uuid, p_table_id uuid, p_data_class text, p_data jsonb,
  p_deleted_at timestamptz)
returns table(target_type text, target_id uuid, edge_role text, field_id uuid, ord integer)
language plpgsql
stable
set search_path to 'pg_catalog'
as $fn$
declare
  v_fields jsonb;
begin
  if p_deleted_at is not null or p_id is null or p_table_id is null
     or coalesce(p_data_class, '') <> 'record'
     or p_data is null or jsonb_typeof(p_data) <> 'object' then
    return;
  end if;
  v_fields := custom.entity_reference_fields(p_organization_id, p_table_id);
  if v_fields = '{}'::jsonb then
    return;
  end if;
  return query
    select distinct on (lower(t.val ->> 'token'), lower(t.val ->> 'id'), f.key)
           lower(btrim(t.val ->> 'token')),
           (t.val ->> 'id')::uuid,
           f.key,
           (f.value ->> 'field_id')::uuid,
           case when coalesce((f.value ->> 'ordered')::boolean, false) then t.ord::integer end
      from jsonb_each(v_fields) f
      cross join lateral jsonb_array_elements(
        case jsonb_typeof(p_data -> f.key)
          when 'array'  then p_data -> f.key
          when 'object' then jsonb_build_array(p_data -> f.key)
          else '[]'::jsonb end) with ordinality as t(val, ord)
     where jsonb_typeof(t.val) = 'object'
       and nullif(btrim(t.val ->> 'token'), '') is not null
       and (t.val ->> 'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     order by lower(t.val ->> 'token'), lower(t.val ->> 'id'), f.key, t.ord;
end
$fn$;

comment on function custom.record_entity_edges(uuid, uuid, uuid, text, jsonb, timestamptz) is
  'SC-R / P12: the record → <entity> edges a record''s document implies, one per (kind, id, field key), first mention kept. The entity twin of custom.record_relation_edges; read by the relation-association triggers.';

-- ═══ 5 · THE WORDS OF A REFERENCE, FOR THE READER ═════════════════════════════════════════
-- Each `{token, id}` gets its `label` from platform.relation_label — the entity's own title,
-- asked of the entity's own access resolver first, so a reader who may not open the thing is
-- told `platform.relation_withheld_label()` and never its name (REL-14: read, never stored).
create or replace function custom.entity_reference_render(p_organization_id uuid, p_table_id uuid, p_doc jsonb)
returns jsonb
language plpgsql
stable
set search_path to 'pg_catalog'
as $fn$
declare
  v_fields jsonb;
  v_out    jsonb;
  v_at     text;
  v_val    jsonb;
  v_items  jsonb;
  e        record;
begin
  if p_doc is null or jsonb_typeof(p_doc) <> 'object' or p_table_id is null then
    return p_doc;
  end if;
  v_fields := custom.entity_reference_fields(p_organization_id, p_table_id);
  if v_fields = '{}'::jsonb then
    return p_doc;
  end if;
  v_out := p_doc;
  for e in select key as k, value as v from jsonb_each(v_fields) loop
    v_at := case when p_doc ? e.k then e.k
                 when p_doc ? (e.v ->> 'field_id') then e.v ->> 'field_id' end;
    if v_at is null then
      continue;
    end if;
    v_val := p_doc -> v_at;
    if jsonb_typeof(v_val) not in ('array', 'object')
       or (jsonb_typeof(v_val) = 'object' and not (v_val ? 'token' and v_val ? 'id')) then
      continue;   -- a masking notice, or something the validator would refuse: untouched
    end if;
    select coalesce(jsonb_agg(
             case when jsonb_typeof(x) = 'object' and x ? 'token' and x ? 'id'
                       and (x ->> 'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                  then jsonb_build_object(
                         'token', x ->> 'token',
                         'id',    x ->> 'id',
                         'label', platform.relation_label(p_organization_id, x ->> 'token', (x ->> 'id')::uuid))
                  else x end order by o), '[]'::jsonb)
      into v_items
      from jsonb_array_elements(case when jsonb_typeof(v_val) = 'array' then v_val
                                     else jsonb_build_array(v_val) end) with ordinality as a(x, o);
    v_out := v_out || jsonb_build_object(v_at,
               case when jsonb_typeof(v_val) = 'array' then v_items else v_items -> 0 end);
  end loop;
  return v_out;
end
$fn$;

comment on function custom.entity_reference_render(uuid, uuid, jsonb) is
  'SC-R / P12: every entity-reference cell of a read document becomes [{token, id, label}], the label from platform.relation_label (withheld for a reader who may not open the thing). Called by custom.choice_render, so every read door that renders choices renders these too.';

-- ═══ 6 · THE WORDS HELPER, FOR A PICKER OR A CHIP BEFORE ANYTHING IS SAVED ════════════════
create or replace function custom.entity_reference_words(p_organization_id uuid, p_refs jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_out jsonb;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.entity_reference_words');
  if p_refs is null or jsonb_typeof(p_refs) <> 'array' then
    raise exception 'The references to name are a list of {token, id}.'
      using errcode = '22023',
            hint = 'SC-R: pass [{"token":"note","id":"<uuid>"}, …]; each comes back with its label.';
  end if;
  if jsonb_array_length(p_refs) > 500 then
    raise exception 'At most 500 references are named in one call, and this asked for %.', jsonb_array_length(p_refs)
      using errcode = '22023', hint = 'SC-R: ask a page at a time.';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'token', x ->> 'token',
           'id',    x ->> 'id',
           'label', case when (select true from custom.entity_reference_kinds() k where k.token = x ->> 'token')
                         then platform.relation_label(p_organization_id, x ->> 'token', (x ->> 'id')::uuid) end)
           order by o), '[]'::jsonb)
    into v_out
    from jsonb_array_elements(p_refs) with ordinality as a(x, o)
   where jsonb_typeof(x) = 'object'
     and (x ->> 'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  return v_out;
end
$fn$;

comment on function custom.entity_reference_words(uuid, jsonb) is
  'SC-R / P12: the words of each {token, id} for a picker or a chip before anything is saved — the label from platform.relation_label, withheld for a reader who may not open the thing, null for a kind no entity-reference Field may name. At most 500 per call.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers, argument_rules)
values
  ('custom', 'entity_reference_kinds', '', array[]::oid[],
   'It takes no argument and returns the registered record → <token> association types with each kind''s label and category — registry facts every signed-in person may read (platform.entity_types is readable to them already). It writes nothing.',
   'scr_a_field_can_point_at_a_platform_entity.sql', null, true, false,
   jsonb_build_object('version', 1, 'declared_by', 'scr_a_field_can_point_at_a_platform_entity.sql',
     'declared_at', '2026-09-24 lane SC-R', 'arguments', '{}'::jsonb)),
  ('custom', 'entity_reference_words', 'p_organization_id uuid, p_refs jsonb', array['uuid'::regtype, 'jsonb'::regtype]::oid[],
   'p_organization_id is checked by custom.assert_client_may_reach before anything is read. Each {token, id} of p_refs is named only through platform.relation_label, which asks iam.has_access(token, id, viewer) for the caller before reading a title and answers the withheld label otherwise; a kind no entity-reference Field may name gets a null label. It writes nothing.',
   'scr_a_field_can_point_at_a_platform_entity.sql', null, true, false,
   jsonb_build_object('version', 1, 'declared_by', 'scr_a_field_can_point_at_a_platform_entity.sql',
     'declared_at', '2026-09-24 lane SC-R',
     'arguments', jsonb_build_object(
       'p_organization_id', jsonb_build_object('type', 'uuid', 'position', 1, 'entity', 'organization',
         'check', 'this body decides it with custom.assert_client_may_reach(arg1) — the organization wall — a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.',
         'foreign', jsonb_build_object('sqlstate', '42501', 'same_as_invented', true),
         'verified', '2026-09-24 lane SC-R — written with this body'),
       'p_refs', jsonb_build_object('type', 'jsonb', 'position', 2, 'entity', 'entity_reference',
         'check', 'each {token, id} is named only by platform.relation_label, which asks iam.has_access(token, id, viewer) for the caller first; a thing the caller may not open gets platform.relation_withheld_label().',
         'foreign', jsonb_build_object('note', 'a thing the caller may not open and an invented id both answer the withheld label or null — never a title.', 'not_a_leak', true, 'same_as_invented', true),
         'verified', '2026-09-24 lane SC-R — written with this body')))),
  ('custom', '_entity_reference_target_ok', 'p_organization_id uuid, p_token text, p_id uuid', array['uuid'::regtype, 'text'::regtype, 'uuid'::regtype]::oid[],
   'server_only: called only by custom.validate_values inside the store''s own write triggers, to ask whether the writer may point an entity-reference Field at (token, id).',
   'scr_a_field_can_point_at_a_platform_entity.sql',
   'server_only: called only by custom.validate_values inside the store''s own write triggers on custom.record; a client asks the same question by writing the value through custom.record_write / custom.record_update.',
   false, false, null)
on conflict do nothing;

-- ═══ 7 · THE EIGHT BODIES, EACH WITH ITS ONE NEW ARM ═══════════════════════════════════

CREATE OR REPLACE FUNCTION custom.field_kinds()
 RETURNS TABLE(kind text, behavior text, parity boolean, made_of text)
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'pg_catalog'
AS $function$
  select t.parity_type, t.behavior, true, t.made_of
    from custom.parity_field_types() t
  union all
  select * from (values
    ('text',      'text',     false, 'plain text: behaviour text with no format — it carries no parity type, which is exactly what custom.parity_type answers for it'),
    ('long_text', 'text',     false, 'behaviour text with format long and config.multiline, for several lines rather than one'),
    ('number',    'range',    false, 'a plain number: behaviour range with no date kind and neither the currency nor the percent format'),
    ('relation',  'relation', false, 'REL / FLD-11: a relation a person aims themselves — relation_target names a Table of this organization, and it is a BEHAVIOUR, never a parity type of its own'),
    ('signature', 'text',     false, 'VAL-10: behaviour text whose format is signature — the one shape custom.doc_sign accepts, sealed by custom.doc_signature_write and checked by custom.doc_signature_intact'),
    ('entity_reference', 'relation', false, 'SC-R / P12: a relation whose target mode is any (REL-8), restricted by config.allowed_types to the platform kinds it may name (custom.entity_reference_kinds() — agents, notes, web sites, workbooks, datasets, conversations …); each value is {token, id}, the edge a platform.associations row record → <token>. File and Person stay relations to their kernel Tables')
  ) as extra(kind, behavior, parity, made_of);
$function$;

CREATE OR REPLACE FUNCTION custom._field_document_for(p_organization_id uuid, p_table_id uuid, p_spec jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  d        jsonb;
  v_parity text := nullif(p_spec ->> 'parity_type', '');
  v_key    text := nullif(p_spec ->> 'key', '');
  -- ── LIMITS-FIX 2026-09-21: ONE WORD FOR WHAT A PERSON READS ON THE COLUMN. ──────────
  -- A table spec's inline field says `name` (`custom._table_shape_guard` demands it) and
  -- this door said `label`, so the same concept had two words one call apart and a caller
  -- that used the table's word was told "A field needs a name" while holding one. Real-data
  -- crew D hit this on 2026-09-21 declaring a podcast episode pipeline. Both words are read
  -- here; `label` still wins when a caller sends both, so no existing caller changes.
  v_label  text := coalesce(nullif(p_spec ->> 'label', ''), nullif(p_spec ->> 'name', ''));
  v_multi  boolean := coalesce((p_spec ->> 'multi')::boolean, false);
  v_config jsonb := coalesce(p_spec -> 'config', '{}'::jsonb);
  v_rules  jsonb := coalesce(p_spec -> 'rules', '[]'::jsonb);
  v_plain  text := coalesce(nullif(p_spec ->> 'plain', ''), 'text');
  v_alias  text := lower(btrim(coalesce(p_spec ->> 'type', '')));
  -- FIX-10B-F6: the caller said the word `signature`. It is one of the kinds
  -- `custom.field_kinds()` publishes and it is NOT a parity type — it is plain
  -- text wearing the one format `custom.doc_sign` accepts — so it is resolved
  -- here, beside the other words, and carried into the plain-text arm below.
  v_signature boolean := false;
  -- GRID-PRIMITIVES G5: the three column kinds the store fills in itself.
  v_system text := null;
  -- GRID-PRIMITIVES G3: a formula a person TYPED, parsed by the store.
  v_parsed jsonb := null;
  v_relation uuid := null;   -- SEAT-SUITES: the Table a caller's own relation column points at
  -- SC-R / P12, 2026-09-24: a column that points at a PLATFORM thing — an agent, a note, a web
  -- site, a workbook — rather than at a record of one of this organization's Tables.
  v_entity  boolean := false;
  v_allowed jsonb   := null;
  -- LIMITS-FIX 2026-09-21: the same one-word rule for the relation's target. Real-data crew E
  -- reported that no client door could declare a table-to-table relation; the door could, and
  -- has since 2026-09-19 — it only ever answered to `relation_target`, and a caller reaching
  -- for `target_table` got "A column that points at other records is a Person column or a File
  -- column", which describes a different mistake entirely.
  v_target text := coalesce(nullif(p_spec ->> 'relation_target', ''), nullif(p_spec ->> 'target_table', ''));
  v_deps   jsonb := case when jsonb_typeof(p_spec -> 'depends_on') = 'array'
                         then p_spec -> 'depends_on' else '[]'::jsonb end;
begin
  -- ── STORE-T: `type` IS THE WORD EVERY CALLER REACHES FOR, AND IT WAS THROWN AWAY. ──────
  -- Measured on 2026-09-20: `{"type":"number"}` produced a TEXT column and `{"type":"banana"}`
  -- was ACCEPTED, silently, as text. Only `parity_type` and `plain` were ever read, so every
  -- agent, script and other client that said "type" got a text column and was never told.
  -- Now it is read as what it plainly means, and a word that means nothing is refused BY NAME
  -- with the list — nothing is guessed and nothing is silently dropped.
  if v_alias <> '' and v_parity is null and nullif(p_spec ->> 'plain', '') is null then
    if exists (select 1 from custom.parity_field_types() t where t.parity_type = v_alias) then
      v_parity := v_alias;
    elsif v_alias in ('number', 'range', 'integer', 'decimal', 'float') then
      v_plain := 'number';
    elsif v_alias in ('long_text', 'longtext', 'long text', 'paragraph') then
      v_plain := 'long_text';
    elsif v_alias in ('text', 'string') then
      v_plain := 'text';
    elsif v_alias in ('boolean', 'bool', 'checkbox', 'check_box', 'tick', 'tickbox',
                      'yes_no', 'yesno', 'yes/no', 'toggle', 'switch') then
      -- LIMITS-FIX: every word a person, an agent or a spreadsheet reaches for when they
      -- mean a tick box lands on the one type that is one.
      v_parity := 'checkbox';
    elsif v_alias = 'list' then
      v_parity := 'select';
    elsif v_alias in ('signature', 'sign', 'e_signature', 'esignature') then
      -- ── FIX-10B-F6, 2026-09-22: THE E-SIGN HALF OF DOCUMENTS COULD NOT BE REACHED. ──────
      -- `custom.doc_sign` accepts exactly one field — text whose format is `signature` — and
      -- this door would write that format only when a caller sent `format: signature`
      -- alongside a plain text type. No screen sends a format: the add-a-column panel
      -- collects an INTENTION and the store answers the behaviour, the format and the unit.
      -- So the sentence under a rendered document ("Crews needs a signature column - a text
      -- column whose format is signature") named a precondition no screen could meet, and
      -- every sign request, expiring link and sealed hash behind it was unreachable.
      -- VERIFIER-10 F6, measured from the admin seat on Rincon Plumbing's Crews table.
      -- A signature is now a WORD like every other kind, published by
      -- `custom.field_kinds()`, and the panel that offers it sends the word.
      v_plain := 'text';
      v_signature := true;
    elsif v_alias in ('autonumber', 'created_time', 'modified_time', 'auto_number',
                      'created', 'modified', 'last_modified', 'last_modified_time') then
      -- ── GRID-PRIMITIVES G5, 2026-09-22: THE STORE'S OWN STAMPS AS COLUMNS. ──────────────
      -- The older grid has an Autonumber, a Created time and a Last modified time column,
      -- and none of the three is typed: the database assigns the number and the row carries
      -- its own stamps. Here each is a formula Field whose expression is the system node —
      -- fx.autonumber is worked out ONCE, on write, and kept; the two stamps on read — so
      -- every reader that serves a worked-out value serves these with nothing new, and a
      -- hand-typed value is refused exactly as it is for any formula (FLD-9).
      v_parity := 'formula';
      v_system := case when v_alias in ('autonumber', 'auto_number') then 'autonumber'
                       when v_alias in ('created_time', 'created') then 'created_time'
                       else 'modified_time' end;
    elsif v_alias in ('entity_reference', 'entity', 'entity_ref', 'reference', 'platform_reference') then
      -- ── SC-R / P12, 2026-09-24: A RECORD POINTING AT SOMETHING THAT IS NOT A RECORD. ─────
      -- The scope system let a client's column point at its web site, its intake note or the
      -- agent that works it (16 such columns live on the main database), and the store could
      -- not: a relation reached one Table of this organization or the kernel File / Person
      -- Table and nothing else, so the mover had to refuse all sixteen. An entity reference is
      -- a RELATION (FLD-1's closed set of five behaviours holds) whose target mode is `any`
      -- (REL-8), restricted to the kinds it names in `allowed_types` — the scope system's own
      -- word `allowed_reference_types` is read too. Each kind must be one
      -- custom.entity_reference_kinds() lists; custom._field_shape_guard says which is not.
      v_entity := true;
      v_allowed := coalesce(
        case when jsonb_typeof(p_spec -> 'allowed_types') = 'array' then p_spec -> 'allowed_types' end,
        case when jsonb_typeof(v_config -> 'allowed_types') = 'array' then v_config -> 'allowed_types' end,
        case when jsonb_typeof(p_spec -> 'allowed_reference_types') = 'array' then p_spec -> 'allowed_reference_types' end,
        case when jsonb_typeof(p_spec -> 'allowed_types') = 'string'
             then jsonb_build_array(p_spec -> 'allowed_types') end);
      select coalesce(jsonb_agg(w order by first_at), '[]'::jsonb) into v_allowed
        from (select lower(btrim(x #>> '{}')) as w, min(o) as first_at
                from jsonb_array_elements(coalesce(v_allowed, '[]'::jsonb)) with ordinality as a(x, o)
               where jsonb_typeof(x) = 'string' and btrim(x #>> '{}') <> ''
               group by 1) s;
      if jsonb_array_length(v_allowed) = 0 then
        raise exception 'A column that points at things on the platform has to say which kinds of thing, and "%" names none.', coalesce(v_label, v_key, 'this column')
          using errcode = '23514',
                hint = 'SC-R / P12: send allowed_types, a list such as ["note", "web_site"]; select token, label from custom.entity_reference_kinds() lists every kind. A file is a File column and a person a Person column. Nothing was created.';
      end if;
    elsif v_alias = 'relation' then
      -- ── SEAT-SUITES, 2026-09-19: A COLUMN POINTING AT ANOTHER OF YOUR OWN TABLES COULD
      -- NOT BE MADE AT ALL. ────────────────────────────────────────────────────────────
      -- `member` points at the kernel Person Table and `attachment` at the kernel File
      -- Table, and those were the ONLY two relations this door could build. A person with
      -- an Invoice Table and a Line Table could not give Invoice a Lines column through any
      -- door, although the store holds exactly that shape already: the parity-floor
      -- fixture's own `lines` field is a plain relation at a custom Table, and every guard,
      -- every edge, every rollup and `custom.record_relation_edges` handle it. Only the
      -- door refused, and it refused EVEN WHEN THE CALLER SAID WHICH TABLE.
      -- THE RULE: a caller that NAMES its target gets the relation it asked for; a caller
      -- that names nothing still gets the old sentence, because a relation with no target
      -- is the thing that sentence is actually about.
      if v_target is null then
        raise exception 'A column that points at other records is a Person column or a File column, and "%" does not say which.', v_alias
          using errcode = '23514',
                hint = 'FLD-11: say member for a person or attachment for a file, or name the Table this column points at in relation_target. Nothing was created.';
      end if;
      v_relation := v_target::uuid;
      -- ── RELATION-DECLARE, 2026-09-20: A COLUMN COULD POINT AT SOMETHING THAT IS NOT A
      -- TABLE, AND NOBODY WAS TOLD. ────────────────────────────────────────────────────────
      -- This arm took the caller's uuid and wrote it down unread. A uuid naming NOTHING at
      -- all was accepted; a uuid naming a RECORD instead of a Table was accepted. The column
      -- then points at a thing with no records to pick from and no title field to make a chip
      -- out of, and every reader downstream has to guess what that means. Measured from the
      -- seat `authenticated` on the main database, 2026-09-20. (A Table in ANOTHER
      -- organization was already refused by custom._field_shape_guard; that stands.)
      if not exists (select 1 from custom.record t
                      where t.id = v_relation
                        and t.deleted_at is null
                        and t.table_id = custom.table_kernel_id()
                        and (t.organization_id = p_organization_id or t.data_class = 'kernel')) then
        raise exception 'A column that points at other records has to point at a TABLE, and "%" is not one of this organization''s tables.', v_relation
          using errcode = '23503',
                hint = 'FLD-11 / REL-8: relation_target names the Table whose records this column may point at - open the Table you meant and use its id. Nothing was created.';
      end if;
    else
      raise exception 'There is no kind of column called "%".', p_spec ->> 'type'
        using errcode = '23514',
              hint = format('FLD-11: %s. Nothing was created.', custom._field_kinds_sentence());
    end if;
  end if;
  if v_label is null then
    raise exception 'A field needs a name - it is what a person reads on the column.'
      using errcode = '23514', hint = 'Give the field a name (a table spec''s own word) or a label - they mean the same thing here. Everything else this door can work out.';
  end if;
  if v_key is null then
    -- The panel derives the key from the label; a caller that did not is not
    -- refused for a machine token it never meant to think about.
    v_key := regexp_replace(lower(btrim(v_label)), '[^a-z0-9]+', '_', 'g');
    v_key := regexp_replace(v_key, '^_+|_+$', '', 'g');
    if v_key !~ '^[a-z]' then v_key := 'f_' || v_key; end if;
    v_key := left(v_key, 48);
  end if;
  if v_key !~ '^[a-z][a-z0-9_]*$' then
    raise exception 'A field''s key is made of lower-case letters, digits and underscores, and this one is "%".', v_key
      using errcode = '23514', hint = 'FLD-13: leave the key out and the store makes one from the name.';
  end if;

  -- THE FLOOR EVERY FIELD STANDS ON. Every key the guards demand is written,
  -- always, so no caller can omit one by accident.
  d := jsonb_build_object(
    'key',                  v_key,
    'label',                v_label,
    'multi',                v_multi,
    'dated',                coalesce((p_spec ->> 'dated')::boolean, false),
    'required',             coalesce((p_spec ->> 'required')::boolean, false),
    'sort',                 coalesce((p_spec ->> 'sort')::numeric, 100),
    'source',               coalesce(nullif(p_spec ->> 'source', ''), 'manual'),
    'source_config',        coalesce(p_spec -> 'source_config', '{}'::jsonb),
    'sensitivity',          coalesce(nullif(p_spec ->> 'sensitivity', ''), 'internal'),
    'context_policy',       coalesce(nullif(p_spec ->> 'context_policy', ''), 'include'),
    'applies_to_types',     coalesce(p_spec -> 'applies_to_types', '[]'::jsonb),
    -- STORE-T / T7: THE CALLER'S OWN DEPENDENCY LIST, KEPT. It used to be hard-coded to the
    -- empty list here, so NO client-made formula ever had dependencies, `custom.field_dependants`
    -- could never name one, and REC-18's refusal — "this field is used by …" — could not fire for
    -- anything a person or an agent built. That is the third half of T7.
    'depends_on',           v_deps,
    'entity_definition_id', p_table_id);

  -- SEAT-SUITES 2026-09-19: two properties `custom.field` has always projected and this door
  -- silently dropped, so a person could read them and never set them. They are carried only
  -- when the caller names them, so no existing field's document changes shape.
  if nullif(p_spec ->> 'review_interval_days', '') is not null then
    d := d || jsonb_build_object('review_interval_days', (p_spec ->> 'review_interval_days')::integer);
  end if;
  if p_spec ? 'default' then
    d := d || jsonb_build_object('default', p_spec -> 'default');
  end if;

  -- SC-R / P12: THE ENTITY REFERENCE (see its arm above). A relation with no Table target: its
  -- target mode is `any` and `allowed_types` says which platform kinds it may name. No display
  -- spec — its words are each thing's own title, read by platform.relation_label.
  if v_entity then
    d := d || jsonb_build_object(
      'type',             'relation',
      'relation_max',     coalesce((p_spec ->> 'relation_max')::integer, case when v_multi then 25 else 1 end),
      'on_target_delete', case when nullif(p_spec ->> 'on_target_delete', '') in ('restrict','set_null','cascade')
                               then p_spec ->> 'on_target_delete' else 'set_null' end,
      'rules',            v_rules,
      'config',           (v_config - 'allowed_types' - 'target_tables')
                          || jsonb_build_object('target_mode', 'any', 'allowed_types', v_allowed));
    return custom._with_display_format(d, p_spec - 'display');
  end if;

  -- THE RELATION A CALLER NAMED ITSELF (see the `relation` arm above). It carries no parity
  -- type — `custom.parity_type` answers nothing for it, exactly as it answers nothing for
  -- plain text and plain numbers — and every relation property is the caller's to declare.
  if v_relation is not null then
    d := d || jsonb_build_object(
      'type',             'relation',
      'relation_target',  v_relation,
      'relation_max',     coalesce((p_spec ->> 'relation_max')::integer, case when v_multi then 25 else 1 end),
      'on_target_delete', case when nullif(p_spec ->> 'on_target_delete', '') in ('restrict','set_null','cascade')
                               then p_spec ->> 'on_target_delete' else 'set_null' end,
      'rules',            v_rules,
      'config',           v_config);
    if nullif(p_spec ->> 'inverse_key', '') is not null then
      d := d || jsonb_build_object('inverse_key', p_spec ->> 'inverse_key');
    end if;
    return custom._with_display_format(custom._with_display(p_organization_id, d, p_spec - 'display_format'), p_spec);
  end if;

  if v_parity is null then
    -- The three behaviours a person picks that are NOT one of the parity types:
    -- plain text, a long text and a plain number. They carry no parity type,
    -- which is exactly what `custom.parity_type` answers for them.
    if v_plain = 'number' then
      d := d || jsonb_build_object('type', 'range', 'config', v_config, 'rules', v_rules);
      if nullif(p_spec ->> 'unit', '') is not null then
        d := d || jsonb_build_object('unit', p_spec ->> 'unit');
      end if;
    elsif v_plain = 'long_text' then
      d := d || jsonb_build_object('type', 'text', 'format', 'long',
                                   'config', v_config || jsonb_build_object('multiline', true),
                                   'rules', v_rules);
    else
      d := d || jsonb_build_object('type', 'text', 'config', v_config, 'rules', v_rules);
      -- ── SEAT-SUITES, 2026-09-19: A SIGNATURE FIELD COULD NOT BE DECLARED BY ANYBODY. ────
      -- `custom.doc_signature_field_ok` accepts exactly one shape — a text field whose
      -- `format` is `signature` — and `custom.doc_sign` refuses every other field by name.
      -- No door wrote that `format`: this branch dropped it, and the parity types
      -- have no signature among them. So `custom.doc_sign`, which IS granted to
      -- `authenticated`, could never be used by a signed-in person at all: the one field it
      -- accepts had no way to exist outside an INSERT straight into `custom.record`, which
      -- needs a table privilege nobody has. Measured from the seat on the main database on
      -- 2026-09-19 while converting `scripts/campaign-tests/w3_doc_c43.sql`.
      -- A plain text field may now SAY it holds a signature, and nothing else changes: a
      -- field that does not ask for it is written exactly as before.
      if v_signature or nullif(p_spec ->> 'format', '') = 'signature' then
        d := d || jsonb_build_object('format', 'signature');
      end if;
    end if;
    return custom._with_display_format(custom._with_display(p_organization_id, d, p_spec - 'display_format'), p_spec);
  end if;

  if not exists (select 1 from custom.parity_field_types() t where t.parity_type = v_parity) then
    raise exception 'There is no field type called "%" in this system.', v_parity
      using errcode = '23514',
            hint = format('FLD-11: %s.', custom._parity_types_sentence());
  end if;

  d := d || jsonb_build_object('parity_type', v_parity);

  case v_parity
    -- ── the two list types ───────────────────────────────────────────────────
    when 'select', 'multi_select' then
      d := d || jsonb_build_object(
        'type',   'list',
        'multi',  v_parity = 'multi_select',
        'rules',  v_rules,
        'config', v_config || jsonb_build_object(
                    'options_table_id', coalesce(nullif(p_spec ->> 'options_table_id', ''),
                                                nullif(v_config ->> 'options_table_id', ''))));

    -- ── the two relation types a person names by what they hold ─────────────
    when 'member' then
      d := d || jsonb_build_object(
        'type',             'relation',
        'relation_target',  custom.person_kernel_id(),
        'relation_max',     coalesce((p_spec ->> 'relation_max')::integer, case when v_multi then 25 else 1 end),
        -- STORE-T / T7 (REL-2): what happens to this record when the thing it points at is
        -- deleted is the CALLER'S to declare — restrict, set_null or cascade. It was hard-coded
        -- to set_null, so no client could ever declare the `restrict` T7 asks for and every
        -- delete of a pointed-at record was accepted. set_null stays the default.
        'on_target_delete', case when nullif(p_spec ->> 'on_target_delete', '') in ('restrict','set_null','cascade')
                                 then p_spec ->> 'on_target_delete' else 'set_null' end,
        'rules',            v_rules,
        'config',           v_config);
    when 'attachment' then
      d := d || jsonb_build_object(
        'type',             'relation',
        'relation_target',  custom.file_kernel_id(),
        'relation_max',     coalesce((p_spec ->> 'relation_max')::integer, case when v_multi then 25 else 1 end),
        -- REC-31: removing the file removes the attachment, never the record — so `cascade` is
        -- the one answer this field may not give, and custom._field_type_parity_guard refuses it
        -- by name. restrict is a caller's to choose.
        'on_target_delete', case when nullif(p_spec ->> 'on_target_delete', '') in ('restrict','set_null','cascade')
                                 then p_spec ->> 'on_target_delete' else 'set_null' end,
        'rules',            v_rules,
        'config',           v_config);

    -- ── the three worked-out types ──────────────────────────────────────────
    when 'lookup' then
      d := d || jsonb_build_object(
        'type',       'formula',
        'source',     'formula',
        'compute_on', coalesce(nullif(p_spec ->> 'compute_on', ''), 'read'),
        'rules',      v_rules,
        'config',     v_config || jsonb_strip_nulls(jsonb_build_object(
                        'via',  nullif(p_spec ->> 'via', ''),
                        'pick', nullif(p_spec ->> 'pick', ''))));
    when 'rollup' then
      d := d || jsonb_build_object(
        'type',       'formula',
        'source',     'formula',
        -- FLD-11: a rollup that stamped itself at write time would be stale the
        -- moment a contained record changed, and the store refuses that — so the
        -- only answer this door can give is the right one.
        'compute_on', 'read',
        'rules',      v_rules,
        'config',     v_config || jsonb_strip_nulls(jsonb_build_object(
                        'via', nullif(p_spec ->> 'via', ''),
                        'agg', nullif(p_spec ->> 'agg', ''),
                        'of',  nullif(p_spec ->> 'of', ''))));
    when 'formula' then
      -- ── GRID-PRIMITIVES G3 / G5, 2026-09-22. ────────────────────────────────────────────
      -- A system kind carries its system expression and says which it is; nothing else it
      -- was sent can change what it works out. A formula a person TYPED (`formula_text`, the
      -- older grid's language) is parsed here by custom.formula_parse, against this Table's
      -- own columns; a mistake is refused in the parser's own words with where it is, and
      -- the text is kept beside the expression so the person edits text and never JSON.
      if v_system is not null then
        v_config := (v_config - 'formula_text') || jsonb_build_object('system', v_system);
        d := d || jsonb_build_object(
          'type',       'formula',
          'source',     'formula',
          'compute_on', case when v_system = 'autonumber' then 'write' else 'read' end,
          'rules',      v_rules,
          'config',     v_config || jsonb_build_object('expr', jsonb_build_object('op', 'fx.' || v_system)));
        if coalesce(jsonb_typeof(p_spec -> 'display_format'), 'null') = 'null' then
          p_spec := p_spec || jsonb_build_object('display_format', jsonb_build_object('id', v_system));
        end if;
      else
        if nullif(btrim(coalesce(p_spec ->> 'formula_text', '')), '') is not null then
          v_parsed := custom.formula_parse(p_organization_id, p_table_id, p_spec ->> 'formula_text');
          if not coalesce((v_parsed ->> 'ok')::boolean, false) then
            raise exception 'The formula for "%" cannot be worked out: % (at character %).',
                            v_label, v_parsed ->> 'error', coalesce((v_parsed ->> 'position')::integer, 0) + 1
              using errcode = '23514',
                    hint = 'GRID-PRIMITIVES G3: a formula names columns in braces, like {Visit fee} - {Deposit taken}; select signature, says from custom.formula_node_kinds() lists every function. Nothing was written.';
          end if;
          v_config := v_config || jsonb_build_object('formula_text', p_spec ->> 'formula_text',
                                                     'expr', v_parsed -> 'expr');
        elsif p_spec ? 'expr' then
          -- An expression written by hand no longer matches any text it came with.
          v_config := v_config - 'formula_text';
        end if;
        d := d || jsonb_build_object(
          'type',       'formula',
          'source',     'formula',
          'compute_on', coalesce(nullif(p_spec ->> 'compute_on', ''), 'read'),
          'rules',      v_rules,
          'config',     v_config || jsonb_build_object('expr',
                          coalesce(v_parsed -> 'expr', p_spec -> 'expr', v_config -> 'expr')));
      end if;

    -- ── the three formatted texts. The format says how to SHOW it; the
    --    pattern Rule is what makes it enforceable (FLD-3 / FLD-11), so the
    --    door writes the Rule rather than leaving a label on an empty box.
    when 'url' then
      d := d || jsonb_build_object('type', 'text', 'format', 'url', 'config', v_config,
        'rules', case when exists (select 1 from jsonb_array_elements(v_rules) r where r ->> 'kind' = 'pattern')
                      then v_rules
                      else v_rules || jsonb_build_array(jsonb_build_object(
                             'kind', 'pattern', 'value', '^https?://[^\s]+$')) end);
    when 'email' then
      d := d || jsonb_build_object('type', 'text', 'format', 'email', 'config', v_config,
        'rules', case when exists (select 1 from jsonb_array_elements(v_rules) r where r ->> 'kind' = 'pattern')
                      then v_rules
                      else v_rules || jsonb_build_array(jsonb_build_object(
                             'kind', 'pattern', 'value', '^[^@\s]+@[^@\s]+\.[^@\s]+$')) end);
    when 'phone' then
      d := d || jsonb_build_object('type', 'text', 'format', 'phone', 'config', v_config,
        'rules', case when exists (select 1 from jsonb_array_elements(v_rules) r where r ->> 'kind' = 'pattern')
                      then v_rules
                      else v_rules || jsonb_build_array(jsonb_build_object(
                             'kind', 'pattern', 'value', custom.phone_pattern())) end);

    -- ── the three numbers and dates ─────────────────────────────────────────
    when 'currency' then
      d := d || jsonb_build_object(
        'type', 'range', 'format', 'currency',
        'unit', coalesce(nullif(p_spec ->> 'unit', ''), '$'),
        'config', v_config, 'rules', v_rules);
    when 'percent' then
      d := d || jsonb_build_object(
        'type', 'range', 'format', 'percent', 'unit', '%', 'config', v_config,
        -- FLD-3 / FLD-11: a percent field that takes -40 is a percent in name only.
        'rules', case when exists (select 1 from jsonb_array_elements(v_rules) r
                                    where r ->> 'kind' in ('min', 'max'))
                      then v_rules
                      else v_rules || jsonb_build_array(
                             jsonb_build_object('kind', 'min', 'value', 0),
                             jsonb_build_object('kind', 'max', 'value', 100)) end);
    -- ── the tick box ────────────────────────────────────────────────────────
    -- No format, no unit, no options Table and no Rule: what it holds IS the
    -- behaviour. A default is carried when the caller named one (above), which is
    -- how a column can start life ticked.
    when 'checkbox' then
      d := d || jsonb_build_object('type', 'boolean', 'config', v_config, 'rules', v_rules);

    when 'datetime' then
      d := d || jsonb_build_object(
        'type', 'range', 'rules', v_rules,
        'config', v_config || jsonb_build_object(
                    'kind', case when coalesce(p_spec ->> 'kind', v_config ->> 'kind') = 'datetime'
                                 then 'datetime' else 'date' end));
      if coalesce(p_spec ->> 'kind', v_config ->> 'kind') = 'datetime' then
        d := d || jsonb_build_object('format', 'datetime');
      end if;
    else
      raise exception 'The field type "%" is known but this store does not yet know what it is made of.', v_parity
        using errcode = '23514',
              hint = 'custom._field_document_for has an arm per parity type; this one is missing. Nothing was written.';
  end case;

  return custom._with_display_format(custom._with_display(p_organization_id, d, p_spec - 'display_format'), p_spec);
end
$function$;

CREATE OR REPLACE FUNCTION custom._field_shape_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_names_bad text;   -- SC-R: the kinds an entity reference names that no record may point at
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
  v_example   text;
begin
  -- THE DOOR. One call to the ONE predicate (`custom.assert_store_door`), which
  -- judges `custom.caller_role()` - the identity the caller actually held - and not
  -- `current_user`, which a SECURITY DEFINER door has already rewritten to itself.
  -- The switch never removes a check: everything below runs exactly as before.
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

  -- Only field definitions. A `kernel` row is the kernel Table `Field` itself (REC-27:
  -- defined in code, not data) and is exempt, exactly as W1-TABLE exempts the kernel Tables.
  if new.table_id is distinct from custom.field_kernel_id() or new.data_class = 'kernel' then
    return new;
  end if;

  v_label := nullif(d ->> 'label', '');
  v_key   := d ->> 'key';
  if v_key is null or v_key !~ '^[a-z][a-z0-9_]*$' then
    raise exception 'a field needs a key made of lower-case letters, digits and underscores, and this one says %',
                    custom.said(v_key, 'nothing')
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
            hint = 'FLD-1: one of list, range, text, relation, formula, boolean. What looks like a second behavior is a modifier (FLD-2) or a Rule (FLD-3).';
  end if;
  v_type := d ->> 'type';
  -- LIMITS-FIX 2026-09-21: `boolean` joins the closed set. It is a BEHAVIOUR and not a
  -- format on something else, because a tick box has THREE answers — ticked, unticked, and
  -- nobody has said — and only a behaviour of its own can hold a real boolean while an
  -- absent key keeps meaning "never asked" (VAL-2).
  if v_type is null or v_type not in ('list', 'range', 'text', 'relation', 'formula', 'boolean') then
    raise exception 'the field % says its behavior is %, and a field behaves as a list, a range, text, a relation, a formula or a tick box',
                    v_label, custom.said(v_type, 'nothing')
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
    -- STORE-T / B1: `unique` joins the set. It is not judged here — a shape guard sees one
    -- row and uniqueness is a statement about the OTHERS — it is carried out by
    -- custom._unique_rule_holds, which is a trigger and can take the lock that makes it true
    -- under concurrency. A kind this store cannot execute is still refused by name.
    if v_kind is null or v_kind not in ('min', 'max', 'pattern', 'length', 'equals_field', 'differs_from_field', 'unique') then
      raise exception 'the field % carries a rule of kind %, which this validator cannot execute',
                      v_label, custom.said(v_kind, 'nothing')
        using errcode = '23514',
              hint = 'FLD-3: an attached validation Rule declares its kind. The general Rule object, its versions and its four uses are W1-RULE''s (REC-15, REC-17, REC-19).';
    end if;

    -- ── STORE-RULE-GAPS (1), 2026-09-23: A PATTERN SAYS HOW TO WRITE IT. ─────────────────
    -- The older grid's `patternHint`: "949-555-0142" beside a phone pattern, so a person who is
    -- refused is shown the shape rather than told only that theirs is wrong. It belongs to the
    -- pattern Rule (it is an example OF that pattern), it is judged here once, and an example
    -- that its own pattern would refuse is refused - a hint that is wrong is worse than none.
    if v_rule ? 'example' and jsonb_typeof(v_rule -> 'example') <> 'null' then
      if v_kind <> 'pattern' then
        raise exception 'the field % shows an example on its % rule, and only a pattern rule has an example to show',
                        v_label, v_kind
          using errcode = '23514',
                hint = 'FLD-3: example belongs to a pattern Rule - {"kind":"pattern","value":"<pattern>","example":"<how a person writes it>"}.';
      end if;
      v_example := case when jsonb_typeof(v_rule -> 'example') = 'string' then btrim(v_rule ->> 'example') end;
      if v_example is null or v_example = '' then
        raise exception 'the field % gives an example of how to write it, and an example is the words a person would type',
                        v_label
          using errcode = '23514', hint = 'FLD-3: example is a short piece of text, like 949-555-0142.';
      end if;
      if length(v_example) > 120 then
        raise exception 'the field % gives an example that is % characters long, and an example is at most 120',
                        v_label, length(v_example)
          using errcode = '23514', hint = 'FLD-3: an example shows the shape of one value, not a paragraph about it.';
      end if;
      if v_example !~ (v_rule ->> 'value') then
        raise exception 'the field % shows "%" as the way to write it, and its own pattern would refuse that',
                        v_label, v_example
          using errcode = '23514',
                hint = 'FLD-3: the example has to pass the pattern it illustrates. Change the example, or the pattern.';
      end if;
    end if;

    -- ── STORE-RULE-GAPS (3), 2026-09-23: A LENGTH HAS A SHORTEST AS WELL AS A LONGEST. ──
    -- The older grid's `minLength`. `value` stays the longest (every stored rule already means
    -- that), `min` is the shortest, and a length rule says at least one of the two. Both are
    -- whole numbers of characters; a shortest past the longest could never be met.
    if v_rule ? 'min' and jsonb_typeof(v_rule -> 'min') <> 'null' and v_kind <> 'length' then
      raise exception 'the field % gives its % rule a shortest length, and only a length rule has one',
                      v_label, v_kind
        using errcode = '23514',
              hint = 'FLD-3: {"kind":"length","min":<shortest>,"value":<longest>} - min is the fewest characters, value the most.';
    end if;
    if v_kind = 'length' then
      if coalesce(v_rule ->> 'value', '') = '' and coalesce(v_rule ->> 'min', '') = '' then
        raise exception 'the field % has a length rule that says neither how short nor how long a value may be',
                        v_label
          using errcode = '23514',
                hint = 'FLD-3: a length rule carries min (the fewest characters), value (the most), or both.';
      end if;
      if coalesce(v_rule ->> 'value', '') <> '' and (v_rule ->> 'value') !~ '^[0-9]+$' then
        raise exception 'the field % says a value may be at most % characters long, and that is not a whole number',
                        v_label, v_rule ->> 'value'
          using errcode = '23514', hint = 'FLD-3: value is the most characters, as a whole number.';
      end if;
      if coalesce(v_rule ->> 'min', '') <> '' and (v_rule ->> 'min') !~ '^[0-9]+$' then
        raise exception 'the field % says a value has to be at least % characters long, and that is not a whole number',
                        v_label, v_rule ->> 'min'
          using errcode = '23514', hint = 'FLD-3: min is the fewest characters, as a whole number.';
      end if;
      if coalesce(v_rule ->> 'value', '') <> '' and coalesce(v_rule ->> 'min', '') <> ''
         and (v_rule ->> 'min')::bigint > (v_rule ->> 'value')::bigint then
        raise exception 'the field % has to be at least % characters and at most %, and nothing is both',
                        v_label, v_rule ->> 'min', v_rule ->> 'value'
          using errcode = '23514', hint = 'FLD-3: the shortest length cannot be more than the longest.';
      end if;
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
                    v_label, custom.said(v_source, 'nothing')
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

  -- ── STORE-RULE-GAPS (2), 2026-09-23: A CHOICE LIST MAY TAKE OTHER VALUES. ───────────────
  -- The older grid's `allowOther`, as the column's own setting: when it is on, a value that is
  -- none of the choices is ADDED to the list as it was typed (custom._resolve_choice_words)
  -- instead of refused. Absent means off, which is what every column declared before today
  -- means. It is a list's setting and nothing else's.
  if d -> 'config' ? 'allow_other' and jsonb_typeof(d -> 'config' -> 'allow_other') <> 'null' then
    if jsonb_typeof(d -> 'config' -> 'allow_other') <> 'boolean' then
      raise exception 'the field % has to say whether it takes values that are not one of its choices as yes or no, and it says %',
                      v_label, d -> 'config' ->> 'allow_other'
        using errcode = '23514', hint = 'FLD-5: allow_other is true or false.';
    end if;
    if v_type <> 'list' then
      raise exception 'the field % is not a choice list, so there is no list for other values to join', v_label
        using errcode = '23514', hint = 'FLD-5: allow_other belongs to a list field.';
    end if;
  end if;

  -- FLD-12 / FLD-13: the relation properties, and they belong to a relation.
  if v_type = 'relation' then
    -- SC-R / P12: an ENTITY REFERENCE says what it points at with config.allowed_types — the
    -- platform kinds it may name — and target mode `any` (REL-8), instead of one Table. Every
    -- kind it names is one custom.entity_reference_kinds() lists, and it names no Table too.
    if jsonb_typeof(d -> 'config' -> 'allowed_types') = 'array' then
      if jsonb_array_length(d -> 'config' -> 'allowed_types') = 0 then
        raise exception 'the field % points at things on the platform and names no kind of thing', v_label
          using errcode = '23514', hint = 'SC-R / P12: config.allowed_types lists the kinds, from custom.entity_reference_kinds().';
      end if;
      if coalesce(d -> 'config' ->> 'target_mode', '') <> 'any' then
        raise exception 'the field % points at things on the platform, so its target mode is any', v_label
          using errcode = '23514', hint = 'SC-R / P12 / REL-8: an entity reference is polymorphic; config.allowed_types is what restricts it.';
      end if;
      if nullif(d ->> 'relation_target', '') is not null then
        raise exception 'the field % points at things on the platform, so it names no Table as well', v_label
          using errcode = '23514', hint = 'SC-R / P12: a column points at the records of a Table (relation_target) or at platform things (config.allowed_types), never both.';
      end if;
      select string_agg(x #>> '{}', ', ' order by x #>> '{}') into v_names_bad
        from jsonb_array_elements(d -> 'config' -> 'allowed_types') x
       where jsonb_typeof(x) <> 'string'
          or not exists (select 1 from custom.entity_reference_kinds() k where k.token = x #>> '{}');
      if v_names_bad is not null then
        raise exception 'the field % points at %, and a record cannot point at that kind of thing', v_label, v_names_bad
          using errcode = '23514',
                hint = case when v_names_bad ~ '(^|, )(file)(,|$)'
                            then 'SC-R / P12: a file is a File column (an attachment — a relation to the kernel File Table), not an entity reference. The kinds are custom.entity_reference_kinds().'
                            when v_names_bad ~ '(^|, )(user|person|user_profile)(,|$)'
                            then 'SC-R / P12: a person is a Person column (a relation to the kernel Person Table), not an entity reference. The kinds are custom.entity_reference_kinds().'
                            else 'SC-R / P12: the kinds a record may point at are custom.entity_reference_kinds(). Nothing was written.' end;
      end if;
    elsif nullif(d ->> 'relation_target', '') is null then
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
                    v_label, custom.said(d ->> 'sensitivity', 'nothing')
      using errcode = '23514', hint = 'FLD-12: sensitivity is public, internal, confidential or restricted.';
  end if;
  if coalesce(d ->> 'context_policy', '') not in ('include', 'summarize', 'exclude', 'on_request') then
    raise exception 'the field % has to say whether an agent may see its values, and it says %',
                    v_label, custom.said(d ->> 'context_policy', 'nothing')
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
        if v_field is null
           or custom.choice_key_of(v_field, v_one #>> '{}') is null then
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

CREATE OR REPLACE FUNCTION custom._relation_associations_stmt_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_named boolean := false;
begin
  if nullif(current_setting('app.actor_system', true), '') is null
     and coalesce(platform.declared_actor_tier(), platform.actor_tier()) in ('ai', 'code') then
    perform set_config('app.actor_system', 'custom.relations', true);
    v_named := true;
  end if;

  -- WRITE what it declares now, WITH THE FIELD ON IT. `platform.enforce_relation_edge` is
  -- what then holds REL-5, REL-7, REL-8 and REL-12 over it.
  insert into platform.associations
    (source_type, source_id, target_type, target_id, role, organization_id,
     relation_field_id, "position")
  select 'record', n.id, 'record', e.target_id, e.edge_role, n.organization_id,
         e.field_id, e.ord
    from new_rows n
    cross join lateral custom.record_relation_edges(n.organization_id, n.id, n.table_id,
                                                    n.data_class, n.data, n.deleted_at) e
   order by n.id
  on conflict (source_type, source_id, target_type, target_id, role) do update
     set relation_field_id = excluded.relation_field_id,
         "position"        = excluded."position",
         deleted_at        = null,
         -- The revive the separate UPDATE used to do, on exactly the rows it used to touch.
         deleted_via_type  = case when associations.deleted_at is not null
                                  then null else associations.deleted_via_type end,
         deleted_via_id    = case when associations.deleted_at is not null
                                  then null else associations.deleted_via_id end;

  -- ── SC-R / P12: THE ENTITY EDGES a new record's document implies, beside the record ones.
  insert into platform.associations
    (source_type, source_id, target_type, target_id, role, organization_id,
     relation_field_id, "position")
  select 'record', n.id, e.target_type, e.target_id, e.edge_role, n.organization_id,
         e.field_id, e.ord
    from new_rows n
    cross join lateral custom.record_entity_edges(n.organization_id, n.id, n.table_id,
                                                  n.data_class, n.data, n.deleted_at) e
   order by n.id
  on conflict (source_type, source_id, target_type, target_id, role) do update
     set relation_field_id = excluded.relation_field_id,
         "position"        = excluded."position",
         deleted_at        = null,
         deleted_via_type  = case when associations.deleted_at is not null
                                  then null else associations.deleted_via_type end,
         deleted_via_id    = case when associations.deleted_at is not null
                                  then null else associations.deleted_via_id end;

  if v_named then
    perform set_config('app.actor_system', '', true);
  end if;
  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION custom._relation_associations_stmt_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_named boolean := false;
begin
  if nullif(current_setting('app.actor_system', true), '') is null
     and coalesce(platform.declared_actor_tier(), platform.actor_tier()) in ('ai', 'code') then
    perform set_config('app.actor_system', 'custom.relations', true);
    v_named := true;
  end if;

  update platform.associations a
     set deleted_at = now()
    from new_rows n
    join old_rows o on o.organization_id = n.organization_id and o.id = n.id
   where not (o.data       is not distinct from n.data
              and o.data_class is not distinct from n.data_class
              and o.table_id   is not distinct from n.table_id
              and o.deleted_at is not distinct from n.deleted_at)
     and a.deleted_at is null
     and a.source_type = 'record'
     and a.source_id = o.id
     and a.relation_field_id is not null
     and (a.target_id, a.role) in (
           select e.target_id, e.edge_role
             from custom.record_relation_edges(o.organization_id, o.id, o.table_id,
                                               o.data_class, o.data, o.deleted_at) e)
     and (a.target_id, a.role) not in (
           select e.target_id, e.edge_role
             from custom.record_relation_edges(n.organization_id, n.id, n.table_id,
                                               n.data_class, n.data, n.deleted_at) e);

  update platform.associations a
     set deleted_at        = null,
         deleted_via_type  = null,
         deleted_via_id    = null,
         relation_field_id = e.field_id,
         "position"        = e.ord
    from new_rows n
    join old_rows o on o.organization_id = n.organization_id and o.id = n.id
    cross join lateral custom.record_relation_edges(n.organization_id, n.id, n.table_id,
                                                    n.data_class, n.data, n.deleted_at) e
   where not (o.data       is not distinct from n.data
              and o.data_class is not distinct from n.data_class
              and o.table_id   is not distinct from n.table_id
              and o.deleted_at is not distinct from n.deleted_at)
     and a.deleted_at is not null
     and a.source_type = 'record'
     and a.source_id = n.id
     and a.target_id = e.target_id
     and a.role = e.edge_role;

  insert into platform.associations
    (source_type, source_id, target_type, target_id, role, organization_id,
     relation_field_id, "position")
  select 'record', n.id, 'record', e.target_id, e.edge_role, n.organization_id,
         e.field_id, e.ord
    from new_rows n
    join old_rows o on o.organization_id = n.organization_id and o.id = n.id
    cross join lateral custom.record_relation_edges(n.organization_id, n.id, n.table_id,
                                                    n.data_class, n.data, n.deleted_at) e
   where not (o.data       is not distinct from n.data
              and o.data_class is not distinct from n.data_class
              and o.table_id   is not distinct from n.table_id
              and o.deleted_at is not distinct from n.deleted_at)
   order by n.id
  on conflict (source_type, source_id, target_type, target_id, role) do update
     set relation_field_id = excluded.relation_field_id,
         "position"        = excluded."position",
         deleted_at        = null;

  -- ── SC-R / P12: THE ENTITY EDGES — withdraw, revive, write — for record → <platform thing>.
  update platform.associations a
     set deleted_at = now()
    from new_rows n
    join old_rows o on o.organization_id = n.organization_id and o.id = n.id
   where not (o.data       is not distinct from n.data
              and o.data_class is not distinct from n.data_class
              and o.table_id   is not distinct from n.table_id
              and o.deleted_at is not distinct from n.deleted_at)
     and a.deleted_at is null
     and a.source_type = 'record'
     and a.source_id = o.id
     and a.target_type <> 'record'
     and a.relation_field_id is not null
     and (a.target_type, a.target_id, a.role) in (
           select e.target_type, e.target_id, e.edge_role
             from custom.record_entity_edges(o.organization_id, o.id, o.table_id,
                                             o.data_class, o.data, o.deleted_at) e)
     and (a.target_type, a.target_id, a.role) not in (
           select e.target_type, e.target_id, e.edge_role
             from custom.record_entity_edges(n.organization_id, n.id, n.table_id,
                                             n.data_class, n.data, n.deleted_at) e);

  update platform.associations a
     set deleted_at        = null,
         deleted_via_type  = null,
         deleted_via_id    = null,
         relation_field_id = e.field_id,
         "position"        = e.ord
    from new_rows n
    join old_rows o on o.organization_id = n.organization_id and o.id = n.id
    cross join lateral custom.record_entity_edges(n.organization_id, n.id, n.table_id,
                                                  n.data_class, n.data, n.deleted_at) e
   where not (o.data       is not distinct from n.data
              and o.data_class is not distinct from n.data_class
              and o.table_id   is not distinct from n.table_id
              and o.deleted_at is not distinct from n.deleted_at)
     and a.deleted_at is not null
     and a.source_type = 'record'
     and a.source_id = n.id
     and a.target_type = e.target_type
     and a.target_id = e.target_id
     and a.role = e.edge_role;

  insert into platform.associations
    (source_type, source_id, target_type, target_id, role, organization_id,
     relation_field_id, "position")
  select 'record', n.id, e.target_type, e.target_id, e.edge_role, n.organization_id,
         e.field_id, e.ord
    from new_rows n
    join old_rows o on o.organization_id = n.organization_id and o.id = n.id
    cross join lateral custom.record_entity_edges(n.organization_id, n.id, n.table_id,
                                                  n.data_class, n.data, n.deleted_at) e
   where not (o.data       is not distinct from n.data
              and o.data_class is not distinct from n.data_class
              and o.table_id   is not distinct from n.table_id
              and o.deleted_at is not distinct from n.deleted_at)
   order by n.id
  on conflict (source_type, source_id, target_type, target_id, role) do update
     set relation_field_id = excluded.relation_field_id,
         "position"        = excluded."position",
         deleted_at        = null;

  if v_named then
    perform set_config('app.actor_system', '', true);
  end if;
  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.choice_render(p_organization_id uuid, p_table_id uuid, p_doc jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_map   jsonb;
  v_out   jsonb;
  v_notes jsonb := '{}'::jsonb;
  v_note  jsonb;
  v_at    text;
  e       record;
begin
  if p_doc is null or jsonb_typeof(p_doc) <> 'object' or p_table_id is null then
    return p_doc;
  end if;
  -- SC-R / P12: an entity reference is rendered here too — {token, id} gains the thing's own
  -- label — because this is the one step every read door takes after masking (read_record,
  -- read_records*, value_read, record_aggregate, query_across_homes, query_by_coordinates).
  p_doc := custom.entity_reference_render(p_organization_id, p_table_id, p_doc);
  v_map := custom.choice_field_map(p_organization_id, p_table_id);
  if v_map = '{}'::jsonb then
    return p_doc;                       -- no list Field on this Table: nothing to say.
  end if;

  v_out := p_doc;
  for e in select key as k, value as v from jsonb_each(v_map) loop
    -- THE COLUMN, UNDER WHICHEVER NAME THIS DOCUMENT USES. `custom.mask_document` re-keys the
    -- whole document by field id when the caller asks for it, and every list surface does.
    v_at := case when p_doc ? e.k then e.k
                 when p_doc ? (e.v ->> 'field_id') then e.v ->> 'field_id'
            end;
    if v_at is null then
      continue;
    end if;
    v_note := custom.choice_render_note(e.v, p_doc -> v_at);
    if v_note is null then
      continue;                         -- a notice, or a token that names no choice: untouched.
    end if;
    v_out   := v_out   || jsonb_build_object(v_at, custom.choice_render_value(e.v, p_doc -> v_at));
    v_notes := v_notes || jsonb_build_object(v_at, v_note);
  end loop;

  if v_notes <> '{}'::jsonb then
    v_out := v_out || jsonb_build_object('_choices', v_notes);
  end if;
  return v_out;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.field_words(p_organization_id uuid, p_field_id uuid, p_value jsonb)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_f     jsonb;
  v_type  text;
  v_opts  jsonb;
  v_one   jsonb;
  v_tok   text;
  v_word  text;
  v_parts text[] := '{}'::text[];
  k_uuid  constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
begin
  if p_value is null or jsonb_typeof(p_value) = 'null' then
    return null;
  end if;
  if p_field_id is null then
    return p_value #>> '{}';
  end if;

  select f.data into v_f
    from custom.record f
   where f.organization_id = p_organization_id
     and f.id = p_field_id
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null;
  -- A Field that is not there any more is REC-18's business, and custom.rule_eval has already
  -- refused by name before this function is ever reached. Answering the stored value here is
  -- the honest fallback for every other caller, not a way of hiding that.
  if v_f is null then
    return p_value #>> '{}';
  end if;

  v_type := v_f ->> 'type';

  if v_type = 'list' then
    v_opts := custom.choice_options(p_organization_id,
                nullif(v_f -> 'config' ->> 'options_table_id', '')::uuid);
  elsif v_type <> 'relation' then
    -- Words somebody typed, a number, a date, a yes/no: already the thing to print.
    if jsonb_typeof(p_value) <> 'array' then
      return p_value #>> '{}';
    end if;
  end if;

  -- ONE VALUE OR MANY, THE SAME WAY. A column that can hold more than one stores an array, and
  -- a person reads them joined by a comma — never a JSON array printed as text.
  for v_one in
    select e from jsonb_array_elements(
      case when jsonb_typeof(p_value) = 'array' then p_value else jsonb_build_array(p_value) end) e
  loop
    if v_one is null or jsonb_typeof(v_one) = 'null' then
      continue;
    end if;
    v_tok  := v_one #>> '{}';
    v_word := null;

    if v_type = 'list' then
      -- The option key first, because that is what the store keeps. An id is accepted too:
      -- some older documents hold the option RECORD's id, and printing that would be the
      -- very defect this file exists to end.
      v_word := coalesce(v_opts -> v_tok ->> 'label',
                         (select o.value ->> 'label'
                            from jsonb_each(coalesce(v_opts, '{}'::jsonb)) o
                           where o.value ->> 'id' = v_tok
                           limit 1));
    elsif v_type = 'relation' and jsonb_typeof(v_one) = 'object'
          and nullif(v_one ->> 'token', '') is not null and coalesce(v_one ->> 'id', '') ~ k_uuid then
      -- SC-R / P12: an entity reference prints the thing's own title, asked of its own
      -- access resolver first (platform.relation_label).
      v_word := platform.relation_label(p_organization_id, v_one ->> 'token', (v_one ->> 'id')::uuid);
    elsif v_type = 'relation' and v_tok ~ k_uuid then
      -- THE RELATION DISPLAY PRIMITIVE, called the way every other relation surface calls it.
      v_word := custom._words_for(p_organization_id, v_tok::uuid,
                                  v_f -> 'display', null, 0);
    end if;

    v_word := coalesce(nullif(btrim(coalesce(v_word, '')), ''), v_tok);
    if nullif(btrim(coalesce(v_word, '')), '') is not null then
      v_parts := v_parts || v_word;
    end if;
  end loop;

  if array_length(v_parts, 1) is null then
    return null;
  end if;
  return array_to_string(v_parts, ', ');
end;
$function$;
