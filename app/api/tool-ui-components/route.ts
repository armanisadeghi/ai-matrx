import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

/**
 * Public endpoint to fetch active tool UI component code by tool_name.
 * Used by the client-side dynamic renderer.
 */
export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { searchParams } = new URL(request.url);
        const toolName = searchParams.get("tool_name");

        if (!toolName) {
            return NextResponse.json(
                { error: "tool_name parameter is required" },
                { status: 400 }
            );
        }

        const { data, error } = await supabase
            .from("tool_ui")
            .select("*")
            .eq("tool_name", toolName)
            .eq("is_active", true)
            .single();

        if (error) {
            if (error.code === "PGRST116") {
                return NextResponse.json({ component: null });
            }
            return NextResponse.json(
                { error: "Failed to fetch component", details: error.message },
                { status: 500 }
            );
        }

        return NextResponse.json({ component: data });
    } catch (error) {
        return NextResponse.json(
            { error: "Internal server error", details: error instanceof Error ? error.message : "Unknown error" },
            { status: 500 }
        );
    }
}
