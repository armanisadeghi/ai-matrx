import { NextRequest, NextResponse } from "next/server";
import { getAdminSupabaseClient } from "@/utils/supabase/getScriptClient";
import type {
  ProviderModelEntry,
  ProviderModelsCache,
} from "@/features/ai-models/types";
import { extractErrorMessage } from "@/utils/errors";

export const dynamic = "force-dynamic";

type ProviderConfig = {
  name: string;
  fetchModels: () => Promise<ProviderModelEntry[]>;
};

async function fetchAnthropicModels(): Promise<ProviderModelEntry[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");

  const models: ProviderModelEntry[] = [];
  let afterId: string | undefined;

  while (true) {
    const url = new URL("https://api.anthropic.com/v1/models");
    url.searchParams.set("limit", "100");
    if (afterId) url.searchParams.set("after_id", afterId);

    const res = await fetch(url.toString(), {
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Anthropic API error ${res.status}: ${text}`);
    }

    const json = (await res.json()) as {
      data: ProviderModelEntry[];
      has_more: boolean;
      last_id?: string;
    };
    models.push(...json.data);

    if (!json.has_more || !json.last_id) break;
    afterId = json.last_id;
  }

  return models;
}

async function fetchOpenAIModels(): Promise<ProviderModelEntry[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");

  const res = await fetch("https://api.openai.com/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI API error ${res.status}: ${text}`);
  }

  const json = (await res.json()) as { data: ProviderModelEntry[] };
  return json.data.map((m) => ({
    ...m,
    display_name: m.id,
    created_at: m.created
      ? new Date((m.created as number) * 1000).toISOString()
      : undefined,
  }));
}

async function fetchGroqModels(): Promise<ProviderModelEntry[]> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY is not set");

  const res = await fetch("https://api.groq.com/openai/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Groq API error ${res.status}: ${text}`);
  }

  const json = (await res.json()) as { data: ProviderModelEntry[] };
  return json.data.map((m) => ({
    ...m,
    display_name: m.id,
    created_at: m.created
      ? new Date((m.created as number) * 1000).toISOString()
      : undefined,
  }));
}

type GoogleModelsPage = {
  models?: Array<Record<string, unknown> & { name: string; displayName?: string }>;
  nextPageToken?: string;
};

async function fetchGoogleModels(): Promise<ProviderModelEntry[]> {
  const apiKey =
    process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY (or GOOGLE_GENERATIVE_AI_API_KEY) is not set");
  }

  const models: ProviderModelEntry[] = [];
  let pageToken: string | undefined;

  while (true) {
    const url = new URL("https://generativelanguage.googleapis.com/v1beta/models");
    url.searchParams.set("pageSize", "200");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const res = await fetch(url.toString(), {
      headers: { "x-goog-api-key": apiKey },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Google API error ${res.status}: ${text}`);
    }

    const json = (await res.json()) as GoogleModelsPage;
    for (const m of json.models ?? []) {
      // Google names models "models/gemini-3.8-flash"; the wire id (what an
      // offering's provider_model_id stores) is the part after the slash.
      const id = m.name.startsWith("models/") ? m.name.slice("models/".length) : m.name;
      models.push({
        ...m,
        id,
        display_name: m.displayName ?? id,
        max_input_tokens: (m.inputTokenLimit as number | undefined) ?? null,
        max_tokens: (m.outputTokenLimit as number | undefined) ?? null,
      });
    }

    if (!json.nextPageToken) break;
    pageToken = json.nextPageToken;
  }

  return models;
}

// Registry of providers we support fetching from. `name` must equal the
// ai.provider.name row (case-insensitive) — that is how GET marks a provider
// as supported and how the dashboard picks the fetcher key.
const PROVIDER_FETCHERS: Record<string, ProviderConfig> = {
  anthropic: { name: "Anthropic", fetchModels: fetchAnthropicModels },
  openai: { name: "OpenAi", fetchModels: fetchOpenAIModels },
  groq: { name: "Groq", fetchModels: fetchGroqModels },
  google: { name: "Google", fetchModels: fetchGoogleModels },
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      provider_id: string;
      provider_key: string;
    };
    const { provider_id, provider_key } = body;

    if (!provider_id || !provider_key) {
      return NextResponse.json(
        { error: "provider_id and provider_key are required" },
        { status: 400 },
      );
    }

    const providerConfig = PROVIDER_FETCHERS[provider_key.toLowerCase()];
    if (!providerConfig) {
      return NextResponse.json(
        {
          error: `No fetcher configured for provider "${provider_key}". Supported: ${Object.keys(PROVIDER_FETCHERS).join(", ")}`,
        },
        { status: 400 },
      );
    }

    let models: ProviderModelEntry[];
    try {
      models = await providerConfig.fetchModels();
    } catch (fetchErr) {
      const msg = extractErrorMessage(fetchErr);
      return NextResponse.json(
        { error: `Failed to fetch from ${providerConfig.name}: ${msg}` },
        { status: 502 },
      );
    }

    const cache: ProviderModelsCache = {
      fetched_at: new Date().toISOString(),
      models,
    };

    const supabase = getAdminSupabaseClient();
    const { error: updateErr } = await supabase
      .schema("ai")
      .from("provider")
      .update({ provider_models_cache: cache })
      .eq("id", provider_id);

    if (updateErr) throw updateErr;

    return NextResponse.json({
      success: true,
      provider: providerConfig.name,
      model_count: models.length,
      fetched_at: cache.fetched_at,
      models,
    });
  } catch (err) {
    console.error("[provider-sync] Unexpected error:", err);
    return NextResponse.json(
      { error: "Unexpected server error" },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const providerId = searchParams.get("provider_id");

    const supabase = getAdminSupabaseClient();

    if (providerId) {
      const { data, error } = await supabase
        .schema("ai")
        .from("provider")
        .select("id, name, provider_models_cache")
        .is("deleted_at", null)
        .eq("id", providerId)
        .single();
      if (error) throw error;
      return NextResponse.json(data);
    }

    // Return all providers with their cache metadata (not full model arrays for performance)
    const { data, error } = await supabase
      .schema("ai")
      .from("provider")
      .select("id, name, provider_models_cache")
      .is("deleted_at", null)
      .order("name");
    if (error) throw error;

    const summary = (data ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      has_cache: p.provider_models_cache != null,
      fetched_at:
        (p.provider_models_cache as ProviderModelsCache | null)?.fetched_at ??
        null,
      model_count:
        (p.provider_models_cache as ProviderModelsCache | null)?.models
          ?.length ?? 0,
      is_supported: Object.values(PROVIDER_FETCHERS).some(
        (cfg) => cfg.name.toLowerCase() === (p.name ?? "").toLowerCase(),
      ),
      provider_key:
        Object.entries(PROVIDER_FETCHERS).find(
          ([, cfg]) => cfg.name.toLowerCase() === (p.name ?? "").toLowerCase(),
        )?.[0] ?? null,
    }));

    return NextResponse.json({ providers: summary });
  } catch (err) {
    console.error("[provider-sync GET] error:", err);
    return NextResponse.json(
      { error: "Unexpected server error" },
      { status: 500 },
    );
  }
}
