import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { searchParams } = new URL(request.url);
        const toolName = searchParams.get("tool_name");
        const activeOnly = searchParams.get("active_only");

        let query = supabase
            .from("tool_ui")
            .select("*")
            .order("tool_name", { ascending: true });

        if (toolName) {
            query = query.eq("tool_name", toolName);
        }
        if (activeOnly === "true") {
            query = query.eq("is_active", true);
        }

        const { data, error } = await query;

        if (error) {
            return NextResponse.json(
                { error: "Failed to fetch components", details: error.message },
                { status: 500 }
            );
        }

        return NextResponse.json({ components: data || [], count: data?.length || 0 });
    } catch (error) {
        return NextResponse.json(
            { error: "Internal server error", details: error instanceof Error ? error.message : "Unknown error" },
            { status: 500 }
        );
    }
}

export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();
        const body = await request.json();

        const { tool_name, display_name, inline_code } = body;
        if (!tool_name || !display_name || !inline_code) {
            return NextResponse.json(
                { error: "Missing required fields: tool_name, display_name, inline_code" },
                { status: 400 }
            );
        }

        const componentData = {
            tool_id: body.tool_id || null,
            tool_name: body.tool_name,
            // Phase-0 default; real surface picker arrives in Phase 2.
            surface_name: body.surface_name || "matrx-admin/tool-registry",
            display_name: body.display_name,
            results_label: body.results_label || null,
            inline_code: body.inline_code,
            overlay_code: body.overlay_code || null,
            utility_code: body.utility_code || null,
            header_extras_code: body.header_extras_code || null,
            header_subtitle_code: body.header_subtitle_code || null,
            keep_expanded_on_stream: body.keep_expanded_on_stream ?? false,
            allowed_imports: body.allowed_imports || [
                "react", "lucide-react", "@/lib/utils",
                "@/components/ui/badge", "@/components/ui/button",
                "@/components/ui/card", "@/components/ui/tabs",
            ],
            language: body.language || "tsx",
            is_active: body.is_active !== undefined ? body.is_active : true,
            version: body.version || "1.0.0",
            notes: body.notes || null,
            contract_version: body.contract_version === 1 ? 1 : 2,
        };

        const { data, error } = await supabase
            .from("tool_ui")
            .insert([componentData])
            .select()
            .single();

        if (error) {
            return NextResponse.json(
                { error: "Failed to create component", details: error.message },
                { status: 500 }
            );
        }

        return NextResponse.json({ message: "Component created successfully", component: data }, { status: 201 });
    } catch (error) {
        return NextResponse.json(
            { error: "Internal server error", details: error instanceof Error ? error.message : "Unknown error" },
            { status: 500 }
        );
    }
}
