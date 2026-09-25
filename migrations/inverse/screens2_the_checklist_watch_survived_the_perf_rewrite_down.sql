-- chair-step: it REPLACES a live definition with a body that is known to be broken, which is
--   exactly what an inverse of a repair is for. Nothing is dropped and no row of anybody's
--   data is touched. Run it only to show the green suite failing, and run the up file again
--   immediately afterwards.
--
-- THE INVERSE — it puts the BROKEN body back, byte for byte as `cfe0e8cdef` left it on the
-- live catalogue (captured 2026-09-20 23:41 UTC with `pg_get_functiondef`), so
-- `scripts/campaign-tests/checklists_green.sql` can be shown FAILING at PART 2 with
-- "cannot cast type record to custom.record" and then passing again after the up file.
--
-- Running this on purpose leaves the checklist product unable to start a run. It exists to
-- prove the repair was a repair.

set lock_timeout = '2s';

create or replace function custom._checklist_watch_stmt_update()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'pg_catalog'
as $function$
declare
  r record;
begin
  for r in
    select n as nrow, o as orow from new_rows n
    join old_rows o on o.organization_id = n.organization_id and o.id = n.id
     where n.data_class = 'record' and n.deleted_at is null
       and (n.data ? 'run_id'
            or (n.table_id is not null and exists (
                  select 1 from custom.record c
                   where c.organization_id = n.organization_id
                     and c.data_class = 'checklist_template'
                     and c.deleted_at is null
                     and (c.data #>> '{trigger,table_id}') = n.table_id::text
                     and coalesce(c.data #>> '{trigger,kind}', 'manual') = 'status_reached')))
     order by n.id
  loop
    perform custom._checklist_watch_for('UPDATE', r.orow, r.nrow);
  end loop;
  return null;
end;
$function$;
