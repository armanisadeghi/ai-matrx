// SN-TRASH plant: Restore un-archives nothing for a Term list. In-transaction on the clone: the trigger and its function are rolled back with the suite.
export default {
  id: "trash-restore-revives-nothing-terms",
  check: "tables.sql-trash-terms",
  items: ["T57"],
  description: "Restore un-archives nothing for a Term list",
  mode: "in-transaction",
  apply: `create or replace function public.sn_trash_restore_revives_nothing() returns trigger language plpgsql as $f$
begin new.deleted_at := old.deleted_at; return new; end $f$;
create trigger zzz_sn_tl before update on agent.term_list for each row
  when (old.deleted_at is not null and new.deleted_at is null) execute function public.sn_trash_restore_revives_nothing();
`,
};
