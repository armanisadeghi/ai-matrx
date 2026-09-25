-- additive: yes
-- lane: UI-FIX-18
-- lock: custom
-- The inverse of migrations/campaign/uifix18_a_write_that_only_works_something_out_is_not_a_change.sql:
-- the two bodies exactly as production held them before it (pg_get_functiondef, 2026-09-24).

CREATE OR REPLACE FUNCTION custom._derived_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_rtype    text;
  v_tf       text;
  f          custom.record;
  v_derived  jsonb := '{}'::jsonb;
  v_prior    jsonb;
  v_stale    text;
  v_retired  jsonb;
begin
  -- THE DOOR. One call to the ONE predicate (`custom.assert_store_door`), which
  -- judges `custom.caller_role()` - the identity the caller actually held - and not
  -- `current_user`, which a SECURITY DEFINER door has already rewritten to itself.
  -- The switch never removes a check: everything below runs exactly as before.
  perform custom.assert_store_door(new.organization_id, 'custom.record');

  if new.data_class in ('kernel', 'relation')
     or new.table_id is null
     or new.table_id = custom.table_kernel_id()
     or new.table_id = custom.field_kernel_id()
     or new.table_id = custom.rule_kernel_id()
     or new.table_id = custom.merge_field_kernel_id() then
    return new;
  end if;

  v_tf := custom.table_type_field(new.organization_id, new.table_id);
  if v_tf is not null then
    v_rtype := new.data ->> v_tf;
  end if;

  for f in select * from custom.applicable_fields(new.organization_id, new.table_id, v_rtype) loop
    if custom.parity_type(f.data) in ('lookup', 'rollup', 'formula')
       and coalesce(f.data ->> 'compute_on', '') = 'write' then
      v_derived := v_derived || jsonb_build_object(f.data ->> 'key', jsonb_build_object(
        'value',    custom.derived_value(new.organization_id, new.id, f.data,
                                         new.data - '_computed' - '_retired' - '_values'
                                                  - '_sources' - '_derived'),
        'field_id', f.id,
        'parity',   custom.parity_type(f.data),
        'at',       to_jsonb(now())));
    end if;
  end loop;

  -- A WORKED-OUT ANSWER NOBODY WORKS OUT is told apart the same two ways W1-RULE tells
  -- them apart, because a reader cannot tell a forged one from a real one and would serve
  -- both. ARRIVING IN THIS WRITE is a forgery and is refused by name; ALREADY THERE and no
  -- longer applicable is a retype and is RETIRED with its reason (a stand-in for History,
  -- announced: W3-HIST owns the real store).
  if jsonb_typeof(new.data -> '_derived') = 'object' then
    v_prior := case when tg_op = 'UPDATE' then coalesce(old.data -> '_derived', '{}'::jsonb)
                    else '{}'::jsonb end;
    for v_stale in
      select k from jsonb_object_keys(new.data -> '_derived') k where not (v_derived ? k)
    loop
      if (v_prior -> v_stale) is distinct from (new.data -> '_derived' -> v_stale) then
        raise exception 'this record carries a worked-out answer for % that nothing works out', v_stale
          using errcode = '23514',
                hint = 'FLD-9 / FLD-11: a worked-out Value belongs to the field that works it out and carries that field''s id and the moment. A value written here by hand would be served as if the system had worked it out.';
      end if;
      v_retired := coalesce(new.data -> '_retired', '[]'::jsonb) || jsonb_build_object(
        'key',    v_stale,
        'value',  v_prior -> v_stale -> 'value',
        'reason', format('this record changed, and nothing works out %s for it any more', v_stale),
        'field_id', v_prior -> v_stale -> 'field_id',
        'at',     to_jsonb(now()));
      new.data := jsonb_set(new.data, '{_retired}', v_retired);
    end loop;
  end if;

  if v_derived = '{}'::jsonb then
    new.data := new.data - '_derived';
  else
    new.data := jsonb_set(new.data, '{_derived}', v_derived);
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION history.record_capture_stmt_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_mig  uuid;
  v_verb text;
  v_n    integer;
begin
  if nullif(current_setting('history.mark_at', true), '') = statement_timestamp()::text then
    v_mig  := nullif(current_setting('history.mark_id', true), '')::uuid;
    v_verb := nullif(current_setting('history.mark_verb', true), '');
  end if;

  insert into history.row_versions
         (entity_type, row_id, organization_id, version, operation, row_data, actor_id, actor_tier,
          migration_id, operation_name)
  select 'custom.record',
         n.id,
         n.organization_id,
         coalesce(n.version, 1),
         -- REC-23's soft delete and its undo are distinguishable operations in the store, or
         -- "who deleted this and when did it come back" is unanswerable.
         case
           when n.deleted_at is not null and o.deleted_at is null then 'SOFT_DELETE'
           when n.deleted_at is null and o.deleted_at is not null then 'RESTORE'
           else 'UPDATE'
         end,
         to_jsonb(n),
         coalesce(nullif(current_setting('app.user_id', true), '')::uuid, (select auth.uid())),
         platform.actor_tier(),
         v_mig,
         v_verb
    from new_rows n
    join old_rows o
      on o.organization_id = n.organization_id and o.id = n.id
   where history.capture_is_open(n.organization_id)
     -- The contentless-update guard, the same one platform._version_capture applies: a
     -- snapshot identical to its predecessor in everything but the bookkeeping columns is
     -- not a version of anything. HIS-1 is "nothing can opt out of being RECORDED", not
     -- "every statement writes a row whether or not it changed anything". The `v_op = 'UPDATE'`
     -- arm of the row trigger is exactly "neither a soft delete nor a restore", which is what
     -- the two deleted_at tests below say.
     and not ((n.deleted_at is null) = (o.deleted_at is null)
              and (to_jsonb(n) - 'version' - 'updated_at' - 'updated_by')
                  is not distinct from (to_jsonb(o) - 'version' - 'updated_at' - 'updated_by'))
   order by n.id;
  get diagnostics v_n = row_count;

  if v_n > 0 then
    insert into history.capture_window (entity_type, note)
    values ('custom.record', 'HIS-1/HIS-7: W3-HIST''s capture on custom.record — Values and structure in one store')
    on conflict (entity_type) do nothing;
  end if;

  return null;
end;
$function$
;
