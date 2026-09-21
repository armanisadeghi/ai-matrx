-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.table_declare(uuid, jsonb) 986fc6a64700eea797cf3b23bacdc25e105846731987b023d97954f556c10dc8
-- based-on: custom.field_declare(uuid, uuid, jsonb) 677bca827a0c1803af93c4d199d63daddd96a275a7fb9cf91a80a039c5ae8003
--
-- LIMITS-FIX — STEP TWO OF THE DOCUMENTED BUILD MET A COLUMN STEP ONE HAD JUST MADE.
--
-- `limitsfix_a_table_s_declared_fields_exist.sql` made `custom.table_declare` materialise
-- the columns a table's spec names — the fix for real-data crews C and D, who declared
-- tables with inline fields and then found `store.fields()` answering an empty array.
-- But the DOCUMENTED way to build a table is two steps:
--
--   1. custom.table_declare(org, {... fields: [{name: 'title'}] ...})
--   2. custom.field_declare(org, table, {label: 'Title', type: 'text'})
--
-- and step two derives the same key from the label, so it now met a row that already
-- existed and refused it:
--
--   ERROR:  This table already has a field called "Title".   [23505]
--
-- `pnpm check:store-doors-decide` went red on exactly that, at its T10 probe, within
-- minutes of the apply. A two-step build that the store's own guard performs is not an
-- edge case; it is the path.
--
-- THE RULE, and it is the one-source-of-truth rule seen from the other side: a column that
-- `custom.table_declare` created and NOBODY has defined yet is the SAME column step two is
-- describing, so step two DEFINES it — the type, the rules, the choices and the label the
-- caller is now giving — rather than refusing it as a twin of itself. `table_declare`
-- stamps each column it materialises `declared_with_table`; `field_declare` fills such a
-- column in and drops the marker in the same write, so a THIRD attempt at that key is an
-- ordinary duplicate and is refused exactly as it always was. A field somebody has already
-- defined is never silently overwritten by this door.
--
-- This preserves both halves of what the crews needed: the columns exist the moment the
-- table does (so the grid, the rollups and `custom.applicable_fields` can see them), and
-- defining them afterwards still works.
--
CREATE OR REPLACE FUNCTION custom.table_declare(p_organization_id uuid, p_spec jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_id    uuid;
  v_field jsonb;
  v_doc   jsonb;
  v_opts  uuid;
  v_n     integer := 0;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.table_declare');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.table_declare');

  if p_organization_id is null then
    raise exception 'custom.table_declare: organization_id is required - the store is keyed (organization_id, id)'
      using errcode = '22004';
  end if;
  insert into custom.record (organization_id, table_id, data_class, data)
  values (p_organization_id, custom.table_kernel_id(), 'table', coalesce(p_spec, '{}'::jsonb))
  returning id into v_id;

  -- ── LIMITS-FIX 2026-09-21: THE FIELDS A TABLE DECLARES NOW EXIST. ─────────────────────
  -- `custom._table_shape_guard` REFUSES a table that declares no fields, so every table
  -- made here names its columns — and this door used to write those names into the table's
  -- own document and make no Field record for any of them. The consequence, measured on the
  -- main database on 2026-09-21: of 770 tables in the store, 104 across 15 organizations
  -- hold 315 declared field names with NO backing Field record. For those tables
  -- `custom.applicable_fields` answers ZERO columns, so `store.fields()` returns an empty
  -- array for a table that plainly has columns and already holds rows using them; the grid
  -- has nothing to draw, and `custom.field_declare`'s own `via`/`of` validation — which
  -- reads that same list — cannot resolve a lookup or a rollup at all. Real-data crew D hit
  -- every one of those symptoms within ten minutes of starting a podcast episode pipeline.
  --
  -- The two halves were never reconciled: the table document said one thing and the Field
  -- records said another, and the store had no opinion about which was true. They are now
  -- written in ONE statement, so they cannot disagree at birth.
  --
  -- It reuses `custom._field_document_for` — the SAME builder `custom.field_declare` uses —
  -- rather than composing a second field document here, so a field born with its table and a
  -- field added later are the same kind of thing, validated by the same guards. The inline
  -- entry's own word for the column's name (`name`) is what that builder now reads.
  -- The table's `fields` list is NOT appended to: the spec already carries these names, and
  -- adding them again would show every column twice on every screen.
  --
  -- A field that cannot be made fails the WHOLE declaration. A table that half exists, with
  -- some of its columns real and the rest only named, is the state this fix is removing.
  if jsonb_typeof(p_spec -> 'fields') = 'array' then
    for v_field in select * from jsonb_array_elements(p_spec -> 'fields') loop
      v_n := v_n + 1;
      -- IN THE ORDER A PERSON WROTE THEM. `sort` is what every reader orders columns by, so
      -- position in the declared list becomes position on the screen unless the caller said
      -- otherwise. Without this the columns come back in whatever order the plan produced.
      if (v_field ->> 'sort') is null then
        v_field := v_field || jsonb_build_object('sort', v_n * 100);
      end if;

      v_doc := custom._field_document_for(p_organization_id, v_id, v_field);

      -- ── LIMITS-FIX 2026-09-21: THIS COLUMN WAS BORN WITH ITS TABLE, AND SAYS SO. ──────
      -- The documented way to build a table is two steps: declare the table naming its
      -- columns, then define each column with `custom.field_declare`. Once this door
      -- materialises the names, step two meets a row that already exists and used to be
      -- refused "This table already has a field called X" — which is how
      -- `pnpm check:store-doors-decide` went red within minutes of the first apply.
      -- The marker is what tells the two apart: a column this door created and NOBODY has
      -- defined yet is the SAME column step two is describing, so step two fills it in.
      -- `custom.field_declare` drops the marker the moment it does, so the second real
      -- attempt at the same key is a duplicate again and is refused by name.
      v_doc := v_doc || jsonb_build_object('declared_with_table', true);

      -- THE CHOICE LIST, exactly as `custom.field_declare` builds it: the words a person
      -- typed are kept the only way FLD-5/FLD-6 allows, as the records of a Table.
      if (v_doc ->> 'type') = 'list'
         and nullif(v_doc -> 'config' ->> 'options_table_id', '') is null then
        if jsonb_typeof(v_field -> 'options') is distinct from 'array'
           or jsonb_array_length(coalesce(v_field -> 'options', '[]'::jsonb)) = 0 then
          raise exception 'A list of choices needs its choices - "%" has none yet.', v_doc ->> 'label'
            using errcode = '23514',
                  hint = 'Give the field its choices in the table spec, as an options array beside its name. Nothing was created.';
        end if;
        v_opts := custom._options_table_for(p_organization_id, v_doc ->> 'label', v_field -> 'options');
        v_doc := jsonb_set(v_doc, '{config,options_table_id}', to_jsonb(v_opts::text));
      end if;

      insert into custom.record (organization_id, table_id, data_class, data)
      values (p_organization_id, custom.field_kernel_id(), 'field', v_doc);
    end loop;
  end if;

  return v_id;
end;
$function$

;

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
  v_existing uuid;
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

  -- ── RELATION-DECLARE, 2026-09-20: "MAY I POINT AT IT" IS "MAY I SEE IT". ───────────────
  -- Pointing a column at a Table is how that Table's titles get onto your screen: the picker
  -- lists its records and platform.relation_label hydrates a chip from each one. So the
  -- question this door was not asking is the question every OTHER door onto a Table asks
  -- (T10) - and this is the one that makes a LASTING link. A caller who names the target
  -- themselves is asked it here; the Person and File columns, whose target is a kernel Table
  -- this door fills in, are untouched.
  -- LIMITS-FIX 2026-09-21: `target_table` is the same question as `relation_target`
  -- (custom._field_document_for reads both), so the may-I-see-it check has to recognise
  -- both too. Reading only one word here would let a caller reach a Table it may not see
  -- simply by spelling the argument the other way.
  if coalesce(nullif(p_spec ->> 'relation_target', ''), nullif(p_spec ->> 'target_table', '')) is not null
     and nullif(v_doc ->> 'relation_target', '') is not null then
    perform custom.assert_may_know_table(p_organization_id,
              (v_doc ->> 'relation_target')::uuid, 'custom.field_declare');
  end if;

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
  -- ── LIMITS-FIX 2026-09-21: A COLUMN BORN WITH ITS TABLE IS FILLED IN HERE, NOT REFUSED.
  -- `custom.table_declare` now materialises the columns a table's spec names, and stamps
  -- each one `declared_with_table`. The documented build is two steps — declare the table
  -- naming its columns, then define each column here — so meeting one of those rows means
  -- step two has arrived for a column step one only sketched, and the right answer is to
  -- DEFINE it: the type, the rules, the choices and the label the caller is now giving.
  -- The marker comes off in the same write, so a THIRD attempt at the same key is an
  -- ordinary duplicate and is refused exactly as it always was. A field somebody has
  -- already defined is never silently overwritten by this door.
  select r.id into v_existing
    from custom.record r
   where r.organization_id = p_organization_id
     and r.table_id = custom.field_kernel_id()
     and r.data_class = 'field'
     and r.deleted_at is null
     and r.data ->> 'entity_definition_id' = p_table_id::text
     and r.data ->> 'key' = v_key
     and coalesce((r.data ->> 'declared_with_table')::boolean, false)
   limit 1;

  if v_existing is null and exists (select 1 from custom.record r
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
  -- The sketch this table was born with becomes the column the caller just described.
  if v_existing is not null then
    update custom.record
       set data = v_doc, updated_at = now(), version = version + 1
     where organization_id = p_organization_id and id = v_existing;
    return v_existing;
  end if;

  insert into custom.record (organization_id, table_id, data_class, data)
  values (p_organization_id, custom.field_kernel_id(), 'field', v_doc)
  returning id into v_id;

  return v_id;
end
$function$

;
