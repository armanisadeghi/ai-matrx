/**
 * Shared human/agent formatters for the MCP tools admin surfaces
 * (McpToolsManager list + ToolViewPage record).
 *
 * SECURITY: same posture as the `matrx-admin/tool-registry` surface manifest —
 * definition metadata only; no MCP endpoint URLs, auth strategies, OAuth ids,
 * or vault credentials.
 */

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

export function toolParamCount(tool: ToolLike): number {
  const params = tool.parameters;
  if (params && typeof params === "object" && !Array.isArray(params)) {
    const props = (params as Record<string, unknown>).properties;
    if (props && typeof props === "object" && !Array.isArray(props)) {
      return Object.keys(props).length;
    }
  }
  return 0;
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

/** One line per tool for whole-list human copy. */
export function toolsListSummary(tools: ToolLike[]): string {
  return tools
    .map(
      (t) =>
        `${t.name} · ${t.category ?? "—"} · ${t.source_kind ?? "—"} · ${t.is_active === false ? "inactive" : "active"} · ${t.description ?? ""}`.trim(),
    )
    .join("\n");
}
