import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { graveyardDb } from "@/utils/supabase/graveyardDb";

// API keys: ONLY sb_publishable_* / sb_secret_*. Legacy JWT keys are DEPRECATED
// and BANNED — see https://supabase.com/docs/guides/getting-started/api-keys
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!.trim();
const supabasePublishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!.trim();

/**
 * Resolve the authenticated user from either the cookie-based server session
 * or a Bearer token in the Authorization header (public route pattern).
 */
async function resolveUser(request: NextRequest) {
  const authHeader = request.headers.get("Authorization");

  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const client = createSupabaseClient(supabaseUrl, supabasePublishableKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const {
      data: { user },
      error,
    } = await client.auth.getUser(token);
    return { user: error ? null : user, supabase: client };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  return { user: error ? null : user, supabase };
}

/**
 * GET /api/admin/prompt-builtins/user-prompts
 *
 * Fetches all prompts owned by the current user with their variables extracted.
 * Supports both cookie-based auth (authenticated routes) and Bearer token auth (public routes).
 */
export async function GET(request: NextRequest) {
  try {
    const { user, supabase } = await resolveUser(request);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: prompts, error } = await graveyardDb(supabase)
      .from("prompts")
      .select(
        "id, name, description, variable_defaults, updated_at, created_at",
      )
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });

    if (error) {
      console.error("Error fetching user prompts:", error);
      return NextResponse.json(
        { error: "Failed to fetch prompts", details: error.message },
        { status: 500 },
      );
    }

    const promptsWithVariables = (prompts ?? []).map((prompt) => {
      const defaults = prompt.variable_defaults;
      const variables = Array.isArray(defaults)
        ? defaults
            .filter(
              (v): v is { name: string } =>
                typeof v === "object" &&
                v !== null &&
                "name" in v &&
                typeof (v as { name: unknown }).name === "string",
            )
            .map((v) => v.name)
        : [];
      return {
        id: prompt.id,
        name: prompt.name,
        description: prompt.description,
        variables,
        updated_at: prompt.updated_at,
        created_at: prompt.created_at,
      };
    });

    return NextResponse.json({
      prompts: promptsWithVariables,
      total: promptsWithVariables.length,
    });
  } catch (error) {
    console.error("Error in user-prompts route:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
