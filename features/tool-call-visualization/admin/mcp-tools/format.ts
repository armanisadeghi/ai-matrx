/**
 * Shared human/agent formatters for the MCP tools admin surfaces
 * (McpToolsManager list, ToolViewPage record, ToolEditPage / ToolCreatePage
 * editor forms).
 *
 * SECURITY: same posture as the `matrx-admin/tool-registry` surface manifest —
 * definition metadata only; no MCP endpoint URLs, auth strategies, OAuth ids,
 * or vault credentials.
 */

import type { AgentPayloadInput } from "@/components/agent-copy/buildAgentPayload";

/** Structural subset shared by McpToolsManager's Tool and DatabaseTool. */
export interface ToolLike {
  id: string;
  name: string;
  description?: string | null;
  category?: string | null;
  tool_group?: string | null;
  tier?: string | null;
  source_kind?: string | null;
  version?: number | null;
  semver?: string | null;
  is_active?: boolean | null;
  admin_only?: boolean | null;
  tags?: string[] | null;
  /** Json in DB rows, Record in the manager's parsed Tool — accept both. */
  parameters?: unknown;
  output_schema?: unknown;
  updated_at?: string | null;
}

/** Count of `properties` on a JSON-schema-ish parameters blob. */
function paramCountOf(params: unknown): number {
  if (params && typeof params === "object" && !Array.isArray(params)) {
    const props = (params as Record<string, unknown>).properties;
    if (props && typeof props === "object" && !Array.isArray(props)) {
      return Object.keys(props).length;
    }
  }
  return 0;
}

export function toolParamCount(tool: ToolLike): number {
  return paramCountOf(tool.parameters);
}

/** Compact catalog projection — mirrors the surface manifest's tools_summary. */
export function toolBrief(tool: ToolLike) {
  return {
    id: tool.id,
    name: tool.name,
    description: tool.description ?? null,
    category: tool.category ?? null,
    tool_group: tool.tool_group ?? null,
    tier: tool.tier ?? null,
    source_kind: tool.source_kind ?? null,
    version: tool.version ?? null,
    is_active: tool.is_active ?? null,
    admin_only: tool.admin_only ?? null,
    tags: tool.tags ?? null,
    param_count: toolParamCount(tool),
  };
}

export function toolSummary(tool: ToolLike): string {
  const flags = [
    tool.is_active === false ? "inactive" : "active",
    tool.admin_only ? "admin-only" : null,
    tool.source_kind ?? null,
    tool.tier ?? null,
  ].filter(Boolean);
  const lines = [
    `${tool.name} (${flags.join(" · ")})`,
    tool.description || "no description",
    `category: ${tool.category ?? "—"} · group: ${tool.tool_group ?? "—"} · params: ${toolParamCount(tool)}${tool.tags?.length ? ` · tags: ${tool.tags.join(", ")}` : ""}`,
  ];
  return lines.join("\n");
}

// ═══════════════════════════════════════════════════════════════════════════
// THE EDITOR FORMS — ToolEditPage / ToolCreatePage
// ═══════════════════════════════════════════════════════════════════════════
//
// Wired 2026-08-15. These are the two surfaces on this feature where THE
// WHAT-I-SEE LAW bites hardest: every input is bound to a single in-memory
// draft, the JSON textareas render live red "JSON Error: …" text, and three
// distinct conditions block Save. A payload built from the fetched row would
// miss the draft, the errors, AND the reason Save is refusing — i.e. all
// three things the user would be asking an agent about.

/**
 * The editable surface of a tool definition, live or saved. Deliberately
 * looser than `ToolLike`: the create form has no `id` yet and types `version`
 * as a semver string, so the shared builders must accept both shapes.
 */
export interface ToolEditorFields {
  id?: string;
  name?: string;
  description?: string | null;
  category?: string | null;
  source_kind?: string | null;
  version?: number | string | null;
  is_active?: boolean | null;
  tags?: string[] | null;
  icon?: string | null;
  managed_by_server_id?: string | null;
  parameters?: unknown;
  output_schema?: unknown;
  annotations?: unknown;
}

export type ToolEditorRecord = ToolEditorFields & Record<string, unknown>;

/**
 * The tool's identity chips as the editor renders them. This surface has no
 * numeric KPI tiles, so these are what it leads with, and every payload from
 * it carries them in the body AND envelope attributes per the page-KPI rule.
 * Built from the LIVE draft, because the form edits every one of them.
 */
export function toolChips(
  tool: ToolEditorFields,
): Record<string, string | number> {
  return {
    name: tool.name || "(unnamed)",
    source_kind: tool.source_kind ?? "—",
    version: tool.version ?? "—",
    active: tool.is_active === false ? "inactive" : "active",
    category: tool.category ?? "—",
    params: paramCountOf(tool.parameters),
  };
}

export interface ToolEditorView {
  mode: "edit" | "create";
  /** The live draft every input is bound to — what is on screen. */
  draft: ToolEditorRecord;
  /** The saved row (edit), or null (create — nothing exists server-side yet). */
  saved: ToolEditorRecord | null;
  activeTab: string;
  isSaving: boolean;
  /** Live JSON parse errors, keyed by field — rendered red beside each box. */
  jsonErrors: Record<string, string>;
  /** Display name of the linked MCP server, when one is selected. */
  mcpServerName: string | null;
}

/** Fields both editors bind inputs to, in the order the form presents them. */
const EDITOR_FIELDS: { field: string; label: string; json?: boolean }[] = [
  { field: "name", label: "Tool Name" },
  { field: "category", label: "Category" },
  { field: "description", label: "Description" },
  { field: "source_kind", label: "Source Kind" },
  { field: "managed_by_server_id", label: "MCP Server" },
  { field: "icon", label: "Icon" },
  { field: "version", label: "Version" },
  { field: "is_active", label: "Active" },
  { field: "tags", label: "Tags" },
  { field: "parameters", label: "Parameters Schema", json: true },
  { field: "output_schema", label: "Output Schema", json: true },
  { field: "annotations", label: "Annotations", json: true },
];

const showField = (value: unknown, json?: boolean): string => {
  if (value === null || value === undefined || value === "") return "(empty)";
  if (Array.isArray(value) && !json) return value.join(", ") || "(empty)";
  if (json || typeof value === "object") return JSON.stringify(value);
  return String(value);
};

/**
 * Exactly what `handleSave` refuses on, with the toast copy verbatim. These
 * are the sentences the user is looking at when they ask for help, so they
 * lead the payload.
 */
export function toolEditorSaveBlockers(
  view: ToolEditorView,
): { field: string; message: string }[] {
  const blockers: { field: string; message: string }[] = [];
  const draft = view.draft;

  if (!draft.name || !draft.description) {
    blockers.push({
      field: "name/description",
      message: "Missing required fields — Name and Description are required.",
    });
  }
  if (draft.source_kind === "mcp_discovered" && !draft.managed_by_server_id) {
    blockers.push({
      field: "managed_by_server_id",
      message:
        "MCP server required — Tools with source_kind=mcp_discovered must be linked to an MCP server.",
    });
  }
  if (Object.keys(view.jsonErrors).length > 0) {
    blockers.push({
      field: Object.keys(view.jsonErrors).join(", "),
      message: "Fix JSON errors before saving",
    });
  }
  return blockers;
}

/** Per-field diff of the live draft against the saved row (edit mode only). */
export function toolEditorUnsavedChanges(view: ToolEditorView): string[] {
  if (view.mode === "create" || !view.saved) return [];
  const saved = view.saved;
  return EDITOR_FIELDS.filter(({ field, json }) => {
    const live = view.draft[field];
    const was = saved[field];
    return json || typeof live === "object"
      ? JSON.stringify(live ?? null) !== JSON.stringify(was ?? null)
      : (live ?? "") !== (was ?? "");
  }).map(
    ({ field, label, json }) =>
      `${label}: ${showField(saved[field], json)} → ${showField(view.draft[field], json)}`,
  );
}

export function toolEditorHuman(view: ToolEditorView): string {
  const chips = toolChips(view.draft);
  const blockers = toolEditorSaveBlockers(view);
  const unsaved = toolEditorUnsavedChanges(view);
  const jsonErrorLines = Object.entries(view.jsonErrors).map(
    ([field, message]) => `${field}: JSON Error: ${message}`,
  );

  const lines: string[] = [
    view.mode === "create"
      ? "New tool definition (not yet created)"
      : `Editing tool ${view.saved?.name ?? view.draft.name}`,
    Object.entries(chips)
      .map(([key, value]) => `${key.replaceAll("_", " ")}: ${value}`)
      .join(" · "),
    `Tab: ${view.activeTab}`,
  ];

  // Errors first — the highest-value content on the surface.
  if (jsonErrorLines.length > 0) {
    lines.push(
      "",
      `JSON ERRORS SHOWN (${jsonErrorLines.length}):`,
      ...jsonErrorLines.map((line) => `• ${line}`),
      "  (These boxes do not parse — the values listed below for those fields",
      "   are the last ones that parsed, not the text currently on screen.)",
    );
  }
  if (blockers.length > 0) {
    lines.push(
      "",
      `SAVE IS BLOCKED (${blockers.length}):`,
      ...blockers.map((blocker) => `• ${blocker.message}`),
    );
  } else {
    lines.push("", "Save is enabled.");
  }

  lines.push(
    "",
    view.mode === "create"
      ? "Form values (LIVE — nothing has been created yet):"
      : "Form values (LIVE — may include unsaved edits):",
    ...EDITOR_FIELDS.filter(
      ({ field }) =>
        field !== "managed_by_server_id" ||
        view.draft.source_kind === "mcp_discovered",
    ).map(({ field, label, json }) => {
      const value =
        field === "managed_by_server_id" && view.mcpServerName
          ? view.mcpServerName
          : showField(view.draft[field], json);
      return `- ${label}: ${value}`;
    }),
  );

  if (unsaved.length > 0) {
    lines.push(
      "",
      `UNSAVED CHANGES (${unsaved.length}) — not written until "Save Tool":`,
      ...unsaved.map((change) => `• ${change}`),
    );
  } else if (view.mode === "edit") {
    lines.push("", "No unsaved changes.");
  }

  if (view.isSaving) lines.push("", "Saving…");
  return lines.join("\n");
}

export function toolEditorAgentPayload(
  view: ToolEditorView,
): AgentPayloadInput {
  const chips = toolChips(view.draft);
  const blockers = toolEditorSaveBlockers(view);
  const unsaved = toolEditorUnsavedChanges(view);

  return {
    kind: view.mode === "create" ? "mcp-tool-create-form" : "mcp-tool-edit-form",
    location:
      view.mode === "create"
        ? "AI Matrx Admin — Tool Registry · New tool (/administration/agents/mcp-tools/new)"
        : `AI Matrx Admin — Tool Registry · Edit tool (/administration/agents/mcp-tools/${view.saved?.id ?? view.draft.id}/edit)`,
    description:
      view.mode === "create"
        ? "The new-tool form as the user sees it: the LIVE draft in every input, the JSON errors rendered beside the schema boxes, and every condition currently blocking Create."
        : "The tool editor as the user sees it: the LIVE draft in every input (which may differ from the saved definition), an explicit unsaved-changes diff, the JSON errors rendered beside the schema boxes, and every condition currently blocking Save.",
    data: {
      mode: view.mode,
      tool_id: view.mode === "edit" ? (view.saved?.id ?? null) : null,
      // The identity chips this page leads with, from the LIVE draft.
      page_kpis: chips,
      active_tab: view.activeTab,
      // Errors first: the exact red text rendered beside each JSON textarea,
      // plus every reason the Save button will refuse.
      json_errors: Object.entries(view.jsonErrors).map(([field, message]) => ({
        field,
        rendered_text: `JSON Error: ${message}`,
        // `setJsonField` only commits to the draft on a SUCCESSFUL parse, so
        // while this error stands the value reported for `field` below is the
        // last one that parsed — NOT the unparseable text on screen. Say so
        // rather than let the agent read a stale object as current.
        caveat:
          "The text in this box does not parse. The value shown for this field is the last successfully parsed one, not what is currently typed.",
      })),
      save_blocked: blockers.length > 0,
      save_blockers: blockers,
      form: {
        note:
          view.mode === "create"
            ? // access-errors: ok — create-mode form hint about an unsaved draft, a verified local state
              "LIVE input values at copy time — this tool does NOT exist yet."
            : 'LIVE input values at copy time — NOT written until "Save Tool" succeeds.',
        name: view.draft.name,
        description: view.draft.description,
        category: view.draft.category,
        source_kind: view.draft.source_kind,
        managed_by_server_id: view.draft.managed_by_server_id ?? null,
        managed_by_server_name: view.mcpServerName,
        icon: view.draft.icon ?? null,
        version: view.draft.version,
        is_active: view.draft.is_active,
        tags: view.draft.tags ?? [],
        parameters: view.draft.parameters,
        output_schema: view.draft.output_schema ?? null,
        annotations: view.draft.annotations ?? null,
        unsaved_changes: unsaved,
        saving: view.isSaving,
      },
      saved_definition:
        view.mode === "edit" && view.saved
          ? {
              note: "The definition as last fetched — the baseline for the diff above.",
              id: view.saved.id ?? null,
              name: view.saved.name ?? null,
              description: view.saved.description ?? null,
              category: view.saved.category ?? null,
              source_kind: view.saved.source_kind ?? null,
              version: view.saved.version ?? null,
              is_active: view.saved.is_active ?? null,
              tags: view.saved.tags ?? null,
              param_count: paramCountOf(view.saved.parameters),
            }
          : null,
    },
    summary: toolEditorHuman(view),
    attributes: {
      ...chips,
      mode: view.mode,
      id: view.mode === "edit" ? (view.saved?.id ?? null) : null,
      tab: view.activeTab,
      unsaved_changes: unsaved.length,
      json_errors: Object.keys(view.jsonErrors).length,
      save_blocked: blockers.length > 0,
    },
  };
}

/** One line per tool for whole-list human copy. */
export function toolsListSummary(tools: ToolLike[]): string {
  return tools
    .map(
      (t) =>
        `${t.name} · ${t.category ?? "—"} · ${t.source_kind ?? "—"} · ${t.is_active === false ? "inactive" : "active"} · ${t.description ?? ""}`.trim(),
    )
    .join("\n");
}
