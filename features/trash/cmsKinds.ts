/**
 * The CMS kinds Trash lists, and the wire contract of `/api/cms/trash`.
 *
 * The CMS is a SEPARATE database (CMS migration 0041 gives its tables `deleted_at`), so its
 * archived rows can never join the main-DB `trash_list` registry. They reach Trash as a second
 * source (`features/trash/sources.ts`) through one route that holds the CMS key. No imports:
 * the route (server) and the source (client) both read this file.
 */

export const CMS_TRASH_KINDS = {
  cms_site: { label: "Site", table: "client_sites", door: "cms_restore_site", arg: "p_site_id" },
  cms_page: { label: "Site page", table: "client_pages", door: "cms_restore_page", arg: "p_page_id" },
  cms_component: {
    label: "Site component",
    table: "client_components",
    door: "cms_restore_component",
    arg: "p_component_id",
  },
} as const;

export type CmsTrashToken = keyof typeof CMS_TRASH_KINDS;

export function isCmsTrashToken(token: string): token is CmsTrashToken {
  return Object.prototype.hasOwnProperty.call(CMS_TRASH_KINDS, token);
}

/** One row, in the main Trash row shape (`trash_list`'s columns). */
export interface CmsTrashRow {
  artifact_kind: CmsTrashToken;
  entity_token: CmsTrashToken;
  label: string;
  id: string;
  title: string;
  deleted_at: string;
  organization_id: string;
  is_mine: boolean;
}

export interface CmsTrashCount {
  artifact_kind: CmsTrashToken;
  label: string;
  n: number;
}

/**
 * GET /api/cms/trash. `live: false` means CMS migration 0041 has not landed: nothing can be
 * archived yet, so the source contributes nothing (no kind, no row, no error).
 */
export interface CmsTrashListResponse {
  live: boolean;
  counts: CmsTrashCount[];
  items: CmsTrashRow[];
}

/** One entry of a restore door's `notices` array, as the migration writes it. */
export interface CmsRestoreNotice {
  kind: string;
  entity: string;
  id: string;
  from: unknown;
  to: unknown;
  message: string;
}

/** POST /api/cms/trash. `notices` is the door's array, verbatim. */
export interface CmsTrashRestoreResponse {
  action: string;
  notices: CmsRestoreNotice[];
}
