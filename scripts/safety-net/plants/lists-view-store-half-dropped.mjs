// The server's pick-list items view loses its store half: a list that lives in the store has no choices to the agents' tool.
export default {
  id: "lists-view-store-half-dropped",
  check: "lists.sql-after-switch",
  items: ["L01", "L03"],
  description: "workbench.pick_list_item_live answers the older half only (in the suite's transaction)",
  mode: "in-transaction",
  apply: `create or replace view workbench.pick_list_item_live with (security_invoker = true) as
 select i.id, i.list_id, (i.label)::text as label, i.description, i.help_text, (i.group_name)::text as group_name, (i.icon_name)::text as icon_name, i.organization_id, i.created_at, i.updated_at, 'older'::text as lives_in
   from workbench.udt_structured_list_items i
   join workbench.udt_structured_lists l on l.id = i.list_id and l.deleted_at is null
  where i.deleted_at is null;`,
};
