-- chair-step: this file GRANTS EXECUTE, and a GRANT is refused by the production allow-list
-- by name. It cannot be avoided: a door nobody may execute is not a door, and the whole point
-- of this file is that a signed-in person reaches these eight functions. Everything it
-- executes is additive - eight brand-new functions in schema `custom`, ten declaration rows in
-- `platform.client_callable_door`, and the EXECUTE grants those rows authorise. It replaces no
-- live body, drops nothing, revokes nothing and changes no existing write path: before it
-- there was no door onto a standard table's custom fields at all. Its inverse drops exactly
-- the eight functions and the ten rows.
--
-- ENTITY-FIELDS 3 — THE DOOR SET. EVERY DOOR IN THIS STORE WAS KEYED BY A CUSTOM TABLE'S
-- UUID, SO A STANDARD BUSINESS TABLE COULD NOT BE REACHED THROUGH ANY OF THEM.
--
-- MEASURED from the seat on the main database 2026-09-19, as admin@admin.com in an
-- organization whose store is on:
--
--     custom.applicable_fields(org, 'party', null)  → 22P02 invalid input syntax for uuid
--     custom.field_declare(org, <a party row>, …)   → 23514 "That table is not in this
--                                                     organization, so a field cannot be
--                                                     added to it."
--     client doors in schema custom taking a table TOKEN   → 0
--     client doors named custom.entity_*                   → 0
--
-- FLD-8 is already law in the store's own guard — `custom._field_shape_guard` accepts a Field
-- carrying `table_token` instead of `entity_definition_id` and checks it against
-- `platform.entity_types` — and `custom.validate_custom_fields` already validates a standard
-- row's document against exactly those Fields. The SHAPE was finished. Nothing a person or an
-- agent can call could produce it: every door took `p_table_id uuid` and looked it up in
-- `custom.record`, where a standard table has no row and never will.
--
-- SO THIS FILE IS THE MISSING HALF, AND IT IS ONE DOOR SET FOR ALL 643 TABLES:
--
--   custom.entity_fields           (org, token)                  what this organization added
--   custom.entity_field_declare    (org, token, spec)            add a column — an admin's right
--   custom.entity_field_update     (org, field, patch)           change one
--   custom.entity_field_retire     (org, field)                  take one away
--   custom.entity_record_read      (org, token, id)              THE READ SHAPE: the row's own
--                                                                columns AND its custom values,
--                                                                in one answer, with the
--                                                                definitions that describe them
--   custom.entity_value_write      (org, token, id, patch)       write custom values on a row
--   custom.entity_records_find     (org, token, key, value, …)   filter by a custom value
--
-- There is no per-table code in any of them and there is no list of tables anywhere: a table
-- is reachable because its registry row says its TYPE carries custom fields (REC-34), and the
-- word a caller uses is the registry token (REC-33).
--
-- 🚨 WHO DECIDES, AND WHY THE TWO HALVES HAVE DIFFERENT SECURITY.
-- Reading and writing a standard row's VALUES is the standard row's own question, so
-- `entity_record_read`, `entity_value_write` and `entity_records_find` are SECURITY INVOKER:
-- the statement runs as the person and `crm.party`'s own RLS policies — `iam.has_access`,
-- the organization arm, the sharing arms — decide exactly as they decide every other read and
-- write of that table. There is no second access system for custom values and no way for this
-- door to show a row the person could not already open. A person who may edit the contact may
-- edit the contact's custom fields; a person who may not, may not, in the same sentence the
-- CRM already gives them.
-- The DEFINITIONS are the other half: a Field is a record in schema `custom`, where a person
-- holds no table privilege at all (`check:store-doors-decide` census 7, and it stays true), so
-- those four doors are SECURITY DEFINER and ask `iam.has_org_admin` — changing the SHAPE of a
-- table everyone in the organization shares is an owner's or admin's right, not an editor's.
--
-- INVERSE: migrations/inverse/entityfields_the_doors_a_person_reaches_down.sql

set lock_timeout = '3s';
set statement_timeout = '300s';


-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 0. THE ONE PLACE A TOKEN IS RESOLVED, AND THE ONE PLACE EACH REFUSAL IS WORDED
-- ─────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION custom.entity_table(p_token text)
RETURNS TABLE(token text, schema_name text, table_name text, type text, title_column text, label text,
              has_organization boolean, has_deleted_at boolean)
LANGUAGE plpgsql
STABLE
SET search_path TO 'pg_catalog'
AS $function$
declare
  r record;
begin
  select e.token, e.schema_name, e.table_name, e.type, e.title_column, e.label,
         e.custom_fields_enabled, e.is_active
    into r
    from platform.entity_types e
   where e.token = p_token;

  if r.token is null then
    raise exception 'There is no table called "%" in this system.', p_token
      using errcode = '23514',
            hint = 'REC-33: a standard table is named by its registry token - "party", "crm_deal", "crm_interaction". Ask for the list rather than guessing one.';
  end if;
  if not r.is_active then
    raise exception 'The table "%" has been retired, so nothing can be added to it.', p_token
      using errcode = '23514', hint = 'platform.entity_types.is_active is false for this token.';
  end if;
  if not r.custom_fields_enabled then
    raise exception 'A % table does not take custom fields - "%" is a %.', r.type, p_token, r.type
      using errcode = '23514',
            hint = 'REC-34 / DD-011: of the seven table types, only Entity and Detail carry custom fields. The other five - Reference, Ledger, Restricted, System, Deprecated - are the platform''s own shapes, and a field added to one of them would be a field nobody owns.';
  end if;
  if not exists (select 1 from pg_class c
                   join pg_namespace n on n.oid = c.relnamespace
                   join pg_attribute a on a.attrelid = c.oid and a.attname = 'custom_fields'
                                      and a.attnum > 0 and not a.attisdropped
                  where n.nspname = r.schema_name and c.relname = r.table_name) then
    raise exception 'The table "%" cannot hold a custom value yet.', p_token
      using errcode = '42703',
            hint = 'REC-40: every Entity and Detail carries a custom_fields column. This one does not - run platform.custom_fields_retrofit(''' || p_token || '''), which is the one verb that creates it. Nothing was written.';
  end if;

  token := r.token; schema_name := r.schema_name; table_name := r.table_name;
  type := r.type; title_column := r.title_column;
  -- THE NAME A PERSON READS. The registry's own `label` is used as it stands - except when
  -- it IS the type word, which `party`'s row literally is ("Entity"), because "Entity already
  -- has a column called display_name" is a sentence about nothing. Nothing is renamed: this
  -- chooses which of two facts the registry already holds to print.
  label := coalesce(nullif(r.label, ''), r.table_name);
  if lower(label) = lower(r.type) then
    label := initcap(replace(r.table_name, '_', ' '));
  end if;
  -- TWO FACTS THE VALUE DOORS NEED AND NEITHER OF THEM IS AN ERROR HERE. 57 of the 643 have
  -- no `organization_id` and 182 have no `deleted_at`; a door that assumed either would fail
  -- with 42703 on a table it was told to serve.
  select exists (select 1 from pg_attribute a join pg_class c on c.oid = a.attrelid
                   join pg_namespace n on n.oid = c.relnamespace
                  where n.nspname = r.schema_name and c.relname = r.table_name
                    and a.attname = 'organization_id' and a.attnum > 0 and not a.attisdropped),
         exists (select 1 from pg_attribute a join pg_class c on c.oid = a.attrelid
                   join pg_namespace n on n.oid = c.relnamespace
                  where n.nspname = r.schema_name and c.relname = r.table_name
                    and a.attname = 'deleted_at' and a.attnum > 0 and not a.attisdropped)
    into has_organization, has_deleted_at;
  return next;
end
$function$;


CREATE OR REPLACE FUNCTION custom.assert_entity_is_organization_scoped(p_token text, p_label text, p_scoped boolean)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'pg_catalog'
AS $function$
begin
  if p_scoped then return; end if;
  -- MEASURED 2026-09-19: 57 of the 643 Entity/Detail tables carry no `organization_id`. They
  -- get REC-40's column like every other one, but a VALUE on them would belong to nobody:
  -- `custom._entity_custom_fields_guard` reads the row's organization to find the Fields and
  -- to ask the switch, and with no organization there is neither. Saying so is the honest
  -- answer; quietly writing an unvalidated, unowned value is not.
  raise exception 'Rows of % do not belong to an organization, so a custom value on one would belong to nobody.', p_label
    using errcode = '23514',
          hint = 'REC-40 / R11: custom fields are an organization''s own fields, and the guard finds them through the row''s organization_id. This table has none. Giving it one is a table change, not a field change - ' || p_token || ' needs its tenancy settled first.';
end
$function$;


-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 1. WHAT THIS ORGANIZATION ADDED TO THIS STANDARD TABLE
-- ─────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION custom.entity_fields(p_organization_id uuid, p_token text)
RETURNS SETOF custom.record
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
begin
  -- The decision comes BEFORE the read, the same order every door in this store uses, so a
  -- foreign organization and an invented one answer identically.
  perform custom.assert_store_door(p_organization_id, 'custom.entity_fields');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.entity_fields');
  perform custom.entity_table(p_token);

  return query
    select f.*
      from custom.record f
     where f.organization_id = p_organization_id
       and f.table_id = custom.field_kernel_id()
       and f.deleted_at is null
       and f.data ->> 'table_token' = p_token
     order by coalesce((f.data ->> 'sort')::numeric, 100), f.data ->> 'label';
end
$function$;


-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 2. ADD A COLUMN TO A STANDARD TABLE
-- ─────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION custom.entity_field_declare(p_organization_id uuid, p_token text, p_spec jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
declare
  v_doc  jsonb;
  v_key  text;
  v_opts uuid;
  v_id   uuid;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.entity_field_declare');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.entity_field_declare');
  perform custom.entity_table(p_token);

  -- THE SHAPE OF A SHARED TABLE IS AN ADMIN'S TO CHANGE. Everyone in the organization sees
  -- this column on every row of this table afterwards, so it is not an editor's decision. The
  -- store owner (every server and campaign lane) goes through as it does everywhere else.
  if not custom.query_is_store_owner() and not iam.has_org_admin(p_organization_id) then
    raise exception 'Adding a column to % changes it for everybody in this organization, and that is an owner''s or an admin''s to do.',
      (select t.label from custom.entity_table(p_token) t)
      using errcode = '42501',
            hint = 'Ask an owner or an admin of this organization to add the field. Reading and filling in the fields that are already there needs no admin at all.';
  end if;

  -- THE WHOLE TYPE VOCABULARY, FROM THE ONE PLACE THAT KNOWS IT. `custom._field_document_for`
  -- is what FIELD-ADD built for custom tables: the sixteen choices, the pattern Rule that
  -- makes a format enforceable, the min/max a percentage lives in, the relation properties.
  -- A standard table gets exactly the same vocabulary rather than a second, poorer one.
  v_doc := custom._field_document_for(p_organization_id, null, p_spec);

  -- FLD-8, the one line that makes it a field OF A STANDARD TABLE: exactly one of the two
  -- identifiers, never both. `custom._field_shape_guard` refuses anything else by name.
  v_doc := (v_doc - 'entity_definition_id') || jsonb_build_object('table_token', p_token);
  v_key := v_doc ->> 'key';

  if exists (select 1 from custom.record r
              where r.organization_id = p_organization_id
                and r.table_id = custom.field_kernel_id()
                and r.data_class = 'field'
                and r.deleted_at is null
                and r.data ->> 'table_token' = p_token
                and r.data ->> 'key' = v_key) then
    raise exception 'This table already has a field called "%".', v_doc ->> 'label'
      using errcode = '23505',
            hint = 'Two fields of one table cannot share a key. Give this one a different name, or edit the one that is already there.';
  end if;

  -- A KEY THAT IS ALREADY A REAL COLUMN IS NOT A CUSTOM FIELD. `crm.party` already has
  -- `display_name`; a custom field of that key would shadow it on every read and the person
  -- would never know which one they were editing. REC-53: real columns first, then the base
  -- contract, then custom fields - three sets, never overlapping.
  if exists (select 1 from pg_attribute a
               join pg_class c on c.oid = a.attrelid
               join pg_namespace n on n.oid = c.relnamespace
               join custom.entity_table(p_token) t
                 on t.schema_name = n.nspname and t.table_name = c.relname
              where a.attname = v_key and a.attnum > 0 and not a.attisdropped) then
    raise exception '% already has a column called "%", so a custom field cannot be called that too.',
      (select t.label from custom.entity_table(p_token) t), v_key
      using errcode = '23505',
            hint = 'REC-53: a standard row is its real columns plus the base contract plus custom fields, and the three never overlap. Give the field a different name - the store makes the key from the name.';
  end if;

  -- THE CHOICE LIST, the same way FIELD-ADD keeps it: the words become the records of a
  -- Table, and the Field points at it. FLD-5/FLD-6 are untouched.
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

  insert into custom.record (organization_id, table_id, data_class, data)
  values (p_organization_id, custom.field_kernel_id(), 'field', v_doc)
  returning id into v_id;

  return v_id;
end
$function$;


-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 3. CHANGE ONE, AND 4. TAKE ONE AWAY
-- ─────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION custom.entity_field_update(p_organization_id uuid, p_field_id uuid, p_patch jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
declare
  v_field custom.record;
  v_doc   jsonb;
  v_key   text;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.entity_field_update');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.entity_field_update');

  select f.* into v_field from custom.record f
   where f.organization_id = p_organization_id and f.id = p_field_id
     and f.table_id = custom.field_kernel_id() and f.deleted_at is null;
  if v_field.id is null or nullif(v_field.data ->> 'table_token', '') is null then
    raise exception 'That is not a custom field of a standard table in this organization.'
      using errcode = '02000',
            hint = 'custom.entity_field_update changes a field declared on a standard table. A field of one of your own tables is custom.field_update.';
  end if;
  if not custom.query_is_store_owner()
     and not iam.has_org_admin(p_organization_id) then
    raise exception 'Changing "%" changes it for everybody in this organization, and that is an owner''s or an admin''s to do.',
      coalesce(v_field.data ->> 'label', v_field.data ->> 'key')
      using errcode = '42501', hint = 'Ask an owner or an admin of this organization.';
  end if;

  v_doc := v_field.data;
  -- The settings a person can change on a field that already holds values. A TYPE change is
  -- refused by name here exactly as it is on a custom table: the values already written were
  -- written under the old type, and silently reinterpreting them is the thing this store
  -- never does.
  if p_patch ? 'type' or p_patch ? 'parity_type' then
    raise exception 'A field''s type cannot be changed in place - "%" already holds values that were written as a %.',
      coalesce(v_doc ->> 'label', v_doc ->> 'key'), coalesce(v_doc ->> 'parity_type', v_doc ->> 'type')
      using errcode = '23514',
            hint = 'FLD-11: add a field of the new type, move the values across where they mean the same thing, and retire this one. Nothing was changed.';
  end if;
  for v_key in select k from jsonb_object_keys(p_patch) k loop
    if v_key not in ('label','sort','required','default','unit','format','sensitivity',
                     'context_policy','review_interval_days','rules','config','applies_to_types',
                     'multi','dated','relation_max','on_target_delete','source','source_config',
                     'depends_on') then
      raise exception 'A field has no setting called "%".', v_key
        using errcode = '23514',
              hint = 'FLD-12 / FLD-13: the settings are label, sort, required, default, unit, format, sensitivity, context_policy, review_interval_days, rules, config, applies_to_types, multi, dated, relation_max, on_target_delete, source, source_config and depends_on. The type is changed by adding a new field, never in place.';
    end if;
  end loop;

  v_doc := v_doc || p_patch;
  update custom.record
     set data = v_doc, updated_at = now(), version = version + 1
   where organization_id = p_organization_id and id = p_field_id;
  return p_field_id;
end
$function$;


CREATE OR REPLACE FUNCTION custom.entity_field_retire(p_organization_id uuid, p_field_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
declare
  v_field custom.record;
  v_dep   text;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.entity_field_retire');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.entity_field_retire');

  select f.* into v_field from custom.record f
   where f.organization_id = p_organization_id and f.id = p_field_id
     and f.table_id = custom.field_kernel_id() and f.deleted_at is null;
  if v_field.id is null or nullif(v_field.data ->> 'table_token', '') is null then
    raise exception 'That is not a custom field of a standard table in this organization.'
      using errcode = '02000', hint = 'A field of one of your own tables is custom.field_retire.';
  end if;
  if not custom.query_is_store_owner()
     and not iam.has_org_admin(p_organization_id) then
    raise exception 'Removing "%" removes it for everybody in this organization, and that is an owner''s or an admin''s to do.',
      coalesce(v_field.data ->> 'label', v_field.data ->> 'key')
      using errcode = '42501', hint = 'Ask an owner or an admin of this organization.';
  end if;

  -- REC-18: a field another field reads through is named, never silently broken.
  select coalesce(d.data ->> 'label', d.data ->> 'key') into v_dep
    from custom.record d
   where d.organization_id = p_organization_id
     and d.table_id = custom.field_kernel_id()
     and d.deleted_at is null
     and d.id <> p_field_id
     and d.data ->> 'table_token' = v_field.data ->> 'table_token'
     and d.data -> 'depends_on' ? (v_field.data ->> 'key')
   limit 1;
  if v_dep is not null then
    raise exception 'Cannot remove "%" - "%" is worked out from it.',
      coalesce(v_field.data ->> 'label', v_field.data ->> 'key'), v_dep
      using errcode = '23514',
            hint = 'REC-18: change or remove the field that depends on it first. Nothing was removed.';
  end if;

  -- The values already written stay in each row's document, untouched: retiring a definition
  -- is not deleting people's data, and REC-40's column is the row's, not the field's. What
  -- changes is that the field stops being offered and stops being validated.
  update custom.record set deleted_at = now() where organization_id = p_organization_id and id = p_field_id;
  return p_field_id;
end
$function$;


-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 5. THE READ SHAPE — THE ROW'S OWN COLUMNS AND ITS CUSTOM VALUES, IN ONE ANSWER
-- ─────────────────────────────────────────────────────────────────────────────────────────
-- SECURITY INVOKER ON PURPOSE. The row is read by a statement running as the PERSON, so
-- `crm.party`'s own RLS decides, through the same ladder that decides every other read of that
-- table. There is no second access system for custom values and this door cannot show a row
-- the CRM would not. A row the person may not open comes back as nothing at all, which is
-- what a standard `select` gives them today.
CREATE OR REPLACE FUNCTION custom.entity_record_read(p_organization_id uuid, p_token text, p_record_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path TO 'pg_catalog'
AS $function$
declare
  t        record;
  v_row    jsonb;
  v_doc    jsonb;
  v_fields jsonb;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.entity_record_read');
  select * into t from custom.entity_table(p_token);
  perform custom.assert_entity_is_organization_scoped(t.token, t.label, t.has_organization);

  execute format('select to_jsonb(x) from %I.%I x where x.id = $1 and x.organization_id = $2',
                 t.schema_name, t.table_name)
    into v_row using p_record_id, p_organization_id;

  if v_row is null then
    raise exception 'There is no % you can open with that id in this organization.', t.label
      using errcode = '02000',
            hint = 'DOOR-1: this door reads the row as YOU, through the table''s own access rules - so a row somebody has not shared with you is the same answer as a row that is not there. Ask whoever holds it to share it with you.';
  end if;

  v_doc := v_row -> 'custom_fields';
  if v_doc is null or jsonb_typeof(v_doc) <> 'object' then v_doc := '{}'::jsonb; end if;

  -- The definitions live in schema `custom`, which a person holds nothing in, so they come
  -- through the definitions door rather than a read of the table.
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
           'id',           f.id,
           'key',          f.data ->> 'key',
           'label',        f.data ->> 'label',
           'type',         f.data ->> 'type',
           'parity_type',  f.data ->> 'parity_type',
           'format',       f.data ->> 'format',
           'unit',         f.data ->> 'unit',
           'multi',        f.data -> 'multi',
           'required',     f.data -> 'required',
           'sort',         f.data -> 'sort',
           'sensitivity',  f.data ->> 'sensitivity',
           'options_table_id', f.data -> 'config' ->> 'options_table_id',
           'relation_target',  f.data ->> 'relation_target',
           'value',        v_doc -> (f.data ->> 'key'),
           'written',      v_doc -> '_values' -> (f.data ->> 'key')))), '[]'::jsonb)
    into v_fields
    from custom.entity_fields(p_organization_id, p_token) f;

  return jsonb_build_object(
    'token',           t.token,
    'label',           t.label,
    'type',            t.type,
    'id',              p_record_id,
    'organization_id', p_organization_id,
    'title',           case when t.title_column is not null then v_row ->> t.title_column end,
    -- REC-53, said in the answer itself: real columns, then the base contract, then custom
    -- fields. They are three named blocks rather than one flat bag, so nothing can quietly
    -- shadow anything.
    'columns',         v_row - 'custom_fields',
    'custom',          v_doc - '_values' - '_retired',
    'custom_written',  coalesce(v_doc -> '_values', '{}'::jsonb),
    'fields',          v_fields,
    'live',            (v_row ->> 'deleted_at') is null);
end
$function$;


-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 6. WRITE CUSTOM VALUES ON A STANDARD ROW
-- ─────────────────────────────────────────────────────────────────────────────────────────
-- SECURITY INVOKER for the same reason: the UPDATE runs as the person, so the table's own
-- `std_update` policy decides, and `custom._entity_custom_fields_guard` validates and
-- envelopes what lands. A person who may edit the contact may edit its custom fields.
CREATE OR REPLACE FUNCTION custom.entity_value_write(p_organization_id uuid, p_token text, p_record_id uuid, p_patch jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'pg_catalog'
AS $function$
declare
  t       record;
  v_doc   jsonb;
  v_key   text;
  v_n     int;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.entity_value_write');
  select * into t from custom.entity_table(p_token);
  perform custom.assert_entity_is_organization_scoped(t.token, t.label, t.has_organization);

  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'A write names the fields it is setting and what to set them to.'
      using errcode = '22023',
            hint = 'Pass {"key": value}. A key set to null clears that value; a key left out is left alone. Nothing was written.';
  end if;

  execute format('select coalesce(x.custom_fields, %L::jsonb) from %I.%I x where x.id = $1 and x.organization_id = $2',
                 '{}', t.schema_name, t.table_name)
    into v_doc using p_record_id, p_organization_id;
  if v_doc is null then
    raise exception 'There is no % you can open with that id in this organization.', t.label
      using errcode = '02000',
            hint = 'DOOR-1 decides reading and writing with the same question: a row you may not open is a row you may not change.';
  end if;
  if jsonb_typeof(v_doc) <> 'object' then v_doc := '{}'::jsonb; end if;

  -- A PATCH, not a replacement: a key left out is left alone, and a key set to null is
  -- cleared - including its envelope, because a value that is gone has no author.
  for v_key in select k from jsonb_object_keys(p_patch) k loop
    if jsonb_typeof(p_patch -> v_key) = 'null' and left(v_key, 1) <> '_' then
      v_doc := v_doc - v_key;
      if jsonb_typeof(v_doc -> '_values') = 'object' then
        v_doc := jsonb_set(v_doc, '{_values}', (v_doc -> '_values') - v_key);
      end if;
    else
      v_doc := jsonb_set(v_doc, array[v_key], p_patch -> v_key, true);
    end if;
  end loop;

  execute format('update %I.%I x set custom_fields = $1 where x.id = $2 and x.organization_id = $3',
                 t.schema_name, t.table_name)
    using v_doc, p_record_id, p_organization_id;
  get diagnostics v_n = row_count;
  if v_n = 0 then
    raise exception 'You can see this %, but it is not yours to change.', t.label
      using errcode = '42501',
            hint = 'DOOR-1: this door writes as YOU, through the table''s own access rules. It would take the editor level, or a share of this row with you. Nothing was written.';
  end if;

  return custom.entity_record_read(p_organization_id, p_token, p_record_id);
end
$function$;


-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 7. FIND ROWS BY A CUSTOM VALUE
-- ─────────────────────────────────────────────────────────────────────────────────────────
-- Also SECURITY INVOKER, so the rows that come back are exactly the rows the person could
-- already list. A filter is not a way around the wall.
CREATE OR REPLACE FUNCTION custom.entity_records_find(p_organization_id uuid, p_token text, p_key text,
                                           p_value jsonb DEFAULT NULL,
                                           p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path TO 'pg_catalog'
AS $function$
declare
  t      record;
  v_rows jsonb;
  v_lim  int := least(greatest(coalesce(p_limit, 50), 1), 500);
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.entity_records_find');
  select * into t from custom.entity_table(p_token);
  perform custom.assert_entity_is_organization_scoped(t.token, t.label, t.has_organization);

  if not exists (select 1 from custom.entity_fields(p_organization_id, p_token) f
                  where f.data ->> 'key' = p_key) then
    raise exception '% has no custom field called "%" in this organization.', t.label, p_key
      using errcode = '23514',
            hint = 'REC-40 / FLD-8: filtering by a field nobody declared would quietly return nothing and look like an empty result. Declare it first, or ask for the fields this table has.';
  end if;

  execute format(
    'select coalesce(jsonb_agg(jsonb_build_object('
    || '''id'', x.id, ''title'', %s, ''value'', x.custom_fields -> $1) order by x.id), ''[]''::jsonb) '
    || 'from (select * from %I.%I y where y.organization_id = $2 '
    ||       'and y.custom_fields ? $1 '
    ||       'and ($3::jsonb is null or y.custom_fields -> $1 = $3) '
    ||       '%s order by y.id limit $4 offset $5) x',
    case when t.title_column is null then 'null::text'
         else format('x.%I::text', t.title_column) end,
    t.schema_name, t.table_name,
    case when t.has_deleted_at then 'and y.deleted_at is null' else '' end)
    into v_rows using p_key, p_organization_id, p_value, v_lim, greatest(coalesce(p_offset, 0), 0);

  return jsonb_build_object('token', t.token, 'label', t.label, 'key', p_key,
                            'value', p_value, 'rows', v_rows,
                            'count', jsonb_array_length(v_rows));
end
$function$;


-- ─────────────────────────────────────────────────────────────────────────────────────────
-- THE GRANTS, AND THE DECLARATION EACH ONE STANDS ON
-- ─────────────────────────────────────────────────────────────────────────────────────────
INSERT INTO platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, signed_in_callers)
VALUES
  -- THE STORE'S ONE ORGANIZATION-WALL PREDICATE, reachable by the seat. The three value
  -- doors are SECURITY INVOKER, so they run AS the person and cannot call a predicate the
  -- person may not execute. The alternative was a second wording of the same wall inside
  -- each of them, which is the thing this campaign refuses to do. It takes no entity id, it
  -- reads nothing, and it either returns void or raises - it can tell a caller nothing they
  -- did not already know about their own membership.
  ('custom','assert_client_may_reach','p_organization_id uuid, p_door text', ARRAY['uuid'::regtype,'text'::regtype]::oid[],
   'p_organization_id is the organization the caller says they are working in and is the only thing this predicate judges - iam.has_org_access decides it, NULL is refused by name with 22004. p_door is a label used in the refusal sentence. It reads no row of any table and returns void or raises.',
   'migrations/campaign/entityfields_the_doors_a_person_reaches.sql', true),
  ('custom','assert_entity_is_organization_scoped','p_token text, p_label text, p_scoped boolean', ARRAY['text'::regtype,'text'::regtype,'bool'::regtype]::oid[],
   'IMMUTABLE and takes no id at all: three words about a table shape that custom.entity_table has already read from the public registry. It returns void or raises the one sentence that says why a table with no organization_id cannot hold an organization''s custom value.',
   'migrations/campaign/entityfields_the_doors_a_person_reaches.sql', true),
  ('custom','entity_table','p_token text', ARRAY['text'::regtype]::oid[],
   'p_token is a platform.entity_types token and carries no entity id. It answers from the public registry only - which table a token names, its type, and whether it can hold a custom value - and reads no row of any table.',
   'migrations/campaign/entityfields_the_doors_a_person_reaches.sql', true),
  ('custom','entity_fields','p_organization_id uuid, p_token text', ARRAY['uuid'::regtype,'text'::regtype]::oid[],
   'p_organization_id is checked by custom.assert_client_may_reach (membership of that organization) before anything is read; NULL is refused there by name. p_token is a registry token, not an entity id. Field definitions are organization-wide, so membership is the whole question.',
   'migrations/campaign/entityfields_the_doors_a_person_reaches.sql', true),
  ('custom','entity_field_declare','p_organization_id uuid, p_token text, p_spec jsonb', ARRAY['uuid'::regtype,'text'::regtype,'jsonb'::regtype]::oid[],
   'p_organization_id is checked by custom.assert_client_may_reach and then by iam.has_org_admin - changing the shape of a shared table is an owner''s or admin''s right; NULL is refused by name. p_token is a registry token. p_spec carries no id that reaches another organization: a relation target is resolved inside the same organization by custom._field_document_for.',
   'migrations/campaign/entityfields_the_doors_a_person_reaches.sql', true),
  ('custom','entity_field_update','p_organization_id uuid, p_field_id uuid, p_patch jsonb', ARRAY['uuid'::regtype,'uuid'::regtype,'jsonb'::regtype]::oid[],
   'p_organization_id is checked by custom.assert_client_may_reach then iam.has_org_admin. p_field_id is looked up WITH that organization_id in the predicate, so a field of another organization answers "not a custom field of a standard table in this organization" and nothing is disclosed; NULL answers the same.',
   'migrations/campaign/entityfields_the_doors_a_person_reaches.sql', true),
  ('custom','entity_field_retire','p_organization_id uuid, p_field_id uuid', ARRAY['uuid'::regtype,'uuid'::regtype]::oid[],
   'p_organization_id is checked by custom.assert_client_may_reach then iam.has_org_admin. p_field_id is looked up WITH that organization_id in the predicate, so a field of another organization is not found; NULL answers the same.',
   'migrations/campaign/entityfields_the_doors_a_person_reaches.sql', true),
  ('custom','entity_record_read','p_organization_id uuid, p_token text, p_record_id uuid', ARRAY['uuid'::regtype,'text'::regtype,'uuid'::regtype]::oid[],
   'SECURITY INVOKER: p_record_id is read by a statement running as the caller, so the standard table''s own RLS decides and a row the caller may not open answers 02000 exactly as a row that does not exist. p_organization_id is checked by custom.assert_client_may_reach first and is also in the predicate; NULL is refused there by name. p_token is a registry token.',
   'migrations/campaign/entityfields_the_doors_a_person_reaches.sql', true),
  ('custom','entity_value_write','p_organization_id uuid, p_token text, p_record_id uuid, p_patch jsonb', ARRAY['uuid'::regtype,'text'::regtype,'uuid'::regtype,'jsonb'::regtype]::oid[],
   'SECURITY INVOKER: p_record_id is written by an UPDATE running as the caller, so the standard table''s own update policy decides and a row the caller may not change writes zero rows and is refused by name. p_organization_id is checked by custom.assert_client_may_reach and is in the predicate; NULL is refused by name. p_token is a registry token.',
   'migrations/campaign/entityfields_the_doors_a_person_reaches.sql', true),
  ('custom','entity_records_find','p_organization_id uuid, p_token text, p_key text, p_value jsonb, p_limit integer, p_offset integer', ARRAY['uuid'::regtype,'text'::regtype,'text'::regtype,'jsonb'::regtype,'int4'::regtype,'int4'::regtype]::oid[],
   'SECURITY INVOKER: the select runs as the caller, so the standard table''s own RLS decides which rows can be counted or listed and the filter is not a way around the wall. p_organization_id is checked by custom.assert_client_may_reach and is in the predicate; NULL is refused by name. p_key must be a field this organization declared, or the door refuses rather than returning an empty list.',
   'migrations/campaign/entityfields_the_doors_a_person_reaches.sql', true)
ON CONFLICT (schema_name, function_name, identity_argtypes) DO NOTHING;

GRANT EXECUTE ON FUNCTION custom.assert_client_may_reach(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION custom.assert_entity_is_organization_scoped(text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION custom.entity_table(text) TO authenticated;
GRANT EXECUTE ON FUNCTION custom.entity_fields(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION custom.entity_field_declare(uuid, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION custom.entity_field_update(uuid, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION custom.entity_field_retire(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION custom.entity_record_read(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION custom.entity_value_write(uuid, text, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION custom.entity_records_find(uuid, text, text, jsonb, integer, integer) TO authenticated;

COMMENT ON FUNCTION custom.entity_record_read(uuid, text, uuid) IS
  'REC-53: a standard row is its real columns plus the base contract plus its organization''s custom fields, in ONE answer. SECURITY INVOKER - the standard table''s own RLS decides.';
