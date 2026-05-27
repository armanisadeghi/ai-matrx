// POST /api/admin/surfaces/remediate-mapping
//
// Remediates a single broken `surface_value` mapping found in the drift
// report. Body shape:
//   {
//     bindingKind: "agent" | "tool",
//     bindingId: string,         // agx_agent_surface.id OR "<tool_id>::<surface_name>"
//     mappingKey: string,        // the JSONB key inside value_mappings / arg_mappings
//     remediation:
//       | { action: "remap_to"; target: string }
//       | { action: "remove" }
//       | { action: "notify_only" }
//   }
//
// Super-admin only.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
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
  if (b.bindingKind !== "agent" && b.bindingKind !== "tool") {
    return { error: "bindingKind must be 'agent' or 'tool'." };
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

  // The tool-binding branch was removed in the 2026 tool-system refactor:
  // `tl_def_surface` was dropped entirely. Tool arg-defaults now live as
  // literal jsonb on `tool_surface_defaults.arg_defaults` — there is no
  // `surface_value` indirection left to remediate. The agent branch (using
  // `agx_agent_surface`) is unchanged.
  if (args.bindingKind === "tool") {
    return NextResponse.json(
      {
        error:
          "Tool mapping remediation is no longer supported. tl_def_surface was dropped in the 2026 refactor; tool arg-defaults live as literal jsonb in tool_surface_defaults.arg_defaults and don't reference surface_values.",
      },
      { status: 410 },
    );
  }

  try {
    const supabase = await createClient();
    const result = await remediateBrokenMapping(supabase, args);
    return NextResponse.json({ result });
  } catch (e) {
    return errorResponse(e);
  }
}
