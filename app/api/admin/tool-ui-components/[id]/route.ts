import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const supabase = await createClient();

        const { data, error } = await supabase
            .from("tool_ui")
            .select("*")
            .eq("id", id)
            .single();

        if (error) {
            return NextResponse.json(
                { error: "Component not found", details: error.message },
                { status: 404 }
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

export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const supabase = await createClient();
        const body = await request.json();

        // Only allow updating specific fields
        const allowedFields = [
            "tool_id", "tool_name", "surface_name", "display_name", "results_label",
            "inline_code", "overlay_code", "utility_code",
            "header_extras_code", "header_subtitle_code",
            "keep_expanded_on_stream", "allowed_imports", "language",
            "is_active", "version", "notes", "contract_version",
        ];

        const updateData: Record<string, unknown> = {};
        for (const field of allowedFields) {
            if (body[field] !== undefined) {
                updateData[field] = body[field];
            }
        }

        if (Object.keys(updateData).length === 0) {
            return NextResponse.json(
                { error: "No valid fields to update" },
                { status: 400 }
            );
        }

        const { data, error } = await supabase
            .from("tool_ui")
            .update(updateData)
            .eq("id", id)
            .select()
            .single();

        if (error) {
            return NextResponse.json(
                { error: "Failed to update component", details: error.message },
                { status: 500 }
            );
        }

        return NextResponse.json({ message: "Component updated successfully", component: data });
    } catch (error) {
        return NextResponse.json(
            { error: "Internal server error", details: error instanceof Error ? error.message : "Unknown error" },
            { status: 500 }
        );
    }
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const supabase = await createClient();

        const { error } = await supabase
            .from("tool_ui")
            .delete()
            .eq("id", id);

        if (error) {
            return NextResponse.json(
                { error: "Failed to delete component", details: error.message },
                { status: 500 }
            );
        }

        return NextResponse.json({ message: "Component deleted successfully" });
    } catch (error) {
        return NextResponse.json(
            { error: "Internal server error", details: error instanceof Error ? error.message : "Unknown error" },
            { status: 500 }
        );
    }
}
