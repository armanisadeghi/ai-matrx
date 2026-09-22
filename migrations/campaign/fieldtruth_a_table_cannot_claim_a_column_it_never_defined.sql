-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
--
-- FIELD-TRUTH — THE SAME RULE, READ FROM THE OTHER SIDE.
--
-- Real-data crew E, 2026-09-21, on Cascade Electronics Recovery: `custom.record_update` on a
-- Table's own `fields` array, naming a key with no matching Field record, was "accepted with
-- no cross-check — the table now declares a field name (`client_site`, `pickup`) with no
-- Field definition behind it, and nothing catches or reports the mismatch". A claimed column
-- with no definition has no type, no rules and no validation: it is a name on a screen that
-- can never hold anything, and `custom.applicable_fields` will never answer with it.
--
-- MEASURED before the repair: 2,521 claimed column names across the store, 53 of them across
-- 48 Tables with no Field record (`scripts/campaign-tests/fieldtruth_repair_claimed_columns.sql`
-- defined all 53; AFTER = 0).
--
-- WHY IT IS DEFERRED, and this is the whole design. Both doors legitimately write the two
-- halves in two statements: `custom.table_declare` inserts the Table row naming its columns
-- and THEN materialises each Field, and `custom.field_declare` appends the name to the
-- Table's list and THEN inserts the Field row. A row-level BEFORE trigger would refuse both
-- doors at their own first statement. A DEFERRABLE INITIALLY DEFERRED constraint trigger
-- asks at COMMIT, which is the only moment the question is meaningful: by then the halves
-- have either met or they have not. Inside one transaction the doors are untouched; a
-- transaction that ENDS with a claim it never defined is refused, by name.
--
-- REC-1 (a Table declares its fields) · REC-51.

CREATE OR REPLACE FUNCTION custom._claimed_column_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_missing text[];
  v_list    text;
begin
  if new.data_class <> 'table' or new.deleted_at is not null then
    return null;
  end if;

  select coalesce(array_agg(distinct e ->> 'name' order by e ->> 'name'), array[]::text[])
    into v_missing
    from jsonb_array_elements(case when jsonb_typeof(new.data -> 'fields') = 'array'
                                   then new.data -> 'fields' else '[]'::jsonb end) e
   where nullif(e ->> 'name', '') is not null
     and not exists (select 1 from custom.record f
                      where f.organization_id = new.organization_id
                        and f.table_id = custom.field_kernel_id()
                        and f.data_class = 'field'
                        and f.deleted_at is null
                        and f.data ->> 'entity_definition_id' = new.id::text
                        and f.data ->> 'key' = e ->> 'name');

  if cardinality(v_missing) = 0 then
    return null;
  end if;

  select string_agg(format('"%s"', x), ', ' order by x) into v_list from unnest(v_missing) x;
  raise exception '% says it has a column called %, and there is no such field.',
                  coalesce(nullif(new.data ->> 'name', ''), 'this table'), v_list
    using errcode = '23514',
          hint = 'REC-1 / REC-51: a table''s fields are the one source of truth for its columns, and a column nobody defined has no type, no rules and no validation — it can never hold anything. Define it in the same breath with custom.field_declare (custom.table_declare already does), or take the name off the table.';
end;
$function$;

COMMENT ON FUNCTION custom._claimed_column_guard() IS
  'FIELD-TRUTH: at COMMIT, every column name a Table claims has a Field record. Deferred because both doors write the two halves in two statements.';

CREATE CONSTRAINT TRIGGER zzzz_b_claimed_column
  AFTER INSERT OR UPDATE ON custom.record
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION custom._claimed_column_guard();
