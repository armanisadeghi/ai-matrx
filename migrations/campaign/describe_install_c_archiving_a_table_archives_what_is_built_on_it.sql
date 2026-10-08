-- describe_install_c_archiving_a_table_archives_what_is_built_on_it.sql — lane DESCRIBE-INSTALL (2026-10-08).
--
-- THE CLASS. custom.table_archive archives a table's forms, inbound addresses, saved views and portals in
-- the same event (T2.1), but any other path that archives the Table record (custom.record_delete called
-- straight at it, a page's Remove, an undo, a script) left them live: 13 forms on live pointed at an
-- archived table, 5 of them published and still taking answers into it. The rule belongs on the Table
-- record, not on one door: a row trigger carries a Table's archive to what is built on it, and its restore
-- back — by the EXACT archive moment, so a form someone archived by hand earlier stays archived, and
-- what custom.table_archive already took (stamped with its own moment, restored from its event's built_on)
-- is not touched twice.
-- Also archives the 13 forms already stranded this way (their restore comes back with their table).

create or replace function custom._table_takes_what_is_built_on_it()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'pg_catalog'
as $function$
begin
  if new.data_class is distinct from 'table' then return null; end if;
  if old.deleted_at is null and new.deleted_at is not null then
    update custom.anon_form f set deleted_at = new.deleted_at
     where f.organization_id = new.organization_id and f.table_id = new.id and f.deleted_at is null;
    update custom.anon_inbound i set deleted_at = new.deleted_at
     where i.organization_id = new.organization_id and i.table_id = new.id and i.deleted_at is null;
    update platform.saved_view v set deleted_at = new.deleted_at
     where v.organization_id = new.organization_id and v.subject_id = new.id and v.deleted_at is null;
    update custom.portal p set archived_at = new.deleted_at, archive_reason = 'Its table was archived.'
     where p.organization_id = new.organization_id and p.client_table_id = new.id and p.archived_at is null;
  elsif old.deleted_at is not null and new.deleted_at is null then
    update custom.anon_form f set deleted_at = null
     where f.organization_id = new.organization_id and f.table_id = new.id and f.deleted_at = old.deleted_at;
    update custom.anon_inbound i set deleted_at = null
     where i.organization_id = new.organization_id and i.table_id = new.id and i.deleted_at = old.deleted_at;
    update platform.saved_view v set deleted_at = null
     where v.organization_id = new.organization_id and v.subject_id = new.id and v.deleted_at = old.deleted_at;
    update custom.portal p set archived_at = null, archive_reason = null
     where p.organization_id = new.organization_id and p.client_table_id = new.id
       and p.archived_at = old.deleted_at and p.archive_reason = 'Its table was archived.';
  end if;
  return null;
end;
$function$;

create trigger zz_table_takes_what_is_built_on_it
  after update of deleted_at on custom.record
  for each row
  when ((old.deleted_at is null) <> (new.deleted_at is null) and new.data_class = 'table')
  execute function custom._table_takes_what_is_built_on_it();

-- The forms (and the rest) already stranded under an archived table, once.
update custom.anon_form f set deleted_at = r.deleted_at
  from custom.record r
 where r.organization_id = f.organization_id and r.id = f.table_id and r.data_class = 'table'
   and r.deleted_at is not null and f.deleted_at is null;
update custom.anon_inbound i set deleted_at = r.deleted_at
  from custom.record r
 where r.organization_id = i.organization_id and r.id = i.table_id and r.data_class = 'table'
   and r.deleted_at is not null and i.deleted_at is null;
