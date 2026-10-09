import { createClient } from "@/utils/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { contextMenuView } from "@/lib/supabase/shortcutStorage";
import { getClaimsUser } from "@/utils/supabase/resolveUser";
import { extractErrorMessage } from "@/utils/errors";

/** Supabase's auth cookie (`sb-<ref>-auth-token`, possibly chunked `.0`, `.1`). */
function carriesSession(request: NextRequest): boolean {
  return request.cookies.getAll().some((c) => c.name.startsWith("sb-") && c.name.includes("-auth-token"));
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await getClaimsUser(supabase);

    if (authError || !user) {
      // A signed-out visitor (a published Applet, a share page) carries no session at all: their menu is
      // truly empty, never a refusal — every guest page load was a 401 in the console (Applet audit
      // 2026-10-09). A request that DOES carry a session we could not resolve is still refused.
      if (!carriesSession(request)) return NextResponse.json({ data: [] });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const placementType = searchParams.get("placement_type");

    const builder = contextMenuView(supabase)
      .select("*");
    const { data, error } = placementType
      ? await builder.eq("placement_type", placementType)
      : await builder;

    if (error) {
      console.error("Error fetching agent context menu:", error);
      return NextResponse.json(
        {
          error: "Failed to fetch agent context menu",
          details: error.message,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({ data: data ?? [] });
  } catch (error) {
    console.error("Error in GET /api/agent-context-menu:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: extractErrorMessage(error, "Unknown error"),
      },
      { status: 500 },
    );
  }
}
