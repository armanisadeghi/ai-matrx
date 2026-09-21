-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.table_column_source(uuid, uuid) 980558fe16eefe6bf2818f4bdd55c2598cd2a0df5d14d47fc93170ffebdeda4c
--
-- FIELD-TRUTH — THE KERNEL IS THE KERNEL FROM EVERY ORGANIZATION'S SEAT.
--
-- `custom.table_column_source` looked the Table up by `(organization_id, id)`, which is the
-- store's primary key and the right question for an organization's OWN Table. The nine
-- KERNEL Tables are not an organization's own: they are one set of rows, all nine of them
-- held by the platform organization 39c38960, and every organization's records point at
-- those same nine ids. So asked from Kestrel Ridge Orchard's seat about the Person kernel
-- the function found nothing and answered `free_form` — the same PASS as `code`, so no
-- write ever behaved differently, but the store was saying something untrue about itself,
-- and a taxonomy that answers "I don't know" for 936 live records is not a taxonomy.
--
-- Caught by fieldtruth_green.sql's PART 5, which asks the question in exactly the way a
-- record of a kernel Table asks it.
--
-- The kernel lookup is now by ID ALONE, which is safe precisely because it can only ever
-- match a `data_class = 'kernel'` row: those nine ids are platform constants
-- (custom.person_kernel_id() and its eight siblings), no organization can mint one, and the
-- answer `code` carries no data with it. The organization-scoped lookup is unchanged for
-- every other Table, so the organization wall is exactly where it was.


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
  if v_class is null then
    return 'free_form';
  end if;

  if v_word = 'free_form' then
    return 'free_form';
  end if;

  -- SILENCE MEANS THE DOCTRINE. A Table that says nothing has Field rows for columns.
  return 'fields';
end;
$function$;
