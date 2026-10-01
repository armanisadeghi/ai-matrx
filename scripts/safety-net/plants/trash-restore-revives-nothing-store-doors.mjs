// SN-TRASH plant: Restore un-archives nothing for a Field, Rule, link, template, dashboard (custom.record rows) or a mandate. In-transaction on the clone: the trigger and its function are rolled back with the suite.
export default {
  id: "trash-restore-revives-nothing-store-doors",
  check: "tables.sql-trash-store-doors",
  items: ["T50", "T51", "T52", "T53", "T54", "T55"],
  description: "Restore un-archives nothing for a Field, Rule, link, template, dashboard (custom.record rows) or a mandate",
  mode: "in-transaction",
  apply: `create or replace function public.sn_trash_restore_revives_nothing() returns trigger language plpgsql as $f$
begin new.deleted_at := old.deleted_at; return new; end $f$;
create trigger zzz_sn_rec before update on custom.record for each row
  when (old.deleted_at is not null and new.deleted_at is null) execute function public.sn_trash_restore_revives_nothing();
create trigger zzz_sn_md before update on mandate.definition for each row
  when (old.deleted_at is not null and new.deleted_at is null) execute function public.sn_trash_restore_revives_nothing();
`,
};
