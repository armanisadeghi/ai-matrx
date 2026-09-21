-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.table_column_source(uuid, uuid) 9c2e51b208bd5bcb749499d7e51d5faaa3fb0768badf3852894a8abe8ca87206
--
-- FIELD-TRUTH — A THING THAT IS NOT A TABLE HAS NO COLUMNS TO DECLARE.
--
-- `custom.table_column_source` answered `fields` — the doctrine, every key must be a Field —
-- for ANY row it found at that id. But `custom.record.table_id` is not guaranteed to point
-- at a `data_class = 'table'` row: the store lets a record hang off a record, and the
-- platform's own fixtures do it. `check:store-doors-decide`'s two-seat probe builds exactly
-- that shape — a `data_class = 'record'` row standing in for a table, with a record beneath
-- it carrying `title` — and the new door refused its fixture: "Two-seat probe table has no
-- field called "title"". The guard was right to go red; the FUNCTION was wrong.
--
-- A row that is not a Table has no Field rows and never will, so there is nothing for
-- `fields` to mean. It answers `free_form`, which is what it has always in fact been.
-- Nothing about a real Table's answer moves: a `data_class = 'table'` row still says
-- `fields` unless it declared `free_form`, and the kernel still says `code`.

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

  -- THE KERNEL, asked by id alone. Its nine Tables are defined in platform code, hold no
  -- Field rows, and are pointed at by every organization; custom._record_field_validation
  -- already exempts two of the nine by name for this reason.
  if exists (select 1 from custom.record k
              where k.id = p_table_id and k.data_class = 'kernel') then
    return 'code';
  end if;

  select r.data_class, nullif(r.data ->> 'columns', '')
    into v_class, v_word
    from custom.record r
   where r.organization_id = p_organization_id
     and r.id = p_table_id
   limit 1;

  -- A Table this organization cannot see is a question for the organization wall
  -- (custom._organization_wall_guard), never for this function. It judges nothing.
  -- AND: a row that is not a Table at all has no Field rows to be the truth about, so
  -- there is nothing here for `fields` to mean.
  if v_class is distinct from 'table' then
    return 'free_form';
  end if;

  if v_word = 'free_form' then
    return 'free_form';
  end if;

  -- SILENCE MEANS THE DOCTRINE. A Table that says nothing has Field rows for columns.
  return 'fields';
end;
$function$;
