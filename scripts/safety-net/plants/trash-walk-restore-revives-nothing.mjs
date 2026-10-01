// SN-TRASH plant for tables.walk-trash. COMMITTED on the clone, scoped to Cedar Ridge Physical Therapy
// (0a54df90-…): a Restore from Trash puts nothing back for a table, a record, a column or a dashboard
// (custom.record rows of that organization) or for a saved view (platform.saved_view rows of that
// organization) — a before-update trigger puts deleted_at back. The restore drops both triggers and the
// function; the read-back prints t when none is left.
const ORG = "0a54df90-eab8-4d07-ab29-81a45fb41e04";
export default {
  id: "trash-walk-restore-revives-nothing",
  check: "tables.walk-trash",
  items: ["T47", "T48", "T49", "T50", "T54"],
  description: "Restore from Trash un-archives nothing in Cedar Ridge (table, record, column, dashboard, saved view) — clone only",
  mode: "committed",
  apply: `set statement_timeout = 0; set lock_timeout = '45s';
create or replace function public.sn_trash_walk_revives_nothing() returns trigger language plpgsql as $f$
begin new.deleted_at := old.deleted_at; return new; end $f$;
create trigger zzz_sn_trash_walk_rec before update on custom.record for each row
  when (old.deleted_at is not null and new.deleted_at is null and new.organization_id = '${ORG}')
  execute function public.sn_trash_walk_revives_nothing();
create trigger zzz_sn_trash_walk_sv before update on platform.saved_view for each row
  when (old.deleted_at is not null and new.deleted_at is null and new.organization_id = '${ORG}')
  execute function public.sn_trash_walk_revives_nothing();
`,
  restore: `set statement_timeout = 0; set lock_timeout = '45s';
drop trigger if exists zzz_sn_trash_walk_rec on custom.record;
drop trigger if exists zzz_sn_trash_walk_sv on platform.saved_view;
drop function if exists public.sn_trash_walk_revives_nothing();
`,
  readback: `select ((select count(*) from pg_trigger where tgname like 'zzz_sn_trash_walk_%') = 0
  and (select count(*) from pg_proc where proname = 'sn_trash_walk_revives_nothing') = 0)::text::boolean;`,
};
