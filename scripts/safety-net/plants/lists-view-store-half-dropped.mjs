// The server's pick-list items view loses its store half: a list that lives in the store has no choices to the agents' tool.
// Store only (lane ONE-HOME wave 4): the older half and its tables are gone, so the plant keeps the view's columns and
// answers no store rows; `lists.sql-after-switch` (listsstore_the_servers_list_views_answer_the_store.sql) fails at 2.
export default {
  id: "lists-view-store-half-dropped",
  check: "lists.sql-after-switch",
  items: ["L01", "L03"],
  description: "workbench.pick_list_item_live answers no store choices (in the suite's transaction)",
  mode: "in-transaction",
  apply: `create or replace view workbench.pick_list_item_live with (security_invoker = true) as
 select c.id, c.table_id as list_id, c.data ->> 'name' as label, c.data ->> 'description' as description, c.data ->> 'help_text' as help_text,
        c.data ->> 'group_name' as group_name, c.data ->> 'icon' as icon_name, c.organization_id, c.created_at, c.updated_at, 'record'::text as lives_in
   from workbench.pick_list_live pl
   join custom.record c on c.organization_id = pl.organization_id and c.table_id = pl.id
  where false;`,
};
