import { getScriptSupabaseClient } from "@/utils/supabase/getScriptClient";
import { NextResponse } from "next/server";

// Prevent build-time prerendering - this route requires Supabase at runtime
// CDN caching is handled via Cache-Control headers (12h cache, 24h stale-while-revalidate)
export const dynamic = "force-dynamic";

export async function GET() {
    try {
        const supabase = getScriptSupabaseClient();

        // Fetch all non-deprecated AI models + providers (to resolve `maker`
        // from the provider_id FK — the free-text `provider` column is
        // dropping and must never be read).
        const [modelsRes, providersRes] = await Promise.all([
            supabase
                .schema("ai")
                .from("model_definition")
                .select("*")
                .is("deleted_at", null)
                .eq("is_deprecated", false)
                .order("common_name", { ascending: true }),
            supabase.schema("ai").from("provider").select("id, name"),
        ]);

        if (modelsRes.error || providersRes.error) {
            console.error(
                "Error fetching AI models:",
                modelsRes.error ?? providersRes.error
            );
            return NextResponse.json(
                { error: "Failed to fetch AI models" },
                { status: 500 }
            );
        }

        const makerById = new Map(
            (providersRes.data ?? []).map((p) => [p.id, p.name ?? null])
        );
        const models = (modelsRes.data ?? []).map((m) => ({
            ...m,
            maker: m.provider_id
                ? makerById.get(m.provider_id) ?? null
                : null,
        }));

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

