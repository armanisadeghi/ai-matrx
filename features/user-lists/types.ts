// Types for User Lists feature

import type {
  FullListBookmark as WireFullListBookmark,
  ListGroupBookmark as WireListGroupBookmark,
  ListItemBookmark as WireListItemBookmark,
} from "@/types/python-generated/stream-events";

export interface UserList {
  /** Normalized from `list_id` (RPC) or `id` (table query) */
  id: string;
  list_name: string;
  description: string | null;
  user_id: string;
  is_public: boolean;
  public_read: boolean;
  created_at: string;
  updated_at: string | null;
  // Populated by get_user_lists_summary RPC
  item_count?: number;
  group_count?: number;
}

/** Raw row returned by get_user_lists_summary RPC — uses list_id instead of id */
export interface UserListSummaryRaw {
  list_id: string;
  list_name: string;
  description: string | null;
  user_id?: string;
  is_public?: boolean;
  public_read?: boolean;
  created_at: string;
  updated_at: string | null;
  item_count: number;
  group_count: number;
}

/** Normalize RPC summary rows to the standard UserList shape */
export function normalizeUserList(raw: UserListSummaryRaw): UserList {
  return {
    id: raw.list_id,
    list_name: raw.list_name,
    description: raw.description,
    user_id: raw.user_id ?? "",
    is_public: raw.is_public ?? false,
    public_read: raw.public_read ?? true,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
    item_count: raw.item_count,
    group_count: raw.group_count,
  };
}

export interface UserListItem {
  id: string;
  label: string;
  description: string | null;
  help_text: string | null;
  group_name: string | null;
  icon_name: string | null;
  user_id: string;
  list_id: string;
  is_public: boolean;
  public_read: boolean;
  created_at: string;
  updated_at: string | null;
}

/** Shape returned by get_user_list_with_items RPC */
export interface UserListWithItems {
  list_id: string;
  list_name: string;
  description: string | null;
  created_at: string;
  updated_at: string | null;
  is_public: boolean;
  public_read: boolean;
  user_id?: string;
  items_grouped: Record<string, GroupedItem[]> | null;
}

export interface GroupedItem {
  id: string;
  label: string;
  description: string | null;
  help_text: string | null;
  icon_name?: string | null;
}

// ─── Selection (label-only) read path ────────────────────────────────────────
// The consumer-facing shape: labels/help/groups/icons ONLY. The secret `description`
// is never present — it is resolved server-side at agent-run time. Returned by the
// get_picklist_for_selection RPC (SECURITY DEFINER, no description column selected).

export interface PicklistSelectionItem {
  id: string;
  label: string;
  help_text: string | null;
  group_name: string | null;
  icon_name: string | null;
}

export interface PicklistForSelection {
  list_id: string;
  list_name: string;
  description: string | null; // list-level metadata (not the secret item description)
  is_public: boolean;
  public_read: boolean;
  items_grouped: Record<string, PicklistSelectionItem[]> | null;
}

// ─── Bookmark types ──────────────────────────────────────────────────────────
//
// CANONICAL: a list bookmark IS a reference item (see
// docs/protocol/MATRX_REFERENCES.md). The identity ids + the one authoritative
// display hint (`list_name`) come from the generated wire types (imported at the
// top of this file); producers may additionally carry purely-cosmetic hints
// (`label`, `description`) which the backend tolerates (item model is
// `extra="allow"`) and ignores for resolution.

/** Optional, non-authoritative display hints a producer may attach to a bookmark. */
interface BookmarkDisplayHints {
  /** Human label for the item (canonical name; was `item_label`). */
  label?: string;
  /** Free-text prose describing the reference, for clipboard/preview only. */
  description?: string;
}

export type FullListBookmark = WireFullListBookmark & BookmarkDisplayHints;
export type ListGroupBookmark = WireListGroupBookmark & BookmarkDisplayHints;
export type ListItemBookmark = WireListItemBookmark & BookmarkDisplayHints;

export type UserListBookmark =
  | FullListBookmark
  | ListGroupBookmark
  | ListItemBookmark;

// ─── Visibility ───────────────────────────────────────────────────────────────

export type ListVisibility = "public" | "authenticated" | "private";

export function getListVisibility(
  list: Pick<UserList, "is_public" | "public_read">,
): ListVisibility {
  if (list.is_public) return "public";
  if (list.public_read) return "authenticated";
  return "private";
}

// ─── Create / Update inputs ───────────────────────────────────────────────────

export interface CreateListItemInput {
  Label: string;
  Description?: string;
  "Help Text"?: string;
  Group?: string;
}

export interface CreateListInput {
  p_list_name: string;
  p_description?: string;
  p_user_id: string;
  p_is_public?: boolean;
  p_public_read?: boolean;
  p_items?: CreateListItemInput[];
}

export interface UpdateListInput {
  p_list_id: string;
  p_list_name?: string;
  p_description?: string;
  p_is_public?: boolean;
  p_public_read?: boolean;
  /** Full replace of items if provided */
  p_items?: CreateListItemInput[] | null;
}
