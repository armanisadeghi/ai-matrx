-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.checklist_steps_table(uuid) 752dde8c3e20725422a43899f94f95fab820675ba8f3facb658de97690aaa102
--
-- FIELD-TRUTH (1 of 2) — NAMING THE CLASSES THAT LIVE UNDER `data_class = 'record'`.
--
-- THE DEFECT, from the real-data crews of 2026-09-20/21: `custom.record_write` accepts a
-- value for a key nobody declared. It is stored, it reads back through the doors, and it is
-- invisible in every grid and in every agent tool's schema, because both of those read the
-- Table's Field rows. Crew A hit it on Birchwood Avenue Renovation — every quote carries a
-- `room` that no column knows about. Lane LIMITS-FIX proved a blanket refusal would break
-- live writers, so the class needs the taxonomy BEFORE it can have a door, and that is what
-- this file is. The door itself is `fieldtruth_a_record_carries_only_declared_fields.sql`.
--
-- THE CENSUS, on the main database, 2026-09-21. 14,004 rows in `custom.record` across 16
-- values of `data_class`. The taxonomy is already half honest: `table`, `field`, `rule`,
-- `relation`, `work_template`, `doc_template`, `checklist_template`, `sign_request` and the
-- rest are their own classes with their own shape guards. What is NOT named is the split
-- inside `data_class = 'record'` itself — 6,847 rows, 6,836 of them belonging to a Table:
--
--   · 936 belong to one of the NINE KERNEL Tables (Person 848, Rule 47, Organization 32,
--     File 9). A kernel Table has ZERO Field rows and always will: its shape is defined in
--     platform code, which is why `custom._record_field_validation` already exempts two of
--     the nine by name. Their documents carry `name`, `full_name`, `user_id`, `expr`,
--     `uses`, `scope_table_id`, `mime_type`, `storage_key` — none of them a column anybody
--     typed.
--   · 8 belong to a `checklist_step` Table (2 organizations), whose own door says in its own
--     comment that `position`, `run_id`, `ref`, `role`, `depends_on_ids`, `requires` and
--     `evidence` "are the checklist's own machinery and stay document keys". That is a
--     DOCUMENT Table: it has Field rows (Step) AND code-written keys.
--   · the remaining ~5,900 belong to an organization's OWN Table, where the doctrine is
--     absolute: the Table's Field rows are the one source of truth for its columns.
--
--   Undeclared keys in live data, once platform keys and those two classes are set aside:
--   223 values, over 209 records, 60 Tables, 8 organizations — ALL of them scalar (197
--   strings, 26 numbers), so every one is repairable into a real Field with no guesswork.
--   `scripts/campaign-tests/fieldtruth_repair_undeclared_keys.sql` is that repair.
--
-- WHAT THIS FILE ADDS. One word on the Table row, `columns`:
--   · `fields`    (the default, and what every Table means when it says nothing) — the
--                 Table's Field rows are its columns, and a record of it carries no other
--                 key. This is the doctrine.
--   · `free_form` — the document's shape is defined somewhere other than the Field rows:
--                 platform code, or the author's own free text. Its Field rows are still
--                 its known columns and the grid still draws them; other keys pass.
-- A kernel Table is `free_form` BY DEFINITION and needs no row to say so, because code is
-- where its shape lives. Every other Table says it, or says nothing and means `fields`.
--
-- PLATFORM KEYS are the third thing, and they belong to NO Table: `parent_id` is read by
-- `custom.containment_parent` on every record in the store, and every `_`-prefixed key is
-- an envelope the platform writes (`_values`, `_sources`, `_computed`, `_derived`,
-- `_retired`, `_pipeline_entry`, and the import path's `_source`). None of them is ever a
-- Field, and declaring one as a column would be a second name for a thing that has one.
--
-- REC-1 (a Table declares its fields) · REC-51 (a validation trigger enforces the field
-- definitions on write).

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- The keys that belong to the platform rather than to any Table.
-- ─────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION custom.record_platform_keys()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'pg_catalog'
AS $function$
  -- `parent_id` is containment (REC-7/REC-8) and is read by custom.containment_parent on
  -- every record in the store. Everything else the platform writes into a document is
  -- `_`-prefixed and is recognised by that prefix, not by this list.
  select array['parent_id']::text[];
$function$;

COMMENT ON FUNCTION custom.record_platform_keys() IS
  'FIELD-TRUTH: keys of a record document that belong to the platform and are never Fields. The `_`-prefixed envelope keys are recognised by their prefix and are not listed here.';

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- Where a Table's columns come from: `code`, `free_form`, or `fields`.
-- ─────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION custom.table_column_source(p_organization_id uuid, p_table_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_class text;
  v_word  text;
begin
  -- A record with no Table is a Home, and a Home is not a row of anything.
  if p_table_id is null then
    return 'free_form';
  end if;

  select r.data_class, nullif(r.data ->> 'columns', '')
    into v_class, v_word
    from custom.record r
   where r.organization_id = p_organization_id
     and r.id = p_table_id
   limit 1;

  -- A Table this organization cannot see is a question for the organization wall
  -- (custom._organization_wall_guard), never for this function. It judges nothing.
  if v_class is null then
    return 'free_form';
  end if;

  -- THE KERNEL. Its nine Tables are defined in platform code and hold no Field rows;
  -- custom._record_field_validation already exempts two of them by name for this reason.
  if v_class = 'kernel' then
    return 'code';
  end if;

  if v_word = 'free_form' then
    return 'free_form';
  end if;

  -- SILENCE MEANS THE DOCTRINE. A Table that says nothing has Field rows for columns.
  return 'fields';
end;
$function$;

COMMENT ON FUNCTION custom.table_column_source(uuid, uuid) IS
  'FIELD-TRUTH: `code` for a kernel Table, `free_form` for a Table that declared itself a document, `fields` for every other Table — whose Field rows are the one source of truth for its columns.';

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- The keys of a document that no Field of its Table accounts for.
-- ─────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION custom.undeclared_keys(p_organization_id uuid, p_table_id uuid, p_data jsonb)
 RETURNS text[]
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
  -- EVERY Field row of the Table, not custom.applicable_fields: a Value for a Field that
  -- does not apply to THIS record's type is a different question entirely, and
  -- custom._record_field_validation's retype path already answers it by moving the value
  -- into `_retired` with its reason. Asking applicable_fields here would call such a value
  -- undeclared and refuse a write that is perfectly legal.
  select coalesce(array_agg(k.key order by k.key), array[]::text[])
    from jsonb_object_keys(case when jsonb_typeof(p_data) = 'object' then p_data else '{}'::jsonb end) k(key)
   where left(k.key, 1) <> '_'
     and not (k.key = any (custom.record_platform_keys()))
     and not exists (
           select 1
             from custom.record f
            where f.organization_id = p_organization_id
              and f.table_id = custom.field_kernel_id()
              and f.data_class = 'field'
              and f.deleted_at is null
              and f.data ->> 'entity_definition_id' = p_table_id::text
              and f.data ->> 'key' = k.key);
$function$;

COMMENT ON FUNCTION custom.undeclared_keys(uuid, uuid, jsonb) IS
  'FIELD-TRUTH: the keys of a record document that no Field row of its Table accounts for, platform keys and `_`-prefixed envelopes set aside.';

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- A Table may only say one of the two words.
-- ─────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION custom._table_columns_word_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
begin
  -- Deliberately NOT folded into custom._table_shape_guard: replacing a 217-line live guard
  -- to add one sentence is how a fix takes something else down with it. This asks its own
  -- question, in its own body, and every other refusal that guard makes is untouched.
  if new.data_class <> 'table' then
    return new;
  end if;
  if (new.data ? 'columns')
     and coalesce(new.data ->> 'columns', '') not in ('fields', 'free_form') then
    raise exception 'a table''s columns come from its fields or the table is free-form, and this one says %',
                    custom.said(new.data ->> 'columns', 'nothing')
      using errcode = '23514',
            hint = 'REC-1: `columns` is `fields` (its Field rows are its columns, the default) or `free_form` (its shape is defined in code or by the author, and other keys pass). Leave it out to mean `fields`.';
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE TRIGGER zzz_table_columns_word
  BEFORE INSERT OR UPDATE ON custom.record
  FOR EACH ROW EXECUTE FUNCTION custom._table_columns_word_guard();

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- The checklist's own Table declares what it has always been: a document Table.
-- Every other byte of this door is unchanged.
-- ─────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION custom.checklist_steps_table(p_organization_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_id   uuid;
  v_home uuid;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.checklist_steps_table');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.checklist_steps_table');

  select r.id into v_id
    from custom.record r
   where r.organization_id = p_organization_id
     and r.table_id = custom.table_kernel_id()
     and r.data ->> 'slug' = 'checklist_step'
     and r.deleted_at is null
   limit 1;
  if v_id is not null then
    return v_id;
  end if;

  select coalesce(
    (select nullif(t.data ->> 'parent_id', '')::uuid
       from custom.record t
      where t.organization_id = p_organization_id
        and t.table_id = custom.table_kernel_id()
        and t.deleted_at is null
        and nullif(t.data ->> 'parent_id', '') is not null
      order by t.created_at
      limit 1),
    (select r.id
       from custom.record r
      where r.organization_id = p_organization_id
        and r.table_id is null
        and r.data_class = 'record'
        and r.deleted_at is null
      order by r.created_at
      limit 1))
    into v_home;
  if v_home is null then
    raise exception 'This organization has nowhere to keep its tables yet, so the checklist steps have nowhere to live either.'
      using errcode = '23503',
            hint = 'REC-1: every Table lives in a Home. Make this organization''s first table, or its Home, and the checklist will keep its steps beside it.';
  end if;

  insert into custom.record (organization_id, table_id, data_class, data)
  values (p_organization_id, custom.table_kernel_id(), 'table', jsonb_build_object(
    'name',           'Checklist steps',
    'slug',           'checklist_step',
    'type',           'entity',
    'label_singular', 'Step',
    'label_plural',   'Steps',
    'title_field',    'title',
    'display',        'list',
    'weight',         'light',
    'ordered',        true,
    'row_order',      'sorted',
    'default_sort',   jsonb_build_array(jsonb_build_object('field', 'position', 'direction', 'asc')),
    'agent_writable', true,
    'retention_days', 3650,
    'work_kind',      'checklist_step',
    -- FIELD-TRUTH 2026-09-21: THIS TABLE SAYS WHERE ITS COLUMNS COME FROM, OUT LOUD.
    -- The comment below has always been true of this table — `position`, `run_id`, `ref`,
    -- `role`, `depends_on_ids`, `requires`, `evidence`, `template` and `about_*` are the
    -- checklist's own machinery and are written into every step's document by code, not by
    -- a person typing into a column. `custom._undeclared_key_guard` refuses exactly that on
    -- a table whose Field rows are its columns, so the table now DECLARES that it is a
    -- document table: its Field rows are still its known columns (Step is one, and the grid
    -- draws it), and the machinery keys pass. Nothing else about it changes.
    'columns',        'free_form',
    'parent_id',      v_home::text,
    'fields', jsonb_build_array(jsonb_build_object('name', 'title'))))
  returning id into v_id;

  perform custom.work_take_assignment(p_organization_id, v_id);

  -- A CHECKLIST STEP IS TICKED OFF, NOT DRAGGED THROUGH A BOARD. `custom.work_states()` ships
  -- the general model — Not started may become In progress or Cancelled, and only In progress
  -- may become Done — which is right for a quote or a deal somebody works on. A checklist step
  -- is a thing you DO and then tick: "Send the contract" has no In progress worth recording,
  -- and asking a person to move it twice is asking them to operate the software rather than do
  -- their job. The states are this TABLE's own vocabulary, held as records of its workflow-state
  -- Table, so this is exactly the change `custom.work_set_state`'s own hint names — "change the
  -- state records if this organization works differently" — and it changes nothing for any
  -- other Table. In progress stays available for the long ones.
  update custom.record s
     set data = s.data || jsonb_build_object('next', jsonb_build_array('In progress', 'Done', 'Cancelled'))
   where s.organization_id = p_organization_id
     and s.data ->> 'name' = 'Not started'
     and s.deleted_at is null
     and s.table_id = (select t.id from custom.record t
                        where t.organization_id = p_organization_id
                          and t.table_id = custom.table_kernel_id()
                          and t.data ->> 'slug' = left('checklist_step', 40) || '_work_state'
                          and t.deleted_at is null
                        limit 1);

  -- ONE declared Field: the step's own title, which is what the Table's `title_field` names
  -- and what every list of records shows. `position`, `run_id`, `ref`, `role`, `depends_on_ids`,
  -- `requires` and `evidence` are the checklist's own machinery and stay document keys, the way
  -- `work_template`'s graph does — a Field for each of them would put seven columns nobody
  -- types into in front of a person.
  --
  -- NO `parity_type`. FLD-11's list is select, multi_select, member, attachment, lookup,
  -- rollup, formula, url, email, phone, currency, percent, datetime — `text` is a BASE type
  -- and naming it as a parity type is refused by `custom._field_type_parity_guard`, which is
  -- how this was found (main database, 15:23 UTC): "the field Step says it is a text and that
  -- is not one of the field types this system ships".
  insert into custom.record (organization_id, table_id, data_class, data)
  values (p_organization_id, custom.field_kernel_id(), 'field',
          jsonb_build_object('key', 'title', 'label', 'Step', 'sort', 10,
                             'type', 'text',
                             'multi', false, 'dated', false, 'required', true,
                             'source', 'manual', 'config', '{}'::jsonb, 'rules', '[]'::jsonb,
                             'depends_on', '[]'::jsonb, 'source_config', '{}'::jsonb,
                             'sensitivity', 'internal', 'context_policy', 'include',
                             'applies_to_types', '[]'::jsonb, 'promoted', false, 'unique', false,
                             'entity_definition_id', v_id::text));

  return v_id;
end
$function$

;
