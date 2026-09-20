import { createClient } from "@/utils/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { getClaimsUser } from "@/utils/supabase/resolveUser";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await getClaimsUser(supabase);

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: agentId, error: rpcError } = await supabase.rpc(
      "agx_create_agent_from_template",
      { p_template_id: id },
    );

    if (rpcError || !agentId) {
      console.error("Error creating agent from template:", rpcError);
      return NextResponse.json(
        { error: "Failed to create agent from template" },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, agentId });
  } catch (error) {
    console.error("Error in POST handler:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
