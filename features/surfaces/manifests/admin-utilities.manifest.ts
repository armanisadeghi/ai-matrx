/**
 * Surface manifest — Utilities Admin (`matrx-admin/utilities`).
 *
 * ADMIN SURFACE. Drives `/administration/utilities/**` — eight unrelated
 * developer/admin diagnostic tools that happen to live under one hub:
 *
 *   /administration/utilities                    hub (AdminDomainDirectory — static link directory, no data)
 *   /administration/utilities/all-routes           full app route tree (server-scanned at request time)
 *   /administration/utilities/blob-cache           browser file-cache inspector (IDB L1/L2 stats, SW status)
 *   /administration/utilities/capture-inspector     live fetch/stream capture viewer (every HTTP exchange, both directions)
 *   /administration/utilities/content-blocks        platform.content_blocks CRUD (skill-teachable content snippets)
 *   /administration/utilities/message-templates      message_templates CRUD (agent/system prompt templates by role)
 *   /administration/utilities/local-storage         browser localStorage/cookie inspector + editor
 *   /administration/utilities/markdown-tester        markdown/JSON-streaming render sandbox
 *   /administration/utilities/server-cache           server-side revalidation triggers (AI models cache, …)
 *   /administration/utilities/utils/text-cleaner      text-cleaning/normalization sandbox
 *
 * DELIBERATELY EXCLUDED: /administration/utilities/kind-registry has its own
 * surface (`matrx-admin/kind-registry`, `admin-kind-registry.manifest.ts`) —
 * do not fold it into this manifest or its route prefix.
 * /administration/utilities/utils is a one-tile link page to text-cleaner
 * (no data of its own) and is folded into the text_cleaner section rather
 * than given a separate nav value.
 *
 * What an agent bound here may safely do: read whichever child's state is
 * populated (per `utilities_section`) and summarize, diagnose, or explain it
 * — e.g. "why is the blob cache over budget", "summarize this captured HTTP
 * exchange", "explain what this content block teaches". Nothing on this
 * surface has a write target yet — content-blocks, message-templates, and
 * local-storage all have real in-page CRUD forms, but none has a natural
 * single-field write target; see readinessNote.
 *
 * NO EMITTER WIRED (readiness: stub). This manifest exists so the
 * vocabulary is bindable ahead of instrumentation — the surface-canonical-
 * fleet campaign's wave 3. Wiring emitters is real follow-up work: every
 * child here is its own client component tree with its own filter/selection
 * state and no shared provider seam today.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

export const ADMIN_UTILITIES_SURFACE_NAME = "matrx-admin/utilities";

const groups: SurfaceValueGroup[] = [
  {
    key: "navigation",
    label: "Utilities navigation",
    sortOrder: 100,
    description: "Which child tool of the Utilities admin family is active.",
  },
  {
    key: "all_routes",
    label: "All routes",
    sortOrder: 200,
    description: "The full scanned app/(admin)/administration route tree.",
  },
  {
    key: "blob_cache",
    label: "Blob cache",
    sortOrder: 300,
    description:
      "Browser file-cache diagnostics: L1 (in-memory) and L2 (IndexedDB) stats, and the file-cache service worker's registration status.",
  },
  {
    key: "capture_inspector",
    label: "Capture inspector",
    sortOrder: 400,
    description:
      "Every captured HTTP exchange (request + response, streamed or plain), newest first, and the one selected for detail.",
  },
  {
    key: "content_blocks",
    label: "Content blocks",
    sortOrder: 500,
    description:
      "platform.content_blocks CRUD: the loaded blocks, categories, skill options, and current list filter/selection.",
  },
  {
    key: "message_templates",
    label: "Message templates",
    sortOrder: 600,
    description:
      "message_templates CRUD: the loaded templates, distinct tags, and the current role filter/search/selection.",
  },
  {
    key: "local_storage",
    label: "Local storage",
    sortOrder: 700,
    description:
      "Browser localStorage/cookie inspector: the module/feature namespace tree and the currently selected key's raw value.",
  },
  {
    key: "markdown_tester",
    label: "Markdown tester",
    sortOrder: 800,
    description:
      "The markdown/streaming-render sandbox: the input text and the active preview/extraction mode.",
  },
  {
    key: "server_cache",
    label: "Server cache",
    sortOrder: 880,
    description:
      "Server-side revalidation triggers (e.g. the AI models cache) and each item's last refresh result.",
  },
  {
    key: "text_cleaner",
    label: "Text cleaner",
    sortOrder: 890,
    description:
      "The text-cleaning sandbox: input text, the active cleaning pattern/config, and the cleaned output.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Navigation ───────────────────────────────────────────────────────
  {
    name: "utilities_section",
    label: "Utilities section",
    description:
      'Which child of the Utilities admin family is active: "hub", "all_routes", "blob_cache", "capture_inspector", "content_blocks", "message_templates", "local_storage", "markdown_tester", "server_cache", or "text_cleaner". Always present — each emitter declares which one it is.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 18,
    sortOrder: 100,
    group: "navigation",
  },

  // ── All routes ───────────────────────────────────────────────────────
  {
    name: "all_routes_list",
    label: "All routes list",
    description:
      "Every route path scanned under app/(admin)/administration, sorted. Present only on utilities_section=all_routes.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 6000,
    autoContext: false,
    sortOrder: 200,
    group: "all_routes",
  },

  // ── Blob cache ───────────────────────────────────────────────────────
  {
    name: "blob_cache_l1_stats",
    label: "Blob cache L1 stats",
    description:
      "In-memory cache stats: { entryCount, totalBytes, budgetBytes }. Absent until the first refresh resolves. Present only on utilities_section=blob_cache.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 80,
    sortOrder: 300,
    group: "blob_cache",
  },
  {
    name: "blob_cache_l2_stats",
    label: "Blob cache L2 stats",
    description:
      "IndexedDB cache stats: { entryCount, totalBytes }. Absent until the first refresh resolves. Present only on utilities_section=blob_cache.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 50,
    sortOrder: 310,
    group: "blob_cache",
  },
  {
    name: "blob_cache_sw_status",
    label: "Blob cache service worker status",
    description:
      'The file-cache service worker\'s state: { kind: "unsupported"|"disabled"|"registering"|"registered", scope?, controllerState? }. Present only on utilities_section=blob_cache.',
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 80,
    sortOrder: 320,
    group: "blob_cache",
  },

  // ── Capture inspector ────────────────────────────────────────────────
  {
    name: "capture_exchanges",
    label: "Captured HTTP exchanges",
    description:
      "The recorded fetch/stream exchanges (id, url, method, status, httpStatus, startedAt, durationMs), newest first, capped by the recorder's ring buffer. Present only on utilities_section=capture_inspector; empty array before anything is captured.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 5000,
    autoContext: false,
    sortOrder: 400,
    group: "capture_inspector",
  },
  {
    name: "capture_mode",
    label: "Capture mode",
    description:
      "Whether capture recording is currently on or off, and the recorder's active mode label. Present only on utilities_section=capture_inspector.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 12,
    sortOrder: 405,
    group: "capture_inspector",
  },
  {
    name: "capture_selected_exchange",
    label: "Selected capture exchange",
    description:
      "The full record of the exchange selected for detail — id, request (url, method, headers, body), and response (status, headers, body/stream chunks). Absent until an exchange is selected. Present only on utilities_section=capture_inspector.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 3000,
    autoContext: false,
    sortOrder: 410,
    group: "capture_inspector",
  },

  // ── Content blocks ───────────────────────────────────────────────────
  {
    name: "content_blocks_list",
    label: "Content blocks list",
    description:
      "Every loaded platform.content_blocks row (id, title, category, content, tags, skill associations). Present only on utilities_section=content_blocks.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 8000,
    autoContext: false,
    sortOrder: 500,
    group: "content_blocks",
  },
  {
    name: "content_blocks_categories",
    label: "Content blocks categories",
    description:
      "The category tree used to organize content blocks (id, label, parent). Present only on utilities_section=content_blocks.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 1200,
    autoContext: false,
    sortOrder: 505,
    group: "content_blocks",
  },
  {
    name: "content_blocks_filter",
    label: "Content blocks filter",
    description:
      'The list toolbar\'s current state: { selectedCategory (a category id or "all"), searchTerm }. Present only on utilities_section=content_blocks.',
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 60,
    sortOrder: 510,
    group: "content_blocks",
  },
  {
    name: "content_blocks_selected_id",
    label: "Selected content block",
    description:
      "id of the content block open for editing, or absent when no editor/create dialog is open. Present only on utilities_section=content_blocks.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 515,
    group: "content_blocks",
  },

  // ── Message templates ────────────────────────────────────────────────
  {
    name: "message_templates_list",
    label: "Message templates list",
    description:
      "Every loaded message_templates row (id, name, role, content, tags, is_active). Present only on utilities_section=message_templates.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 6000,
    autoContext: false,
    sortOrder: 600,
    group: "message_templates",
  },
  {
    name: "message_templates_tags",
    label: "Message templates all tags",
    description:
      "The distinct tag set across all loaded templates, for the filter UI. Present only on utilities_section=message_templates.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 500,
    autoContext: false,
    sortOrder: 605,
    group: "message_templates",
  },
  {
    name: "message_templates_filter",
    label: "Message templates filter",
    description:
      'The list toolbar\'s current state: { selectedRole (a role name or "all"), searchTerm }. Present only on utilities_section=message_templates.',
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 60,
    sortOrder: 610,
    group: "message_templates",
  },
  {
    name: "message_templates_selected_id",
    label: "Selected message template",
    description:
      "id of the message template open for editing/preview, or absent when none is selected. Present only on utilities_section=message_templates.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 615,
    group: "message_templates",
  },

  // ── Local storage ────────────────────────────────────────────────────
  {
    name: "local_storage_modules",
    label: "Local storage modules",
    description:
      "The top-level module namespaces discovered in the browser's localStorage tree. Present only on utilities_section=local_storage.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 400,
    autoContext: false,
    sortOrder: 700,
    group: "local_storage",
  },
  {
    name: "local_storage_selected_module",
    label: "Selected local storage module",
    description:
      'The module namespace currently drilled into, or "" when browsing the top level. Present only on utilities_section=local_storage.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 30,
    sortOrder: 705,
    group: "local_storage",
  },
  {
    name: "local_storage_items",
    label: "Local storage items",
    description:
      "The key/value entries visible under local_storage_selected_module (raw, unparsed values). Present only on utilities_section=local_storage.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 2000,
    autoContext: false,
    sortOrder: 710,
    group: "local_storage",
  },
  {
    name: "local_storage_editing_key",
    label: "Local storage editing key",
    description:
      "The key currently open in the raw-value editor, or absent when no editor is open. Present only on utilities_section=local_storage.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 60,
    sortOrder: 715,
    group: "local_storage",
  },

  // ── Markdown tester ──────────────────────────────────────────────────
  {
    name: "markdown_tester_input",
    label: "Markdown tester input",
    description:
      "The raw markdown/JSON text typed into the sandbox's editor pane. Empty string before anything is typed. Present only on utilities_section=markdown_tester.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 1500,
    sortOrder: 800,
    group: "markdown_tester",
  },
  {
    name: "markdown_tester_extraction_config",
    label: "Markdown tester extraction config",
    description:
      "The JSON-extraction sandbox's current settings: { allowFuzzy, repairEnabled, maxResults, chunkStrategy, chunkDelayMs, minChunkSize, maxChunkSize }. Present only on utilities_section=markdown_tester.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 200,
    sortOrder: 810,
    group: "markdown_tester",
  },

  // ── Server cache ─────────────────────────────────────────────────────
  {
    name: "server_cache_items",
    label: "Server cache items",
    description:
      "The revalidation triggers offered on the page (id, title, description, endpoint) and each item's last refresh result (loading, success, message, timestamp). Present only on utilities_section=server_cache.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 600,
    autoContext: false,
    sortOrder: 900,
    group: "server_cache",
  },

  // ── Text cleaner ─────────────────────────────────────────────────────
  {
    name: "text_cleaner_input",
    label: "Text cleaner input",
    description:
      "The raw text pasted into the cleaner. Empty string before anything is typed. Present only on utilities_section=text_cleaner.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 1000,
    sortOrder: 1000,
    group: "text_cleaner",
  },
  {
    name: "text_cleaner_config",
    label: "Text cleaner active config",
    description:
      "The selected cleaning pattern/preset and any custom rule overrides. Present only on utilities_section=text_cleaner.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 300,
    sortOrder: 1010,
    group: "text_cleaner",
  },
  {
    name: "text_cleaner_output",
    label: "Text cleaner output",
    description:
      "The cleaned result of applying text_cleaner_config to text_cleaner_input. Empty string until a clean has run. Present only on utilities_section=text_cleaner.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 1000,
    sortOrder: 1020,
    group: "text_cleaner",
  },
];

export const adminUtilitiesManifest: SurfaceManifest = {
  surfaceName: ADMIN_UTILITIES_SURFACE_NAME,
  readiness: "stub",
  readinessNote:
    "Manifest-only — vocabulary audited against the live pages, no runtime emitter wired yet. /administration/utilities itself is a static link directory (AdminDomainDirectory, no data, no values). kind-registry is deliberately excluded (own surface, matrx-admin/kind-registry). Every other child is its own independent client component tree (content-blocks and message-templates each carry 10+ useState hooks of CRUD/dialog state) with no shared provider seam — wiring an emitter per child is real follow-up work.",
  label: "Utilities Admin",
  urlPattern: "/administration/utilities",
  intro: `<surface_intro>
This is an ADMIN surface: the Utilities admin family at /administration/utilities, covering eight unrelated developer/admin diagnostic tools that happen to live under one hub. The Shape System console at /administration/utilities/kind-registry is a SEPARATE surface (matrx-admin/kind-registry) — nothing about it lives here.

utilities_section tells you which one is active: "all_routes" (the full scanned app route tree), "blob_cache" (browser file-cache L1/IndexedDB stats + service-worker status), "capture_inspector" (every captured HTTP exchange, request and response), "content_blocks" (platform.content_blocks CRUD — skill-teachable content snippets), "message_templates" (message_templates CRUD — agent/system prompt templates by role), "local_storage" (browser localStorage/cookie inspector and editor), "markdown_tester" (a markdown/streaming-render sandbox), "server_cache" (server-side revalidation triggers), or "text_cleaner" (a text-cleaning/normalization sandbox).

Only the values matching the current utilities_section are populated — everything else is absent, not stale. Treat all rows here as live production/browser-local data: summarize, diagnose, explain, but never republish verbatim at scale. This surface has no write targets yet — content-blocks, message-templates, and local-storage all have real in-page CRUD forms, but nothing is wired for agent writes.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(pickBaseline("context"), surfaceSpecific),
};

/**
 * Type-safe payload helper. Required keys (no `?`) mirror every value
 * declared `alwaysAvailable: true`; optional keys mirror `alwaysAvailable: false`.
 */
export function createAdminUtilitiesScope(values: {
  // alwaysAvailable: true → required
  utilities_section:
    | "hub"
    | "all_routes"
    | "blob_cache"
    | "capture_inspector"
    | "content_blocks"
    | "message_templates"
    | "local_storage"
    | "markdown_tester"
    | "server_cache"
    | "text_cleaner";
  // alwaysAvailable: false → optional
  context?: Record<string, unknown>;
  all_routes_list?: string[];
  blob_cache_l1_stats?: Record<string, unknown>;
  blob_cache_l2_stats?: Record<string, unknown>;
  blob_cache_sw_status?: Record<string, unknown>;
  capture_exchanges?: unknown[];
  capture_mode?: string;
  capture_selected_exchange?: Record<string, unknown>;
  content_blocks_list?: unknown[];
  content_blocks_categories?: unknown[];
  content_blocks_filter?: Record<string, unknown>;
  content_blocks_selected_id?: string;
  message_templates_list?: unknown[];
  message_templates_tags?: string[];
  message_templates_filter?: Record<string, unknown>;
  message_templates_selected_id?: string;
  local_storage_modules?: string[];
  local_storage_selected_module?: string;
  local_storage_items?: Record<string, unknown>;
  local_storage_editing_key?: string;
  markdown_tester_input?: string;
  markdown_tester_extraction_config?: Record<string, unknown>;
  server_cache_items?: unknown[];
  text_cleaner_input?: string;
  text_cleaner_config?: Record<string, unknown>;
  text_cleaner_output?: string;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
