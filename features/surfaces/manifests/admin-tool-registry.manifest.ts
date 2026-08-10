/**
 * Surface manifest — Tool Registry admin (`matrx-admin/tool-registry`).
 *
 * ADMIN SURFACE. Drives `/administration/agents/mcp-tools/**` — the
 * super-admin console over the platform tool registry (schema `tool`). The
 * list page browses every `tool.definition` row; the detail route opens one
 * tool with tabs for overview, registry standing, parameters (the input JSON
 * schema), output schema, annotations, and test samples.
 *
 * What an agent bound here may safely do: read the tool catalogue and the open
 * tool's definition, critique descriptions and parameter schemas, find
 * undocumented or duplicated tools, and audit tiering and gating. It may also
 * APPLY three authored-metadata edits to the open tool — description,
 * category, tags — via `writeTargets` below, each behind an in-place confirm.
 * Everything else it can only propose: schemas, gating, activation and every
 * capability field go through the admin's own editor, and nothing here invokes
 * a tool.
 *
 * SECURITY: this manifest declares NO secrets, API keys, tokens, connection
 * strings, or credential material, and the emitters never place any in the
 * scope. `tool.definition`, `tool.binding` and `tool.executor` carry no secret
 * columns; the credential-shaped fields in this domain live on ADJACENT tables
 * that this surface does not read — `tool.mcp_server` (auth_strategy,
 * oauth_client_id, oauth_scopes, endpoint_url), `tool.mcp_user_conn`
 * (credential_item_id, oauth token endpoints/expiry, endpoint_url_override),
 * `tool.mcp_config.env_schema`, and the vault-backed `credential_items` /
 * `user_secrets` / `integration_connections`. If any of that ever needs
 * representing here it becomes a presence boolean (e.g. `has_api_key`,
 * `has_oauth_client_id`), never a value.
 *
 * Emitters (real, wired):
 *   - Catalogue → `features/tool-call-visualization/admin/McpToolsManager.tsx`
 *   - Open tool → `features/tool-call-visualization/admin/mcp-tools/ToolViewPage.tsx`
 *
 * Deliberately NOT declared (nothing emits them): executor bindings
 * (`tool.executor` + `tool.binding`) and per-surface tool defaults
 * (`tool.surface_defaults` — always/never include lists, arg defaults and
 * injection) are loaded INSIDE the detail page's Registry tab
 * (`features/tool-registry/tools-admin/components/RegistryTab.tsx`) and never
 * reach `ToolViewPage`'s props, so the surface cannot promise them today.
 * Wiring RegistryTab's loaded state up to the emitter is the next step toward
 * `verified`.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
  SurfaceWriteTarget,
} from "@/features/surfaces/types";
import {
  TOOL_CATEGORY_MAX_CHARS,
  TOOL_DESCRIPTION_MAX_CHARS,
  TOOL_TAGS_MAX_COUNT,
  TOOL_TAG_MAX_CHARS,
} from "@/features/tool-call-visualization/admin/mcp-tools/tool-metadata";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

export const ADMIN_TOOL_REGISTRY_SURFACE_NAME = "matrx-admin/tool-registry";

const groups: SurfaceValueGroup[] = [
  {
    key: "catalogue",
    label: "Tool catalogue",
    sortOrder: 100,
    description:
      "The set of registered tool definitions the admin is browsing, and the counts attached to them.",
  },
  {
    key: "browse_state",
    label: "Browse state",
    sortOrder: 200,
    description:
      "The admin's current cut of the catalogue: search, category / source / status / tag filters, and sort.",
  },
  {
    key: "open_tool",
    label: "Open tool",
    sortOrder: 300,
    description:
      "Identity and description of the single tool definition the admin has open.",
  },
  {
    key: "tool_contract",
    label: "Tool contract",
    sortOrder: 400,
    description:
      "The machine contract of the open tool: input parameter schema, output schema, and annotations.",
  },
  {
    key: "tool_standing",
    label: "Registry standing",
    sortOrder: 500,
    description:
      "How the open tool is governed: source, owning MCP server, tier, version, activation, gating, and exemptions.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Catalogue ─────────────────────────────────────────────────────────
  {
    name: "registry_section",
    label: "Registry section",
    description:
      '"catalogue" when the admin is on the tool list, "tool_detail" when a single tool is open. Always present — each emitter declares which one it is.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 12,
    sortOrder: 100,
    group: "catalogue",
  },
  {
    name: "tool_ids",
    label: "Tool IDs",
    description:
      "UUIDs of every active `tool.definition` row loaded into the catalogue. Absent on the tool-detail route, which loads only one tool.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 8000,
    sortOrder: 110,
    group: "catalogue",
  },
  {
    name: "tool_count",
    label: "Tool count",
    description:
      "Number of tools loaded into the catalogue before filters. Absent on the tool-detail route.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 4,
    sortOrder: 120,
    group: "catalogue",
  },
  {
    name: "tools_summary",
    label: "Catalogue summary",
    description:
      "One compact record per loaded tool: id, name, description, category, tool_group, tier, source_kind, version, is_active, admin_only, tag list, and parameter count. Large — bindable, not auto-context. Absent on the tool-detail route.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 40000,
    autoContext: false,
    sortOrder: 130,
    group: "catalogue",
  },
  {
    name: "filtered_tool_ids",
    label: "Filtered tool IDs",
    description:
      "UUIDs of the tools actually visible after search, filters, and sort, in display order. Equals `tool_ids` when nothing is filtered. Absent on the tool-detail route.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 4000,
    sortOrder: 140,
    group: "catalogue",
  },
  {
    name: "tool_categories",
    label: "Tool categories",
    description:
      "Distinct category values present across the loaded catalogue — the vocabulary an agent should stay inside when proposing a category. Absent on the tool-detail route.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 300,
    sortOrder: 150,
    group: "catalogue",
  },

  // ── Browse state ──────────────────────────────────────────────────────
  {
    name: "search_query",
    label: "Search",
    description:
      "The admin's free-text search over the catalogue. Empty when untouched; absent on the tool-detail route.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 20,
    sortOrder: 200,
    group: "browse_state",
  },
  {
    name: "category_filter",
    label: "Category filter",
    description:
      "The category the catalogue is filtered to. Absent when no category filter is applied or on the tool-detail route.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 20,
    sortOrder: 210,
    group: "browse_state",
  },
  {
    name: "source_kind_filter",
    label: "Source filter",
    description:
      "The `source_kind` the catalogue is filtered to (how the tool entered the registry). Absent when unfiltered or on the tool-detail route.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 16,
    sortOrder: 220,
    group: "browse_state",
  },
  {
    name: "status_filter",
    label: "Status filter",
    description:
      '"all", "active", or "inactive" — the activation cut of the catalogue. Absent on the tool-detail route.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 8,
    sortOrder: 230,
    group: "browse_state",
  },
  {
    name: "tag_filter",
    label: "Tag filter",
    description:
      "The single tag the catalogue is filtered to. Absent when unfiltered or on the tool-detail route.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 16,
    sortOrder: 240,
    group: "browse_state",
  },
  {
    name: "sort_state",
    label: "Sort",
    description:
      "Catalogue sort key and direction. Absent on the tool-detail route.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 40,
    sortOrder: 250,
    group: "browse_state",
  },

  // ── Open tool ─────────────────────────────────────────────────────────
  {
    name: "tool_id",
    label: "Open tool ID",
    description:
      "UUID of the `tool.definition` row the admin has open. Absent on the catalogue list.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 300,
    group: "open_tool",
  },
  {
    name: "tool_name",
    label: "Tool name",
    description:
      "The canonical tool name — the key agents call it by. `tool.definition` has no slug column; the name IS the identifier. Absent on the catalogue list.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 30,
    sortOrder: 310,
    group: "open_tool",
  },
  {
    name: "tool_description",
    label: "Tool description",
    description:
      "The description an LLM reads when deciding whether to call this tool — the highest-leverage editable field on the surface. Empty when unset; absent on the catalogue list.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 400,
    sortOrder: 320,
    group: "open_tool",
  },
  {
    name: "tool_category",
    label: "Category",
    description:
      "Category the open tool is filed under. Empty when uncategorised; absent on the catalogue list.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 20,
    sortOrder: 330,
    group: "open_tool",
  },
  {
    name: "tool_group",
    label: "Tool group",
    description:
      "The group the open tool belongs to (a coarser bundle than category). Empty when unset; absent on the catalogue list.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 20,
    sortOrder: 340,
    group: "open_tool",
  },
  {
    name: "tool_tags",
    label: "Tags",
    description:
      "Tag strings on the open tool. Absent on the catalogue list or when the tool has no tags.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 60,
    sortOrder: 350,
    group: "open_tool",
  },
  {
    name: "tool_summary",
    label: "Tool summary",
    description:
      "Composite of the open tool's identity and standing (id, name, description, category, group, tier, source_kind, version, semver, is_active, admin_only, tags) as one object. Absent on the catalogue list.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 800,
    sortOrder: 360,
    group: "open_tool",
  },

  // ── Tool contract ─────────────────────────────────────────────────────
  {
    name: "tool_parameters_schema",
    label: "Parameters schema",
    description:
      "The open tool's input JSON schema (`tool.definition.parameters`) — the contract callers must satisfy. Verbose: bindable, not auto-context. Absent on the catalogue list.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 3000,
    autoContext: false,
    sortOrder: 400,
    group: "tool_contract",
  },
  {
    name: "tool_parameter_names",
    label: "Parameter names",
    description:
      "Top-level property names of the open tool's input schema — the cheap way to reason about its signature without pulling the whole schema. Absent on the catalogue list or when the schema has no properties.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 150,
    sortOrder: 410,
    group: "tool_contract",
  },
  {
    name: "tool_output_schema",
    label: "Output schema",
    description:
      "The open tool's declared output JSON schema, when it has one. Bindable, not auto-context. Absent on the catalogue list or when the tool declares no output schema.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 2000,
    autoContext: false,
    sortOrder: 420,
    group: "tool_contract",
  },
  {
    name: "tool_has_output_schema",
    label: "Has output schema",
    description:
      "Whether the open tool declares an output schema at all — an audit signal that costs nothing to carry. Absent on the catalogue list.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 430,
    group: "tool_contract",
  },
  {
    name: "tool_annotations",
    label: "Annotations",
    description:
      "MCP-style annotations on the open tool (read-only / destructive / idempotent hints). Bindable, not auto-context. Absent on the catalogue list or when none are set.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 600,
    autoContext: false,
    sortOrder: 440,
    group: "tool_contract",
  },

  // ── Registry standing ─────────────────────────────────────────────────
  {
    name: "tool_source_kind",
    label: "Source kind",
    description:
      "How the open tool entered the registry (server-native, MCP-discovered, client-side, …). Absent on the catalogue list.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 16,
    sortOrder: 500,
    group: "tool_standing",
  },
  {
    name: "tool_managed_by_server_id",
    label: "Owning MCP server ID",
    description:
      "UUID of the `tool.mcp_server` row that owns the open tool, when it is MCP-managed. Identifier only — no endpoint URL, auth strategy, or OAuth material is emitted. Absent on the catalogue list or for non-MCP tools.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 510,
    group: "tool_standing",
  },
  {
    name: "tool_tier",
    label: "Tier",
    description:
      "Registry tier of the open tool (its exposure/trust band). Absent on the catalogue list or when unset.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 12,
    sortOrder: 520,
    group: "tool_standing",
  },
  {
    name: "tool_version",
    label: "Version",
    description:
      "Integer version counter of the open tool's definition. Absent on the catalogue list.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    sortOrder: 530,
    group: "tool_standing",
  },
  {
    name: "tool_semver",
    label: "Semver",
    description:
      "Semantic version string of the open tool, when it carries one. Absent on the catalogue list or when unset.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 10,
    sortOrder: 540,
    group: "tool_standing",
  },
  {
    name: "tool_is_active",
    label: "Is active",
    description:
      "Whether the open tool is active. An inactive tool stays in the registry but is not dispatchable. Absent on the catalogue list.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 550,
    group: "tool_standing",
  },
  {
    name: "tool_admin_only",
    label: "Admin only",
    description:
      "Whether the open tool is restricted to admins. Absent on the catalogue list.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 560,
    group: "tool_standing",
  },
  {
    name: "tool_gating",
    label: "Gating",
    description:
      "The open tool's gating configuration — the conditions under which it is offered to an agent. Absent on the catalogue list or when ungated.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 300,
    sortOrder: 570,
    group: "tool_standing",
  },
  {
    name: "tool_exemptions",
    label: "Exemptions & limits",
    description:
      "Operational escape hatches on the open tool as one object: dedupe_exempt, validation_exempt, and max_client_wait_seconds. Absent on the catalogue list.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 90,
    sortOrder: 580,
    group: "tool_standing",
  },
  {
    name: "tool_visibility",
    label: "Visibility",
    description:
      "Canonical visibility of the open tool row (personal / internal / public). Absent on the catalogue list.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 10,
    sortOrder: 585,
    group: "tool_standing",
  },
  {
    name: "tool_updated_at",
    label: "Last updated",
    description:
      "ISO timestamp of the last write to the open tool's definition row. Absent on the catalogue list.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 25,
    sortOrder: 590,
    group: "tool_standing",
  },
];

/**
 * Write half of the 360 loop — what an agent may WRITE into the tool registry.
 *
 * This is an ADMIN surface over the table that decides what every agent on the
 * platform can call, so the bar is deliberately narrow: the three fields of
 * AUTHORED metadata a model genuinely writes better than a human types
 * (description, category, tags) and nothing else.
 *
 * PER-MOUNT: only `ToolViewPage` (the single open tool) registers handlers.
 * `McpToolsManager` mounts this same surface for the catalogue and registers
 * NONE, so `listAgentWritableTargets()` offers nothing on the list route. That
 * is a decision, not an oversight:
 *   • The catalogue's only local state is BROWSE state — search, category /
 *     source / status / tag filters, column filters, sort. Driving someone's
 *     filter chips is the "pure-mechanical view state" class the judgment bar
 *     excludes; an agent that wants a subset can already read
 *     `tools_summary` / `filtered_tool_ids` and answer directly.
 *   • It holds no open record. A metadata write from the list would either
 *     need a tool id invented from the model's side or would fan out across
 *     rows — neither is something a single in-place confirm can make legible.
 *   • The detail page is where the authored metadata is actually read and
 *     reviewed, and it already owns the canonical write door, so wiring the
 *     catalogue would be a parallel write path around it.
 *
 * MODE: every target is `mode: "entity"` + `applyPolicy: "ask"`. `draft` is the
 * preferred mode elsewhere and is genuinely unavailable here — the detail page
 * is server-rendered read-only props with no editor state for a value to stage
 * into (editing has its own route, `/[toolId]/edit`, which does not mount this
 * surface). Rather than invent a shadow draft the Save bar would not know
 * about, each handler validates and then goes through
 * `updateToolDefinition()` → `PUT /api/admin/tools/[id]` → `requireAdmin()`,
 * the exact door the page's own Active toggle and the admin editor use, and
 * then `router.refresh()` so the read twin reflects what landed. The ask
 * dialog IS the review step: `auto` would be an agent silently writing the
 * platform tool registry, which is never acceptable here.
 *
 * DELIBERATELY NOT WRITABLE, and this must stay that way:
 *   • `tool_is_active`, `tool_admin_only`, `tool_gating`, `tool_exemptions`,
 *     `tool_visibility`, `tool_tier` — changing what a tool may REACH, who may
 *     reach it, or whether it dispatches at all is a CAPABILITY/permissions
 *     change, not a copy edit. This is the same call `agent-builder` made when
 *     it kept model / tools / MCP servers / skills / governance human-only,
 *     and it matters more here: one flipped flag re-arms a tool for every
 *     agent on the platform. The page keeps its human Active switch.
 *   • `tool_id` and `tool_name` — identity. The name IS the key callers
 *     dispatch by (there is no slug column), so renaming silently breaks every
 *     existing call site and every stored transcript.
 *   • `tool_parameters_schema`, `tool_output_schema`, `tool_annotations` — the
 *     machine contract. A wrong parameter schema breaks every call of the
 *     tool, and annotations are the read-only / destructive hints other agents
 *     trust when deciding how carefully to treat it. Both have a dedicated
 *     JSON editor with error reporting; an agent should propose a diff there.
 *   • `tool_version`, `tool_semver` — version accounting, not authoring.
 *   • Anything `mcp_server`-adjacent (`tool_managed_by_server_id`,
 *     `tool_source_kind`) — provenance, and the neighbourhood the manifest's
 *     SECURITY note keeps this surface out of. Repointing a tool at a
 *     different MCP server is a capability change wearing a metadata costume.
 *   • `tool_group` — a filing label like `category` and otherwise a fair
 *     candidate, but NO human editor exposes it (it is absent from both
 *     `ToolCreatePage` and `ToolEditPage`; the catalogue only renders it as a
 *     column). An entity write to a field the admin cannot then correct in the
 *     UI is a one-way door. If the editor ever gains the field, adding the
 *     target here is a few lines.
 *   • Deleting a tool. Destructive stays human, always.
 *
 * Handlers live in `ToolViewPage`'s `getWriteHandlers`; the bounds quoted in
 * the descriptions below and the checks the handlers run are the SAME
 * constants, from `admin/mcp-tools/tool-metadata.ts`.
 */
const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "tool_description",
    label: "Tool description",
    description: `Replaces the open tool's description — the text an LLM reads when deciding whether to call this tool, so write it as a decision aid: what the tool does, when to reach for it, and when not to. This is a FULL replacement, not a merge: read \`tool_description\` first and include anything you mean to keep. Plain text, 1-${TOOL_DESCRIPTION_MAX_CHARS} characters after trimming; the empty string is REJECTED rather than treated as a way to clear the field, because the column is NOT NULL. PERSISTS IMMEDIATELY on apply, through the same admin tool API the human editor saves to — there is no draft step, so the confirm dialog is the review.`,
    valueType: "string",
    updatesValue: "tool_description",
    mode: "entity",
    applyPolicy: "ask",
    group: "open_tool",
    sortOrder: 100,
  },
  {
    name: "tool_category",
    label: "Category",
    description: `Replaces the category the open tool is filed under — the short label the catalogue groups and filters by (e.g. "web", "data", "core"). A single-line free-text string, max ${TOOL_CATEGORY_MAX_CHARS} characters, no newlines or tabs; the empty string clears the category back to none. There is no fixed vocabulary, so reuse a category the registry already uses instead of inventing a near-duplicate — the catalogue view of this same surface publishes the live list as \`tool_categories\`. PERSISTS IMMEDIATELY on apply, through the same admin tool API the human editor saves to.`,
    valueType: "string",
    updatesValue: "tool_category",
    mode: "entity",
    applyPolicy: "ask",
    group: "open_tool",
    sortOrder: 110,
  },
  {
    name: "tool_tags",
    label: "Tags",
    description: `Replaces the FULL tag set on the open tool — this does NOT append. Read \`tool_tags\` first and include every tag you want kept; pass an empty array to clear all tags. Value: an array of at most ${TOOL_TAGS_MAX_COUNT} short strings, each 1-${TOOL_TAG_MAX_CHARS} characters after trimming, with no duplicates and no commas inside a tag (the admin's tag editor is one comma-separated input, so an embedded comma would split the tag the next time a human edits it). A bad entry rejects the whole array rather than being dropped. PERSISTS IMMEDIATELY on apply, through the same admin tool API the human editor saves to.`,
    valueType: "array",
    updatesValue: "tool_tags",
    mode: "entity",
    applyPolicy: "ask",
    group: "open_tool",
    sortOrder: 120,
  },
];

export const adminToolRegistryManifest: SurfaceManifest = {
  surfaceName: ADMIN_TOOL_REGISTRY_SURFACE_NAME,
  readiness: "partial",
  readinessNote:
    "Catalogue and open-tool emitters are wired and real. Executor bindings (tool.executor + tool.binding) and per-surface tool defaults (tool.surface_defaults) are loaded inside the detail page's Registry tab and never reach the emitter, so they are deliberately undeclared; lifting that state to the emitter is the remaining work. The mcp-servers / bundles / executor-surfaces sibling routes have no emitter.",
  label: "Tool Registry",
  urlPattern: "/administration/agents/mcp-tools",
  intro: `<surface_intro>
This is an ADMIN surface: the super-admin console for the platform tool registry at /administration/agents/mcp-tools.

The admin browses every registered tool definition (schema tool, table definition) and opens one to inspect its description, input parameter schema, output schema, annotations, registry standing, and test samples.

How to read the values: registry_section tells you where you are — "catalogue" (the list) or "tool_detail" (one tool open). On the catalogue, tools_summary and the filter values apply and every tool_* detail value is absent; on the detail route the reverse. The tool's NAME is its identifier — there is no slug column. tool_is_active is the dispatchability signal; an inactive tool still exists in the registry.

What you may safely do: read the catalogue and the open tool's definition, sharpen tool descriptions and parameter schemas (the description is what an LLM reads when choosing a tool), audit gating and tiering, and find undocumented or duplicated entries. You never invoke a tool from here.

You can also WRITE, but only on the tool-detail route and only to the authored metadata: tool_description, tool_category, and tool_tags. Those three persist to the registry the moment the admin confirms, so read the current value first — description and tags are FULL replacements, not merges. Everything that decides what a tool may REACH or who may reach it — is_active, admin_only, gating, exemptions, visibility, tier — plus the tool's name, its parameter and output schemas, its annotations, its version, and its MCP provenance are human-only. Propose those in your answer; do not try to apply them.

No credentials are present in this scope. MCP server endpoints, auth strategies, OAuth client ids, and vault-backed secrets live on adjacent tables this surface does not read; do not ask for them or infer them.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
  writeTargets,
};

/** Compact catalogue row emitted by the admin tool list. */
export interface AdminToolSummaryEntry {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  tool_group: string | null;
  tier: string | null;
  source_kind: string | null;
  version: number | null;
  is_active: boolean | null;
  admin_only: boolean | null;
  tags: string[] | null;
  param_count: number;
}

/**
 * Type-safe payload helper. Required keys (no `?`) mirror every value declared
 * `alwaysAvailable: true`; optional keys mirror `alwaysAvailable: false`.
 */
export function createAdminToolRegistryScope(values: {
  // alwaysAvailable: true → required
  registry_section: "catalogue" | "tool_detail";
  // alwaysAvailable: false → optional
  selection?: string;
  context?: Record<string, unknown>;
  tool_ids?: string[];
  tool_count?: number;
  tools_summary?: AdminToolSummaryEntry[];
  filtered_tool_ids?: string[];
  tool_categories?: string[];
  search_query?: string;
  category_filter?: string;
  source_kind_filter?: string;
  status_filter?: string;
  tag_filter?: string;
  sort_state?: { key: string; dir: string };
  tool_id?: string;
  tool_name?: string;
  tool_description?: string;
  tool_category?: string;
  tool_group?: string;
  tool_tags?: string[];
  tool_summary?: Record<string, unknown>;
  tool_parameters_schema?: unknown;
  tool_parameter_names?: string[];
  tool_output_schema?: unknown;
  tool_has_output_schema?: boolean;
  tool_annotations?: unknown[];
  tool_source_kind?: string;
  tool_managed_by_server_id?: string;
  tool_tier?: string;
  tool_version?: number;
  tool_semver?: string;
  tool_is_active?: boolean;
  tool_admin_only?: boolean;
  tool_gating?: unknown;
  tool_exemptions?: {
    dedupe_exempt: boolean | null;
    validation_exempt: boolean | null;
    max_client_wait_seconds: number | null;
  };
  tool_visibility?: string;
  tool_updated_at?: string;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
