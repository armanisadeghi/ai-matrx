// SN-TRASH plant: Restore un-archives nothing for a Meeting. In-transaction on the clone: the trigger and its function are rolled back with the suite.
export default {
  id: "trash-restore-revives-nothing-meetings",
  check: "tables.sql-trash-meetings",
  items: ["T56"],
  description: "Restore un-archives nothing for a Meeting",
  mode: "in-transaction",
  apply: `create or replace function public.sn_trash_restore_revives_nothing() returns trigger language plpgsql as $f$
begin new.deleted_at := old.deleted_at; return new; end $f$;
create trigger zzz_sn_mm before update on communication.meet_meetings for each row
  when (old.deleted_at is not null and new.deleted_at is null) execute function public.sn_trash_restore_revives_nothing();
`,
};
