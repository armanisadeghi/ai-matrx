/**
 * CMS Trash — which archived CMS rows a caller sees, and in what shape (CMS migration 0041).
 *
 * Pure, so the whole decision is testable without a database. The route
 * (`app/api/cms/trash/route.ts`) only fetches rows and hands them here.
 *
 * THE ACCESS DECISION IS NOT NEW. A row is listed exactly when the caller holds the level the
 * existing CMS routes demand to archive it, which is the level the restore door needs too, so no
 * row ever offers a Restore that is then refused:
 *
 *   site       `canAccessCmsSite(caller, site, "admin")`   (sites route `delete`)
 *   page       the page's site at `"editor"`                (pages route `delete`)
 *   component  the component's site at `"editor"`           (components route `delete`)
 *
 * TWO ROWS ARE LEFT OUT ON PURPOSE, because their restore door refuses them and the one that
 * brings them back is already listed:
 *   - a page or component of an ARCHIVED site: restoring the site brings back every child that
 *     was archived with it (`cms_restore_site` matches them by the site's stamp);
 *   - a page under an ARCHIVED parent page: `cms_restore_page` refuses until the parent is back,
 *     and restoring the parent brings back the sub-pages archived with it.
 */

import {
  CMS_TRASH_KINDS,
  type CmsTrashCount,
  type CmsTrashListResponse,
  type CmsTrashRow,
  type CmsTrashToken,
} from "@/features/trash/cmsKinds";

import { canAccessCmsSite, type CmsCaller } from "./cmsAccess";

export interface CmsTrashSiteRow {
  id: string;
  name: string | null;
  slug: string | null;
  owner_user_id: string | null;
  organization_id: string | null;
  visibility: string | null;
  deleted_at?: string | null;
}

export interface CmsTrashPageRow {
  id: string;
  client_id: string;
  parent_id: string | null;
  title: string | null;
  slug: string | null;
  deleted_at: string | null;
}

export interface CmsTrashComponentRow {
  id: string;
  client_id: string;
  name: string | null;
  component_type: string | null;
  deleted_at: string | null;
}

/** Which CMS tables carry `deleted_at` right now (`archiveLive`). */
export interface CmsTrashLiveness {
  sites: boolean;
  pages: boolean;
  components: boolean;
}

export interface CmsTrashQuery {
  /** Only these kinds' rows (counts always cover every kind). */
  kinds?: string[];
  /** PER KIND, the same shape as the main `trash_list`. */
  limit: number;
  offset: number;
}

export const NOT_LIVE: CmsTrashListResponse = { live: false, counts: [], items: [] };

function byNewest(a: CmsTrashRow, b: CmsTrashRow): number {
  return b.deleted_at.localeCompare(a.deleted_at);
}

export function assembleCmsTrash(
  caller: CmsCaller,
  rows: {
    sites: CmsTrashSiteRow[];
    pages: CmsTrashPageRow[];
    components: CmsTrashComponentRow[];
  },
  live: CmsTrashLiveness,
  query: CmsTrashQuery,
): CmsTrashListResponse {
  if (!live.sites && !live.pages && !live.components) return NOT_LIVE;

  const site = new Map(rows.sites.map((s) => [s.id, s]));
  const liveEditorSite = (siteId: string): CmsTrashSiteRow | null => {
    const s = site.get(siteId);
    if (!s || s.deleted_at) return null;
    return canAccessCmsSite(caller, s, "editor") ? s : null;
  };
  const row = (
    token: CmsTrashToken,
    id: string,
    title: string | null,
    deletedAt: string,
    owner: CmsTrashSiteRow,
  ): CmsTrashRow => ({
    artifact_kind: token,
    entity_token: token,
    label: CMS_TRASH_KINDS[token].label,
    id,
    title: title?.trim() || "",
    deleted_at: deletedAt,
    organization_id: owner.organization_id ?? "",
    is_mine: !!owner.owner_user_id && owner.owner_user_id === caller.userId,
  });

  const byKind: Record<CmsTrashToken, CmsTrashRow[]> = {
    cms_site: [],
    cms_page: [],
    cms_component: [],
  };

  if (live.sites) {
    for (const s of rows.sites) {
      if (!s.deleted_at || !canAccessCmsSite(caller, s, "admin")) continue;
      byKind.cms_site.push(row("cms_site", s.id, s.name || s.slug, s.deleted_at, s));
    }
  }

  if (live.pages) {
    const archivedPage = new Set(rows.pages.filter((p) => p.deleted_at).map((p) => p.id));
    for (const p of rows.pages) {
      if (!p.deleted_at) continue;
      if (p.parent_id && archivedPage.has(p.parent_id)) continue;
      const owner = liveEditorSite(p.client_id);
      if (!owner) continue;
      byKind.cms_page.push(row("cms_page", p.id, p.title || p.slug, p.deleted_at, owner));
    }
  }

  if (live.components) {
    for (const c of rows.components) {
      if (!c.deleted_at) continue;
      const owner = liveEditorSite(c.client_id);
      if (!owner) continue;
      byKind.cms_component.push(row("cms_component", c.id, c.name, c.deleted_at, owner));
    }
  }

  const counts: CmsTrashCount[] = [];
  const items: CmsTrashRow[] = [];
  for (const token of Object.keys(byKind) as CmsTrashToken[]) {
    const all = byKind[token].sort(byNewest);
    if (all.length > 0) {
      counts.push({ artifact_kind: token, label: CMS_TRASH_KINDS[token].label, n: all.length });
    }
    if (query.kinds && !query.kinds.includes(token)) continue;
    items.push(...all.slice(query.offset, query.offset + query.limit));
  }
  return { live: true, counts, items: items.sort(byNewest) };
}

/**
 * A restore door's refusal, as a sentence for the person. The doors raise
 * `cms_restore_page: the site is archived. Restore the site first; …` — the prefix names the
 * function, which means nothing to them; the rest already says what to do.
 */
export function restoreRefusalMessage(message: string): string {
  const text = message.replace(/^cms_restore_[a-z_]+:\s*/i, "").trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "The restore was refused.";
}
