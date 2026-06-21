// POST /api/admin/surfaces/remediate-mapping
//
// Remediates a single broken `surface_value` mapping found in the drift
// report. Body shape:
//   {
//     bindingKind: "agent",
//     bindingId: string,         // agx_agent_surface.id
//     mappingKey: string,        // the JSONB key inside value_mappings
//     remediation:
//       | { action: "remap_to"; target: string }
//       | { action: "remove" }
//       | { action: "notify_only" }
//   }
//
// Super-admin only.

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/adminClient";
import { requireSuperAdmin } from "@/utils/auth/adminUtils";
import {
  remediateBrokenMapping,
  type RemediateMappingArgs,
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

function validate(body: unknown): RemediateMappingArgs | { error: string } {
  if (!body || typeof body !== "object") {
    return { error: "Body must be a JSON object." };
  }
  const b = body as Record<string, unknown>;
  if (b.bindingKind !== "agent") {
    return { error: "bindingKind must be 'agent'." };
  }
  if (typeof b.bindingId !== "string" || !b.bindingId) {
    return { error: "bindingId is required." };
  }
  if (typeof b.mappingKey !== "string" || !b.mappingKey) {
    return { error: "mappingKey is required." };
  }
  const r = b.remediation as Record<string, unknown> | undefined;
  if (!r || typeof r !== "object") {
    return { error: "remediation object is required." };
  }
  if (r.action === "remap_to") {
    if (typeof r.target !== "string" || !r.target) {
      return { error: "remap_to requires a non-empty target." };
    }
    return {
      bindingKind: b.bindingKind,
      bindingId: b.bindingId,
      mappingKey: b.mappingKey,
      remediation: { action: "remap_to", target: r.target },
    };
  }
  if (r.action === "remove") {
    return {
      bindingKind: b.bindingKind,
      bindingId: b.bindingId,
      mappingKey: b.mappingKey,
      remediation: { action: "remove" },
    };
  }
  if (r.action === "notify_only") {
    return {
      bindingKind: b.bindingKind,
      bindingId: b.bindingId,
      mappingKey: b.mappingKey,
      remediation: { action: "notify_only" },
    };
  }
  return { error: "Unknown remediation action." };
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
    // agx_agent_surface is RLS-protected; super-admin gated above, use admin client.
    const supabase = createAdminClient();
    const result = await remediateBrokenMapping(supabase, args);
    return NextResponse.json({ result });
  } catch (e) {
    return errorResponse(e);
  }
}
