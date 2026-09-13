import { getScriptSupabaseClient } from "@/utils/supabase/getScriptClient";
import { requireCanonicalCapabilities } from "@/features/ai-models/capabilities/parse";
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
                // The columns `anon` may read on ai.model_definition — this route
                // uses the PUBLISHABLE key (getScriptSupabaseClient), so it runs as
                // `anon` and `*` is refused (42501). It also CDN-caches its answer
                // for 12 hours to the public internet, which is exactly why
                // created_by / updated_by / organization_id / metadata / version are
                // not in this list. Register: lib/security/public-exposure.ts
                // #ANON_COLUMN_SURFACE, kept true to the live grants by
                // `pnpm check:anon-column-surface` (DD-186).
                .select(
                    "id,name,common_name,context_window,max_tokens,capabilities,provider_id,is_deprecated,is_primary,is_premium,mid_fallback_id,guest_fallback_id,visibility,deleted_at,created_at,updated_at,release_date,description,cost_rating,speed_rating,retry_fallback_id,retry_max_attempts,retired_at,successor_id",
                )
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
            // This public cache route is a persistence boundary too. Never
            // CDN-cache provider aliases or malformed JSONB for 12 hours.
            capabilities: requireCanonicalCapabilities(m.capabilities, {
                modelId: m.id,
                modelName: m.name,
            }),
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
