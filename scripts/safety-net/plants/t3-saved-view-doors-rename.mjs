// SN-T3 plant: the saved-view doors stamp a wrong name on every update (a rename through
// public.saved_view_save no longer lands). In-transaction on the clone.
export default {
  id: "t3-saved-view-doors-rename",
  check: "tables.sql-saved-view-doors",
  items: ["T36", "T37", "T38", "T39", "T40"],
  description: "public.saved_view_save renames land as \"Saved view\" (the grid, sheet, board, calendar and gallery looks all save through it)",
  mode: "in-transaction",
  apply: `create or replace function public.sn_t3_view_renames() returns trigger language plpgsql as $f$
begin new.name := 'Saved view'; return new; end $f$;
create trigger zzz_sn_t3_view before update on platform.saved_view for each row execute function public.sn_t3_view_renames();
`,
};
