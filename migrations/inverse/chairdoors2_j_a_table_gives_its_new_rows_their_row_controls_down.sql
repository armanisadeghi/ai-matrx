-- chair-step: undo chairdoors2_j_a_table_gives_its_new_rows_their_row_controls.sql: restores custom.record_write and custom.record_write_many exactly as they were, removes the four door rows and drops the four doors and custom._row_control_columns; custom._table_row_defaults is left standing (the window file's insert trigger may run it; it is ungranted and reads only). Run the window file's inverse first if that file was applied. Tables keep any data.row_defaults already written (inert without the doors).
-- lane: CHAIR-DOORS-2
-- based-on: custom.record_write(uuid, uuid, jsonb) c4881987f3773f729aca4f0aea24cfec802d1ca5dde5857d3db305a47c1ea56e
-- based-on: custom.record_write_many(uuid, uuid, jsonb[], uuid[]) 6d589b711e01ba06e29e234cd8c386dbfd2c53615a42638a33b5a040d63d6a7e
delete from platform.client_callable_door
 where declared_by = 'chairdoors2_j_a_table_gives_its_new_rows_their_row_controls.sql';
drop function custom.record_row_controls_set(uuid, uuid, jsonb);
drop function custom.record_row_controls(uuid, uuid);
drop function custom.table_row_defaults_set(uuid, uuid, jsonb);
drop function custom.table_row_defaults(uuid, uuid);
drop function custom._row_control_columns();
-- custom._table_row_defaults stays standing: the window file's insert trigger runs it (inert and ungranted).

CREATE OR REPLACE FUNCTION custom.record_write(p_organization_id uuid, p_table_id uuid, p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_id uuid;
begin
  -- THE ENVELOPE KEY COMES OFF FIRST. Before the door predicates, before the undeclared-key
  -- guard, before storage — `custom.record.data` must never hold it.
  p_data := custom._take_op_id(p_data, 'custom.record_write');

  -- The switch, then the organization, then the Table this record is being added to.
  -- `current_user` in here is already the definer; both predicates read the caller.
  perform custom.assert_store_door(p_organization_id, 'custom.record_write');
  perform custom.assert_client_may_change(p_organization_id, p_table_id, 'custom.record_write',
                                          'editor'::public.permission_level, 'table');

  if p_organization_id is null then
    raise exception 'custom.record_write: organization_id is required - the store is keyed (organization_id, id)'
      using errcode = '22004';
  end if;
  -- DATA-V2-BASICS-2: every value this new record does not name takes its Field's default.
  insert into custom.record (organization_id, table_id, data)
  values (p_organization_id, p_table_id,
          custom._record_defaults_filled(p_organization_id, p_table_id, coalesce(p_data, '{}'::jsonb)))
  returning id into v_id;
  return v_id;
end
$function$
;
CREATE OR REPLACE FUNCTION custom.record_write_many(p_organization_id uuid, p_table_id uuid, p_rows jsonb[], p_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS uuid[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_ids   uuid[];
  v_n     integer := coalesce(cardinality(p_rows), 0);
  v_clean jsonb[];
  v_seen  text := null;
  v_this  text;
  ord     integer;
begin
  -- The switch, then the organization, then the Table these records are being added to — the
  -- same two predicates `custom.record_write` asks, in the same order, ONCE for the batch.
  perform custom.assert_store_door(p_organization_id, 'custom.record_write_many');
  perform custom.assert_client_may_change(p_organization_id, p_table_id, 'custom.record_write_many',
                                          'editor'::public.permission_level, 'table');

  if p_organization_id is null then
    raise exception 'custom.record_write_many: organization_id is required - the store is keyed (organization_id, id)'
      using errcode = '22004';
  end if;
  if v_n = 0 then
    perform set_config('custom.op_id', '', true);
    return '{}'::uuid[];
  end if;
  if p_ids is not null and coalesce(cardinality(p_ids), 0) <> v_n then
    raise exception 'custom.record_write_many: % ids were handed in for % records, so no row could be told from another', coalesce(cardinality(p_ids), 0), v_n
      using errcode = '22023',
            hint = 'Hand in one id per record, in the same order, or hand in none and let the door mint them. Nothing was written.';
  end if;

  -- ONE STATEMENT IS ONE OPERATION. Every row's `_op_id` comes off, and they must AGREE: a
  -- batch is one paste, one import, one click. Two different ids in one statement would make
  -- one notice that could only name one of them, so the other writer would be told to drop an
  -- echo that was never its own — which is the one way an echo filter loses a real change.
  v_clean := array[]::jsonb[];
  for ord in 1..v_n loop
    v_this := case when p_rows[ord] is not null and jsonb_typeof(p_rows[ord]) = 'object'
                   then p_rows[ord] ->> '_op_id' else null end;
    if v_this is not null then
      if v_seen is not null and v_seen <> v_this then
        raise exception 'custom.record_write_many: this batch carries two different _op_id values (% and %), and one statement announces itself once.', left(v_seen, 64), left(v_this, 64)
          using errcode = '22023',
                hint = 'Nothing was written. A batch is ONE client operation — one paste, one import, one click — so every row either carries the same _op_id or carries none. Split the rows into one call per operation, or leave the key out.';
      end if;
      v_seen := v_this;
    end if;
    v_clean := v_clean || case
                 when p_rows[ord] is null or jsonb_typeof(p_rows[ord]) <> 'object' then p_rows[ord]
                 -- DATA-V2-BASICS-2: every value this new record does not name takes its Field's default.
                 else custom._record_defaults_filled(p_organization_id, p_table_id, p_rows[ord] - '_op_id') end;
  end loop;

  -- Validated and remembered ONCE for the batch, through the same one place the single-row
  -- door uses, so a malformed id is refused with the same sentence.
  perform custom._take_op_id(
    case when v_seen is null then '{}'::jsonb else jsonb_build_object('_op_id', v_seen) end,
    'custom.record_write_many');

  if p_ids is null then
    select array_agg(gen_random_uuid() order by s) into v_ids
      from generate_subscripts(v_clean, 1) s;
  else
    v_ids := p_ids;
  end if;

  insert into custom.record (organization_id, table_id, id, data)
  select p_organization_id, p_table_id, v_ids[s], coalesce(v_clean[s], '{}'::jsonb)
    from generate_subscripts(v_clean, 1) s
   order by s;

  return v_ids;
end
$function$

;
