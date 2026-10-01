// SN-T3 plant: a saved view loses its filters and its grouping on every update (a board or calendar press
// drops what the person had set). In-transaction on the clone.
export default {
  id: "t3-saved-view-drops-filters",
  check: "tables.sql-saved-view-store",
  items: ["T38", "T39"],
  description: "an update of a saved view drops its filters and grouping (the board forgets what it was grouped by)",
  mode: "in-transaction",
  apply: `create or replace function public.sn_t3_view_forgets() returns trigger language plpgsql as $f$
begin new.definition := coalesce(new.definition, '{}'::jsonb) - 'filters' - 'group_by' - 'groupBy' - 'group'; return new; end $f$;
create trigger zzz_sn_t3_view_forgets before update on platform.saved_view for each row execute function public.sn_t3_view_forgets();
`,
};
