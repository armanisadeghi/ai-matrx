/**
 * CMS Trash — the second Trash source (the first is the main-DB `trash_list` registry).
 *
 * The CMS is a separate database, so its archived sites, pages and components cannot join the
 * main registry; `/trash` merges this route's answer beside it (`features/trash/sources.ts`).
 *
 *   GET   ?kinds=cms_page&limit=50&offset=0
 *         → { live, counts, items } in the Trash row shape. `live: false` until CMS migration
 *           0041 gives the tables `deleted_at`; then the source contributes nothing at all.
 *   POST  { token, id }
 *         → { action, notices } from the migration's restore door (`cms_restore_site`,
 *           `cms_restore_page`, `cms_restore_component`), `notices` passed through verbatim.
 *
 * Access is the SAME decision the existing CMS routes take to archive the row (see
 * `_lib/cmsTrash.ts`), never a new rule.
 */

import { NextRequest, NextResponse } from "next/server";

import { createClient as createMainSupabaseClient } from "@/utils/supabase/server";
import { getClaimsUser } from "@/utils/supabase/resolveUser";
import {
  CMS_TRASH_KINDS,
  isCmsTrashToken,
  type CmsTrashRestoreResponse,
} from "@/features/trash/cmsKinds";

import { logCmsActivity } from "../_lib/activityLog";
import { archiveLive, archiveNotLiveResponse } from "../_lib/cmsArchive";
import { canAccessCmsSite, cmsVisibleSitesFilter, resolveCmsCaller } from "../_lib/cmsAccess";
import { getCmsClient } from "../_lib/cmsDb";
import {
  assembleCmsTrash,
  NOT_LIVE,
  restoreRefusalMessage,
  type CmsTrashComponentRow,
  type CmsTrashPageRow,
  type CmsTrashSiteRow,
} from "../_lib/cmsTrash";

/** The CMS is small (tens of sites, a few hundred pages); one read per table is bounded here. */
const ROW_CAP = 2000;
const SITE_COLUMNS = "id, name, slug, owner_user_id, organization_id, visibility";

function intParam(value: string | null, fallback: number, max: number): number {
  if (value === null || value.trim() === "") return fallback;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? Math.min(n, max) : fallback;
}

async function authed() {
  const mainSupabase = await createMainSupabaseClient();
  const {
    data: { user },
    error,
  } = await getClaimsUser(mainSupabase);
  if (error || !user) return null;
  return { user, caller: await resolveCmsCaller(mainSupabase, user.id) };
}

export async function GET(request: NextRequest) {
  try {
    const who = await authed();
    if (!who) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { caller } = who;
    const db = getCmsClient();

    const live = {
      sites: await archiveLive(db, "client_sites"),
      pages: await archiveLive(db, "client_pages"),
      components: await archiveLive(db, "client_components"),
    };
    if (!live.sites && !live.pages && !live.components) return NextResponse.json(NOT_LIVE);

    const params = request.nextUrl.searchParams;
    const kinds = params.get("kinds")?.split(",").filter(isCmsTrashToken);
    const query = {
      kinds: kinds && kinds.length > 0 ? kinds : undefined,
      limit: intParam(params.get("limit"), 200, 500),
      offset: intParam(params.get("offset"), 0, ROW_CAP),
    };

    // Every site the caller can open (theirs + their organizations'), live AND archived: the
    // archived ones are the site rows, the live ones decide which children are listed.
    const orFilter = cmsVisibleSitesFilter(caller);
    const sitesBase = db
      .from("client_sites")
      .select(live.sites ? `${SITE_COLUMNS}, deleted_at` : SITE_COLUMNS);
    const { data: sites, error: sitesError } = await (orFilter
      ? sitesBase.or(orFilter)
      : sitesBase.eq("owner_user_id", caller.userId)
    ).limit(ROW_CAP);
    if (sitesError) throw new Error(`Could not read sites: ${sitesError.message}`);
    const siteRows = (sites ?? []) as unknown as CmsTrashSiteRow[];
    const liveSiteIds = siteRows.filter((s) => !s.deleted_at).map((s) => s.id);

    let pages: CmsTrashPageRow[] = [];
    let components: CmsTrashComponentRow[] = [];
    if (liveSiteIds.length > 0 && live.pages) {
      const { data, error } = await db
        .from("client_pages")
        .select("id, client_id, parent_id, title, slug, deleted_at")
        .in("client_id", liveSiteIds)
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false })
        .limit(ROW_CAP);
      if (error) throw new Error(`Could not read archived pages: ${error.message}`);
      pages = (data ?? []) as CmsTrashPageRow[];
    }
    if (liveSiteIds.length > 0 && live.components) {
      const { data, error } = await db
        .from("client_components")
        .select("id, client_id, name, component_type, deleted_at")
        .in("client_id", liveSiteIds)
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false })
        .limit(ROW_CAP);
      if (error) throw new Error(`Could not read archived components: ${error.message}`);
      components = (data ?? []) as CmsTrashComponentRow[];
    }

    return NextResponse.json(
      assembleCmsTrash(caller, { sites: siteRows, pages, components }, live, query),
    );
  } catch (error) {
    console.error("[cms/trash] list failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load archived site content." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const who = await authed();
    if (!who) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { user, caller } = who;
    const body = (await request.json().catch(() => ({}))) as { token?: unknown; id?: unknown };
    const token = typeof body.token === "string" ? body.token : "";
    const id = typeof body.id === "string" ? body.id : "";
    if (!isCmsTrashToken(token) || !id) {
      return NextResponse.json({ error: "token (a CMS kind) and id are required" }, { status: 400 });
    }
    const kind = CMS_TRASH_KINDS[token];
    const db = getCmsClient();
    if (!(await archiveLive(db, kind.table))) return archiveNotLiveResponse("a restore");

    // The row (archived or not) and the site that governs it.
    let siteId: string;
    let title: string;
    if (token === "cms_site") {
      siteId = id;
      title = "";
    } else {
      const columns = token === "cms_page" ? "client_id, title, slug" : "client_id, name";
      const { data: child } = await db.from(kind.table).select(columns).eq("id", id).maybeSingle();
      if (!child) return NextResponse.json({ error: "It is no longer in the Trash." }, { status: 404 });
      const c = child as unknown as { client_id: string; title?: string; slug?: string; name?: string };
      siteId = c.client_id;
      title = c.title || c.slug || c.name || "";
    }
    const { data: site } = await db
      .from("client_sites")
      .select(`${SITE_COLUMNS}, deleted_at`)
      .eq("id", siteId)
      .maybeSingle();
    if (!site) return NextResponse.json({ error: "It is no longer in the Trash." }, { status: 404 });
    const siteRow = site as unknown as CmsTrashSiteRow;
    // Restoring asks for the level archiving asked for: admin for a site, editor for its content.
    if (!canAccessCmsSite(caller, siteRow, token === "cms_site" ? "admin" : "editor")) {
      return NextResponse.json(
        { error: "Restore was refused — you may no longer have access to this site." },
        { status: 403 },
      );
    }

    const { data, error } = await db.rpc(kind.door, { [kind.arg]: id });
    if (error) {
      return NextResponse.json(
        { error: restoreRefusalMessage(error.message) },
        { status: error.code === "P0002" ? 404 : 409 },
      );
    }
    const result = (data ?? {}) as { action?: unknown; notices?: unknown };
    const response: CmsTrashRestoreResponse = {
      action: typeof result.action === "string" ? result.action : "restored",
      notices: Array.isArray(result.notices) ? (result.notices as CmsTrashRestoreResponse["notices"]) : [],
    };

    const entity = token === "cms_site" ? "site" : token === "cms_page" ? "page" : "component";
    await logCmsActivity(db, {
      siteId,
      activityType: `${entity}.restore`,
      entityType: entity,
      entityId: id,
      description: `Restored ${entity} "${title || siteRow.name || id}" from Trash`,
      userId: user.id,
      userEmail: user.email,
      changes: { restore: result },
    });

    return NextResponse.json(response);
  } catch (error) {
    console.error("[cms/trash] restore failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not restore." },
      { status: 500 },
    );
  }
}
