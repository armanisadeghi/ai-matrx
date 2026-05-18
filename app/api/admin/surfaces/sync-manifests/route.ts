// POST /api/admin/surfaces/sync-manifests
//
// Applies the code-side SurfaceManifest registry into `public.ui_surface_value`.
// Body shape (all optional):
//   { deleteStale?: boolean; createMissingSurfaces?: boolean }
//
// - `deleteStale: false` (default) leaves `db_only` rows alone so admins can
//   review the drift report and decide.
// - `createMissingSurfaces: false` (default) refuses to register manifests
//   whose `surfaceName` isn't present in `public.ui_surface`. Set true to
//   auto-create the surface row before upserting its values.
//
// Super-admin only.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
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
    const supabase = await createClient();
    const result = await applyManifestSync(supabase, {
      deleteStale: body?.deleteStale ?? false,
      createMissingSurfaces: body?.createMissingSurfaces ?? false,
    });
    return NextResponse.json({ result });
  } catch (e) {
    return errorResponse(e);
  }
}
