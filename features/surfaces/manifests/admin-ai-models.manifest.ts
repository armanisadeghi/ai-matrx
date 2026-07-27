/**
 * Surface manifest — AI Model Registry admin (`matrx-admin/ai-models`).
 *
 * ADMIN SURFACE. Drives `/administration/ai/ai-models/**` — the super-admin
 * console over the AI model registry (`features/ai-models`, schema `ai`). The
 * main page lists every `ai.model_definition` row with its resolved maker
 * (`ai.provider.name`) and opens one model in a detail panel with tabs for
 * details, raw JSON, controls, constraints, pricing, usage, and provider.
 *
 * What an agent bound here may safely do: read the model list and the open
 * model's public registry facts (name, maker, context window, max tokens,
 * capabilities, ratings, deprecation/primary/premium flags, release date), and
 * from those write descriptions, audit capability coverage, spot stale or
 * duplicate entries, and propose registry edits. It must NOT assume a proposal
 * has been applied — writes go through the admin's own panel.
 *
 * SECURITY — this surface sits next to real credential material, so the
 * boundary is explicit. This manifest declares NO secrets, API keys, tokens,
 * connection strings, or credential material, and the emitter never places any
 * in the scope. Specifically EXCLUDED and never to be added as values:
 *   - `ai.endpoint.auth_ref`      (auth resolution descriptor — names a secret)
 *   - `ai.endpoint.byok_secret_key` (BYOK secret reference)
 *   - `ai.endpoint.base_url` / `vendor` / `internal_name`, `ai.api.translator_key`,
 *     `ai.offering.provider_model_id` — the real serving-vendor identity, which
 *     `features/ai-models/FEATURE.md` declares admin-secret
 *   - `ai.offering.pricing` real-dollar tiers (admin-only; users see points)
 * If any of these ever needs representing here it becomes a presence boolean
 * (e.g. `has_api_key`), never a value.
 *
 * Emitter (real, wired):
 *   `features/ai-models/components/AiModelsContainer.tsx` — the `"use client"`
 *   owner of `models`, `providers`, `selectedModel`, and the URL-synced tab
 *   state. Scope is assembled at trigger time from live state.
 *
 * Deliberately NOT declared (nothing emits them): endpoints, APIs, offerings,
 * settings, and aliases live on sibling routes (`/endpoints`, `/offerings`,
 * `/settings`, `/aliases`) with their own containers and no emitter, and the
 * offerings a detail panel lazy-loads are per-tab local state.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

export const ADMIN_AI_MODELS_SURFACE_NAME = "matrx-admin/ai-models";

const groups: SurfaceValueGroup[] = [
  {
    key: "registry",
    label: "Model registry",
    sortOrder: 100,
    description:
      "The catalogue of registered models and providers the admin is browsing.",
  },
  {
    key: "browse_state",
    label: "Browse state",
    sortOrder: 200,
    description:
      "The admin's current cut of the registry: active tab, search, filters, and sort.",
  },
  {
    key: "open_model",
    label: "Open model",
    sortOrder: 300,
    description:
      "Identity and provenance of the single model record open in the detail panel.",
  },
  {
    key: "model_capabilities",
    label: "Capabilities & limits",
    sortOrder: 400,
    description:
      "What the open model can do and how much it can take: capability flags, context window, token ceiling, ratings.",
  },
  {
    key: "model_standing",
    label: "Registry standing",
    sortOrder: 500,
    description:
      "Where the open model sits in the catalogue: deprecation, primary/premium tiering, fallbacks, and visibility.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Model registry ────────────────────────────────────────────────────
  {
    name: "model_ids",
    label: "Model IDs",
    description:
      "UUIDs of every `ai.model_definition` row loaded into the admin list. Always an array (empty until the initial fetch resolves).",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 6000,
    sortOrder: 100,
    group: "registry",
  },
  {
    name: "model_count",
    label: "Model count",
    description:
      "Total number of models loaded into the registry list, before tab filters. Always present.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 4,
    sortOrder: 110,
    group: "registry",
  },
  {
    name: "deprecated_model_count",
    label: "Deprecated model count",
    description:
      "How many loaded models carry `is_deprecated`. Always present — the deprecation backlog is the main hygiene signal on this page.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 3,
    sortOrder: 120,
    group: "registry",
  },
  {
    name: "models_summary",
    label: "Model list summary",
    description:
      "One compact record per loaded model: id, name, common_name, maker, context_window, max_tokens, is_deprecated, is_primary, is_premium, cost_rating, speed_rating. Large — bindable, not auto-context. Always present as an array.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 30000,
    autoContext: false,
    sortOrder: 130,
    group: "registry",
  },
  {
    name: "provider_names",
    label: "Provider names",
    description:
      "Names of the `ai.provider` rows loaded alongside the models (the makers behind the catalogue). Always an array. Public identity only — no endpoint, vendor, or credential information.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 300,
    sortOrder: 140,
    group: "registry",
  },
  {
    name: "provider_count",
    label: "Provider count",
    description: "Number of providers loaded. Always present.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 3,
    sortOrder: 150,
    group: "registry",
  },

  // ── Browse state ──────────────────────────────────────────────────────
  {
    name: "active_tab_label",
    label: "Active tab",
    description:
      "Label of the registry tab the admin is on (each tab is an independent saved query over the list). Always present.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 20,
    sortOrder: 200,
    group: "browse_state",
  },
  {
    name: "search_query",
    label: "Search",
    description:
      "The active tab's free-text search over model names. Empty when the tab has no search term.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 20,
    sortOrder: 210,
    group: "browse_state",
  },
  {
    name: "active_filters",
    label: "Active filters",
    description:
      "The active tab's structured filters (provider, is_deprecated, is_primary, is_premium, context-window and max-token ranges). Absent when the tab is unfiltered.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 200,
    sortOrder: 220,
    group: "browse_state",
  },
  {
    name: "sort_state",
    label: "Sort",
    description:
      "The active tab's sort field and direction. Absent when the tab uses the default ordering.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 40,
    sortOrder: 230,
    group: "browse_state",
  },
  {
    name: "is_creating_model",
    label: "Creating a model",
    description:
      "True when the detail panel is open in create-new mode rather than showing an existing record. Always present.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 240,
    group: "browse_state",
  },

  // ── Open model ────────────────────────────────────────────────────────
  {
    name: "model_id",
    label: "Open model ID",
    description:
      "UUID of the `ai.model_definition` row open in the detail panel. Empty when no model is selected.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 300,
    group: "open_model",
  },
  {
    name: "model_name",
    label: "Model name",
    description:
      "The provider-facing model identifier (`ai.model_definition.name`, e.g. the string sent on the wire). Empty when no model is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 40,
    sortOrder: 310,
    group: "open_model",
  },
  {
    name: "model_common_name",
    label: "Common name",
    description:
      "The human display name of the open model as shown throughout the product. Empty when no model is open or none is set.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 40,
    sortOrder: 320,
    group: "open_model",
  },
  {
    name: "model_maker",
    label: "Maker",
    description:
      "Name of the `ai.provider` that MAKES the open model (Anthropic, OpenAI, …). This is the public maker, not the serving vendor — serving vendors are admin-secret and are never emitted on this surface. Empty when no model is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 20,
    sortOrder: 330,
    group: "open_model",
  },
  {
    name: "model_description",
    label: "Model description",
    description:
      "Registry description of the open model. Empty when no model is open or the field is blank — writing this field is the most common agent job here.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 300,
    sortOrder: 340,
    group: "open_model",
  },
  {
    name: "model_release_date",
    label: "Release date",
    description:
      "Release date recorded for the open model. Empty when no model is open or unknown.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 12,
    sortOrder: 350,
    group: "open_model",
  },
  {
    name: "model_summary",
    label: "Model summary",
    description:
      "Composite of the open model's public registry facts (id, name, common_name, maker, description, context_window, max_tokens, ratings, standing flags, release_date) as one object. Absent when no model is open.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 900,
    sortOrder: 360,
    group: "open_model",
  },

  // ── Capabilities & limits ─────────────────────────────────────────────
  {
    name: "model_capabilities",
    label: "Capabilities",
    description:
      "The open model's capability map (text_input, vision, function_calling, streaming, structured_output, …) exactly as stored on the registry row. Absent when no model is open.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 700,
    sortOrder: 400,
    group: "model_capabilities",
  },
  {
    name: "model_capability_keys",
    label: "Enabled capability keys",
    description:
      "Flat list of the capability keys that are enabled on the open model — the quick answer to 'can this model do X'. Absent when no model is open.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 250,
    sortOrder: 410,
    group: "model_capabilities",
  },
  {
    name: "model_context_window",
    label: "Context window",
    description:
      "Maximum input tokens the open model accepts. Absent when no model is open or the value is unset.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 7,
    sortOrder: 420,
    group: "model_capabilities",
  },
  {
    name: "model_max_tokens",
    label: "Max output tokens",
    description:
      "Maximum output tokens the open model can generate in one response. Absent when no model is open or the value is unset.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 6,
    sortOrder: 430,
    group: "model_capabilities",
  },
  {
    name: "model_cost_rating",
    label: "Cost rating",
    description:
      "Relative cost rating (1–6) shown in the registry. A coarse product signal, not a price — real dollar pricing lives on offerings and is admin-secret. Absent when no model is open.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 1,
    sortOrder: 440,
    group: "model_capabilities",
  },
  {
    name: "model_speed_rating",
    label: "Speed rating",
    description:
      "Relative speed rating (1–6) shown in the registry. Absent when no model is open.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 1,
    sortOrder: 450,
    group: "model_capabilities",
  },

  // ── Registry standing ─────────────────────────────────────────────────
  {
    name: "model_is_deprecated",
    label: "Is deprecated",
    description:
      "Whether the open model is marked deprecated. There is no `is_active` column on `ai.model_definition` — deprecation IS the activation signal for models. Absent when no model is open.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 500,
    group: "model_standing",
  },
  {
    name: "model_is_primary",
    label: "Is primary",
    description:
      "Whether the open model is flagged primary (a headline model surfaced by default in pickers). Absent when no model is open.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 510,
    group: "model_standing",
  },
  {
    name: "model_is_premium",
    label: "Is premium",
    description:
      "Whether the open model is flagged premium (gated behind higher entitlements). Absent when no model is open.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 520,
    group: "model_standing",
  },
  {
    name: "model_visibility",
    label: "Visibility",
    description:
      "Canonical visibility of the open model row (personal / internal / public). Absent when no model is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 10,
    sortOrder: 530,
    group: "model_standing",
  },
  {
    name: "model_fallback_ids",
    label: "Fallback model IDs",
    description:
      "The open model's configured fallbacks as one object: mid, guest, and retry fallback model UUIDs plus the retry attempt ceiling. Absent when no model is open.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 160,
    sortOrder: 540,
    group: "model_standing",
  },
  {
    name: "model_updated_at",
    label: "Last updated",
    description:
      "ISO timestamp of the last write to the open model's registry row. Empty when no model is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 25,
    sortOrder: 550,
    group: "model_standing",
  },
];

export const adminAiModelsManifest: SurfaceManifest = {
  surfaceName: ADMIN_AI_MODELS_SURFACE_NAME,
  readiness: "partial",
  readinessNote:
    "The main registry page (list + providers + open model + tab/filter state) is fully declared and emitted from AiModelsContainer. The sibling admin routes — endpoints, APIs, offerings, settings, aliases, audit, provider-sync, deprecated-audit — have no emitter, so their data is deliberately undeclared. Serving-vendor identity, auth_ref, byok_secret_key and real-dollar pricing are permanently excluded as admin-secret.",
  label: "AI Model Registry",
  urlPattern: "/administration/ai/ai-models",
  intro: `<surface_intro>
This is an ADMIN surface: the super-admin console for the AI model registry at /administration/ai/ai-models.

The admin browses every registered model (schema ai, table model_definition) with its maker resolved from ai.provider, and opens one model in a side panel to inspect or edit its details, capabilities, controls, constraints, and standing.

How to read the values: model_ids / models_summary / provider_names describe the CATALOGUE; active_tab_label, search_query, active_filters and sort_state describe the admin's current cut of it; every model_* value describes the ONE model open in the detail panel and is absent when nothing is selected. Note that models have no is_active column — model_is_deprecated is the activation signal, and model_is_primary / model_is_premium do the tiering.

What you may safely do: read the catalogue and the open model's public facts, then write descriptions, audit capability coverage, find stale duplicates or missing deprecations, and propose registry edits. You never write the registry yourself — the admin applies changes in the panel.

Secrecy boundary, and it is strict: serving-vendor identity, endpoint base URLs, auth references, BYOK secret keys, and real-dollar pricing are admin-secret and are NOT present in this scope. Do not ask for them, do not guess them, and never repeat a credential of any kind.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
};

/** Compact registry row emitted by the admin list. */
export interface AdminAiModelSummaryEntry {
  id: string;
  name: string | null;
  common_name: string | null;
  maker: string | null;
  context_window: number | null;
  max_tokens: number | null;
  is_deprecated: boolean | null;
  is_primary: boolean | null;
  is_premium: boolean | null;
  cost_rating: number | null;
  speed_rating: number | null;
}

/**
 * Type-safe payload helper. Required keys (no `?`) mirror every value declared
 * `alwaysAvailable: true`; optional keys mirror `alwaysAvailable: false`.
 */
export function createAdminAiModelsScope(values: {
  // alwaysAvailable: true → required
  model_ids: string[];
  model_count: number;
  deprecated_model_count: number;
  models_summary: AdminAiModelSummaryEntry[];
  provider_names: string[];
  provider_count: number;
  active_tab_label: string;
  is_creating_model: boolean;
  // alwaysAvailable: false → optional
  selection?: string;
  context?: Record<string, unknown>;
  search_query?: string;
  active_filters?: Record<string, unknown>;
  sort_state?: { sort: string; dir: string };
  model_id?: string;
  model_name?: string;
  model_common_name?: string;
  model_maker?: string;
  model_description?: string;
  model_release_date?: string;
  model_summary?: Record<string, unknown>;
  model_capabilities?: unknown;
  model_capability_keys?: string[];
  model_context_window?: number;
  model_max_tokens?: number;
  model_cost_rating?: number;
  model_speed_rating?: number;
  model_is_deprecated?: boolean;
  model_is_primary?: boolean;
  model_is_premium?: boolean;
  model_visibility?: string;
  model_fallback_ids?: {
    mid_fallback_id: string | null;
    guest_fallback_id: string | null;
    retry_fallback_id: string | null;
    retry_max_attempts: number | null;
  };
  model_updated_at?: string;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
