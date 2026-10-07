/**
 * Surface manifest — Applets (`matrx-user/agent-apps`).
 *
 * Drives the `/applets` route family (`features/applets`): the hub grid
 * of the user's shareable AI mini-apps plus the per-app workspace at
 * `/applets/manage/[id]` with its sub-route UIs (overview / run / code / settings
 * / versions). One surface covers the whole family, so NOTHING app-specific
 * is `alwaysAvailable` — the hub route has no active app. When an app IS open
 * (`/applets/manage/[id]/**`) the emitter fills the app_identity / app_content /
 * run_state (active view + usage) values from the Redux applet slice (`state.applet`, hydrated
 * by `AppletHydratorServer`).
 *
 * Runtime emitter: `features/applets/route/AppletSurfaceRuntime.tsx`,
 * mounted in `app/(core)/applets/manage/[id]/layout.tsx`.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
  SurfaceWriteTarget,
} from "@ai-matrx/chat/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "@ai-matrx/chat/surfaces/manifests/_baseline.manifest";
import { MATRX_WEB_APP_EXECUTOR } from "@ai-matrx/chat/surfaces/executor";

export const APPLETS_SURFACE_NAME = "matrx-user/agent-apps";

const groups: SurfaceValueGroup[] = [
  {
    key: "app_identity",
    label: "App identity",
    sortOrder: 100,
    description:
      "Which Applet is open: naming, lifecycle and version.",
  },
  {
    key: "app_content",
    label: "App content",
    sortOrder: 200,
    description:
      "What the Applet is made of: its code files, entry, pages, jobs and data sources.",
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
      "The hub listing — the set of Applets shown on the /applets grid.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── App identity ──────────────────────────────────────────────────────
  {
    name: "app_id",
    label: "App ID",
    description:
      "UUID of the Applet open in the workspace (`/applets/manage/[id]`). Empty on the hub grid, templates, and /new — no app is open there.",
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
      "Display name of the open Applet. Empty when no app is open.",
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
    name: "app_visibility",
    label: "Published to the web",
    description:
      '"Published to the web" (anyone, signed in or not, reaches it at `/p/[slug]`) or "Not published" — the open app\'s web state. Absent when no app is open.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 340,
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
    name: "app_summary",
    label: "App summary",
    description:
      "Composite of the open Applet's identity as one object: { id, slug, name, tagline, status, category, tags, published_to_web, version }. Mirrors the individual identity values (completeness law). Absent when no Applet is open.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 500,
    sortOrder: 365,
    group: "app_identity",
  },

  {
    name: "app_bundle",
    label: "Open app",
    description:
      "The open Applet condensed as one XML bundle — read this first: <applet id name slug public_url status published_to_web category tags version entry view> with <tagline>, <description>, <pages> (one <page path title file/> each), <jobs> (one <job alias key/> each), <sources> (one <source alias table_id|entity/> each), <files> (one <file name chars/> each) and <usage runs success_rate last_run/>. The full sources are app_files. Absent when no Applet is open or it has not loaded yet.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 5000,
    // 8,000 keeps the page inside the 10,000 budget with the 2,000 custom_fields baseline (typical bundle is 5,000).
    inlineUpTo: 8000,
    sortOrder: 299,
    group: "app_identity",
  },

  // ── App content ───────────────────────────────────────────────────────
  {
    name: "app_entry",
    label: "Entry file",
    description: "The file the open Applet starts from (the record's `entry`). Absent when no Applet is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 12,
    sortOrder: 400,
    group: "app_content",
  },
  {
    name: "app_pages",
    label: "Pages",
    description:
      "The open Applet's pages, one entry per page: { path, title, file, parent? }. Empty array when the entry file renders alone. Absent when no Applet is open.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 300,
    sortOrder: 410,
    group: "app_content",
  },
  {
    name: "app_jobs",
    label: "Jobs",
    description:
      "The jobs the open Applet runs, one entry per job: { alias, key } — the alias is what its code passes to useJob, the key names the mandate. Absent when no Applet is open.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 200,
    sortOrder: 420,
    group: "app_content",
  },
  {
    name: "app_sources",
    label: "Data sources",
    description:
      "The data the open Applet reads, one entry per alias: { alias, table_id, organization_id } for a table or { alias, entity } for a platform record type. Absent when no Applet is open.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 300,
    sortOrder: 430,
    group: "app_content",
  },
  {
    name: "app_files",
    label: "Code files",
    description:
      "The open Applet's FULL code: an object of file name → source (edited on the Code tab). Large — bindable for code-editing agents. Absent when no Applet is open.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 8000,
    autoContext: false,
    sortOrder: 440,
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
      "Number of Applets shown on the hub grid. Absent on `/applets/manage/[id]` routes — the grid is not mounted there.",
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
      "One entry per app card on the hub grid with { id, slug, name, status }, in display order. Absent on `/applets/manage/[id]` routes; empty array when the user has no apps.",
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
 * WHY THESE FIVE. An Applet is a published product: its name, tagline,
 * description, category and tags are the entire storefront at `/p/[slug]`,
 * and they are exactly the "authored copy an agent drafts better/faster"
 * class. A user who has just built an app has working code and placeholder
 * marketing text; drafting that copy from what the app actually does is the
 * single most useful thing an agent can do on this surface.
 *
 * WHY NOT THE REST. `app_slug` and `app_id` are identity (the public URL is
 * built from the slug — renaming it breaks every existing link).
 * `app_visibility` is a sharing decision and `app_status` (draft → published)
 * is a release decision — both are the human's call, not a copy edit.
 * `app_version` is structural, the files / pages / jobs / sources change in
 * the Code and Settings editors or by talking (a different job), rate
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
 * Handlers live in `features/applets/route/AppletSettingsContent.tsx` —
 * the component that owns both the local input state and the `saveField`
 * wrapper the user's own clicks go through — registered with
 * `useSurfaceWriteHandlers` under the layout's provider. All five are
 * therefore live on `/applets/manage/[id]/settings`, the route where these
 * fields are editable.
 *
 * MOUNTS, and what a write means OFF the Settings tab. The DRAFT trio is
 * Settings-only by necessity: a draft stages into an input, and on
 * overview / run / code / versions there is no input for it to land in — so
 * those three are simply not offered there (`listAgentWritableTargets()`
 * skips a declared target with no registered handler, and a forced call gets
 * the seam's loud "declares … but registered no handler" error rather than
 * silence). The ENTITY pair has no such dependency — it persists straight
 * through `saveAppField` and needs only the open row — so
 * `AppletSurfaceRuntime` (the `/applets/manage/[id]` layout, mounted on every
 * sub-route) registers `app_category` and `app_tags` as well, from the shared
 * validators in `features/applets/route/applet-entity-writes.ts`.
 * Scoping those two to Settings would have been an artifact of where the
 * pickers are rendered, not a safety property. On Settings the component's
 * own registration shadows the layout's (registered handlers win —
 * `resolveHandlers`), so the write still goes through the same `saveField`
 * wrapper a picker click uses.
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
      "Stages a new display name into the open app's Name field on the Settings > Overview tab. Value: a non-empty plain string, which REPLACES the current name. This is a draft — it lands in the input with a Save button beside it and the user still presses Save, so the app_name read value does not change until they do.",
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
      "Stages a one-line marketing tagline into the open app's Tagline field on the Settings > Overview tab — the short line shown under the app name in the hub and on the public page. Value: a plain string (pass an empty string to clear it), which REPLACES the current tagline. This is a draft — the user still presses Save, so the app_tagline read value does not change until they do.",
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
      "Stages the longer description of what the open app does into the Description field on the Settings > Overview tab. Value: a plain string (pass an empty string to clear it), which REPLACES the full description rather than appending — read app_description first and include any existing text you want kept. This is a draft — the user still presses Save, so the app_description read value does not change until they do.",
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

export const appletsManifest: SurfaceManifest = {
  surfaceName: APPLETS_SURFACE_NAME,
  client: "matrx-user",
  executor: MATRX_WEB_APP_EXECUTOR,
  executionMode: "python-stream",
  description:
    "Applets: the editor and hub for a person's small apps (files, pages, jobs, sources)",
  readiness: "partial",
  readinessNote:
    "AP-0 lane B3 2026-10-07: values describe the Applet record (files, entry, pages, jobs, sources); the shell/slot/agent/run keys are gone. Live probe and agent write proof are pending.",
  label: "Applets",
  urlPattern: "/applets",
  intro: `<surface_intro>
You are on Applets: the user's Applets — small apps each made of code files, pages, jobs (mandates it runs, by key) and data sources (their tables or platform record types). An Applet can be published at /p/[slug].
When app_id is present one Applet is open in its editor; read app_bundle first — it is the open Applet in one place. active_view tells you which UI they are on (overview, run, code, settings, versions). app_content holds what it is made of: app_entry, app_pages, app_jobs, app_sources and the full code in app_files. Never invent usage statistics.
You can WRITE the open Applet's storefront copy through apply_surface_write — its name, tagline, description, category and tags. Name, tagline and description stage into the Settings > Overview inputs for the user to Save and are available only on that tab; category and tags save as soon as the user approves and remain available on every per-app sub-route. Those five are the only writable fields: the slug, publishing, pages, jobs, sources and code are not agent-writable here — the code changes by talking at /applets/build?applet=<id>. Every write requires an Applet to be open (app_id present).
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
  writeTargets,
};

/** One hub-grid entry as emitted in `listed_apps_summary`. */
export interface AppletsListedEntry {
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
export function createAppletsScope(values: {
  app_bundle?: string;
  app_id?: string;
  app_slug?: string;
  app_name?: string;
  app_tagline?: string;
  app_description?: string;
  app_status?: string;
  app_category?: string;
  app_tags?: string[];
  app_visibility?: string;
  app_version?: number;
  app_summary?: Record<string, unknown>;
  app_entry?: string;
  app_pages?: Array<Record<string, unknown>>;
  app_jobs?: Array<Record<string, unknown>>;
  app_sources?: Array<Record<string, unknown>>;
  app_files?: Record<string, string>;
  active_view?:
    "overview" | "run" | "code" | "settings" | "versions" | "version_detail";
  usage_stats?: Record<string, unknown>;
  listed_app_count?: number;
  listed_apps_summary?: AppletsListedEntry[];
  selection?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
