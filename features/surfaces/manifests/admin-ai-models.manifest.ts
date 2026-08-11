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
 * from those audit capability coverage, spot stale or duplicate entries, and
 * propose registry edits. It may also APPLY two authored-copy edits to the
 * open model — its description and its human display name — via `writeTargets`
 * below, each behind an in-place confirm. Everything else it can only propose:
 * capabilities, limits, ratings, standing flags and fallback routing go
 * through the admin's own panel, and it must NOT assume a proposal there has
 * been applied.
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
  SurfaceWriteTarget,
} from "@/features/surfaces/types";
import {
  MODEL_COMMON_NAME_MAX_CHARS,
  MODEL_DESCRIPTION_MAX_CHARS,
} from "@/features/ai-models/model-metadata";
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

/**
 * Write targets — the AUTHORED COPY on the open model row, and nothing else.
 *
 * WHERE THEY LIVE: `AiModelDetailPanel` registers the handlers via
 * `useSurfaceWriteHandlers`, not `AiModelsContainer`. The container mounts the
 * provider and owns the catalogue + the browse state, but the DETAIL PANE owns
 * the form state, the save path, and the `saving` flag a write has to respect.
 * Both are inside the SAME provider — unlike `schedules` or `shapes`, the
 * detail pane here is a child of the list mount, not a second surface mount —
 * so this is one surface with one set of targets, registered from the
 * component that can actually honour them. Nothing is registered against the
 * list itself: the list owns only browse state, which is not writable here.
 *
 * MODE: both targets are `mode: "entity"` + `applyPolicy: "ask"`. `draft` is
 * the preferred mode elsewhere and is genuinely the wrong fit here. The panel
 * DOES have draft state, but it is a whole-row form with one Save that also
 * carries the capability and governance fields; staging a description into it
 * would leave the admin's Save button holding an agent's edit mixed in with
 * their own, and a stale form would then clobber it. Instead each handler
 * validates, writes the ONE column through `aiModelService.update` — the exact
 * call `handleSave` makes — and then patches the field into both `formData`
 * and `baseline` so the panel shows what landed and the form does not go
 * dirty. The ask dialog IS the review step; `auto` would be an agent silently
 * rewriting the model registry every product surface reads.
 *
 * REFUSALS THE HANDLERS MAKE, beyond value validation: no model open, the
 * panel in create-new mode (`is_creating_model` — there is no row to update
 * yet, and the create flow is the admin's), a save already in flight, and a
 * dirty Raw JSON tab (that tab saves the WHOLE row, so an unsaved edit there
 * would overwrite whatever the agent just wrote). Each throws with the reason.
 *
 * A GAP THIS WORK CLOSED, stated plainly: `description` had NO human editor
 * anywhere in the admin console. It is a real column, it is rendered to USERS
 * as the secondary line of every model picker row (`lab/ModelListDropdown`),
 * and this manifest already declared it as a read value — but the Details form
 * had no field for it and the Raw JSON tab STRIPPED it as an unknown column.
 * An entity write to a field the admin cannot then correct in the UI is a
 * one-way door (the `tool_group` lesson from `admin-tool-registry`). Rather
 * than declare the target anyway or drop the surface's only prose field, the
 * same change that added this target added the Description textarea to
 * `AiModelForm` and put `description` in the panel's column whitelist. The
 * correction path exists first; the target follows it.
 *
 * DELIBERATELY NOT WRITABLE, and this must stay that way:
 *   • `model_context_window`, `model_max_tokens`, `model_capabilities` — what
 *     the platform believes the model CAN DO. These are not opinions; they are
 *     enforced limits and a capability map the settings engine and every model
 *     picker read. A wrong context window silently truncates or over-sends for
 *     every caller on the model. Capabilities additionally have their own JSON
 *     editor with error reporting — an agent should propose a diff there.
 *   • `model_is_deprecated`, `model_is_primary`, `model_is_premium`,
 *     `model_visibility` — governance. Deprecation IS the activation signal on
 *     this table (there is no `is_active` column), primary decides what
 *     pickers surface by default, and premium is an entitlement gate. This is
 *     the exact line `admin-tool-registry` drew at `tool_is_active` /
 *     `tool_gating`, and it matters the same way: one flipped flag changes
 *     what every agent on the platform gets served. The panel keeps its human
 *     switches.
 *   • `model_fallback_ids` and the retry ceiling — substitution routing. These
 *     decide which OTHER model answers when a caller is over a limit, is a
 *     guest, or keeps failing. Repointing them is a dispatch change wearing a
 *     configuration costume, and the value is a UUID an agent would be
 *     guessing at.
 *   • `model_cost_rating` / `model_speed_rating` — cost-shaped. They render as
 *     the $-tier and speed dots users choose models by, so they steer spend
 *     and expectation across the product even though they are not prices. Real
 *     pricing lives on `ai.offering` and is admin-secret; neither belongs to
 *     an agent.
 *   • `model_name` — IDENTITY, and the hardest no. It is the provider-facing
 *     id sent on the wire and the key the provider-cache lookup matches on
 *     (`ProviderDataTab` finds the cache entry by `m.id === model.name`). A
 *     wrong one breaks every call site at once. A model's api name is a fact
 *     to be looked up, never authored.
 *   • `model_id`, `model_maker` (`provider_id`) — identity and provenance.
 *   • `model_release_date` — a fact, not copy: it is looked up from the
 *     provider, not written, and like `description` before this change it has
 *     no editor in the panel. Both reasons apply; either alone is enough.
 *   • `model_updated_at` — accounting, written by the database.
 *   • Deleting or duplicating a model, and every sibling admin route
 *     (endpoints, apis, offerings, settings, aliases). Destructive stays
 *     human, always; the siblings have no emitter and no surface at all.
 *
 * The bounds quoted in the descriptions below and the checks the handlers run
 * are the SAME constants, from `features/ai-models/model-metadata.ts`.
 */
const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "model_description",
    label: "Model description",
    description: `Replaces the open model's registry description — the prose a USER reads under the model's name when picking a model, so write it as a choosing aid: what this model is good at, how it differs from its siblings, and when to reach for something else. This is a FULL replacement, not a merge: read \`model_description\` first and include anything you mean to keep. Plain text, up to ${MODEL_DESCRIPTION_MAX_CHARS} characters after trimming; the empty string CLEARS the description, which is a legitimate value because the column is nullable. Do NOT restate the numbers the picker already shows on its own (context window, max tokens, cost and speed ratings) — those are separate fields and are not writable here. PERSISTS IMMEDIATELY on apply, through the same \`aiModelService.update\` call the panel's Save button makes, so the confirm dialog is the review. Refused while the panel is creating a new model, while a save is in flight, or while the Raw JSON tab has unsaved edits.`,
    valueType: "string",
    updatesValue: "model_description",
    mode: "entity",
    applyPolicy: "ask",
    group: "open_model",
    sortOrder: 100,
  },
  {
    name: "model_common_name",
    label: "Common name",
    description: `Replaces the open model's human display name — the label shown throughout the product wherever the model appears (pickers, the admin table, agent settings). Write the maker's own marketing name as a person would say it ("Claude Sonnet 4.6", "GPT-5 mini"), NOT the wire id: the provider-facing id is a separate field and is not writable here. A single-line string, 1-${MODEL_COMMON_NAME_MAX_CHARS} characters after trimming, no newlines or tabs. The empty string is REJECTED rather than treated as a way to clear the label, because every picker falls back to the raw provider model id when it is blank. PERSISTS IMMEDIATELY on apply, through the same \`aiModelService.update\` call the panel's Save button makes. Refused while the panel is creating a new model, while a save is in flight, or while the Raw JSON tab has unsaved edits.`,
    valueType: "string",
    updatesValue: "model_common_name",
    mode: "entity",
    applyPolicy: "ask",
    group: "open_model",
    sortOrder: 110,
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

What you may safely do: read the catalogue and the open model's public facts, audit capability coverage, find stale duplicates or missing deprecations, and propose registry edits. Two fields on the OPEN model you may actually write, each behind a confirm the admin sees: its description and its common (display) name — the authored copy a person reads. Everything else you can only propose. Capabilities, context window, max tokens, ratings, the deprecated/primary/premium flags, visibility and fallback routing all change what the platform DOES with this model for every caller on it, so the admin applies those in the panel. The model's provider-facing name is a dispatch key, not a label — never propose editing it as if it were copy.

Secrecy boundary, and it is strict: serving-vendor identity, endpoint base URLs, auth references, BYOK secret keys, and real-dollar pricing are admin-secret and are NOT present in this scope. Do not ask for them, do not guess them, and never repeat a credential of any kind.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
  writeTargets,
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
