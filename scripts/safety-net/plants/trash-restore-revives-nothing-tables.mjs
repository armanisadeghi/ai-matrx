// SN-TRASH plant: Restore un-archives nothing for a Table, a Record and a saved view (a before-update trigger puts deleted_at back). In-transaction on the clone: the trigger and its function are rolled back with the suite.
export default {
  id: "trash-restore-revives-nothing-tables",
  check: "tables.sql-trash-tables",
  items: ["T47", "T48", "T49"],
  description: "Restore un-archives nothing for a Table, a Record and a saved view (a before-update trigger puts deleted_at back)",
  mode: "in-transaction",
  apply: `create or replace function public.sn_trash_restore_revives_nothing() returns trigger language plpgsql as $f$
begin new.deleted_at := old.deleted_at; return new; end $f$;
create trigger zzz_sn_rec before update on custom.record for each row
  when (old.deleted_at is not null and new.deleted_at is null) execute function public.sn_trash_restore_revives_nothing();
create trigger zzz_sn_sv before update on platform.saved_view for each row
  when (old.deleted_at is not null and new.deleted_at is null) execute function public.sn_trash_restore_revives_nothing();
`,
};
