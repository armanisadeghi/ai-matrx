-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
--
-- FIELD-TRUTH (2 of 2) — THE DOOR. A RECORD OF A TABLE CARRIES NO KEY THAT IS NOT A FIELD.
--
-- WHAT THE CREWS HIT. `custom.record_write` took a value for a key nobody had declared and
-- kept it. Crew A, entering a real renovation on Birchwood Avenue Renovation, put a `room`
-- on every purchase; the store accepted all twelve, reads them back through the doors, and
-- shows them in NO grid and in NO agent tool's schema, because both read the Table's Field
-- rows. The same shape on Ridgeline Physical Therapy (`patient`, `full_name`,
-- `treatment_plan`), on The Alvarado-Chen Kitchen (`recipe`, `shopping_list`, `list_name`)
-- and on 54 further Tables. A value you cannot see is worse than a value refused: the
-- person believes their data is in the system, and it is nowhere they will ever look.
--
-- THE DOOR. For a Table whose columns come from its Field rows — `custom.table_column_source`
-- answering `fields`, which is every Table that has not declared itself a document —
-- `custom.record_write`, `custom.record_write_many` and `custom.record_update` refuse a key
-- with no Field row, naming EVERY such key at once and saying what to do about it. The
-- refusal is a trigger on `custom.record` rather than code in the three doors, so the agent
-- CRUD tools, the packages, the import path and PostgREST inherit the same sentence with no
-- code of their own: they all arrive at the same table.
--
-- WHAT IT DELIBERATELY DOES NOT REFUSE, and each is a decision rather than an oversight:
--   · A KERNEL Table's records (Person, Organization, Rule, File …, 936 rows live). Their
--     shape is platform code and they hold no Field rows at all.
--   · A Table that declared `columns = 'free_form'`. The checklist's step Table is the live
--     example and says so in its own door.
--   · Platform keys — `parent_id` and every `_`-prefixed envelope. They belong to the store,
--     not to any Table, and a Field for one would be a second name for one thing.
--   · A RETIREMENT, judged by the same custom.is_a_retirement every other guard here uses:
--     the document is byte-for-byte what it was, so there is no new shape to judge.
--   · ON UPDATE, A KEY THAT WAS ALREADY THERE AND HAS NOT CHANGED. This is the one that
--     keeps the door from bricking history. An orphan key that predates this file is a row
--     to REPAIR (scripts/campaign-tests/fieldtruth_repair_undeclared_keys.sql declares it as
--     a real Field), never a row somebody can no longer edit: refusing an untouched key
--     would mean a person who opens such a record can never save it again, and the value
--     they did not put there would be the reason. A key this write ADDS, or whose value this
--     write CHANGES, is this write's doing and is refused. After the repair there are none
--     left: measured 0 undeclared values on the main database at the repair's exit.
--
-- REC-1 (a Table declares its fields) · REC-51 (a validation trigger enforces the field
-- definitions on write).

CREATE OR REPLACE FUNCTION custom._undeclared_key_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_bad   text[];
  v_new   text[];
  k       text;
  v_name  text;
  v_list  text;
begin
  -- Only a record OF a Table. Every other data_class — table, field, rule, relation,
  -- work_template, doc_template, sign_request and the rest — has its own shape guard and
  -- its own document, and none of them is a row of columns.
  if new.data_class <> 'record' or new.table_id is null then
    return new;
  end if;

  -- A RETIREMENT IS NOT A CHANGE OF SHAPE — the shared question every guard on this table
  -- asks, asked here too so a retiring record, a cascade and the delete sweep all pass.
  if tg_op = 'UPDATE'
     and custom.is_a_retirement(old.deleted_at, new.deleted_at,
                                old.data, new.data,
                                old.table_id, new.table_id,
                                old.organization_id, new.organization_id,
                                old.data_class, new.data_class) then
    return new;
  end if;

  -- THE TAXONOMY, asked once. `code` (a kernel Table) and `free_form` (a document Table)
  -- both pass; only `fields` is judged.
  if custom.table_column_source(new.organization_id, new.table_id) <> 'fields' then
    return new;
  end if;

  v_bad := custom.undeclared_keys(new.organization_id, new.table_id, new.data);
  if v_bad is null or cardinality(v_bad) = 0 then
    return new;
  end if;

  -- ON UPDATE: only what THIS write put there or changed. See the header.
  if tg_op = 'UPDATE' then
    v_new := array[]::text[];
    foreach k in array v_bad loop
      if (old.data -> k) is distinct from (new.data -> k) then
        v_new := array_append(v_new, k);
      end if;
    end loop;
    v_bad := v_new;
    if cardinality(v_bad) = 0 then
      return new;
    end if;
  end if;

  -- EVERY problem in one answer, the way LIMITS-FIX taught custom._table_shape_guard to:
  -- one round trip per missing key is how reproducing a four-key mistake costs five calls.
  select coalesce(nullif(t.data ->> 'label_singular', ''), nullif(t.data ->> 'name', ''), 'this table')
    into v_name
    from custom.record t
   where t.organization_id = new.organization_id and t.id = new.table_id;

  select string_agg(format('"%s"', x), ', ' order by x) into v_list from unnest(v_bad) x;

  raise exception '% has no field called %, so there is nowhere to keep %.',
                  coalesce(v_name, 'this table'), v_list,
                  case when cardinality(v_bad) = 1 then 'that value' else 'those values' end
    using errcode = '23514',
          hint = format(
            'REC-1 / REC-51: a table''s fields are the one source of truth for its columns, so a value with no field is a value nobody will ever see. Add %s with custom.field_declare (or name %s in custom.table_declare''s `fields` list, which now creates the column too), or take %s off the record. A table whose shape is written by code, not by columns, declares `columns: "free_form"` and keeps its own keys.',
            case when cardinality(v_bad) = 1 then 'it' else 'them' end,
            case when cardinality(v_bad) = 1 then 'it' else 'them' end,
            case when cardinality(v_bad) = 1 then 'it' else 'them' end);
end;
$function$;

-- After custom_record_zz_derived_fields (which writes `_derived`) and after the choice-word
-- and containment guards, so a document is judged in the shape it will actually be stored in.
CREATE OR REPLACE TRIGGER zzzz_a_undeclared_key_guard
  BEFORE INSERT OR UPDATE ON custom.record
  FOR EACH ROW EXECUTE FUNCTION custom._undeclared_key_guard();
