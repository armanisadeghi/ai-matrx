"use client";

/**
 * useModelCatalog — TEMPORARY data hook for the model-picker Lab.
 *
 * Purpose: prove the *data* for a rich model picker before we invest in the
 * final UI (a ui-bakeoff comes later). Two variants, each reading its canonical
 * view directly (client → Supabase, per the data-flow doctrine):
 *
 *   - "user"  → `ai.model_public`  (anon + authenticated; masked, points-based
 *               pricing). Filtered to ROUTABLE models via `ai.model_offering`
 *               (a bare model_definition row with no offering cannot be called).
 *   - "admin" → `ai.model_admin`   (super-admin; raw $ pricing, vendor,
 *               wire_format, service internals, is_deprecated). Shows the FULL
 *               catalog including deprecated / non-routable rows.
 *
 * Loud, no silent fallback: a read failure surfaces the real PostgREST error
 * (a 42501 on `model_admin` means the admin view isn't granted to the caller —
 * that is a DB grant gap to fix, not something to paper over).
 *
 * This hook is self-contained (not wired into the modelRegistry slice) so the
 * Lab can be added and removed without touching canonical state. When the final
 * picker is chosen, its data path folds back into the one registry.
 */

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import {
  parseCapabilities,
  type ModelCapabilities,
} from "@/features/ai-models/capabilities/parse";
import type { Database, Json } from "@/types/database.types";

type ModelPublicRow = Database["ai"]["Views"]["model_public"]["Row"];
type ModelAdminRow = Database["ai"]["Views"]["model_admin"]["Row"];

export type ModelCatalogVariant = "user" | "admin";

/** Unified, render-ready model row for the Lab picker. */
export interface CatalogModel {
  id: string;
  name: string;
  commonName: string | null;
  maker: string | null;
  modelClass: string | null;
  capabilities: ModelCapabilities;
  contextWindow: number | null;
  maxTokens: number | null;
  isPrimary: boolean;
  isPremium: boolean;
  isDeprecated: boolean;
  description: string | null;
  releaseDate: string | null;
  usageBasis: string | null;
  tokenBilled: boolean | null;
  serviceName: string | null;
  /** points per 1M tokens (user view); null on admin view */
  pointsInput: number | null;
  pointsOutput: number | null;
  /** admin-only extras — present only for variant === "admin" */
  admin?: {
    pricing: Json | null;
    vendor: string | null;
    wireFormat: string | null;
    serviceDisplayName: string | null;
    serviceInternalName: string | null;
    offeringId: string | null;
    providerModelId: string | null;
  };
}

function normalizePublic(row: ModelPublicRow): CatalogModel | null {
  if (!row.id || !row.name) return null;
  return {
    id: row.id,
    name: row.name,
    commonName: row.common_name,
    maker: row.maker,
    modelClass: row.model_class,
    capabilities: parseCapabilities(row.capabilities),
    contextWindow: row.context_window,
    maxTokens: row.max_tokens,
    isPrimary: row.is_primary ?? false,
    isPremium: row.is_premium ?? false,
    isDeprecated: false, // model_public never surfaces deprecated rows
    description: row.description,
    releaseDate: row.release_date,
    usageBasis: row.usage_basis,
    tokenBilled: row.token_billed,
    serviceName: row.service_name,
    pointsInput: row.points_per_million_input,
    pointsOutput: row.points_per_million_output,
  };
}

function normalizeAdmin(row: ModelAdminRow): CatalogModel | null {
  if (!row.id || !row.name) return null;
  return {
    id: row.id,
    name: row.name,
    commonName: row.common_name,
    maker: row.maker,
    modelClass: row.model_class,
    capabilities: parseCapabilities(row.capabilities),
    contextWindow: row.context_window,
    maxTokens: row.max_tokens,
    isPrimary: row.is_primary ?? false,
    isPremium: row.is_premium ?? false,
    isDeprecated: row.is_deprecated ?? false,
    description: row.description,
    releaseDate: row.release_date,
    usageBasis: row.usage_basis,
    tokenBilled: row.token_billed,
    serviceName: row.service_display_name ?? row.service_internal_name,
    pointsInput: null,
    pointsOutput: null,
    admin: {
      pricing: row.pricing,
      vendor: row.vendor,
      wireFormat: row.wire_format,
      serviceDisplayName: row.service_display_name,
      serviceInternalName: row.service_internal_name,
      offeringId: row.offering_id,
      providerModelId: row.provider_model_id,
    },
  };
}

interface CatalogState {
  models: CatalogModel[];
  isLoading: boolean;
  error: string | null;
}

export function useModelCatalog(variant: ModelCatalogVariant): CatalogState & {
  reload: () => void;
} {
  const [state, setState] = useState<CatalogState>({
    models: [],
    isLoading: true,
    error: null,
  });

  const load = useCallback(async () => {
    setState((s) => ({ ...s, isLoading: true, error: null }));
    try {
      const supabase = createClient();

      if (variant === "admin") {
        const { data, error } = await supabase
          .schema("ai")
          .from("model_admin")
          .select("*")
          .order("common_name", { ascending: true, nullsFirst: false });
        if (error) throw error;
        const models = (data ?? [])
          .map(normalizeAdmin)
          .filter((m): m is CatalogModel => m !== null);
        setState({ models, isLoading: false, error: null });
        return;
      }

      // user variant: routable public models only
      const [publicRes, offeringRes] = await Promise.all([
        supabase
          .schema("ai")
          .from("model_public")
          .select("*")
          .order("common_name", { ascending: true, nullsFirst: false }),
        supabase.schema("ai").from("model_offering").select("model_id"),
      ]);
      if (publicRes.error) throw publicRes.error;
      if (offeringRes.error) throw offeringRes.error;
      const routable = new Set(
        (offeringRes.data ?? [])
          .map((r) => r.model_id)
          .filter((id): id is string => typeof id === "string"),
      );
      const models = (publicRes.data ?? [])
        .map(normalizePublic)
        .filter((m): m is CatalogModel => m !== null)
        .filter((m) => routable.has(m.id));
      setState({ models, isLoading: false, error: null });
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
      setState({ models: [], isLoading: false, error: message });
    }
  }, [variant]);

  useEffect(() => {
    void load();
  }, [load]);

  return { ...state, reload: () => void load() };
}
