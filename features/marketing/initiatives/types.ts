import type { Database } from "@/types/database.types";
import type { ListScopeKind } from "@/lib/list-scope/types";

export type Initiative = Database["marketing"]["Tables"]["initiative"]["Row"];
export type InitiativeInsert =
  Database["marketing"]["Tables"]["initiative"]["Insert"];
export type InitiativeUpdate =
  Database["marketing"]["Tables"]["initiative"]["Update"];

export type InitiativeListRow =
  Database["public"]["Functions"]["mkt_initiative_list_scoped"]["Returns"][number];

export const INITIATIVE_LIST_SCOPES: ListScopeKind[] = [
  "mine",
  "orgs",
  "shared",
  "public",
];
export const INITIATIVE_STATUSES = [
  "draft",
  "active",
  "paused",
  "completed",
  "archived",
] as const;
export const INITIATIVE_OBJECTIVES = [
  "awareness",
  "acquisition",
  "conversion",
  "retention",
  "launch",
  "seasonal",
  "other",
] as const;
export const initiativeHref = (row: Pick<Initiative, "id">) =>
  `/marketing/initiatives/${row.id}`;
