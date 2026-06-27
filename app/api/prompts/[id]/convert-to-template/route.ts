import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/adminClient";
import { NextRequest, NextResponse } from "next/server";
import { checkIsSuperAdmin } from "@/utils/supabase/userSessionData";
import { graveyardDb } from "@/utils/supabase/graveyardDb";

export async function POST(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await context.params;
        const supabase = await createClient();
        const adminClient = createAdminClient();

        // Check if user is authenticated
        const {
            data: { user },
            error: authError,
        } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Check if user is a system admin
        const isAdmin = await checkIsSuperAdmin(supabase, user.id);
        if (!isAdmin) {
            return NextResponse.json(
                { error: "Forbidden: Admin access required" },
                { status: 403 }
            );
        }

        // Fetch the original prompt
        const { data: originalPrompt, error: fetchError } = await graveyardDb(supabase)
            .from("prompts")
            .select("*")
            .eq("id", id)
            .single();

        if (fetchError || !originalPrompt) {
            console.error("Error fetching prompt:", fetchError);
            return NextResponse.json({ error: "Prompt not found" }, { status: 404 });
        }

        // Check if a template with this name already exists
        const { data: existingTemplate } = await graveyardDb(adminClient)
            .from("prompt_templates")
            .select("id")
            .eq("name", originalPrompt.name)
            .single();

        let templateName = originalPrompt.name;
        if (existingTemplate) {
            // Append timestamp to make it unique
            templateName = `${originalPrompt.name} (Template ${new Date().toISOString().split('T')[0]})`;
        }

        // Create a new template using admin client (bypasses RLS on prompt_templates)
        const { data: newTemplate, error: insertError } = await graveyardDb(adminClient)
            .from("prompt_templates")
            .insert({
                name: templateName,
                description: originalPrompt.description || `Template created from prompt: ${originalPrompt.name}`,
                messages: originalPrompt.messages,
                variable_defaults: originalPrompt.variable_defaults,
                tools: originalPrompt.tools,
                settings: originalPrompt.settings,
                category: "custom", // Default category
                is_featured: false, // Admin can make it featured later
                use_count: 0,
                created_by_user_id: user.id,
            })
            .select()
            .single();

        if (insertError) {
            console.error("Error creating template:", insertError);
            return NextResponse.json(
                { 
                    error: "Failed to create template from prompt",
                    details: insertError.message || "Database error"
                },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            template: newTemplate,
            message: `Successfully converted "${originalPrompt.name}" to template`,
        });
    } catch (error) {
        console.error("Error in POST handler:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

