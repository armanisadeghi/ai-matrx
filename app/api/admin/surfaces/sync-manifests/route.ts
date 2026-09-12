// POST /api/admin/surfaces/sync-manifests
//
// Applies the code-side SurfaceManifest registry into:
//   - ui.ui_surface_value
//   - ui.ui_surface_agent_role
//   - ui.ui_surface.url_pattern (from manifest.urlPattern or route defaults)
// Body shape (all optional):
//   { deleteStale?: boolean; createMissingSurfaces?: boolean }
//
// - `deleteStale: false` (default) leaves `db_only` rows alone so admins can
//   review the drift report and decide.
// - `createMissingSurfaces: false` (default) refuses to register manifests
//   whose `surfaceName` isn't present in `ui.ui_surface`. Set true to
//   auto-create the surface row before upserting its values.
//
// Super-admin only.

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/adminClient";
import { requireSuperAdmin } from "@/utils/auth/adminUtils";
import { applyManifestSync } from "@/features/surfaces/services/manifest-sync.service";
import { apiSyncedFrom } from "@/features/surfaces/services/sync-provenance";
// ONE error→status mapping for this route family, and the only thing that
// describes a PostgREST failure (thrown as a plain object, never an Error).
import { errorResponse } from "@/app/api/admin/surfaces/error-response";

export async function POST(request: NextRequest) {
  // The super admin whose session ran this sync — stamped onto every mirror
  // row it writes (`synced_by`). It comes from the SAME call that authorizes
  // the request, so the provenance can never name someone the gate did not
  // actually check.
  let syncedBy: string;
  try {
    syncedBy = await requireSuperAdmin();
  } catch (e) {
    return errorResponse(e);
  }

  const body = (await request.json().catch(() => null)) as {
    deleteStale?: boolean;
    createMissingSurfaces?: boolean;
  } | null;

  try {
    // ui_surface* tables are RLS-protected with no write policy — use the admin
    // client for these super-admin-gated writes.
    const supabase = createAdminClient();
    const result = await applyManifestSync(supabase, {
      deleteStale: body?.deleteStale ?? false,
      createMissingSurfaces: body?.createMissingSurfaces ?? false,
      provenance: { syncedBy, syncedFrom: apiSyncedFrom() },
    });
    return NextResponse.json({ result });
  } catch (e) {
    return errorResponse(e);
  }
}
