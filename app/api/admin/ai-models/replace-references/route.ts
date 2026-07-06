import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/adminClient";
import { requireSuperAdmin } from "@/utils/auth/adminUtils";
import { replaceModelReferencesAdmin } from "@/features/ai-models/server/replace-model-references";
import type { LLMParams } from "@/features/agents/types/agent-api-types";

export const dynamic = "force-dynamic";

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

    const body = (await request.json()) as {
      oldModelId?: string;
      newModelId?: string;
      newSettings?: LLMParams;
    };

    const { oldModelId, newModelId, newSettings } = body;
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

    const supabase = createAdminClient();
    const result = await replaceModelReferencesAdmin(
      supabase,
      oldModelId,
      newModelId,
      newSettings,
    );

    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
