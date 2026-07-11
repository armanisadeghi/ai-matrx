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
 *               directly from the client. The RPC is one-row-per-model
 *               (preferred offering only), so the admin variant ALSO reads
 *               `ai.offering` + `ai.endpoint` + `ai.api` directly (their RLS
 *               grants authenticated reads) and attaches EVERY offering —
 *               vendor, api, provider_model_id, real $ pricing, priority,
 *               availability — as `CatalogModel.admin.offerings`. Total
 *               transparency: nothing the admin variant shows is masked.
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

/**
 * One real $ pricing band from `ai.offering.pricing` (array of tiers:
 * `{ max_tokens, input_price, output_price, cached_input_price }`, prices in
 * $ per million tokens unless `usage_basis` says otherwise). ADMIN eyes only.
 */
export interface AdminPricingBand {
  maxTokens: number | null;
  inputPrice: number | null;
  outputPrice: number | null;
  cachedInputPrice: number | null;
}

/**
 * One full `ai.offering` row joined to its endpoint + api — the exact call
 * (model × endpoint × api × provider_model_id) with REAL vendor/wire/$ data.
 * ADMIN eyes only; never rendered outside the admin variant.
 */
export interface AdminOffering {
  offeringId: string;
  /** The actual model id sent on a raw call to the vendor. */
  providerModelId: string | null;
  /** Real serving vendor (ai.endpoint.vendor) — never user-facing. */
  vendor: string | null;
  endpointId: string | null;
  endpointDisplayName: string | null;
  endpointInternalName: string | null;
  apiId: string | null;
  apiName: string | null;
  translatorKey: string | null;
  transport: string | null;
  /** Real $ pricing bands (parsed from ai.offering.pricing). */
  pricing: AdminPricingBand[];
  usageBasis: string | null;
  tokenBilled: boolean | null;
  /** Lower = preferred (the server's default pick). */
  priority: number;
  isAvailable: boolean;
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
    /**
     * EVERY offering of this model (priority-ordered, preferred first) with
     * real vendor/api/provider_model_id/$ pricing — total transparency.
     */
    offerings: AdminOffering[];
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

/**
 * Parse `ai.offering.pricing` — canonically an ARRAY of tier objects
 * (`[{ max_tokens, input_price, output_price, cached_input_price }]`); a bare
 * object is treated as a single band. Unknown shapes yield [] (shown as "—").
 */
function parsePricingBands(pricing: Json | null): AdminPricingBand[] {
  const asBand = (v: unknown): AdminPricingBand | null => {
    if (typeof v !== "object" || v === null || Array.isArray(v)) return null;
    const o = v as Record<string, unknown>;
    const num = (x: unknown): number | null => (typeof x === "number" ? x : null);
    return {
      maxTokens: num(o.max_tokens),
      inputPrice: num(o.input_price),
      outputPrice: num(o.output_price),
      cachedInputPrice: num(o.cached_input_price),
    };
  };
  if (Array.isArray(pricing)) {
    return pricing
      .map(asBand)
      .filter((b): b is AdminPricingBand => b !== null);
  }
  const single = asBand(pricing);
  return single ? [single] : [];
}

/** Real $ output price (first band) — the admin price sort/display basis. */
function pricingOutputCost(pricing: Json | null): number | null {
  return parsePricingBands(pricing)[0]?.outputPrice ?? null;
}

function normalizeAdmin(
  row: ModelAdminRow,
  offerings: AdminOffering[],
): CatalogModel | null {
  if (!row.id || !row.name) return null;
  return {
    // Every offering is a serving tier (priority-ordered, preferred first);
    // the branded endpoint display name doubles as the tier brand. Falls back
    // to the RPC's preferred-offering columns if the offerings read was empty.
    tiers: offerings.length
      ? offerings.map((o) => ({
          offeringId: o.offeringId,
          servedVia: o.endpointDisplayName ?? o.vendor ?? "",
          endpointId: o.endpointId,
          priority: o.priority,
        }))
      : row.offering_id && row.endpoint_display_name
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
      offerings,
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
      // The RPC is one-row-per-model (preferred offering); the FULL offering
      // list (every vendor/api/$ row) comes from direct ai.offering +
      // ai.endpoint + ai.api reads, which RLS grants to authenticated.
      const [rpcRes, offeringsRes, endpointsRes, apisRes] = await Promise.all([
        supabase.rpc("admin_model_catalog"),
        supabase
          .schema("ai")
          .from("offering")
          .select(
            "id, model_id, provider_model_id, pricing, usage_basis, token_billed, priority, is_available, endpoint_id, api_id",
          )
          .is("deleted_at", null)
          .order("priority", { ascending: true }),
        supabase
          .schema("ai")
          .from("endpoint")
          .select("id, vendor, display_name, internal_name")
          .is("deleted_at", null),
        supabase
          .schema("ai")
          .from("api")
          .select("id, name, translator_key, transport")
          .is("deleted_at", null),
      ]);
      if (rpcRes.error) throw rpcRes.error;
      if (offeringsRes.error) throw offeringsRes.error;
      if (endpointsRes.error) throw endpointsRes.error;
      if (apisRes.error) throw apisRes.error;
      const endpointById = new Map(
        (endpointsRes.data ?? []).map((e) => [e.id, e]),
      );
      const apiById = new Map((apisRes.data ?? []).map((a) => [a.id, a]));
      const offeringsByModel = new Map<string, AdminOffering[]>();
      for (const o of offeringsRes.data ?? []) {
        if (typeof o.model_id !== "string" || typeof o.id !== "string") continue;
        const endpoint = o.endpoint_id ? endpointById.get(o.endpoint_id) : undefined;
        const api = o.api_id ? apiById.get(o.api_id) : undefined;
        const list = offeringsByModel.get(o.model_id) ?? [];
        list.push({
          offeringId: o.id,
          providerModelId: o.provider_model_id,
          vendor: endpoint?.vendor ?? null,
          endpointId: o.endpoint_id,
          endpointDisplayName: endpoint?.display_name ?? null,
          endpointInternalName: endpoint?.internal_name ?? null,
          apiId: o.api_id,
          apiName: api?.name ?? null,
          translatorKey: api?.translator_key ?? null,
          transport: api?.transport ?? null,
          pricing: parsePricingBands(o.pricing),
          usageBasis: o.usage_basis,
          tokenBilled: o.token_billed,
          priority: o.priority ?? 100,
          isAvailable: o.is_available ?? false,
        });
        offeringsByModel.set(o.model_id, list);
      }
      const models = (rpcRes.data ?? [])
        .map((row) =>
          normalizeAdmin(row, row.id ? (offeringsByModel.get(row.id) ?? []) : []),
        )
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
