// SN-T3 plant: any update of a saved view stamps the name "Saved view" (the one-press-renames-the-view
// defect the DATA-V2-FACE lane found on production). In-transaction on the clone; rolled back with the suite.
export default {
  id: "t3-saved-view-update-renames",
  check: "tables.sql-view-press-keeps-name",
  items: ["T38", "T39"],
  description: "a press on a saved view (Calendar's date pick) renames the view to \"Saved view\"",
  mode: "in-transaction",
  apply: `create or replace function public.sn_t3_view_renames() returns trigger language plpgsql as $f$
begin new.name := 'Saved view'; return new; end $f$;
create trigger zzz_sn_t3_view before update on platform.saved_view for each row execute function public.sn_t3_view_renames();
`,
};
