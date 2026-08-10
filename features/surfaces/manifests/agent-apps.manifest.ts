/**
 * Surface manifest — Agent Apps (`matrx-user/agent-apps`).
 *
 * Drives the `/agent-apps` route family (`features/agent-apps`): the hub grid
 * of the user's shareable AI mini-apps plus the per-app workspace at
 * `/agent-apps/[id]` with its sub-route UIs (overview / run / code / settings
 * / versions). One surface covers the whole family, so NOTHING app-specific
 * is `alwaysAvailable` — the hub route has no active app. When an app IS open
 * (`/agent-apps/[id]/**`) the emitter fills the app_identity / app_content /
 * run_state values from the Redux agent-app slice (`state.agentApp`, hydrated
 * by `AgentAppHydratorServer`).
 *
 * Runtime emitter: `features/agent-apps/route/AgentAppSurfaceRuntime.tsx`,
 * mounted in `app/(core)/agent-apps/[id]/layout.tsx`.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
  SurfaceWriteTarget,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

export const AGENT_APPS_SURFACE_NAME = "matrx-user/agent-apps";

const groups: SurfaceValueGroup[] = [
  {
    key: "app_identity",
    label: "App identity",
    sortOrder: 100,
    description:
      "Which agent app is open: naming, lifecycle, versioning, and the agent that powers it.",
  },
  {
    key: "app_content",
    label: "App content",
    sortOrder: 200,
    description:
      "What the app is made of: shell kind, custom component code, variable schema, and shell configuration.",
  },
  {
    key: "run_state",
    label: "Run state",
    sortOrder: 300,
    description:
      "Which workspace UI is active and the app's accumulated usage evidence.",
  },
  {
    key: "catalog",
    label: "Catalog",
    sortOrder: 400,
    description:
      "The hub listing — the set of agent apps shown on the /agent-apps grid.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── App identity ──────────────────────────────────────────────────────
  {
    name: "app_id",
    label: "App ID",
    description:
      "UUID of the agent app open in the workspace (`/agent-apps/[id]`). Empty on the hub grid, templates, and /new — no app is open there.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 300,
    group: "app_identity",
  },
  {
    name: "app_slug",
    label: "App slug",
    description:
      "URL slug of the open app — the public route is `/p/[slug]`. Empty when no app is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 30,
    sortOrder: 305,
    group: "app_identity",
  },
  {
    name: "app_name",
    label: "App name",
    description:
      "Display name of the open agent app. Empty when no app is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 40,
    sortOrder: 310,
    group: "app_identity",
  },
  {
    name: "app_tagline",
    label: "App tagline",
    description:
      "Short marketing tagline of the open app. Empty when no app is open or the app has no tagline.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 80,
    sortOrder: 315,
    group: "app_identity",
  },
  {
    name: "app_description",
    label: "App description",
    description:
      "Longer description of what the open app does. Empty when no app is open or none was written.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 300,
    sortOrder: 320,
    group: "app_identity",
  },
  {
    name: "app_status",
    label: "App status",
    description:
      "Lifecycle status of the open app: draft, published, archived, or suspended. Empty when no app is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 10,
    sortOrder: 325,
    group: "app_identity",
  },
  {
    name: "app_category",
    label: "App category",
    description:
      "Category label of the open app. Empty when no app is open or the app is uncategorized.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 20,
    sortOrder: 330,
    group: "app_identity",
  },
  {
    name: "app_tags",
    label: "App tags",
    description:
      "Tag strings on the open app. Absent when no app is open; empty array when the app has no tags.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 80,
    sortOrder: 335,
    group: "app_identity",
  },
  {
    name: "app_is_public",
    label: "Publicly shared",
    description:
      "True when the open app is publicly reachable at `/p/[slug]` without auth. Absent when no app is open.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 340,
    group: "app_identity",
  },
  {
    name: "agent_id",
    label: "Powering agent ID",
    description:
      "UUID of the agent (`agent.definition`) that powers the open app's executions. Empty when no app is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 345,
    group: "app_identity",
  },
  {
    name: "app_version",
    label: "Current version",
    description:
      "The open app's current version number (increments on publish-worthy saves). Absent when no app is open.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    sortOrder: 350,
    group: "app_identity",
  },
  {
    name: "pinned_version",
    label: "Pinned version",
    description:
      "Version number the app is pinned to serve, when the owner froze it. Absent when no app is open or the app follows latest.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    sortOrder: 355,
    group: "app_identity",
  },
  {
    name: "use_latest",
    label: "Uses latest agent version",
    description:
      "True when the app always runs the powering agent's latest version instead of a pinned agent version. Absent when no app is open.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 360,
    group: "app_identity",
  },
  {
    name: "app_summary",
    label: "App summary",
    description:
      "Composite of the open app's identity as one object: { id, slug, name, tagline, status, category, tags, is_public, agent_id, version, pinned_version, use_latest }. Mirrors the individual identity values (completeness law). Absent when no app is open.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 500,
    sortOrder: 365,
    group: "app_identity",
  },

  // ── App content ───────────────────────────────────────────────────────
  {
    name: "shell_kind",
    label: "Shell kind",
    description:
      "Which built-in layout shell renders the open app (chat, form_to_result, widget, …, or fully_custom when the whole UI is custom code). Empty when no app is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 15,
    sortOrder: 400,
    group: "app_content",
  },
  {
    name: "component_language",
    label: "Component language",
    description:
      "Language of the app's custom component code (tsx, jsx, html, …). Empty when no app is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 10,
    sortOrder: 410,
    group: "app_content",
  },
  {
    name: "component_code",
    label: "Component code",
    description:
      "The app's FULL custom component source (the fully_custom UI, edited on the Code tab). Empty when no app is open or the app has no custom code. Large — bindable for code-editing agents.",
    valueType: "document",
    alwaysAvailable: false,
    typicalCharCount: 8000,
    autoContext: false,
    sortOrder: 420,
    group: "app_content",
  },
  {
    name: "variable_schema",
    label: "Variable schema",
    description:
      "Declared input variables of the open app (one entry per variable with name/type/config). Absent when no app is open; empty array when the app takes no variables.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 800,
    sortOrder: 430,
    group: "app_content",
  },
  {
    name: "shell_config",
    label: "Shell configuration",
    description:
      "Per-shell settings of the open app (title, chat allowance, variable panel, input chrome, branding, …). Absent when no app is open.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 600,
    autoContext: false,
    sortOrder: 440,
    group: "app_content",
  },
  {
    name: "slot_overrides",
    label: "Slot overrides",
    description:
      "Which shell slots the open app swapped for custom code (slot name → default|custom). Absent when no app is open; empty object when no slot is overridden.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 120,
    autoContext: false,
    sortOrder: 450,
    group: "app_content",
  },

  // ── Run state ─────────────────────────────────────────────────────────
  {
    name: "active_view",
    label: "Active workspace view",
    description:
      "Which per-app UI is open: overview, run, code, settings, versions, or version_detail (a `/v/[version]` snapshot). Empty on the hub grid — there is no per-app view there.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 15,
    sortOrder: 500,
    group: "run_state",
  },
  {
    name: "usage_stats",
    label: "Usage statistics",
    description:
      "Accumulated execution evidence of the open app: { total_executions, total_tokens_used, total_cost, unique_users_count, success_rate, avg_execution_time_ms, last_execution_at }. Absent when no app is open; individual fields are null until the app has run.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 250,
    autoContext: false,
    sortOrder: 510,
    group: "run_state",
  },

  // ── Catalog (hub grid) ────────────────────────────────────────────────
  {
    name: "listed_app_count",
    label: "Listed app count",
    description:
      "Number of agent apps shown on the hub grid. Absent on `/agent-apps/[id]` routes — the grid is not mounted there.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    sortOrder: 600,
    group: "catalog",
  },
  {
    name: "listed_apps_summary",
    label: "Listed apps",
    description:
      "One entry per app card on the hub grid with { id, slug, name, status }, in display order. Absent on `/agent-apps/[id]` routes; empty array when the user has no apps.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 1200,
    autoContext: false,
    sortOrder: 610,
    group: "catalog",
  },
];

/**
 * Write targets — the five Identity fields of an open app.
 *
 * WHY THESE FIVE. An agent app is a published product: its name, tagline,
 * description, category and tags are the entire storefront at `/p/[slug]`,
 * and they are exactly the "authored copy an agent drafts better/faster"
 * class. A user who has just built an app has working code and placeholder
 * marketing text; drafting that copy from what the app actually does is the
 * single most useful thing an agent can do on this surface.
 *
 * WHY NOT THE REST. `app_slug` and `app_id` are identity (the public URL is
 * built from the slug — renaming it breaks every existing link).
 * `app_is_public` is a sharing decision and `app_status` (draft → published)
 * is a release decision — both are the human's call, not a copy edit.
 * `agent_id` / `app_version` / `pinned_version` / `use_latest` are structural
 * bindings, `component_code` / `shell_config` / `slot_overrides` belong to
 * the /code and /layout editors (a different job, not declared here), rate
 * limits are abuse controls, and deletion stays human by doctrine.
 *
 * MODE IS PER-FIELD, because the page's own UI is per-field. Name, tagline
 * and description are typed into local inputs that show a dirty marker and
 * their own Save button — a real staging buffer — so those are `draft`: the
 * agent stages the text, the user reads it in the field and presses Save.
 * Category and tags have no staging step (their pickers commit on change via
 * `saveAppField`), so those are `entity` and say so in their descriptions.
 *
 * One consequence of `draft` here is worth stating: the read twins
 * (`app_name`, `app_tagline`, `app_description`) are emitted from the Redux
 * app row, not from the input's local state, so a staged value does NOT
 * appear in them until the user presses Save. Each draft description says so
 * rather than leaving the agent to wonder why its write "did nothing".
 *
 * Handlers live in `features/agent-apps/route/AgentAppSettingsContent.tsx` —
 * the component that owns both the local input state and the `saveField`
 * wrapper the user's own clicks go through — registered with
 * `useSurfaceWriteHandlers` under the layout's provider. They are therefore
 * live on `/agent-apps/[id]/settings`, the route where these fields are
 * editable; on the other sub-routes the targets are declared but unhandled,
 * which the writeback seam reports honestly.
 *
 * Every target is `applyPolicy: "ask"`. `auto` is deliberately absent: the
 * entity pair writes the database with no undo, and even the draft trio
 * overwrites text the user may have typed.
 */
const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "app_name",
    label: "App name",
    description:
      "Stages a new display name into the open app's Name field on the Settings > Identity tab. Value: a non-empty plain string, which REPLACES the current name. This is a draft — it lands in the input with a Save button beside it and the user still presses Save, so the app_name read value does not change until they do.",
    valueType: "string",
    updatesValue: "app_name",
    mode: "draft",
    applyPolicy: "ask",
    group: "app_identity",
    sortOrder: 310,
  },
  {
    name: "app_tagline",
    label: "App tagline",
    description:
      "Stages a one-line marketing tagline into the open app's Tagline field on the Settings > Identity tab — the short line shown under the app name in the hub and on the public page. Value: a plain string (pass an empty string to clear it), which REPLACES the current tagline. This is a draft — the user still presses Save, so the app_tagline read value does not change until they do.",
    valueType: "string",
    updatesValue: "app_tagline",
    mode: "draft",
    applyPolicy: "ask",
    group: "app_identity",
    sortOrder: 315,
  },
  {
    name: "app_description",
    label: "App description",
    description:
      "Stages the longer description of what the open app does into the Description field on the Settings > Identity tab. Value: a plain string (pass an empty string to clear it), which REPLACES the full description rather than appending — read app_description first and include any existing text you want kept. This is a draft — the user still presses Save, so the app_description read value does not change until they do.",
    valueType: "string",
    updatesValue: "app_description",
    mode: "draft",
    applyPolicy: "ask",
    group: "app_identity",
    sortOrder: 320,
  },
  {
    name: "app_category",
    label: "App category",
    description:
      "Sets the open app's category. Saved to the database immediately — there is no draft to review. Value: a plain string naming the category, or null to clear it. The category is free text rather than a fixed enum (the picker offers system categories and accepts a custom one), so prefer an existing category name from the catalog over inventing a near-duplicate.",
    valueType: "string",
    updatesValue: "app_category",
    mode: "entity",
    applyPolicy: "ask",
    group: "app_identity",
    sortOrder: 330,
  },
  {
    name: "app_tags",
    label: "App tags",
    description:
      "Sets the open app's tags. Saved to the database immediately — there is no draft to review. Value: an array of non-empty plain strings. This REPLACES the FULL tag set rather than appending — read app_tags first and include every existing tag you want kept, or they are dropped. Pass an empty array to remove all tags.",
    valueType: "array",
    updatesValue: "app_tags",
    mode: "entity",
    applyPolicy: "ask",
    group: "app_identity",
    sortOrder: 335,
  },
];

export const agentAppsManifest: SurfaceManifest = {
  surfaceName: AGENT_APPS_SURFACE_NAME,
  readiness: "partial",
  readinessNote: "Hub catalog values declared but the server-rendered grid has no emitter yet",
  label: "Agent Apps",
  urlPattern: "/agent-apps",
  intro: `<surface_intro>
You are on Agent Apps: the user's workspace for shareable AI mini-apps — each app wraps one agent in a custom UI (a shell kind plus optional custom component code) and can be published publicly at /p/[slug].
When app_id is present the user has one app open in its workspace; active_view tells you which UI they are on (overview, run, code, settings, versions). When app_id is absent the user is on the hub grid — only the catalog values apply.
Read app_identity for what the app is, app_content for what it is made of (shell, code, variables, config), and run_state for the active view plus usage evidence. Code-editing work targets component_code; configuration work targets shell_config and variable_schema — never invent usage statistics.
You can also WRITE the open app's storefront copy through apply_surface_write — its name, tagline, description, category and tags. Name, tagline and description stage into the Settings > Identity inputs for the user to Save; category and tags save to the database as soon as the user approves. Those five are the only writable fields: the slug, publish status, public sharing, agent binding and code are not agent-writable, so propose those in words instead. Writing requires an app to be open (app_id present) and the user to be on the Settings tab — on the hub grid or another sub-route there is nothing to write into.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
  writeTargets,
};

/** One hub-grid entry as emitted in `listed_apps_summary`. */
export interface AgentAppsListedEntry {
  id: string;
  slug: string;
  name: string;
  status: string;
}

/**
 * Type-safe payload helper — the "a UI cannot lie" enforcement.
 * Nothing is `alwaysAvailable: true` (the hub route has no active app), so
 * every key is optional.
 */
export function createAgentAppsScope(values: {
  app_id?: string;
  app_slug?: string;
  app_name?: string;
  app_tagline?: string;
  app_description?: string;
  app_status?: string;
  app_category?: string;
  app_tags?: string[];
  app_is_public?: boolean;
  agent_id?: string;
  app_version?: number;
  pinned_version?: number;
  use_latest?: boolean;
  app_summary?: Record<string, unknown>;
  shell_kind?: string;
  component_language?: string;
  component_code?: string;
  variable_schema?: Array<Record<string, unknown>>;
  shell_config?: Record<string, unknown>;
  slot_overrides?: Record<string, unknown>;
  active_view?:
    | "overview"
    | "run"
    | "code"
    | "settings"
    | "versions"
    | "version_detail";
  usage_stats?: Record<string, unknown>;
  listed_app_count?: number;
  listed_apps_summary?: AgentAppsListedEntry[];
  selection?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
