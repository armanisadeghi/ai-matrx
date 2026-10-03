-- chair-step: this puts custom.field_declare back to the body viewsfields_bl_a_link_shows_on_both_tables.sql was written against (a new relation is no longer given an inverse_key it did not ask for; any inverse_key already stamped on a Field stays, as a caller-named one would), revokes and DROPs the two client doors that file added (custom.reverse_links_many, custom.reverse_columns) with their platform.client_callable_door rows, DROPs its two helpers (custom._inverse_key_default, custom._may_know_table) and archives nothing else. The knob row custom.back_links is deleted with its overrides (nothing else reads it once these bodies are gone).
-- lane: VIEWS-AND-FIELDS
-- guard: custom/system_enabled
-- based-on: custom.field_declare(uuid, uuid, jsonb) 9ad5692be23c1a7baa36fbe3ce841fcdcb2bec1848326bff8f599a51284e847e

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
  v_holder   text;          -- DATA-V2-BASICS: the label of the column already holding the key
  v_base     text;
  v_n        integer;
begin
  -- THE DECISION FIRST, BEFORE ANYTHING IS READ OR WRITTEN: the organization's
  -- own off switch, then the organization wall, then the right to change the
  -- SHAPE of this table, which is an admin's right and not an editor's -
  -- EXCEPT on a Table the app keeps for agent outputs (CHAIR-ACCESS a, NC-12): there a
  -- column is born the way a row is, by the first member whose output carries it (a newer
  -- kind version, a new data_table column), so a field add asks the Table's ADD rung
  -- (custom.table_add_rung: viewer, every member who may see it), never admin.
  perform custom.assert_store_door(p_organization_id, 'custom.field_declare');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.field_declare');
  perform custom.assert_client_may_change(p_organization_id, p_table_id, 'custom.field_declare',
                                          custom.field_add_rung(p_organization_id, p_table_id), 'table');
  -- VISION-REACH W4 (a): the organization's "Agent changes" setting, enforced here (custom._agent_change_gate).
  perform custom._agent_change_gate(p_organization_id, p_table_id, 'custom.field_declare');

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

  -- ── DATA-V2-BASICS, 2026-09-27: A KEY THE STORE DERIVED NEVER LANDS ON ANOTHER COLUMN. ────
  -- Arman's Coding Accounts: the column "Resets" (key `resets`) was renamed "Account Type".
  -- Adding a new column called "Resets" derived the key `resets` again, and this door answered
  -- 23505 *"This table already has a field called "Resets""* — false: no column on the screen
  -- is called that. Had the new column been a choice list like the old one, the same-type rule
  -- below would have returned the OLD column's id and the person's new column would never have
  -- appeared at all. And a key a RETIRED column held still sits under every record's history,
  -- so a new column given it would show the old column's values.
  -- THE RULE: when the caller did not ask for a key, the key is the store's to choose, and it
  -- chooses one no column of this table has ever held (`resets_2`, `resets_3` …) unless the
  -- column holding it is the SAME column said again — the same name (and then the same-type
  -- rule below answers, or the name is refused as taken). A key a caller asked for by name is
  -- still exactly that key, and a clash on it is refused naming the column that holds it.
  -- ── DATA-V2-BASICS (BREAKER-1 F8): A NEW COLUMN NEVER TAKES ANOTHER COLUMN'S NAME. ─────────
  -- The same name AND the same key AND the same kind is the same column said again (a caller's
  -- repeated declaration, answered below by the same-type rule). Any other column already called
  -- that is refused by name: two headers reading "Patient Name" over different data is how a paste
  -- matched the wrong column and blanked a real one (BREAKER-1 F10).
  if exists (select 1 from custom.record r
              where r.organization_id = p_organization_id
                and r.table_id = custom.field_kernel_id()
                and r.data_class = 'field'
                and r.deleted_at is null
                and r.data ->> 'entity_definition_id' = p_table_id::text
                and not coalesce((r.data ->> 'declared_with_table')::boolean, false)
                and lower(btrim(coalesce(r.data ->> 'label', ''))) = lower(btrim(coalesce(v_doc ->> 'label', '')))
                and not (nullif(p_spec ->> 'key', '') is not null
                         and r.data ->> 'key' = v_key
                         and coalesce(r.data ->> 'type', r.data ->> 'plain', 'text')
                             is not distinct from coalesce(v_doc ->> 'type', v_doc ->> 'plain', 'text'))) then
    raise exception 'You already have a column called "%".', btrim(v_doc ->> 'label')
      using errcode = '23505',
            hint = 'Open that column from its header to change it, or give the new one another name. Nothing was added.';
  end if;

  if nullif(p_spec ->> 'key', '') is null then
    select coalesce(r.data ->> 'label', r.data ->> 'name', '') into v_holder
      from custom.record r
     where r.organization_id = p_organization_id
       and r.table_id = custom.field_kernel_id()
       and r.data_class = 'field'
       and r.deleted_at is null
       and r.data ->> 'entity_definition_id' = p_table_id::text
       and r.data ->> 'key' = v_key
       and not coalesce((r.data ->> 'declared_with_table')::boolean, false)
     limit 1;
    if (v_holder is not null
          and lower(btrim(v_holder)) is distinct from lower(btrim(coalesce(v_doc ->> 'label', ''))))
       or (v_holder is null and exists (
             select 1 from custom.record r
              where r.organization_id = p_organization_id
                and r.table_id = custom.field_kernel_id()
                and r.data_class = 'field'
                and r.deleted_at is not null
                and r.data ->> 'entity_definition_id' = p_table_id::text
                and r.data ->> 'key' = v_key)
           and not exists (
             select 1 from custom.record r
              where r.organization_id = p_organization_id
                and r.table_id = custom.field_kernel_id()
                and r.data_class = 'field'
                and r.deleted_at is null
                and r.data ->> 'entity_definition_id' = p_table_id::text
                and r.data ->> 'key' = v_key)) then
      v_base := left(v_key, 44);
      v_n := 2;
      loop
        v_key := v_base || '_' || v_n;
        exit when not exists (
                    select 1 from custom.record r
                     where r.organization_id = p_organization_id
                       and r.table_id = custom.field_kernel_id()
                       and r.data_class = 'field'
                       and r.data ->> 'entity_definition_id' = p_table_id::text
                       and r.data ->> 'key' = v_key)
                  and not exists (select 1 from jsonb_array_elements(v_fields) f where f ->> 'name' = v_key);
        v_n := v_n + 1;
      end loop;
      v_doc := jsonb_set(v_doc, '{key}', to_jsonb(v_key));
    end if;
  end if;

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
    -- DATA-V2-BASICS: the sentence names the column that is really there. A clash on the
    -- NAME says the name; a clash on a key the caller asked for names the column holding it.
    select coalesce(r.data ->> 'label', r.data ->> 'name', r.data ->> 'key') into v_holder
      from custom.record r
     where r.organization_id = p_organization_id
       and r.table_id = custom.field_kernel_id()
       and r.data_class = 'field'
       and r.deleted_at is null
       and r.data ->> 'entity_definition_id' = p_table_id::text
       and r.data ->> 'key' = v_key
     limit 1;
    if lower(btrim(coalesce(v_holder, ''))) = lower(btrim(coalesce(v_doc ->> 'label', ''))) then
      raise exception 'This table already has a field called "%".', v_doc ->> 'label'
        using errcode = '23505',
              hint = 'Two columns of one table cannot share a name and a kind. Give this one a different name, or edit the one that is already there.';
    end if;
    raise exception 'The column "%" already uses the key %, so "%" cannot have it too.', v_holder, v_key, v_doc ->> 'label'
      using errcode = '23505',
            hint = 'Leave the key out and the store picks a free one, or rename the column that holds it.';
  end if;

  -- THE CHOICE LIST. The person typed words; the store keeps them the only way
  -- FLD-5/FLD-6 allows — as the records of a Table — and points the Field at it.
  if (v_doc ->> 'type') = 'list'
     and nullif(v_doc -> 'config' ->> 'options_table_id', '') is null then
    -- CHOICE-COLUMN-EDIT, 2026-09-27: none typed yet is an empty list, not a refusal — the column
    -- is a choice column from the start and its first choice is added later (settings or a cell).
    v_opts := custom._options_table_for(p_organization_id, v_doc ->> 'label',
                                        case when jsonb_typeof(p_spec -> 'options') = 'array'
                                             then p_spec -> 'options' else '[]'::jsonb end);
    v_doc := jsonb_set(v_doc, '{config,options_table_id}', to_jsonb(v_opts::text));
  end if;

  -- DATA-V2-BASICS-2 (2026-09-29, BREAKER-2 B2-01): the default fits the column, or nothing is written.
  v_doc := custom._field_default_fitted(p_organization_id, v_doc);

  -- DATA-V2-BASICS-2 (2026-09-29, BREAKER-2 B2-16): A NEW COLUMN GOES AFTER THE OTHERS. Every column was
  -- born at sort 100, so a table of ten columns added one at a time listed them alphabetically, not in
  -- the order they were added. A column that does not ask for a place goes after the last one.
  if not (p_spec ? 'sort') then
    v_doc := jsonb_set(v_doc, '{sort}', to_jsonb(coalesce(
      (select max((f.data ->> 'sort')::numeric)
         from custom.record f
        where f.organization_id = p_organization_id
          and f.table_id = custom.field_kernel_id()
          and f.deleted_at is null
          and coalesce(f.data_class, '') <> 'kernel'
          and f.data ->> 'entity_definition_id' = p_table_id::text
          and f.data ->> 'sort' ~ '^-?[0-9]+(\.[0-9]+)?$'), 90) + 10));
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

revoke execute on function custom.reverse_links_many(uuid, uuid, uuid, uuid[], integer, integer) from authenticated;
revoke execute on function custom.reverse_columns(uuid, uuid) from authenticated;
delete from platform.client_callable_door where schema_name = 'custom' and function_name in ('reverse_links_many', 'reverse_columns');
drop function custom.reverse_links_many(uuid, uuid, uuid, uuid[], integer, integer);
drop function custom.reverse_columns(uuid, uuid);
drop function custom._inverse_key_default(uuid, uuid, jsonb);
drop function custom._may_know_table(uuid, uuid);
delete from platform.feature_knob where feature = 'custom' and key = 'back_links';
