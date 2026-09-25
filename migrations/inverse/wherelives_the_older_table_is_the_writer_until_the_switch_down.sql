-- INVERSE of migrations/campaign/wherelives_the_older_table_is_the_writer_until_the_switch.sql (lane WHERE-LIVES-SWITCH): the copy fence back to production's body before it, byte for byte; the door's declaration, the door, the refusal helper and the fact removed.
-- chair-step: restores custom._context_copy_fence() as SC-1' left it; drops custom.where_tables_live(uuid[]), custom._older_table_copy_refusal(uuid) and platform.table_lives_in(uuid); deletes the three platform.client_callable_door rows the up file wrote.
-- based-on: custom._context_copy_fence() f2b0b58b52f8a7d22bf48995eafc687fb1e682a278c50a027a5153e73331de85

set local lock_timeout = '30s';

CREATE OR REPLACE FUNCTION custom._context_copy_fence()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_role   name := custom.caller_role();
  v_table  uuid;
  v_key    text;
  v_hit    text;
  v_kept   text;
  v_name   text;
  v_on     boolean;
  v_where  text;
begin
  -- THE ONE WRITER. The store owner's own connection — the scopes mover and the follow worker —
  -- is the only one that may write the copy. Read from the catalogue, never a role literal,
  -- exactly as custom._store_door's operator lane is.
  if pg_has_role(v_role, (select c.relowner from pg_class c where c.oid = 'custom.record'::regclass), 'member') then
    return new;
  end if;

  -- WHICH TABLE THIS ROW BELONGS TO: a Table record is itself; a Field names its Table; every
  -- other row is a record of new.table_id.
  -- A scope's OWN table (G11, tied to its scope by `scope_binding`) is not a copy: the store is
  -- its writer, and people keep rows in it. Only the Tables the scopes mover lands — one per
  -- scope type, carrying no binding — are the copy.
  if new.data_class = 'table' then
    v_kept := case when new.data ? 'scope_binding' then '' else coalesce(new.data ->> 'kept_for', '') end;
    if tg_op = 'UPDATE' and v_kept <> 'context' and not (old.data ? 'scope_binding') then
      v_kept := coalesce(old.data ->> 'kept_for', '');   -- taking the word off is a write too
    end if;
    v_name := coalesce(nullif(new.data ->> 'name', ''), 'this table');
  else
    v_table := case when new.data_class = 'field'
                    then nullif(new.data ->> 'entity_definition_id', '')::uuid
                    else new.table_id end;
    if v_table is null then
      return new;
    end if;
    -- ONE PRIMARY-KEY READ, NO MEMO. The store's memo (platform.memo_k_*) is WRITE-PERF-4's, and
    -- its inverse takes it away; a trigger that reached it would stand over a missing body after
    -- that rollback (check:inverses-leave-the-ground-standing, clause a). The read is the
    -- (organization_id, id) primary key of one partition.
    select case when t.data ? 'scope_binding' then '' else coalesce(t.data ->> 'kept_for', '') end
           || chr(31) || coalesce(nullif(t.data ->> 'name', ''), 'this table')
      into v_hit
      from custom.record t
     where t.organization_id = new.organization_id
       and t.id = v_table
       and t.table_id = custom.table_kernel_id();
    v_hit := coalesce(v_hit, chr(31));
    v_kept := split_part(v_hit, chr(31), 1);
    v_name := split_part(v_hit, chr(31), 2);
  end if;

  if v_kept is distinct from 'context' then
    return new;
  end if;

  v_on := coalesce((platform.knob_resolve('custom', 'context_copy_following', new.organization_id) #>> '{}')::boolean, true);
  if not v_on then
    return new;
  end if;

  -- WHERE TO EDIT IT INSTEAD. A copied Record keeps its scope's id, so its scope page is known;
  -- a change to the Table or its Fields is a change to the scope type, made on the scopes screen.
  v_where := case when new.data_class = 'record' then '/scopes/s/' || new.id::text else '/scopes/manage' end;

  raise exception 'This is the new system''s copy of %; it follows the current screens until the switch. Edit it on %.',
                  v_name, v_where
    using errcode = '42501',
          hint = 'SC-1'' P13: while custom/context_copy_following is on for this organization, only the follow of the current scope screens writes the record store''s copy of the context system. Nothing was written. The switch to the new system turns this off; an organization where the store is the writer turns it off for itself.';
end;
$function$;

delete from platform.client_callable_door
 where (schema_name, function_name) in (('custom', 'where_tables_live'), ('custom', '_older_table_copy_refusal'), ('platform', 'table_lives_in'))
   and declared_by like 'migrations/campaign/wherelives_the_older_table_is_the_writer_until_the_switch.sql%';
drop function if exists custom.where_tables_live(uuid[]);
drop function if exists custom._older_table_copy_refusal(uuid);
drop function if exists platform.table_lives_in(uuid);
