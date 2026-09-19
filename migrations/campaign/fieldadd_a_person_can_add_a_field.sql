-- FIELD-ADD — A PERSON CAN ADD A FIELD.
--
-- WHAT A PERSON HIT (independent verdict, 19 September, "The worst thing we
-- found"). "Add field" opened a proper panel and then refused everything:
--
--   Number → "the table does not declare a field called day_rate - declare it
--            there first" (REC-1 / FLD-8)
--   Date   → the same sentence, word for word
--   Person → "the formula Crew lead has to say whether it works out its answer
--            when somebody reads it or when somebody saves" (FLD-9)
--   A list → "the list field Stage has to say which table its choices come
--            from" (FLD-5 / FLD-6), with no way on the panel to say it
--
-- and a table made with the product's own button still had exactly one column.
--
-- WHY, AND IT IS ONE CAUSE, NOT FOUR. THERE WAS NO DOOR FOR DECLARING A FIELD.
-- A Field is a record (REC-25), so the panel wrote it with `custom.record_write`
-- into the field kernel — and `custom.record_write` can do exactly one thing:
-- insert one row with `data_class = 'record'`. It cannot ALSO add the key to
-- the Table record's `fields` array, which `custom._field_shape_guard` requires
-- before it will accept any definition at all ("ONE SOURCE OF TRUTH, both
-- ways"), and it cannot stamp `data_class = 'field'`, which is why the delete
-- rules and the formula-dependency check never fired on a field a client wrote
-- (the same verdict's defect 1). Every screen therefore had to assemble a
-- guard-perfect document by hand and then failed on the one thing no client can
-- do. This is the shape `custom.rule_declare` is already owed for a Rule; a
-- Field needed it first, because adding a column is the first thing anybody
-- does with a table.
--
-- WHAT THIS FILE ADDS — three doors, and the store now owns the knowledge of
-- what each of the thirteen parity types is MADE OF, so every client inherits
-- it at once instead of each one re-deriving it and getting it wrong:
--
--   custom.field_declare(org, table_id, spec)  → the Field's id
--   custom.field_update (org, field_id, patch) → the Field's id
--   custom.field_retire (org, field_id)        → true
--
-- `spec` is what a PERSON knows: a parity type, a label, and for a choice list
-- the choices themselves. The door fills in everything the guards demand —
-- behaviour, modifiers, format, unit, relation target, relation max, the
-- pattern Rule that makes a format enforceable, the min/max Rules a percentage
-- lives in, compute_on for a formula — so a caller states an intention and the
-- store turns it into a lawful Field. Nothing here relaxes a single guard: every
-- one of them still runs on the row this door inserts, and a spec the store
-- cannot make lawful is refused in the guard's own words.
--
-- THE CHOICE LIST, DEFINED WHERE A PERSON DEFINES IT. FLD-5/FLD-6 stay exactly
-- as they are — every pick-list IS a Table and a list value stores the id of an
-- option record. What changes is who is made to know that: `spec.options` is an
-- array of words, and the door declares the options Table, its Home and one
-- record per word, then points the Field at it. The doctrine is untouched; the
-- person is no longer asked to build a table before they can have a dropdown.
--
-- A PERSON FIELD IS A PERSON. `member` resolves to a relation at the kernel
-- Person Table with `on_target_delete = set_null`, which is what
-- `custom.parity_type` reads back as `member`. The panel offers the
-- organization's members and writes their Person records; no screen has to know
-- that a person is a relation.
--
-- LEFT BEHIND, ON PURPOSE, AND WRITTEN DOWN RATHER THAN FORGOTTEN. The store's
-- own empty-key refusal ends mid-air — "a field needs a key made of lower-case
-- letters, digits and underscores, and this one says" with nothing after it,
-- because `coalesce('', 'nothing')` is `''` and not `'nothing'`. It belongs in
-- `custom._field_shape_guard`, which is a SHARED object in schema `custom`, and
-- the `custom` build lock is held by another lane. This lane takes its own
-- prefix and creates only new `custom.field_*` objects, so it does not touch
-- it. No person reaches that sentence through the panel any more — the panel
-- derives the key from the name and the door derives it again when a caller
-- leaves it out — but a caller writing the field kernel directly still can.
--
-- ADDITIVE: five new functions, three registry rows and the grants those rows
-- imply. Nothing is replaced, nothing is dropped and nothing is revoked.
--
-- THE INVERSE: migrations/inverse/fieldadd_a_person_can_add_a_field_down.sql.

set lock_timeout = '5s';
set statement_timeout = '600s';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. WHAT A PARITY TYPE IS MADE OF, as a document the store builds.
--    Private (no door row, no grant): the three doors below are its only
--    callers, and a client that could call it would be assembling a Field
--    document outside a door again.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function custom._field_document_for(
  p_organization_id uuid,
  p_table_id        uuid,
  p_spec            jsonb
) returns jsonb
language plpgsql
stable
set search_path to 'pg_catalog'
as $function$
declare
  d        jsonb;
  v_parity text := nullif(p_spec ->> 'parity_type', '');
  v_key    text := nullif(p_spec ->> 'key', '');
  v_label  text := nullif(p_spec ->> 'label', '');
  v_multi  boolean := coalesce((p_spec ->> 'multi')::boolean, false);
  v_config jsonb := coalesce(p_spec -> 'config', '{}'::jsonb);
  v_rules  jsonb := coalesce(p_spec -> 'rules', '[]'::jsonb);
  v_plain  text := coalesce(nullif(p_spec ->> 'plain', ''), 'text');
begin
  if v_label is null then
    raise exception 'A field needs a name - it is what a person reads on the column.'
      using errcode = '23514', hint = 'Give the field a label. Everything else this door can work out.';
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
    'depends_on',           '[]'::jsonb,
    'entity_definition_id', p_table_id);

  if v_parity is null then
    -- The three behaviours a person picks that are NOT one of the thirteen:
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
    end if;
    return d;
  end if;

  if not exists (select 1 from custom.parity_field_types() t where t.parity_type = v_parity) then
    raise exception 'There is no field type called "%" in this system.', v_parity
      using errcode = '23514',
            hint = 'FLD-11: the thirteen are select, multi_select, member, attachment, lookup, rollup, formula, url, email, phone, currency, percent and datetime.';
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
                    'options_table_id', p_spec ->> 'options_table_id'));

    -- ── the two relation types a person names by what they hold ─────────────
    when 'member' then
      d := d || jsonb_build_object(
        'type',             'relation',
        'relation_target',  custom.person_kernel_id(),
        'relation_max',     coalesce((p_spec ->> 'relation_max')::integer, case when v_multi then 25 else 1 end),
        'on_target_delete', 'set_null',
        'rules',            v_rules,
        'config',           v_config);
    when 'attachment' then
      d := d || jsonb_build_object(
        'type',             'relation',
        'relation_target',  custom.file_kernel_id(),
        'relation_max',     coalesce((p_spec ->> 'relation_max')::integer, case when v_multi then 25 else 1 end),
        -- REC-31: removing the file removes the attachment, never the record.
        'on_target_delete', 'set_null',
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
      d := d || jsonb_build_object(
        'type',       'formula',
        'source',     'formula',
        'compute_on', coalesce(nullif(p_spec ->> 'compute_on', ''), 'read'),
        'rules',      v_rules,
        'config',     v_config || jsonb_build_object('expr', coalesce(p_spec -> 'expr', v_config -> 'expr')));

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
                             'kind', 'pattern', 'value', '^[+0-9][0-9 ()\-\.]{4,}$')) end);

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

  return d;
end
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. THE OPTIONS TABLE A CHOICE LIST NEEDS, made for the person rather than
--    demanded of them. Private, for the same reason as above.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function custom._options_table_for(
  p_organization_id uuid,
  p_label           text,
  p_options         jsonb
) returns uuid
language plpgsql
set search_path to 'pg_catalog'
as $function$
declare
  v_home  uuid;
  v_table uuid;
  v_slug  text;
  v_word  text;
begin
  v_slug := regexp_replace(lower(btrim(coalesce(p_label, 'choices'))), '[^a-z0-9]+', '_', 'g');
  v_slug := regexp_replace(v_slug, '^_+|_+$', '', 'g');
  if v_slug !~ '^[a-z]' then v_slug := 'c_' || v_slug; end if;
  v_slug := left(v_slug || '_choices_' || replace(gen_random_uuid()::text, '-', ''), 48);

  -- REC-1: a Table has to live somewhere, so it gets its own Home like any other.
  insert into custom.record (organization_id, table_id, data)
  values (p_organization_id, custom.person_kernel_id(),
          jsonb_build_object('name', coalesce(p_label, 'Choices') || ' choices Home'))
  returning id into v_home;

  insert into custom.record (organization_id, table_id, data_class, data)
  values (p_organization_id, custom.table_kernel_id(), 'table', jsonb_build_object(
    'name',           coalesce(p_label, 'Choices') || ' choices',
    'slug',           v_slug,
    'type',           'entity',
    'label_singular', 'Choice',
    'label_plural',   'Choices',
    -- FLD-5: a list Field takes its choices from a Table SHOWN AS A LIST.
    'display',        'list',
    'weight',         'light',
    'ordered',        true,
    'row_order',      'manual',
    'title_field',    'title',
    'retention_days', 365,
    'agent_writable', true,
    'default_sort',   jsonb_build_array(jsonb_build_object('field', 'title', 'direction', 'asc')),
    'fields',         jsonb_build_array(jsonb_build_object('name', 'title')),
    -- KEPT BY THE APP. The tables list already has a lane for the app's own
    -- bookkeeping; a person's list of tables must not fill up with one table
    -- per dropdown they made.
    'kept_by_the_app', true,
    'parent_id',      v_home))
  returning id into v_table;

  insert into custom.record (organization_id, table_id, data)
  values (p_organization_id, custom.field_kernel_id(), jsonb_build_object(
    'key', 'title', 'label', 'Choice', 'type', 'text',
    'multi', false, 'dated', false, 'required', false, 'sort', 10,
    'rules', '[]'::jsonb, 'config', '{}'::jsonb, 'source', 'manual',
    'source_config', '{}'::jsonb, 'sensitivity', 'internal',
    'context_policy', 'include', 'applies_to_types', '[]'::jsonb,
    'depends_on', '[]'::jsonb, 'entity_definition_id', v_table));

  for v_word in select value #>> '{}' from jsonb_array_elements(coalesce(p_options, '[]'::jsonb)) loop
    if btrim(coalesce(v_word, '')) <> '' then
      insert into custom.record (organization_id, table_id, data)
      values (p_organization_id, v_table, jsonb_build_object('title', btrim(v_word)));
    end if;
  end loop;

  return v_table;
end
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. THE DOOR: DECLARE A FIELD.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function custom.field_declare(
  p_organization_id uuid,
  p_table_id        uuid,
  p_spec            jsonb
) returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_doc     jsonb;
  v_key     text;
  v_fields  jsonb;
  v_opts    uuid;
  v_id      uuid;
begin
  -- THE DECISION FIRST, BEFORE ANYTHING IS READ OR WRITTEN: the organization's
  -- own off switch, then the organization wall, then the right to change the
  -- SHAPE of this table, which is an admin's right and not an editor's.
  perform custom.assert_store_door(p_organization_id, 'custom.field_declare');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.field_declare');
  perform custom.assert_client_may_change(p_organization_id, p_table_id, 'custom.field_declare',
                                          'admin'::public.permission_level, 'table');

  select r.data -> 'fields' into v_fields
    from custom.record r
   where r.organization_id = p_organization_id
     and r.id = p_table_id
     and r.table_id = custom.table_kernel_id()
     and r.deleted_at is null;
  if v_fields is null then
    raise exception 'That table is not in this organization, so a field cannot be added to it.'
      using errcode = '23514',
            hint = 'REC-29: organizations are hard walls. Open the table you meant and add the field there.';
  end if;

  v_doc := custom._field_document_for(p_organization_id, p_table_id, p_spec);
  v_key := v_doc ->> 'key';

  if exists (select 1 from jsonb_array_elements(v_fields) f where f ->> 'name' = v_key) then
    raise exception 'This table already has a field called "%".', v_doc ->> 'label'
      using errcode = '23505',
            hint = 'Two fields of one table cannot share a key. Give this one a different name, or edit the one that is already there.';
  end if;

  -- THE CHOICE LIST. The person typed words; the store keeps them the only way
  -- FLD-5/FLD-6 allows — as the records of a Table — and points the Field at it.
  if (v_doc ->> 'type') = 'list'
     and nullif(v_doc -> 'config' ->> 'options_table_id', '') is null then
    if jsonb_typeof(p_spec -> 'options') is distinct from 'array'
       or jsonb_array_length(coalesce(p_spec -> 'options', '[]'::jsonb)) = 0 then
      raise exception 'A list of choices needs its choices - "%" has none yet.', v_doc ->> 'label'
        using errcode = '23514',
              hint = 'Type the choices into the field panel, one per line, and they are saved with the field.';
    end if;
    v_opts := custom._options_table_for(p_organization_id, v_doc ->> 'label', p_spec -> 'options');
    v_doc := jsonb_set(v_doc, '{config,options_table_id}', to_jsonb(v_opts::text));
  end if;

  -- ONE SOURCE OF TRUTH, both ways: the TABLE declares which fields it has and
  -- `custom.field` defines what one of them is, so the table is told first —
  -- the field guard refuses a definition for a field the table never declared,
  -- which is the exact sentence every "Add field" ended on.
  update custom.record
     set data = jsonb_set(data, '{fields}',
                          coalesce(data -> 'fields', '[]'::jsonb)
                          || jsonb_build_array(jsonb_build_object('name', v_key))),
         updated_at = now(), version = version + 1
   where organization_id = p_organization_id
     and id = p_table_id
     and table_id = custom.table_kernel_id();

  -- `data_class = 'field'` is the other half of what no client could write. A
  -- field stored as a plain record is invisible to the delete rules and to the
  -- formula-dependency check (the 19 September verdict's defect 1).
  insert into custom.record (organization_id, table_id, data_class, data)
  values (p_organization_id, custom.field_kernel_id(), 'field', v_doc)
  returning id into v_id;

  return v_id;
end
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. THE DOOR: CHANGE A FIELD'S MIND ABOUT ITSELF.
--    What a field IS (its parity type) is a conversion, and the store already
--    has a door for that. This one changes everything else a panel offers.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function custom.field_update(
  p_organization_id uuid,
  p_field_id        uuid,
  p_patch           jsonb
) returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_old   jsonb;
  v_table uuid;
  v_next  jsonb;
  v_opts  uuid;
  v_word  text;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.field_update');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.field_update');

  select r.data, (r.data ->> 'entity_definition_id')::uuid into v_old, v_table
    from custom.record r
   where r.organization_id = p_organization_id
     and r.id = p_field_id
     and r.table_id = custom.field_kernel_id()
     and r.deleted_at is null;
  if v_old is null then
    raise exception 'There is no such field in this organization, so nothing was changed.'
      using errcode = '23514', hint = 'REC-29: organizations are hard walls.';
  end if;
  if v_table is not null then
    perform custom.assert_client_may_change(p_organization_id, v_table, 'custom.field_update',
                                            'admin'::public.permission_level, 'table');
  end if;

  if nullif(p_patch ->> 'parity_type', '') is not null
     and (p_patch ->> 'parity_type') is distinct from (v_old ->> 'parity_type') then
    raise exception 'Changing what "%" holds is a conversion, not a setting.', v_old ->> 'label'
      using errcode = '23514',
            hint = 'Every value already saved has to be converted or kept aside with its reason, so it goes through the field-type conversion rather than through this panel. Add a new field and move the values if you want both.';
  end if;
  if nullif(p_patch ->> 'key', '') is not null and (p_patch ->> 'key') is distinct from (v_old ->> 'key') then
    raise exception 'A field''s key is how every saved value finds it, so it cannot be renamed.'
      using errcode = '23514', hint = 'The name a person reads is the label, and that can be changed freely.';
  end if;

  v_next := v_old;
  if p_patch ? 'label'          then v_next := jsonb_set(v_next, '{label}', to_jsonb(p_patch ->> 'label')); end if;
  if p_patch ? 'required'       then v_next := jsonb_set(v_next, '{required}', to_jsonb(coalesce((p_patch ->> 'required')::boolean, false))); end if;
  if p_patch ? 'dated'          then v_next := jsonb_set(v_next, '{dated}', to_jsonb(coalesce((p_patch ->> 'dated')::boolean, false))); end if;
  if p_patch ? 'sort'           then v_next := jsonb_set(v_next, '{sort}', to_jsonb(coalesce((p_patch ->> 'sort')::numeric, 100))); end if;
  if p_patch ? 'sensitivity'    then v_next := jsonb_set(v_next, '{sensitivity}', to_jsonb(p_patch ->> 'sensitivity')); end if;
  if p_patch ? 'context_policy' then v_next := jsonb_set(v_next, '{context_policy}', to_jsonb(p_patch ->> 'context_policy')); end if;
  if p_patch ? 'unit'           then v_next := jsonb_set(v_next, '{unit}', to_jsonb(p_patch ->> 'unit')); end if;
  if p_patch ? 'rules'          then v_next := jsonb_set(v_next, '{rules}', coalesce(p_patch -> 'rules', '[]'::jsonb)); end if;

  -- THE CHOICES, EDITED WHERE THEY WERE TYPED. The options Table this field
  -- already points at is rewritten to match the list a person just typed;
  -- records that are still wanted keep their ids, so no saved value is orphaned.
  if jsonb_typeof(p_patch -> 'options') = 'array' and (v_old ->> 'type') = 'list' then
    v_opts := nullif(v_old -> 'config' ->> 'options_table_id', '')::uuid;
    if v_opts is null then
      v_opts := custom._options_table_for(p_organization_id, v_next ->> 'label', p_patch -> 'options');
      v_next := jsonb_set(v_next, '{config,options_table_id}', to_jsonb(v_opts::text));
    else
      update custom.record o
         set deleted_at = now()
       where o.organization_id = p_organization_id
         and o.table_id = v_opts
         and o.deleted_at is null
         and not exists (select 1 from jsonb_array_elements_text(p_patch -> 'options') w
                          where btrim(w.value) = (o.data ->> 'title'));
      for v_word in select btrim(value) from jsonb_array_elements_text(p_patch -> 'options') loop
        if v_word <> '' and not exists (
             select 1 from custom.record o
              where o.organization_id = p_organization_id and o.table_id = v_opts
                and o.deleted_at is null and o.data ->> 'title' = v_word) then
          insert into custom.record (organization_id, table_id, data)
          values (p_organization_id, v_opts, jsonb_build_object('title', v_word));
        end if;
      end loop;
    end if;
  end if;

  update custom.record
     set data = v_next, updated_at = now(), version = version + 1
   where organization_id = p_organization_id
     and id = p_field_id
     and table_id = custom.field_kernel_id();

  return p_field_id;
end
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. THE DOOR: TAKE A FIELD OFF A TABLE.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function custom.field_retire(
  p_organization_id uuid,
  p_field_id        uuid
) returns boolean
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. THE DECLARATIONS. The grant FOLLOWS from the declaration, never beside it.
-- ─────────────────────────────────────────────────────────────────────────────
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes,
   signed_in_callers, anonymous_callers, declared_by, reason)
values
 ('custom', 'field_declare', 'p_organization_id uuid, p_table_id uuid, p_spec jsonb',
  array['uuid'::regtype::oid, 'uuid'::regtype::oid, 'jsonb'::regtype::oid],
  true, false,
  'migrations/campaign/fieldadd_a_person_can_add_a_field.sql (lane FIELD-ADD)',
  'Adding a column to a table is the first thing anybody does with one, and until this door existed no client could do it: a Field is a record, the one write door writes data_class = record, and the field guard refuses any definition for a field the TABLE has not declared - so every screen assembled a document by hand and then failed on the one write no client can make. This door takes what a person knows (a field type, a name, and for a choice list the choices themselves), turns it into the document the store''s own guards demand, tells the table about the field and writes the definition as a field rather than as a plain record. It decides the organization''s off switch, then the organization wall, then whether this caller may change the SHAPE of this table - an admin''s right, never an editor''s - before it reads anything at all.'),
 ('custom', 'field_update', 'p_organization_id uuid, p_field_id uuid, p_patch jsonb',
  array['uuid'::regtype::oid, 'uuid'::regtype::oid, 'jsonb'::regtype::oid],
  true, false,
  'migrations/campaign/fieldadd_a_person_can_add_a_field.sql (lane FIELD-ADD)',
  'The settings of one field a person edits from the same panel that created it: its name, whether it is required, how sensitive its values are, whether an agent may see them, its validation rules and the choices of a choice list. What the field HOLDS is not one of them - changing that converts or keeps aside every value already saved, so it goes through the field-type conversion and is refused here by name. It decides the organization''s off switch, the organization wall and the right to change the shape of the field''s own table before it reads the field.'),
 ('custom', 'field_retire', 'p_organization_id uuid, p_field_id uuid',
  array['uuid'::regtype::oid, 'uuid'::regtype::oid],
  true, false,
  'migrations/campaign/fieldadd_a_person_can_add_a_field.sql (lane FIELD-ADD)',
  'Taking one field off a table somebody made, from the same panel that added it. It refuses by name the three removals that would leave the store inconsistent: the field every record is called by, the last field a table has, and a field another field works out its answer from. The definition is retired first and the table is then left declaring only fields that exist, so the table is never momentarily describing a column that is gone. It decides the organization''s off switch, the organization wall and the right to change the shape of that table before it reads anything.')
on conflict (schema_name, function_name, identity_argtypes) do nothing;

select custom.reopen_declared_doors();
