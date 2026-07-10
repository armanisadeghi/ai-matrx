/**
 * CMS Versions API Route — v5 (canonical history, every entity, ownership-secured)
 *
 * Reads the canonical append-only log `history.row_versions` on the CMS project
 * through its public façade RPCs (`version_list` / `version_get`, aidream CMS
 * migrations `0003` + `0006`). EVERY change to a versioned row is an entry —
 * create, edit, draft save, publish, rollback.
 *
 * FIVE entities are versioned (migration `0005`), not just pages. The `entityType`
 * param is a `platform.entity_types` token; it defaults to `client_page` so the
 * page History tab keeps working unchanged.
 *
 * The RPCs are SECURITY DEFINER with EXECUTE locked to `service_role` and carry
 * NO in-DB access gate (the CMS project has no `iam`), so the ownership chain MUST
 * be verified HERE before any version data is returned — the same contract
 * aidream's `services/cms/access.py` enforces on its side. `verifyEntityOwnership`
 * below is that chain; an entity absent from it is unreachable, by construction.
 */

import { NextRequest, NextResponse } from "next/server";
import { SupabaseClient } from "@supabase/supabase-js";
import { createClient as createMainSupabaseClient } from "@/utils/supabase/server";
import {
  getCmsClient,
  verifyPageOwnership,
  verifySiteOwnership,
  verifyComponentOwnership,
  verifyAssetOwnership,
  verifyHtmlPageOwnership,
} from "../_lib/cmsDb";
import type {
  CmsEntityType,
  ClientEntityVersion,
  ClientEntityVersionDetail,
} from "@/features/cms/types";

/** The `version_get` RPC returns the summary fields plus the raw row snapshot. */
type VersionGetRow = ClientEntityVersion & { row_data: Record<string, unknown> };

/**
 * entity token -> its ownership check. This map IS the authorization boundary:
 * an entity that is not here cannot be read through this route, even if the DB
 * versions it.
 */
const OWNERSHIP: Record<
  CmsEntityType,
  (db: SupabaseClient, rowId: string, userId: string) => Promise<boolean>
> = {
  client_site: verifySiteOwnership,
  client_page: verifyPageOwnership,
  client_component: async (db, rowId, userId) =>
    (await verifyComponentOwnership(db, rowId, userId)).ok,
  client_asset: verifyAssetOwnership,
  html_page: verifyHtmlPageOwnership,
};

function resolveEntityType(raw: unknown): CmsEntityType | null {
  if (raw === undefined || raw === null) return "client_page"; // back-compat default
  return typeof raw === "string" && raw in OWNERSHIP
    ? (raw as CmsEntityType)
    : null;
}

export async function POST(request: NextRequest) {
  try {
    const mainSupabase = await createMainSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await mainSupabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { action, ...params } = body;
    const db = getCmsClient();

    const entityType = resolveEntityType(params.entityType);
    if (!entityType) {
      return NextResponse.json(
        {
          error: `Unknown entityType: ${String(params.entityType)}. Known: ${Object.keys(OWNERSHIP).join(", ")}`,
        },
        { status: 400 },
      );
    }

    switch (action) {
      case "list": {
        // `pageId` is the legacy name the page History tab sends; `rowId` is the
        // general one. Exactly one is required.
        const rowId: string | undefined = params.rowId ?? params.pageId;
        if (!rowId) {
          return NextResponse.json(
            { error: "rowId (or pageId) is required" },
            { status: 400 },
          );
        }

        if (!(await OWNERSHIP[entityType](db, rowId, user.id))) {
          return NextResponse.json(
            { error: "Not found or access denied" },
            { status: 403 },
          );
        }

        const { data, error } = await db.rpc("version_list", {
          p_token: entityType,
          p_id: rowId,
        });

        if (error) {
          console.error("[cms/versions] list error:", error);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({
          versions: (data ?? []) as ClientEntityVersion[],
        });
      }

      case "get": {
        const { versionId } = params;
        if (!versionId) {
          return NextResponse.json(
            { error: "versionId is required" },
            { status: 400 },
          );
        }

        const { data, error } = await db.rpc("version_get", {
          p_token: entityType,
          p_version_id: Number(versionId),
        });

        if (error || !data) {
          return NextResponse.json(
            { error: "Version not found" },
            { status: 404 },
          );
        }

        const row = data as VersionGetRow;

        // Ownership is checked on the ROW the version belongs to — the RPC itself
        // has no access gate.
        if (!(await OWNERSHIP[entityType](db, row.row_id, user.id))) {
          return NextResponse.json({ error: "Access denied" }, { status: 403 });
        }

        const version: ClientEntityVersionDetail = {
          id: row.id,
          entity_type: row.entity_type,
          row_id: row.row_id,
          version_number: row.version_number,
          operation: row.operation,
          actor_id: row.actor_id,
          occurred_at: row.occurred_at,
          is_current: row.is_current,
          data: row.row_data ?? {},
        };
        return NextResponse.json({ version });
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 },
        );
    }
  } catch (err: unknown) {
    console.error("[cms/versions] Unexpected error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
