import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

/**
 * POST endpoint to manually refresh the AI models cache
 * This will be called from the admin panel
 * 
 * Usage: POST /api/ai-models/revalidate
 * Headers: Authorization header will be checked via Supabase auth
 */
export async function POST() {
    try {
        const supabase = await createClient();

        // Verify user is authenticated
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        
        if (authError || !user) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
        }

        // TODO: Add admin role check here when you implement it
        // For now, any authenticated user can refresh the cache
        // Example:
        // const { data: profile } = await supabase
        //     .schema("users").from("profiles")
        //     .select("role")
        //     .eq("id", user.id)
        //     .single();
        // 
        // if (profile?.role !== "admin") {
        //     return NextResponse.json(
        //         { error: "Forbidden: Admin access required" },
        //         { status: 403 }
        //     );
        // }

        // Purge the cached route so the next request fetches fresh data
        revalidatePath("/api/ai-models");

        return NextResponse.json({
            success: true,
            message: "AI models cache refreshed successfully",
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error("Error revalidating AI models cache:", error);
        return NextResponse.json(
            { error: "Failed to refresh cache" },
            { status: 500 }
        );
    }
}

