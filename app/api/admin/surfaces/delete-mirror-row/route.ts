// POST /api/admin/surfaces/delete-mirror-row
//
// Deletes ONE stale mirror row found in the drift report — never a sweep.
// The global "delete stale rows" path lives on
// POST /api/admin/surfaces/sync-manifests and stays deliberately separate:
// it cannot tell a target removed from code apart from a row a sibling branch
// synced, so it is the wrong lever for a single row an admin has actually
// read. Body shape:
//   {
//     table: "ui_surface_value" | "ui_surface_agent_role"
//          | "ui_surface_write_target" | "ui_surface_client_tool",
//     surfaceName: string,        // ui.<table>.surface_name
//     name: string,               // ui.<table>.name — together the composite PK
//     acknowledgeRecent?: boolean // set only after a human accepted the
//                                 // "this row was written recently" warning
//   }
//
// Super-admin only.

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/adminClient";
import { requireSuperAdmin } from "@/utils/auth/adminUtils";
import {
  deleteMirrorRow,
  isMirrorTable,
  type DeleteMirrorRowArgs,
} from "@/features/surfaces/services/manifest-sync.service";

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown error";
  const status = message.startsWith("Unauthorized")
    ? 401
    : message.startsWith("Forbidden")
      ? 403
      : 500;
  return NextResponse.json({ error: message }, { status });
}

function validate(body: unknown): DeleteMirrorRowArgs | { error: string } {
  if (!body || typeof body !== "object") {
    return { error: "Body must be a JSON object." };
  }
  const b = body as Record<string, unknown>;
  if (!isMirrorTable(b.table)) {
    return {
      error:
        "table must be one of: ui_surface_value, ui_surface_agent_role, ui_surface_write_target, ui_surface_client_tool.",
    };
  }
  if (typeof b.surfaceName !== "string" || !b.surfaceName) {
    return { error: "surfaceName is required." };
  }
  if (typeof b.name !== "string" || !b.name) {
    return { error: "name is required." };
  }
  if (b.acknowledgeRecent !== undefined && typeof b.acknowledgeRecent !== "boolean") {
    return { error: "acknowledgeRecent must be a boolean when present." };
  }
  return {
    table: b.table,
    surfaceName: b.surfaceName,
    name: b.name,
    ...(b.acknowledgeRecent === true ? { acknowledgeRecent: true } : {}),
  };
}

export async function POST(request: NextRequest) {
  try {
    await requireSuperAdmin();
  } catch (e) {
    return errorResponse(e);
  }

  const raw = (await request.json().catch(() => null)) as unknown;
  const args = validate(raw);
  if ("error" in args) {
    return NextResponse.json({ error: args.error }, { status: 400 });
  }

  try {
    // The `ui.*` mirror tables are super-admin-write under RLS; gated above,
    // so use the admin client — same posture as remediate-mapping.
    const supabase = createAdminClient();
    const result = await deleteMirrorRow(supabase, args);
    return NextResponse.json({ result });
  } catch (e) {
    return errorResponse(e);
  }
}
