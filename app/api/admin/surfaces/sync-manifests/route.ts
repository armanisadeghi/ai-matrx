// POST /api/admin/surfaces/sync-manifests
//
// Applies the code-side SurfaceManifest registry into `ui.ui_surface_value`.
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

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown error";
  const status = message.startsWith("Unauthorized")
    ? 401
    : message.startsWith("Forbidden")
      ? 403
      : 500;
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: NextRequest) {
  try {
    await requireSuperAdmin();
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
    });
    return NextResponse.json({ result });
  } catch (e) {
    return errorResponse(e);
  }
}
