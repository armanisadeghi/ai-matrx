// features/trash/movedOlderTable.ts — AN OLDER TABLE THAT MOVED WITH ITS ORGANIZATION'S SWITCH (lane SWITCH-AFTERMATH).
//
// Pressing Data tables → new system archives every older table of the organization; each one's
// same-id copy in the record store is the table from then on. Trash lists those older tables with
// this label (public.trash_list / public.org_trash_list say it, from
// platform._older_table_moved_by_switch), and they come back only all together, with Switch back on
// the organization's settings page — the store refuses a single restore by name
// (trigger workbench._moved_older_table_restores_with_switch_back). So the row offers the one
// action that works instead of a Restore that would be refused.

/** The label the Trash doors give a moved older table. Keep in step with the campaign file. */
export const MOVED_OLDER_TABLE_LABEL = "Older table (moved to the new system)";

export function isMovedOlderTable(item: { entity_token: string; label: string }): boolean {
  return item.entity_token === "dataset" && item.label === MOVED_OLDER_TABLE_LABEL;
}

export const SWITCH_BACK_EXPLAINED = "Switch back restores all of them together";

/** Where Switch back lives for the organization the older table belongs to. */
export function switchBackHrefFor(organizationId: string | null | undefined): string {
  return organizationId ? `/organizations/${organizationId}/settings#data` : "/organizations";
}
