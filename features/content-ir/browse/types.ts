import type { Database } from "@/types/database.types";
import type { ListScopeKind } from "@/lib/list-scope/types";

/** One row, exactly as the canonical Shapes list RPC returns it. */
export type ShapeBrowseRow =
  Database["public"]["Functions"]["shx_list_scoped"]["Returns"][number];

/** Shapes currently support every canonical scope except Industry. */
export const SHAPE_LIST_SCOPES: ListScopeKind[] = [
  "mine",
  "orgs",
  "shared",
  "public",
];
