import { createClient } from "@/utils/supabase/server";
import { NextRequest, NextResponse } from "next/server";

type AgentContextMenuViewRow = {
  placement_type: string;
  categories_flat: unknown;
};

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const placementType = searchParams.get("placement_type");

    type ContextMenuViewQuery = {
      from: (tableOrView: string) => {
        select: (cols: string) => {
          eq: (col: string, val: string) => Promise<{
            data: AgentContextMenuViewRow[] | null;
            error: { message: string } | null;
          }>;
        } & Promise<{
          data: AgentContextMenuViewRow[] | null;
          error: { message: string } | null;
        }>;
      };
    };

    const untyped = supabase as unknown as ContextMenuViewQuery & {
      schema: (name: string) => ContextMenuViewQuery;
    };

    const builder = untyped
      .schema("agent")
      .from("context_menu_view")
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
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
