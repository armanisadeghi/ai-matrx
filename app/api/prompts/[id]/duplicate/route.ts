import { createClient } from "@/utils/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { graveyardDb } from "@/utils/supabase/graveyardDb";

export async function POST(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await context.params;
        const supabase = await createClient();

        // Check if user is authenticated
        const {
            data: { user },
            error: authError,
        } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Fetch the original prompt
        // RLS policies handle access control - user can access if they:
        // 1. Own the prompt
        // 2. Have permission (viewer/editor/admin) via permissions table
        // 3. Prompt is public
        const { data: originalPrompt, error: fetchError } = await graveyardDb(supabase)
            .from("prompts")
            .select("*")
            .eq("id", id)
            .single();

        if (fetchError || !originalPrompt) {
            console.error("Error fetching prompt:", fetchError);
            return NextResponse.json({ error: "Prompt not found or access denied" }, { status: 404 });
        }

        // Create a duplicate owned by the current user
        // Note: The new copy is always owned by the current user regardless of who
        // owned the original prompt - this is the "Copy to My Prompts" functionality
        const { data: newPrompt, error: insertError } = await graveyardDb(supabase)
            .from("prompts")
            .insert({
                name: `${originalPrompt.name} (Copy)`,
                messages: originalPrompt.messages,
                variable_defaults: originalPrompt.variable_defaults,
                tools: originalPrompt.tools,
                user_id: user.id, // Always set to current user
                settings: originalPrompt.settings,
                description: originalPrompt.description,
                tags: originalPrompt.tags,
                category: originalPrompt.category,
                model_id: originalPrompt.model_id,
                output_format: originalPrompt.output_format,
                output_schema: originalPrompt.output_schema,
                // is_favorite and is_archived are intentionally reset for copies
                is_favorite: false,
                is_archived: false,
            })
            .select()
            .single();

        if (insertError) {
            console.error("Error duplicating prompt:", insertError);
            return NextResponse.json({ error: "Failed to duplicate prompt" }, { status: 500 });
        }

        return NextResponse.json({ success: true, prompt: newPrompt });
    } catch (error) {
        console.error("Error in POST handler:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

