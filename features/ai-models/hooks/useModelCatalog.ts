"use client";

/**
 * useModelCatalog — data hook for the model picker.
 *
 * Two variants, each reading its canonical view directly (client → Supabase):
 *   - "user"  → `ai.model_public`  (anon + authenticated; masked, points pricing).
 *               Filtered to ROUTABLE models via `ai.model_offering`, which also
 *               supplies each model's serving TIERS (`served_via` — the
 *               endpoint's public Matrx brand: "Matrx Fast", "Matrx Lightning",
 *               "Matrx Standard", ... — never the real vendor).
 *   - "admin" → `public.admin_model_catalog()` RPC (SECURITY DEFINER, gated by
 *               `is_super_admin()`) returning `ai.model_admin` rows (raw $
 *               pricing + real serving vendors; full catalog incl. deprecated).
 *               The view itself has postgres-only grants — never read it
 *               directly from the client.
 *
 * The row is reshaped for display: pretty name only, the stored MAKER (the DB
 * resolves it — serving vendors like Groq/Cerebras are never exposed on
 * user-facing views), stored cost/speed ratings (1-6; 6 renders as "5+"),
 * capability modalities + grouped features preserved in full (nothing hidden),
 * interaction (turn/single/extraction/realtime) and multilingual kept intact.
 *
 * Loud, no silent fallback: a read failure surfaces the real PostgREST error.
 */

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import {
  groupFeatures,
  type GroupedFeatures,
} from "@/features/ai-models/capabilities/feature-map";
import type { Database, Json } from "@/types/database.types";

type ModelPublicRow = Database["ai"]["Views"]["model_public"]["Row"];
type ModelAdminRow = Database["ai"]["Views"]["model_admin"]["Row"];

export type ModelCatalogVariant = "user" | "admin";

export type Modality = "text" | "image" | "audio" | "video" | "entities";
export const INPUT_MODALITIES: Modality[] = ["text", "image", "audio", "video"];
export const OUTPUT_MODALITIES: Modality[] = [
  "text",
  "image",
  "audio",
  "video",
  "entities",
];

export type Interaction = "turn" | "single" | "extraction" | "realtime";

/**
 * One serving tier for a model — a row of `ai.model_offering`, identified to
 * users ONLY by the endpoint's public Matrx brand (`served_via`: "Matrx Fast",
 * "Matrx Lightning", "Matrx Standard", ...). The real vendor never leaves
 * `ai.model_admin`. `endpointId` is the opaque uuid a future request-wire
 * endpoint hint would echo back to the server (resolve_call_profile).
 */
export interface CatalogTier {
  offeringId: string;
  /** Public Matrx brand of the serving endpoint — never a vendor name. */
  servedVia: string;
  /** Opaque endpoint uuid (safe wire hint) — no vendor identity. */
  endpointId: string | null;
  /** Lower = preferred/faster (the server's default pick). */
  priority: number;
}

/** Reshaped, render-ready model row. */
export interface CatalogModel {
  id: string;
  /** Pretty, business-facing name only — never a technical identifier. */
  name: string;
  /** Who MADE the model (stored `maker` — never a serving vendor). */
  maker: string | null;
  /** Curated cost rating, 1-6 smallint (6 renders as the "5+" band). */
  costRating: number | null;
  /** Curated speed rating, 1-6 smallint (6 renders as "5+"). */
  speedRating: number | null;
  input: Modality[];
  output: Modality[];
  features: GroupedFeatures;
  interaction: Interaction;
  multilingual: boolean;
  contextWindow: number | null;
  maxTokens: number | null;
  isPrimary: boolean;
  isPremium: boolean;
  isDeprecated: boolean;
  /** OUTPUT cost basis used for the price tier (points for user view). */
  outputCost: number | null;
  usageBasis: string | null;
  tokenBilled: boolean | null;
  description: string | null;
  releaseDate: string | null;
  /**
   * Serving tiers (priority-ordered, preferred first) — user variant only.
   * Multi-tier models (e.g. GPT OSS 120B on Matrx Lightning / Matrx Fast /
   * Matrx Standard) list every brand; the first is the server's default.
   */
  tiers: CatalogTier[];
  /** admin-only extras — present only for variant === "admin" */
  admin?: {
    pricing: Json | null;
    /** Serving vendor (ai.endpoint.vendor) — ADMIN eyes only, never user-facing. */
    vendor: string | null;
    endpointId: string | null;
    endpointDisplayName: string | null;
    endpointInternalName: string | null;
    apiId: string | null;
    apiName: string | null;
    /** Wire-contract translator (ai.api.translator_key — the old wire_format vocabulary). */
    translatorKey: string | null;
    transport: string | null;
    offeringId: string | null;
    providerModelId: string | null;
  };
}

function asModalities(raw: unknown, allowed: Modality[]): Modality[] {
  if (!Array.isArray(raw)) return [];
  const set = new Set(allowed);
  const out: Modality[] = [];
  for (const v of raw) {
    if (typeof v === "string" && set.has(v as Modality) && !out.includes(v as Modality)) {
      out.push(v as Modality);
    }
  }
  return out;
}

function asInteraction(raw: unknown): Interaction {
  return raw === "single" || raw === "extraction" || raw === "realtime"
    ? raw
    : "turn";
}

/** Parse the raw `capabilities` JSON, preserving everything (no data loss). */
function parseCaps(raw: unknown): {
  input: Modality[];
  output: Modality[];
  features: GroupedFeatures;
  interaction: Interaction;
  multilingual: boolean;
} {
  const obj =
    typeof raw === "object" && raw !== null && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const rawFeatures = Array.isArray(obj.features)
    ? obj.features.filter((f): f is string => typeof f === "string")
    : [];
  return {
    input: asModalities(obj.input, INPUT_MODALITIES),
    output: asModalities(obj.output, OUTPUT_MODALITIES),
    features: groupFeatures(rawFeatures),
    interaction: asInteraction(obj.interaction),
    multilingual: obj.multilingual === true,
  };
}

function normalizePublic(
  row: ModelPublicRow,
  tiers: CatalogTier[],
): CatalogModel | null {
  if (!row.id || !row.name) return null;
  return {
    tiers,
    id: row.id,
    name: row.common_name || row.name,
    maker: row.maker,
    costRating: row.cost_rating,
    speedRating: row.speed_rating,
    ...parseCaps(row.capabilities),
    contextWindow: row.context_window,
    maxTokens: row.max_tokens,
    isPrimary: row.is_primary ?? false,
    isPremium: row.is_premium ?? false,
    isDeprecated: false,
    outputCost: row.points_per_million_output,
    usageBasis: row.usage_basis,
    tokenBilled: row.token_billed,
    description: row.description,
    releaseDate: row.release_date,
  };
}

function pricingOutputCost(pricing: Json | null): number | null {
  if (typeof pricing !== "object" || pricing === null || Array.isArray(pricing)) {
    return null;
  }
  const p = pricing as Record<string, unknown>;
  const candidate = p.output ?? p.output_per_million ?? p.per_million_output;
  return typeof candidate === "number" ? candidate : null;
}

function normalizeAdmin(row: ModelAdminRow): CatalogModel | null {
  if (!row.id || !row.name) return null;
  return {
    // Admin view is one-row-per-model (preferred offering only); the branded
    // endpoint display name doubles as its tier.
    tiers:
      row.offering_id && row.endpoint_display_name
        ? [
            {
              offeringId: row.offering_id,
              servedVia: row.endpoint_display_name,
              endpointId: row.endpoint_id,
              priority: 0,
            },
          ]
        : [],
    id: row.id,
    name: row.common_name || row.name,
    maker: row.maker,
    costRating: row.cost_rating,
    speedRating: row.speed_rating,
    ...parseCaps(row.capabilities),
    contextWindow: row.context_window,
    maxTokens: row.max_tokens,
    isPrimary: row.is_primary ?? false,
    isPremium: row.is_premium ?? false,
    isDeprecated: row.is_deprecated ?? false,
    outputCost: pricingOutputCost(row.pricing),
    usageBasis: row.usage_basis,
    tokenBilled: row.token_billed,
    description: row.description,
    releaseDate: row.release_date,
    admin: {
      pricing: row.pricing,
      vendor: row.vendor,
      endpointId: row.endpoint_id,
      endpointDisplayName: row.endpoint_display_name,
      endpointInternalName: row.endpoint_internal_name,
      apiId: row.api_id,
      apiName: row.api_name,
      translatorKey: row.translator_key,
      transport: row.transport,
      offeringId: row.offering_id,
      providerModelId: row.provider_model_id,
    },
  };
}

interface CatalogState {
  models: CatalogModel[];
  error: string | null;
  /** Which variant the current `models`/`error` reflect; null until first load. */
  loadedVariant: ModelCatalogVariant | null;
  /** Bumped by reload() to force a re-fetch of the same variant. */
  nonce: number;
}

async function loadCatalog(
  variant: ModelCatalogVariant,
): Promise<{ models: CatalogModel[]; error: string | null }> {
  try {
    const supabase = createClient();
    if (variant === "admin") {
      // ai.model_admin has NO grants to authenticated (vendor names are
      // secret). The ONE read path is the SECURITY DEFINER RPC gated by
      // is_super_admin() — non-admins get a loud 42501, never data.
      const { data, error } = await supabase.rpc("admin_model_catalog");
      if (error) throw error;
      const models = (data ?? [])
        .map(normalizeAdmin)
        .filter((m): m is CatalogModel => m !== null);
      return { models, error: null };
    }
    const [publicRes, offeringRes] = await Promise.all([
      supabase
        .schema("ai")
        .from("model_public")
        .select("*")
        .order("common_name", { ascending: true, nullsFirst: false }),
      supabase
        .schema("ai")
        .from("model_offering")
        .select(
          "model_id, offering_id, served_via, served_via_endpoint_id, priority",
        )
        .order("priority", { ascending: true }),
    ]);
    if (publicRes.error) throw publicRes.error;
    if (offeringRes.error) throw offeringRes.error;
    // Group the routable offerings into per-model serving tiers, preferred
    // (lowest priority) first — the branded tier list the picker displays.
    const tiersByModel = new Map<string, CatalogTier[]>();
    for (const r of offeringRes.data ?? []) {
      if (typeof r.model_id !== "string" || typeof r.offering_id !== "string") {
        continue;
      }
      const list = tiersByModel.get(r.model_id) ?? [];
      list.push({
        offeringId: r.offering_id,
        servedVia: r.served_via ?? "",
        endpointId: r.served_via_endpoint_id,
        priority: r.priority ?? 100,
      });
      tiersByModel.set(r.model_id, list);
    }
    const models = (publicRes.data ?? [])
      .map((row) =>
        normalizePublic(row, row.id ? (tiersByModel.get(row.id) ?? []) : []),
      )
      .filter((m): m is CatalogModel => m !== null)
      .filter((m) => tiersByModel.has(m.id));
    return { models, error: null };
  } catch (err: unknown) {
    const message =
      err instanceof Error
        ? err.message
        : typeof err === "object" && err && "message" in err
          ? String((err as { message: unknown }).message)
          : "Failed to load model catalog";
    // Loud: a real failure (e.g. 42501 on model_admin) must be visible.
    console.error(
      `[useModelCatalog] ${variant} catalog load failed:`,
      message,
      err,
    );
    return { models: [], error: message };
  }
}

export function useModelCatalog(variant: ModelCatalogVariant): {
  models: CatalogModel[];
  isLoading: boolean;
  error: string | null;
  reload: () => void;
} {
  const [state, setState] = useState<CatalogState>({
    models: [],
    error: null,
    loadedVariant: null,
    nonce: 0,
  });

  useEffect(() => {
    let active = true;
    void loadCatalog(variant).then((result) => {
      if (active) {
        setState((s) => ({ ...s, ...result, loadedVariant: variant }));
      }
    });
    return () => {
      active = false;
    };
  }, [variant, state.nonce]);

  // Loading whenever the loaded data doesn't reflect the requested variant yet.
  const loading = state.loadedVariant !== variant;

  return {
    models: loading ? [] : state.models,
    isLoading: loading,
    error: loading ? null : state.error,
    reload: () =>
      setState((s) => ({ ...s, loadedVariant: null, nonce: s.nonce + 1 })),
  };
}
