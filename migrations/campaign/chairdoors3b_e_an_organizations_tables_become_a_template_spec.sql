-- chair-step: CREATES one SECURITY DEFINER read door, custom.template_from_tables, declares it in platform.client_callable_door and GRANTs EXECUTE on it to `authenticated`. `anon` gains nothing. It writes nothing; no table, column, index, trigger, policy, knob row or existing function is touched.
-- lane: CHAIR-DOORS-3B (asked by v6 lane 2 MAKE-HOME, need templates (b) "Save my setup as a template"; lane 8 TEMPLATES)
--
-- AN ORGANIZATION'S TABLES BECOME A TEMPLATE SPEC. "Save my setup as a template": the person picks the
-- tables that make up her setup and gets back ONE TemplateSpec-shaped document (aidream
-- @ai-matrx/records src/templates/types.ts, TEMPLATE_SPEC_VERSION 1) — tables, fields, choices,
-- relationships, saved views, forms, booking pages and dimensions read from the store exactly as they
-- are, plus the honest list of what only a person can write (the sentence, industry, job, strengths, the
-- three walk steps, the agent). The gallery (lane 2) hands the spec to validateTemplate / templateDeclaration
-- and custom.template_declare('org', spec); the validator says what is still missing.
--
--   custom.template_from_tables(p_organization_id uuid, p_table_ids uuid[], p_include_rows boolean default false,
--                               p_rows_per_table integer default 25)
--     → jsonb {spec: TemplateSpec, missing: text[], notes: text[], tables: int, fields: int, relationships: int,
--              views: int, forms: int, bookings: int, rows: int}
--   WALLS: custom.assert_client_may_reach, then custom.assert_may_know_table on EVERY table named (viewer rung).
--   Rows (off by default) come through custom.read_records — the reader's own mask, so a column she may not
--   read is not in the seed — capped by p_rows_per_table (1–200) and cut to the fields the spec carries.
--   With rows the spec cannot affirm noRealPeople (the person affirms it, or leaves the rows out).
--   A choice field's "… choices" table is folded into the field's `choices` and is never a table of the spec.
--   A relation to a table outside the set is kept as a plain field and named in `notes`.
--
-- INVERSE: migrations/inverse/chairdoors3b_e_an_organizations_tables_become_a_template_spec_down.sql

create or replace function custom.template_from_tables(p_organization_id uuid, p_table_ids uuid[], p_include_rows boolean default false, p_rows_per_table integer default 25)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'pg_catalog'
as $function$
declare
  v_ids      uuid[];
  v_id       uuid;
  v_org_name text;
  v_tables   jsonb := '[]'::jsonb;
  v_rels     jsonb := '[]'::jsonb;
  v_views    jsonb := '[]'::jsonb;
  v_forms    jsonb := '[]'::jsonb;
  v_extras   jsonb := '[]'::jsonb;
  v_dims     jsonb := '[]'::jsonb;
  v_missing  text[] := array[]::text[];
  v_notes    text[] := array[]::text[];
  v_tok      jsonb := '{}'::jsonb;   -- table id → token
  v_choice   uuid[] := array[]::uuid[];   -- the "… choices" tables folded into fields
  v_t        record;
  v_f        record;
  v_v        record;
  v_fm       record;
  v_fields   jsonb;
  v_field    jsonb;
  v_choices  jsonb;
  v_target   uuid;
  v_rows     jsonb;
  v_row      record;
  v_vals     jsonb;
  v_keys     text[];
  v_k        text;
  v_kind     text;
  v_def      jsonb;
  v_n_fields integer := 0;
  v_n_rows   integer := 0;
  v_cap      integer := least(greatest(coalesce(p_rows_per_table, 25), 1), 200);
  v_slug     text;
  v_me       uuid := custom.query_principal();
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.template_from_tables');
  select array_agg(distinct x) into v_ids from unnest(coalesce(p_table_ids, '{}'::uuid[])) x where x is not null;
  if coalesce(cardinality(v_ids), 0) = 0 then
    raise exception 'Pick at least one table to save as a template.' using errcode = '22023', hint = 'Nothing was read.';
  end if;
  if cardinality(v_ids) > 40 then
    raise exception 'A template holds at most 40 tables, and % were picked.', cardinality(v_ids) using errcode = '22023';
  end if;
  foreach v_id in array v_ids loop
    perform custom.assert_may_know_table(p_organization_id, v_id, 'custom.template_from_tables');
  end loop;
  select o.name into v_org_name from iam.organizations o where o.id = p_organization_id;

  -- Which picked tables are a choice list of another picked table's field: folded, never a table.
  select coalesce(array_agg(distinct (f.data #>> '{config,options_table_id}')::uuid), '{}'::uuid[]) into v_choice
    from custom.record f
   where f.organization_id = p_organization_id and f.table_id = custom.field_kernel_id() and f.deleted_at is null
     and (f.data ->> 'entity_definition_id')::uuid = any (v_ids)
     and (f.data #>> '{config,options_table_id}') is not null
     and (f.data #>> '{config,options_table_id}')::uuid = any (v_ids);

  -- Tokens first, so relations and views can name their tables.
  for v_t in
    select t.id, t.data
      from custom.record t
     where t.organization_id = p_organization_id and t.id = any (v_ids)
       and t.table_id = custom.table_kernel_id() and t.deleted_at is null
       and not (t.id = any (v_choice))
     order by t.data ->> 'name', t.id
  loop
    v_slug := custom._template_token(regexp_replace(coalesce(nullif(v_t.data ->> 'slug', ''), v_t.data ->> 'name', 'table'), '_\d{10,}$', ''));
    -- unique within the spec
    while exists (select 1 from jsonb_each_text(v_tok) e where e.value = v_slug) loop v_slug := v_slug || '_2'; end loop;
    v_tok := v_tok || jsonb_build_object(v_t.id::text, v_slug);
  end loop;
  if v_tok = '{}'::jsonb then
    raise exception 'None of the picked tables is a live table of this organization.' using errcode = '02000';
  end if;

  for v_t in
    select t.id, t.data, (v_tok ->> t.id::text) as token
      from custom.record t
     where t.organization_id = p_organization_id and t.id = any (v_ids)
       and t.table_id = custom.table_kernel_id() and t.deleted_at is null
       and not (t.id = any (v_choice))
     order by t.data ->> 'name', t.id
  loop
    v_fields := '[]'::jsonb;
    v_keys := array[]::text[];
    for v_f in
      select f.data, f.id
        from custom.record f
       where f.organization_id = p_organization_id and f.table_id = custom.field_kernel_id() and f.deleted_at is null
         and (f.data ->> 'entity_definition_id')::uuid = v_t.id
       order by (f.data ->> 'sort')::numeric nulls last, f.created_at, f.id
    loop
      v_n_fields := v_n_fields + 1;
      v_keys := v_keys || (v_f.data ->> 'key');
      v_choices := null;
      v_target := nullif(v_f.data ->> 'relation_target', '')::uuid;
      if (v_f.data #>> '{config,options_table_id}') is not null then
        select jsonb_agg(o.data ->> 'title' order by (o.metadata ->> 'option_position')::integer nulls last, o.created_at)
          into v_choices
          from custom.record o
         where o.organization_id = p_organization_id and o.deleted_at is null
           and o.table_id = (v_f.data #>> '{config,options_table_id}')::uuid and o.data_class = 'record';
      elsif jsonb_typeof(v_f.data #> '{config,choices}') = 'array' then
        v_choices := v_f.data #> '{config,choices}';
      end if;
      v_field := jsonb_strip_nulls(jsonb_build_object(
        'key', v_f.data ->> 'key',
        'label', v_f.data ->> 'label',
        'parityType', coalesce(v_f.data ->> 'parity_type', v_f.data ->> 'type'),
        'multi', coalesce((v_f.data ->> 'multi')::boolean, false),
        'dated', coalesce((v_f.data ->> 'dated')::boolean, false),
        'required', coalesce((v_f.data ->> 'required')::boolean, false),
        'unit', v_f.data ->> 'unit',
        'format', v_f.data ->> 'format',
        'source', coalesce(v_f.data ->> 'source', 'manual'),
        'computeOn', v_f.data ->> 'compute_on',
        'rules', case when jsonb_typeof(v_f.data -> 'rules') = 'array' and v_f.data -> 'rules' <> '[]'::jsonb then v_f.data -> 'rules' end,
        'choices', v_choices,
        'relationTarget', case when v_target is not null and v_tok ? v_target::text then v_tok ->> v_target::text end,
        'relationMax', case when v_target is not null and v_tok ? v_target::text then (v_f.data ->> 'relation_max')::integer end,
        'sensitivity', coalesce(v_f.data ->> 'sensitivity', 'internal'),
        'contextPolicy', coalesce(v_f.data ->> 'context_policy', 'include'),
        'help', v_f.data ->> 'description',
        'default', v_f.data -> 'default'));
      if v_target is not null and not (v_tok ? v_target::text)
         and v_target not in (custom.person_kernel_id(), custom.file_kernel_id()) then
        v_notes := v_notes || format('%s.%s points at a table outside the picked set, so it is saved as a plain field.', v_t.token, v_f.data ->> 'key');
      end if;
      if v_target is not null and v_tok ? v_target::text then
        v_rels := v_rels || jsonb_build_array(jsonb_build_object(
          'describes', format('%s: %s.', coalesce(v_t.data ->> 'label_singular', v_t.data ->> 'name'), v_f.data ->> 'label'),
          'fromTable', v_t.token,
          'fromField', v_f.data ->> 'key',
          'toTable', v_tok ->> v_target::text,
          'flavor', case when v_f.data ->> 'on_target_delete' = 'cascade' then 'owned' else 'referenced' end,
          'cardinality', case when coalesce((v_f.data ->> 'relation_max')::integer, 0) = 1 then 'one' else 'many' end,
          'onDelete', coalesce(v_f.data ->> 'on_target_delete', 'set_null'),
          'inverseKey', coalesce(v_f.data ->> 'inverse_key', v_t.token || '_' || (v_f.data ->> 'key'))));
      end if;
      v_fields := v_fields || jsonb_build_array(v_field);
    end loop;

    -- Seed rows, through the reader's own mask, cut to the spec's fields; relations become row keys.
    v_rows := '[]'::jsonb;
    if p_include_rows then
      for v_row in
        select r.id, r.document from custom.read_records(p_organization_id, v_t.id, false, v_cap, 0) r
      loop
        v_vals := '{}'::jsonb;
        foreach v_k in array v_keys loop
          if v_row.document ? v_k then
            v_vals := v_vals || jsonb_build_object(v_k, custom._template_row_value(v_row.document -> v_k, v_tok));
          end if;
        end loop;
        v_rows := v_rows || jsonb_build_array(jsonb_build_object('key', 'row-' || left(v_row.id::text, 8), 'values', v_vals));
        v_n_rows := v_n_rows + 1;
      end loop;
    end if;

    v_tables := v_tables || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'token', v_t.token,
      'name', v_t.data ->> 'name',
      'labelSingular', coalesce(v_t.data ->> 'label_singular', v_t.data ->> 'name'),
      'labelPlural', coalesce(v_t.data ->> 'label_plural', v_t.data ->> 'name'),
      'type', coalesce(v_t.data ->> 'type', 'entity'),
      'display', coalesce(v_t.data ->> 'display', 'list'),
      'weight', coalesce(v_t.data ->> 'weight', 'light'),
      'ordered', coalesce((v_t.data ->> 'ordered')::boolean, false),
      'icon', v_t.data ->> 'icon',
      'titleField', coalesce(v_t.data ->> 'title_field', v_keys[1]),
      'describes', coalesce(v_t.data ->> 'description', ''),
      'fields', v_fields,
      'rows', v_rows)));
    if coalesce(v_t.data ->> 'description', '') = '' then
      v_missing := v_missing || format('tables.%s.describes', v_t.token);
    end if;

    -- Saved views on this table.
    for v_v in
      select sv.name, sv.definition
        from platform.saved_view sv
       where sv.organization_id = p_organization_id and sv.subject_id = v_t.id and sv.deleted_at is null
       order by sv.created_at, sv.id
    loop
      v_def  := coalesce(v_v.definition, '{}'::jsonb);
      v_kind := coalesce(v_def ->> 'layout', 'grid');
      if v_kind not in ('grid', 'kanban', 'calendar', 'gallery', 'timeline') then
        v_notes := v_notes || format('View "%s" on %s has a layout (%s) the template grammar does not carry; left out.', v_v.name, v_t.token, v_kind);
        continue;
      end if;
      v_views := v_views || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
        'token', custom._template_token(v_t.token || '_' || v_v.name),
        'name', v_v.name,
        'table', v_t.token,
        'kind', v_kind,
        'isDefault', case when (v_def ->> 'is_default')::boolean then true end,
        'filters', case when jsonb_typeof(v_def -> 'filters') = 'object' and v_def -> 'filters' <> '{}'::jsonb then v_def -> 'filters' end,
        'sorts', case when jsonb_typeof(v_def -> 'sorts') = 'array' and v_def -> 'sorts' <> '[]'::jsonb then v_def -> 'sorts' end,
        'hiddenFields', v_def #> '{presentation,hiddenFields}',
        'groupBy', case v_kind when 'grid' then v_def #>> '{presentation,grouping,field}' when 'kanban' then v_def ->> 'group_field' when 'timeline' then v_def ->> 'group_field' end,
        'swimlaneBy', case when v_kind = 'kanban' then v_def ->> 'swimlane_field' end,
        'measure', case when v_kind = 'kanban' then v_def ->> 'measure' end,
        'dateField', case when v_kind = 'calendar' then v_def ->> 'date_field' end,
        'coverField', case when v_kind = 'gallery' then v_def ->> 'image_field' end,
        'startField', case when v_kind = 'timeline' then v_def ->> 'start_field' end,
        'endField', case when v_kind = 'timeline' then v_def ->> 'end_field' end)));
    end loop;

    -- Forms and booking pages on this table.
    for v_fm in
      select f.id, f.title, f.slug, f.presentation, f.published_at, f.audience
        from custom.anon_form f
       where f.organization_id = p_organization_id and f.table_id = v_t.id and f.deleted_at is null
       order by f.created_at, f.id
    loop
      select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
               'field', q ->> 'field', 'ask', coalesce(q ->> 'ask', q ->> 'field'), 'help', q ->> 'help',
               'required', case when (q ->> 'required')::boolean then true end))), '[]'::jsonb)
        into v_fields
        from jsonb_array_elements(coalesce(v_fm.presentation -> 'questions', '[]'::jsonb)) q;
      if v_fm.presentation ? 'booking' then
        v_extras := v_extras || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
          'kind', 'booking',
          'token', custom._template_token(v_t.token || '_' || coalesce(v_fm.title, 'booking')),
          'title', coalesce(v_fm.title, 'Book a time'),
          'table', v_t.token,
          'questions', v_fields,
          'availability', jsonb_strip_nulls(jsonb_build_object(
            'timezone', v_fm.presentation #>> '{booking,timezone}',
            'slotMinutes', coalesce((v_fm.presentation #>> '{booking,slot_minutes}')::integer, 30),
            'bufferMinutes', (v_fm.presentation #>> '{booking,buffer_minutes}')::integer,
            'leadMinutes', (v_fm.presentation #>> '{booking,lead_minutes}')::integer,
            'maxPerDay', (v_fm.presentation #>> '{booking,max_per_day}')::integer,
            'days', (v_fm.presentation #>> '{booking,days}')::integer,
            'windows', coalesce(v_fm.presentation #> '{booking,windows}', '[]'::jsonb))))));
      else
        v_forms := v_forms || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
          'token', custom._template_token(v_t.token || '_' || coalesce(v_fm.title, 'form')),
          'name', coalesce(v_fm.title, 'Form'),
          'describes', coalesce(v_fm.presentation ->> 'intro', ''),
          'audience', case when v_fm.published_at is not null then 'public' else 'member' end,
          'table', v_t.token,
          'fields', v_fields,
          'submitLabel', coalesce(v_fm.presentation ->> 'submit_label', 'Send'),
          'confirmation', coalesce(v_fm.presentation #>> '{thank_you,body}', v_fm.presentation #>> '{thank_you,title}', 'Thank you.'))));
      end if;
    end loop;

    -- Dimensions the table already names (its overrides only; the store infers the rest on install).
    if jsonb_typeof(v_t.data -> 'dimensions') = 'object' then
      v_dims := v_dims || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
        'table', v_t.token,
        'dimensions', v_t.data #> '{dimensions,dimensions}',
        'measures', v_t.data #> '{dimensions,measures}',
        'paths', v_t.data #> '{dimensions,paths}',
        'default', v_t.data #> '{dimensions,default}')));
    end if;
  end loop;

  v_missing := v_missing || array['useCase', 'industry', 'vertical', 'job', 'audience', 'teaches', 'strengths',
                                  'business.describes', 'business.address', 'business.phone', 'walk', 'agent'];
  if p_include_rows then
    v_missing := v_missing || 'provenance.noRealPeople'::text;
    v_notes := v_notes || ('Seed rows are your own data: affirm provenance.noRealPeople only after replacing every real person, phone, address and mailbox; dates are absolute, the grammar wants install-relative dates (@today+3d).')::text;
  end if;

  return jsonb_build_object(
    'spec', jsonb_build_object(
      'specVersion', 1,
      'catalogueId', 'ORG-' || upper(left(replace(p_organization_id::text, '-', ''), 8)) || '-' || to_char(now(), 'YYYYMMDD'),
      'id', custom._template_token(coalesce(v_org_name, 'organization') || '-setup-' || to_char(now(), 'YYYY-MM-DD')),
      'useCase', '',
      'industry', null,
      'vertical', '',
      'job', null,
      'audience', null,
      'teaches', null,
      'strengths', '[]'::jsonb,
      'requires', '[]'::jsonb,
      'business', jsonb_build_object('name', coalesce(v_org_name, ''), 'describes', '',
                    'address', jsonb_build_object('line1', '', 'city', '', 'region', '', 'postalCode', '', 'country', ''), 'phone', ''),
      'cleanupTag', 'template-from-tables:' || p_organization_id::text,
      'tables', v_tables,
      'relationships', v_rels,
      'sharedBlocks', '[]'::jsonb,
      'views', v_views,
      'forms', v_forms,
      'dimensions', v_dims,
      'extras', v_extras,
      'agent', null,
      'walk', '[]'::jsonb,
      'foundation', '[]'::jsonb,
      'provenance', jsonb_build_object('kind', 'synthesized',
                      'authoredBy', 'custom.template_from_tables for ' || coalesce(v_me::text, 'a member'),
                      'authoredOn', to_char(now(), 'YYYY-MM-DD'),
                      'noRealPeople', not p_include_rows),
      'version', 1),
    'missing', to_jsonb(v_missing),
    'notes', to_jsonb(v_notes),
    'tables', jsonb_array_length(v_tables),
    'fields', v_n_fields,
    'relationships', jsonb_array_length(v_rels),
    'views', jsonb_array_length(v_views),
    'forms', jsonb_array_length(v_forms),
    'bookings', jsonb_array_length(v_extras),
    'rows', v_n_rows);
end
$function$;
comment on function custom.template_from_tables(uuid, uuid[], boolean, integer) is
  'Chair (v6) — "Save my setup as a template": reads the picked tables (fields, choices, relationships, saved views, forms, booking pages, dimensions; rows only when asked, through the reader''s own mask) into ONE TemplateSpec-shaped document (@ai-matrx/records src/templates/types.ts, spec version 1) with the list of what only a person can write (missing) and what was left out (notes). Viewer rung on every table; writes nothing.';

-- helpers (no grant)
create or replace function custom._template_token(p_text text)
 returns text
 language sql
 immutable
 set search_path to 'pg_catalog'
as $function$
  select coalesce(nullif(btrim(regexp_replace(regexp_replace(lower(coalesce(p_text, '')), '[^a-z0-9]+', '_', 'g'), '_+', '_', 'g'), '_'), ''), 'item')
$function$;
revoke all on function custom._template_token(text) from public, anon, authenticated;

-- A seed value: a relation value (a record id, or an array of them) becomes the row key(s) the spec uses.
create or replace function custom._template_row_value(p_value jsonb, p_tokens jsonb)
 returns jsonb
 language sql
 immutable
 set search_path to 'pg_catalog'
as $function$
  select case
    when jsonb_typeof(p_value) = 'string' and (p_value #>> '{}') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then to_jsonb('row-' || left(p_value #>> '{}', 8))
    when jsonb_typeof(p_value) = 'array' and (select bool_and(jsonb_typeof(x) = 'string' and (x #>> '{}') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') from jsonb_array_elements(p_value) x)
      then (select coalesce(jsonb_agg(to_jsonb('row-' || left(x #>> '{}', 8))), '[]'::jsonb) from jsonb_array_elements(p_value) x)
    else p_value end
$function$;
revoke all on function custom._template_row_value(jsonb, jsonb) from public, anon, authenticated;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers, argument_rules)
values
  ('custom', 'template_from_tables', 'p_organization_id uuid, p_table_ids uuid[], p_include_rows boolean, p_rows_per_table integer',
   array['uuid'::regtype::oid, 'uuid[]'::regtype::oid, 'boolean'::regtype::oid, 'integer'::regtype::oid],
   'Reads the picked tables of the caller''s organization into one TemplateSpec document ("Save my setup as a template"). custom.assert_client_may_reach first, then custom.assert_may_know_table on every table; rows only through custom.read_records (the reader''s own mask). Writes nothing.',
   'chairdoors3b_e_an_organizations_tables_become_a_template_spec.sql', null, true, false,
   jsonb_build_object('version', '1', 'arguments', jsonb_build_object(
     'p_organization_id', jsonb_build_object('foreign', jsonb_build_object('bounded', true,
       'note', 'custom.assert_client_may_reach decides it first; every row is read in this organization only.')),
     'p_table_ids', jsonb_build_object('foreign', jsonb_build_object('bounded', true,
       'note', 'Each id passes custom.assert_may_know_table (42501 for a foreign or hidden table, the same sentence as an invented id); tables are then read in p_organization_id only.')))))
on conflict do nothing;

grant execute on function custom.template_from_tables(uuid, uuid[], boolean, integer) to authenticated;
