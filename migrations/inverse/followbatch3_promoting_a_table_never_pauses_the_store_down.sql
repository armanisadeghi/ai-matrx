-- chair-step: inverse of followbatch3_promoting_a_table_never_pauses_the_store.sql (lane FOLLOW-BATCH-3) — puts custom.promote_table back to building every promoted Field's index inline (route A, ShareLock on every custom.record partition inside the person's save).
-- lane: FOLLOW-BATCH-3
-- lock: custom
-- based-on: custom.promote_table(uuid, uuid) 31485e33bb55fde9784faea0f7238c1288cec8f1920fb9f88a1339755bdd0a1f
set local statement_timeout = '60s';

CREATE OR REPLACE FUNCTION custom.promote_table(p_organization_id uuid, p_table_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_moved  bigint;
  v_before bigint;
  v_after  bigint;
  v_was    text;
  v_owner  oid;
  f        record;
  v_built  jsonb := '[]'::jsonb;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.promote_table');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.promote_table');

  -- 🚨 ONE QUESTION MORE THAN THE OTHER DOORS, and it is because of what this one DOES:
  -- it builds indexes on `custom.record`, a sixteen-way hash-partitioned table shared by
  -- every organization. Moving a Table to fast storage is a storage decision, not an edit,
  -- so a member who may write records still may not make it — `admin` on the Table itself
  -- is what may, and that is the same ladder every other access answer in this store uses.
  select c.relowner into v_owner from pg_class c where c.oid = 'custom.record'::regclass;
  if not pg_has_role(custom.caller_role(), v_owner, 'member')
     and not custom.has_visibility(auth.uid(), 'record', p_table_id, 'admin'::public.permission_level) then
    raise exception 'Moving this table to fast storage is an administrator''s change, and you have not been given that on this table.'
      using errcode = '42501',
            hint = 'Promoting a table builds indexes across the whole store, so it asks for admin on the table rather than permission to edit its records. Ask somebody who administers this table to do it.';
  end if;

  v_was := custom.table_storage(p_organization_id, p_table_id);
  if v_was is null then
    raise exception 'That is not a table of this organization, so there was nothing to move.'
      using errcode = '23503',
            hint = 'REC-4: promoting a Table is per Table and per organization. The store is keyed (organization_id, id), so a Table of another organization is not found by this one - and a Table that was deleted is not found either.';
  end if;
  select count(*) into v_before from custom.record r
   where r.organization_id = p_organization_id and r.table_id = p_table_id;

  for f in select * from custom.promoted_fields(p_organization_id, p_table_id) where indexable loop
    v_built := v_built || jsonb_build_array(custom.promote_field(p_organization_id, p_table_id, f.field_id));
  end loop;

  update custom.record
     set data = data || jsonb_build_object('storage', 'heavy')
   where organization_id = p_organization_id and id = p_table_id
     and table_id = custom.table_kernel_id();
  get diagnostics v_moved = row_count;
  if v_moved = 0 then
    raise exception 'Nothing was changed, so this table was not moved to fast storage.'
      using errcode = '42501',
            hint = 'REC-4: the table is there and readable, but this caller''s write did not reach it. Nothing was built and nothing was left half-done.';
  end if;

  select count(*) into v_after from custom.record r
   where r.organization_id = p_organization_id and r.table_id = p_table_id;

  return jsonb_build_object('was', v_was, 'now', custom.table_storage(p_organization_id, p_table_id),
                            'records_before', v_before, 'records_after', v_after,
                            'rows_moved', v_after - v_before, 'indexes', v_built,
                            'table_rows_changed', v_moved);
end $function$;
