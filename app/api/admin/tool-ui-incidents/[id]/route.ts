import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

/**
 * PUT - Resolve or update an incident.
 */
export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const supabase = await createClient();
        const body = await request.json();

        const updateData: Record<string, unknown> = {};

        if (body.resolved !== undefined) {
            updateData.resolved = body.resolved;
            if (body.resolved) {
                updateData.resolved_at = new Date().toISOString();
            } else {
                updateData.resolved_at = null;
                updateData.resolved_by = null;
            }
        }
        if (body.resolved_by !== undefined) {
            updateData.resolved_by = body.resolved_by;
        }
        if (body.resolution_notes !== undefined) {
            updateData.resolution_notes = body.resolution_notes;
        }

        const { data, error } = await supabase
            .from("tool_ui_incident")
            .update(updateData)
            .eq("id", id)
            .select()
            .single();

        if (error) {
            return NextResponse.json(
                { error: "Failed to update incident", details: error.message },
                { status: 500 }
            );
        }

        return NextResponse.json({ message: "Incident updated", incident: data });
    } catch (error) {
        return NextResponse.json(
            { error: "Internal server error", details: error instanceof Error ? error.message : "Unknown error" },
            { status: 500 }
        );
    }
}

/**
 * DELETE - Remove an incident.
 */
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const supabase = await createClient();

        const { error } = await supabase
            .from("tool_ui_incident")
            .delete()
            .eq("id", id);

        if (error) {
            return NextResponse.json(
                { error: "Failed to delete incident", details: error.message },
                { status: 500 }
            );
        }

        return NextResponse.json({ message: "Incident deleted" });
    } catch (error) {
        return NextResponse.json(
            { error: "Internal server error", details: error instanceof Error ? error.message : "Unknown error" },
            { status: 500 }
        );
    }
}
