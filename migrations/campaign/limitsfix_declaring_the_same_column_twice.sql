-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.capture_sheet_declare(uuid, uuid, text, jsonb, jsonb, uuid, uuid) 03479548bea43816a33bf3ebb9e43721b129b7518f4e5e9bb81b90f434c5a150
-- based-on: custom.field_declare(uuid, uuid, jsonb) 33ebfeb5fee49367112876bf18c4eb74e15fd05c9ea5b3a638a9aea8c095f6c4
--
-- LIMITS-FIX — SAYING THE SAME TRUE THING TWICE IS NOT A CONTRADICTION.
--
-- TWO limitations the real-data crews hit on 2026-09-21, and one hole a guard named.
--
-- 1. DECLARING A COLUMN THAT IS ALREADY THAT COLUMN. Crew A: "Create and import a file"
--    on a brand-new table answered 409 on the table's OWN default Title column — the
--    create path declares Title, the import path declares Title, and the second was
--    treated as a conflict. Crew E2 hit the same wall on a table whose own column is
--    called `name`: SQLSTATE 23505 on New record and on import. Neither caller wanted a
--    second column. `custom.field_declare` is now idempotent on the thing that makes a
--    column what it is: the same key with the same TYPE is that column, returned unchanged
--    and not written again. The same key with a DIFFERENT type is still refused by name,
--    because silently retyping a live column would take its values with it.
--
-- 2. THE ORGANIZATION WALL, ASKED IN THE DOOR'S OWN BODY. `pnpm check:store-doors-decide`
--    names `custom.capture_sheet_declare` twice: client-callable, SECURITY DEFINER, takes
--    an organization id, and its body never reaches the one ladder. The WRITE was never
--    open — `custom.form_declare` asks `custom.assert_client_may_change` — but the
--    `published_at` read happens BEFORE that delegation and ran as the definer, so a
--    caller outside the organization could learn whether a sheet id is a published form in
--    someone else's. Borrowing a delegate's check leaves everything above the delegation
--    unguarded. (That door is lane FORMS/CAPTURE's; this is the one missing line, added
--    where the guard asks for it, and it changes nothing for a caller who belongs.)
--
CREATE OR REPLACE FUNCTION custom.capture_sheet_declare(p_organization_id uuid, p_table_id uuid, p_title text, p_questions jsonb, p_presentation jsonb DEFAULT '{}'::jsonb, p_sheet_id uuid DEFAULT NULL::uuid, p_notify_rule_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_id      uuid;
  v_pub     timestamptz;
  v_present jsonb;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.capture_sheet_declare');
  -- ── LIMITS-FIX 2026-09-21: THE ORGANIZATION WALL, ASKED HERE AND NOT ONLY DOWNSTREAM. ──
  -- `pnpm check:store-doors-decide` names this door twice: client-callable, SECURITY
  -- DEFINER, takes an organization id, and its body never reaches the one ladder. The write
  -- itself was never open — `custom.form_declare` below asks
  -- `custom.assert_client_may_change` — but the published_at READ under this line runs as
  -- the definer BEFORE that delegation, so a caller outside the organization could learn
  -- whether a given sheet id is a published form in someone else's. A door that takes an
  -- organization id asks the wall in its OWN body; borrowing a delegate's check leaves
  -- everything above the delegation unguarded, which is precisely what happened here.

  if p_sheet_id is not null then
    select published_at into v_pub from custom.anon_form
     where organization_id = p_organization_id and id = p_sheet_id and deleted_at is null;
    if v_pub is not null then
      raise exception 'That form is published to the public, so it cannot also be a crew capture sheet.'
        using errcode = '23514',
              hint = 'A public form takes answers from strangers with the link; a capture sheet takes them from members of this organization who hold editor on the table. Close the public form first, or make the capture sheet as a new one.';
    end if;
  end if;

  -- A capture sheet is filled standing up, in the rain, on a phone. One question at a time
  -- is the default because it is the only flow that fits, not because it is fashionable.
  v_present := jsonb_build_object('flow', 'one-at-a-time') || coalesce(p_presentation, '{}'::jsonb);

  v_id := custom.form_declare(p_organization_id, p_table_id, p_title, p_questions,
                              v_present, null, null, p_notify_rule_id, p_sheet_id, null);

  update custom.anon_form set audience = 'crew'
   where organization_id = p_organization_id and id = v_id;

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
  v_same     uuid;
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

  -- ── LIMITS-FIX 2026-09-21: DECLARING THE SAME COLUMN TWICE IS THE SAME COLUMN. ───────
  -- Real-data crew A: "Create and import a file" on a brand-new table answered 409 on the
  -- table's OWN default Title column — the create path declares Title, the import path
  -- declares Title, and the second one was a conflict. Real-data crew E2 hit the same wall
  -- from another direction with a table whose own column is called `name`. Neither caller
  -- was asking for a second column; both were saying the same true thing twice, and the
  -- store treated the repetition as a contradiction.
  -- THE RULE: the same key with the same TYPE already defined is that column, returned
  -- unchanged and not written again — declaring is idempotent, as a declaration should be.
  -- The same key with a DIFFERENT type is a real conflict and is still refused by name,
  -- because silently retyping a live column would take its values with it.
  select r.id into v_same
    from custom.record r
   where r.organization_id = p_organization_id
     and r.table_id = custom.field_kernel_id()
     and r.data_class = 'field'
     and r.deleted_at is null
     and r.data ->> 'entity_definition_id' = p_table_id::text
     and r.data ->> 'key' = v_key
     and coalesce(r.data ->> 'type', r.data ->> 'plain', 'text')
         is not distinct from coalesce(v_doc ->> 'type', v_doc ->> 'plain', 'text')
   limit 1;
  if v_existing is null and v_same is not null then
    return v_same;
  end if;

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
