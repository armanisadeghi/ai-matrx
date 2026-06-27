import { getScriptSupabaseClient } from "@/utils/supabase/getScriptClient";
import { NextResponse } from "next/server";

// Prevent build-time prerendering - this route requires Supabase at runtime
// CDN caching is handled via Cache-Control headers (12h cache, 24h stale-while-revalidate)
export const dynamic = "force-dynamic";

export async function GET() {
    try {
        const supabase = getScriptSupabaseClient();

        // Fetch all non-deprecated AI models
        const { data: models, error } = await supabase
            .schema("ai")
            .from("model")
            .select("*")
            .eq("is_deprecated", false)
            .order("common_name", { ascending: true });

        if (error) {
            console.error("Error fetching AI models:", error);
            return NextResponse.json(
                { error: "Failed to fetch AI models" },
                { status: 500 }
            );
        }

        return NextResponse.json(
            { models, cached_at: new Date().toISOString() },
            {
                headers: {
                    "Cache-Control": "public, s-maxage=43200, stale-while-revalidate=86400",
                },
            }
        );
    } catch (error) {
        console.error("Unexpected error fetching AI models:", error);
        return NextResponse.json(
            { error: "An unexpected error occurred" },
            { status: 500 }
        );
    }
}

