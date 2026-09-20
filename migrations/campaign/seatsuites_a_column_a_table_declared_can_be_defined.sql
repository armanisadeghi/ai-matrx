-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.field_declare(uuid, uuid, jsonb) 3bda8ac78a62ed1e1b129687b9307eff8f14fd7d0b0d6ae9ec676c0e8f10de36
--
-- SEAT-SUITES — A COLUMN A TABLE DECLARED CAN BE DEFINED.
--
-- FOUND BY RUNNING A CAMPAIGN SUITE FROM THE SEAT A SIGNED-IN PERSON HAS. Every campaign
-- suite before 2026-09-20 ran as the role that OWNS `custom.record`, and in that seat a
-- suite can INSERT a Field row straight into the table. Every one of them did. From the
-- seat `authenticated` that INSERT is `permission denied for table record`, and the only
-- door that makes a Field row is `custom.field_declare` — which refused every name the
-- table had declared.
--
-- THE SHAPE OF THE HOLE. `custom._table_shape_guard` refuses a table declaring no fields
-- ("a table has to declare its fields", REC-1), so every table made through
-- `custom.table_declare` names at least one column. `table_declare` writes the NAME into
-- the table's `fields` list and makes NO Field row. So:
--
--   custom.table_declare(org, {... fields:[{name:'pname'}] ...})
--   custom.applicable_fields(org, table)                      ->  0 rows
--   custom.field_declare(org, table, {label:'Pname', plain:'text'})
--                          ->  23505 'This table already has a field called "Pname".'
--   custom.applicable_fields(org, table)                      ->  0 rows
--
-- A table whose first column shows on no screen, has no type, enforces no rule, and can
-- never be given one — through the doors a product has. Measured on the main database,
-- 2026-09-19, organization ZZ SEAT probe3, seat `authenticated`.
--
-- THE RULE, STATED THE WAY A PERSON WOULD. A column the table declared and never defined is
-- FILLED IN by the door that defines columns. Only a column that already HAS a definition is
-- a duplicate, and that is still refused by name with the same sentence. Nothing else changes:
-- the door still asks the store switch, the organization wall and the admin right first, and a
-- name the table never declared is still appended to the table's list exactly as before.
--
-- WHAT MAKES IT FAIL (rule 3): put the `jsonb_array_elements(v_fields)` test back in place of
-- the Field-row test, which is exactly what
-- `migrations/inverse/seatsuites_a_column_a_table_declared_can_be_defined_down.sql` does.
-- `scripts/campaign-tests/seatsuites_red.sql` runs that inverse inside a rolled-back
-- transaction and the clause flips.

CREATE OR REPLACE FUNCTION custom.field_declare(p_organization_id uuid, p_table_id uuid, p_spec jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_doc     jsonb;
  v_listed  boolean;
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

  -- ── SEAT-SUITES, 2026-09-19: A COLUMN A TABLE DECLARED COULD NEVER BE DEFINED. ──────
  -- `custom._table_shape_guard` refuses a table that declares no fields, so EVERY table made
  -- through `custom.table_declare` names at least one column. `table_declare` writes only the
  -- NAME into the table's `fields` list — it makes no Field row — so `custom.applicable_fields`
  -- answers ZERO columns for a brand-new table, and this door then refused every one of those
  -- names as "already there". Through the doors alone, a signed-in person's first column had no
  -- type, no rules, no validation and no way to ever get one. The old suites never saw it
  -- because they INSERTed the Field rows straight into `custom.record` as the role that owns
  -- the table — a privilege no person has. Measured from the seat `authenticated` on the main
  -- database on 2026-09-19: applicable_fields = 0, then 23505 "This table already has a field
  -- called Pname", then applicable_fields = 0 again.
  --
  -- THE RULE: a NAME the table declared and never defined is FILLED IN by this door. Only a
  -- name that already has a Field ROW is a duplicate, and that is still refused by name.
  v_listed := exists (select 1 from jsonb_array_elements(v_fields) f where f ->> 'name' = v_key);
  if exists (select 1 from custom.record r
              where r.organization_id = p_organization_id
                and r.table_id = custom.field_kernel_id()
                and r.data_class = 'field'
                and r.deleted_at is null
                and r.data ->> 'entity_definition_id' = p_table_id::text
                and r.data ->> 'key' = v_key) then
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
  -- A name the table already declared is not added to the list a second time; a table that
  -- listed the same column twice would show it twice on every screen.
  if not v_listed then
    update custom.record
       set data = jsonb_set(data, '{fields}',
                            coalesce(data -> 'fields', '[]'::jsonb)
                            || jsonb_build_array(jsonb_build_object('name', v_key))),
           updated_at = now(), version = version + 1
     where organization_id = p_organization_id
       and id = p_table_id
       and table_id = custom.table_kernel_id();
  end if;

  -- `data_class = 'field'` is the other half of what no client could write. A
  -- field stored as a plain record is invisible to the delete rules and to the
  -- formula-dependency check (the 19 September verdict's defect 1).
  insert into custom.record (organization_id, table_id, data_class, data)
  values (p_organization_id, custom.field_kernel_id(), 'field', v_doc)
  returning id into v_id;

  return v_id;
end
$function$

;
