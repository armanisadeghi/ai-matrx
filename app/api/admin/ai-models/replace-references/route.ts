import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { requireSuperAdmin } from "@/utils/auth/adminUtils";
import {
  replaceModelReferencesAdmin,
  type SettingSwap,
} from "@/features/ai-models/server/replace-model-references";
import type { LLMParams } from "@/features/agents/types/agent-api-types";

export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  // A PostgrestError is a plain object, not an Error — reading only
  // `instanceof Error` turned every database refusal into "Unknown error"
  // (2026-09-14: the provenance guard's sentence never reached the screen).
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" &&
          error !== null &&
          typeof (error as { message?: unknown }).message === "string"
        ? (error as { message: string }).message
        : "Unknown error";
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

    const body = (await request.json()) as {
      oldModelId?: string;
      newModelId?: string;
      newSettings?: LLMParams;
      swaps?: SettingSwap[];
    };

    const { oldModelId, newModelId, newSettings } = body;
    const swaps = Array.isArray(body.swaps)
      ? body.swaps.filter(
          (swap): swap is SettingSwap =>
            !!swap && typeof swap.key === "string" && swap.key.length > 0,
        )
      : [];
    if (!oldModelId || !newModelId) {
      return NextResponse.json(
        { error: "oldModelId and newModelId are required." },
        { status: 400 },
      );
    }
    if (oldModelId === newModelId) {
      return NextResponse.json(
        { error: "oldModelId and newModelId must differ." },
        { status: 400 },
      );
    }

    // The admin's own session, never the service-role key: agent.definition
    // refuses a write that names no actor (provenance guard). See
    // replace-model-references.ts.
    const supabase = await createClient();
    const result = await replaceModelReferencesAdmin(
      supabase,
      oldModelId,
      newModelId,
      newSettings,
      swaps,
    );

    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
