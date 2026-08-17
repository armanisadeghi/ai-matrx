import type {
  AgentDefinition,
  AgentDefinitionRecord,
  VariableDefinition,
} from "@/features/agents/types/agent-definition.types";
import type {
  ChangeType,
  DiffNode,
  DiffResult,
} from "@/components/diff/engine/types";
import type { AgentVersionHistoryItem } from "@/features/agents/redux/agent-definition/thunks";

/**
 * Human-readable, multi-line summary of a full agent definition — the "Copy"
 * (human) flavor shared by every agent-detail surface (currently
 * `AgentViewContent`). The AI flavor dumps the full definition as JSON via
 * `buildAgentPayload`, so this only needs to cover the fields a human scans.
 */
export function agentDefinitionSummary(
  agent: AgentDefinition,
  opts?: {
    liveAgentId?: string;
    currentVersionId?: string | null;
    modelLabel?: string | null;
  },
): string {
  const entityLabel = agent.agentType === "builtin" ? "System Agent" : "Agent";
  const lines: string[] = [
    `${entityLabel}: ${agent.name}`,
    `Agent ID: ${opts?.liveAgentId ?? agent.id}`,
  ];
  if (agent.version != null) lines.push(`Version: ${agent.version}`);
  if (opts?.currentVersionId) {
    lines.push(`Current Version ID: ${opts.currentVersionId}`);
  }
  if (agent.description) lines.push(`Description: ${agent.description}`);
  if (agent.category) lines.push(`Category: ${agent.category}`);
  const modelLabel =
    opts?.modelLabel ??
    (agent.modelId ? `Unknown AI model (${agent.modelId})` : null);
  if (modelLabel) lines.push(`Model: ${modelLabel}`);
  if (agent.tags?.length) lines.push(`Tags: ${agent.tags.join(", ")}`);

  lines.push(
    "",
    `Settings: ${Object.keys(agent.settings ?? {}).length}`,
    `Variables: ${agent.variableDefinitions?.length ?? 0}`,
    `Context policies: ${agent.contextPolicies?.length ?? 0}`,
    `Tools: ${(agent.tools?.length ?? 0) + (agent.customTools?.length ?? 0)}`,
    `MCP servers: ${agent.mcpServers?.length ?? 0}`,
    `Messages: ${agent.messages?.length ?? 0}`,
  );

  const statusBits = [
    agent.isActive ? "active" : "inactive",
    agent.isArchived ? "archived" : null,
  ].filter(Boolean);
  lines.push("", `Status: ${statusBits.join(", ")}`);
  if (agent.isVersion && agent.changeNote) {
    lines.push(`Change note: ${agent.changeNote}`);
  }

  return lines.join("\n");
}

/**
 * Compact roster projection for a builtin (system) agent — the single shape
 * behind both `SystemAgentsGrid`'s surface-registry scope emitter and its
 * "Roster summary" Copy-for-AI variant. Never duplicate this projection.
 */
export interface SystemAgentRosterEntry {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  tags: string[] | null;
  model_id: string | null;
  model_name: string | null;
  is_active: boolean | null;
  is_archived: boolean | null;
  updated_at: string | null;
}

export function buildSystemAgentRosterEntries(
  agents: AgentDefinitionRecord[],
  modelNameById?: ReadonlyMap<string, string>,
): SystemAgentRosterEntry[] {
  return agents.map((a) => ({
    id: a.id,
    name: a.name,
    description: a.description ?? null,
    category: a.category ?? null,
    tags: a.tags ?? null,
    model_id: a.modelId ?? null,
    model_name: a.modelId ? (modelNameById?.get(a.modelId) ?? null) : null,
    is_active: a.isActive ?? null,
    is_archived: a.isArchived ?? null,
    updated_at: a.updatedAt ?? null,
  }));
}

/** One scannable line per roster entry — used for both the per-card human
 *  copy and the whole-roster human copy-all. */
export function systemAgentRosterEntrySummary(
  entry: SystemAgentRosterEntry,
): string {
  return [
    entry.name,
    entry.category ? `(${entry.category})` : null,
    entry.model_id
      ? `model:${entry.model_name ?? "Unknown AI model"} (${entry.model_id})`
      : null,
    entry.is_active === false ? "[inactive]" : null,
    entry.is_archived ? "[archived]" : null,
  ]
    .filter(Boolean)
    .join(" ");
}

// ---------------------------------------------------------------------------
// Agent version diff — `features/agents/components/diff/AgentVersionDiffPage`
//
// THE WHAT-I-SEE LAW: a user copying a version diff is asking an agent "what
// changed, and is it safe to promote?". The payload is therefore the RENDERED
// DIFF converted to data — the same per-field rows `DiffViewerShell` draws,
// through the same adapter labels and summary text — never two raw record
// dumps for the agent to re-diff.
// ---------------------------------------------------------------------------

/**
 * The stats strip `DiffViewerShell` leads its toolbar with (`+2 added ·
 * -1 removed · ~3 modified · 40 unchanged`, or "No changes"). Every payload
 * on the diff page carries these numbers verbatim, in the body AND the
 * envelope attributes, so the agent never recomputes what the user is
 * already looking at.
 */
export interface AgentVersionDiffKpis {
  added: number;
  removed: number;
  modified: number;
  unchanged: number;
  fields_compared: number;
  changed_fields: number;
  has_changes: boolean;
}

export function agentVersionDiffKpis(diff: DiffResult): AgentVersionDiffKpis {
  return {
    added: diff.stats.added,
    removed: diff.stats.removed,
    modified: diff.stats.modified,
    unchanged: diff.stats.unchanged,
    fields_compared: diff.stats.total,
    changed_fields: diff.root.filter((n) => n.changeType !== "unchanged")
      .length,
    has_changes: diff.hasChanges,
  };
}

/** The stats strip rendered as the one line the toolbar shows. */
export function agentVersionDiffStatsLine(kpis: AgentVersionDiffKpis): string {
  if (!kpis.has_changes) return "No changes";
  return [
    kpis.added > 0 ? `+${kpis.added} added` : null,
    kpis.removed > 0 ? `-${kpis.removed} removed` : null,
    kpis.modified > 0 ? `~${kpis.modified} modified` : null,
    kpis.unchanged > 0 ? `${kpis.unchanged} unchanged` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * How the diff view names and describes one field. Supplied by the callsite
 * from the SAME adapter registry + enrichment context the viewer renders
 * with, so the payload mirrors the view's own extractor instead of
 * re-deriving labels and status text.
 */
export interface AgentDiffFieldRenderer {
  /** The field label the viewer shows (adapter label, falling back to key). */
  label: (node: DiffNode) => string;
  /** The exact status line the Summary tab renders for this field. */
  summaryText: (node: DiffNode) => string;
}

/** One nested change under a field, as the expanded field row shows it. */
export interface AgentVersionDiffChildChange {
  path: string;
  key: string;
  change: ChangeType;
  old_value?: unknown;
  new_value?: unknown;
}

/** One changed field, exactly as the Changes / Summary tabs render it. */
export interface AgentVersionDiffFieldChange {
  field: string;
  label: string;
  change: ChangeType;
  /** The Summary tab's per-field text ("3 messages → 4 messages"). */
  summary: string;
  old_value?: unknown;
  new_value?: unknown;
  changed_children?: AgentVersionDiffChildChange[];
}

function pathString(path: string[]): string {
  return path.reduce((acc, segment, i) => {
    if (i === 0) return segment;
    if (/^\d+$/.test(segment)) return `${acc}[${segment}]`;
    return `${acc}.${segment}`;
  }, "");
}

function collectChangedChildren(
  node: DiffNode,
  includeValues: boolean,
  depth = 0,
): AgentVersionDiffChildChange[] {
  if (!node.children?.length || depth > 3) return [];
  const out: AgentVersionDiffChildChange[] = [];
  for (const child of node.children) {
    if (child.changeType === "unchanged") continue;
    out.push({
      path: pathString(child.path),
      key: child.key,
      change: child.changeType,
      ...(includeValues
        ? { old_value: child.oldValue, new_value: child.newValue }
        : {}),
    });
    out.push(...collectChangedChildren(child, includeValues, depth + 1));
  }
  return out;
}

/**
 * The changed-field rows the diff view renders, as data. `includeValues`
 * maps to the page's own view modes: `true` is the Changes tab (values on
 * screen), `false` is the Summary tab (field · status · one-liner).
 */
export function buildAgentVersionDiffChanges(
  diff: DiffResult,
  renderer: AgentDiffFieldRenderer,
  opts?: { includeValues?: boolean },
): AgentVersionDiffFieldChange[] {
  const includeValues = opts?.includeValues ?? true;
  return diff.root
    .filter((node) => node.changeType !== "unchanged")
    .map((node) => {
      const children = collectChangedChildren(node, includeValues);
      return {
        field: node.key,
        label: renderer.label(node),
        change: node.changeType,
        summary: renderer.summaryText(node),
        ...(includeValues
          ? { old_value: node.oldValue, new_value: node.newValue }
          : {}),
        ...(children.length ? { changed_children: children } : {}),
      };
    });
}

/** Which two things the toolbar's two selects are comparing. */
export interface AgentVersionDiffSides {
  left: {
    label: string;
    version: number | null;
    version_id: string | null;
    changed_at: string | null;
    change_note: string | null;
  };
  right: {
    label: string;
    version: number | "current";
    is_live_current: boolean;
  };
}

/** The whole diff surface as data — what the user sees, not what was fetched. */
export interface AgentVersionDiffView {
  agent: { id: string; name: string | null; live_version: number | null };
  comparing: AgentVersionDiffSides;
  direction: string;
  kpis: AgentVersionDiffKpis;
  stats_line: string;
  active_tab: "compare" | "history";
  /** True when the toolbar offers "Promote v<n>" for the left version. */
  promote_offered: boolean;
  versions_in_history: number;
  changed_fields: AgentVersionDiffFieldChange[];
  /** Labels of the fields the strip counts as unchanged. */
  unchanged_fields: string[];
}

export function buildAgentVersionDiffView(input: {
  agentId: string;
  agentName: string | null;
  liveVersion: number | null;
  sides: AgentVersionDiffSides;
  diff: DiffResult;
  renderer: AgentDiffFieldRenderer;
  activeTab: "compare" | "history";
  promoteOffered: boolean;
  versionsInHistory: number;
  includeValues?: boolean;
}): AgentVersionDiffView {
  const kpis = agentVersionDiffKpis(input.diff);
  return {
    agent: {
      id: input.agentId,
      name: input.agentName,
      live_version: input.liveVersion,
    },
    comparing: input.sides,
    direction: `${input.sides.left.label} → ${input.sides.right.label}`,
    kpis,
    stats_line: agentVersionDiffStatsLine(kpis),
    active_tab: input.activeTab,
    promote_offered: input.promoteOffered,
    versions_in_history: input.versionsInHistory,
    changed_fields: buildAgentVersionDiffChanges(input.diff, input.renderer, {
      includeValues: input.includeValues,
    }),
    unchanged_fields: input.diff.root
      .filter((n) => n.changeType === "unchanged")
      .map((n) => input.renderer.label(n)),
  };
}

/** The human "Copy" flavor of a rendered version diff. */
export function agentVersionDiffSummary(view: AgentVersionDiffView): string {
  const lines: string[] = [
    `Agent version diff: ${view.agent.name ?? view.agent.id}`,
    `Agent ID: ${view.agent.id}`,
    `Comparing: ${view.direction}`,
    `Changes: ${view.stats_line}`,
  ];
  if (view.comparing.left.changed_at) {
    lines.push(`Left version saved: ${view.comparing.left.changed_at}`);
  }
  if (view.comparing.left.change_note) {
    lines.push(`Left change note: ${view.comparing.left.change_note}`);
  }
  if (view.promote_offered && view.comparing.left.version != null) {
    lines.push(`Promote offered: v${view.comparing.left.version} → current`);
  }

  lines.push("", `Changed fields (${view.changed_fields.length}):`);
  if (view.changed_fields.length === 0) {
    lines.push("- none — the two versions match on every compared field");
  } else {
    for (const change of view.changed_fields) {
      lines.push(`- ${change.label} — ${change.summary}`);
      for (const child of change.changed_children ?? []) {
        lines.push(`    · ${child.path}: ${child.change}`);
      }
    }
  }
  if (view.unchanged_fields.length) {
    lines.push(
      "",
      `Unchanged (${view.unchanged_fields.length}): ${view.unchanged_fields.join(", ")}`,
    );
  }
  return lines.join("\n");
}

/**
 * The instruction brief wrapped around a version-diff payload. A user copying
 * a diff has exactly one question, and this is it — see the Error Inspector
 * "with prompt" sibling-variant pattern.
 */
export function agentVersionDiffReviewPrompt(payload: string): string {
  return [
    "I am looking at a version diff for an AI agent definition and I need to know",
    "what changed and whether it is safe to promote.",
    "",
    "Using ONLY the rendered diff below (it is the exact per-field diff on my",
    "screen, through the same field labels the UI shows):",
    "",
    "1. Summarize what actually changed, in plain language, most significant first.",
    "2. Flag anything that could change the agent's BEHAVIOR at runtime — model,",
    "   messages/system prompt, tools, MCP servers, settings, output schema,",
    "   variables, context policies.",
    "3. Call out anything risky, destructive, or likely unintentional (a removed",
    "   tool, a truncated prompt, a loosened gate, a swapped model tier).",
    "4. Give me a clear verdict: safe to promote, or not — and why.",
    "",
    "<version_diff>",
    payload,
    "</version_diff>",
    "",
    "Remember: base the verdict only on the diff above. If a field's change is",
    "ambiguous from what is shown, say so instead of guessing.",
  ].join("\n");
}

/** One version-history row, as the History tab's table renders it. */
export interface AgentVersionHistoryRow {
  version: number;
  version_id: string;
  name: string;
  changed_at: string;
  change_note: string;
  is_current: boolean;
}

export function buildAgentVersionHistoryRows(
  versions: AgentVersionHistoryItem[],
  currentVersion: number | null,
): AgentVersionHistoryRow[] {
  return versions.map((v) => ({
    version: v.version_number,
    version_id: v.version_id,
    name: v.name,
    changed_at: v.changed_at,
    change_note: v.change_note,
    is_current: currentVersion != null && v.version_number === currentVersion,
  }));
}

/** Flat CSV-shaped rows — ALL versions, never the visible slice. */
export function agentVersionHistoryCsvRows(
  rows: AgentVersionHistoryRow[],
): Array<Record<string, unknown>> {
  return rows.map((row) => ({
    version: row.version,
    is_current: row.is_current,
    changed_at: row.changed_at,
    change_note: row.change_note,
    name: row.name,
    version_id: row.version_id,
  }));
}

export function agentVersionHistoryRowSummary(
  row: AgentVersionHistoryRow,
): string {
  return [
    `v${row.version}`,
    row.is_current ? "(current)" : null,
    row.changed_at,
    row.change_note || null,
    `id:${row.version_id}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

// ---------------------------------------------------------------------------
// Agent widget tester — `features/agents/components/widgets/AgentWidgetsPage`
//
// A pure local-state harness: the on-screen form IS the payload. LIVE state
// only — copying the fetched agent record after the user filled in variables
// would be lying to the agent about what is on screen.
// ---------------------------------------------------------------------------

/** The counts this page leads with ("N defined" beside the Variables label). */
export interface AgentWidgetTesterKpis {
  variables_defined: number;
  variables_filled: number;
  required_variables: number;
  required_unfilled: number;
  user_input_chars: number;
  editor_context_included: boolean;
  has_json_error: boolean;
}

export function agentWidgetTesterKpis(input: {
  definitions: VariableDefinition[];
  values: Record<string, unknown>;
  userInput: string;
  includeEditorContext: boolean;
  jsonError: string | null;
}): AgentWidgetTesterKpis {
  const filled = (def: VariableDefinition) => {
    const value = input.values[def.name];
    return value !== undefined && value !== null && value !== "";
  };
  const required = input.definitions.filter((d) => d.required);
  return {
    variables_defined: input.definitions.length,
    variables_filled: input.definitions.filter(filled).length,
    required_variables: required.length,
    required_unfilled: required.filter((d) => !filled(d)).length,
    user_input_chars: input.userInput.length,
    editor_context_included: input.includeEditorContext,
    has_json_error: Boolean(input.jsonError),
  };
}

/** One variable row as `WidgetVariableInputs` renders it. */
export interface AgentWidgetVariableRow {
  name: string;
  required: boolean;
  help_text: string | null;
  input_kind: "number" | "text";
  default_value: unknown;
  /** The value currently typed into the input — LIVE, not the saved default. */
  current_value: unknown;
  filled: boolean;
  bound_to_context_item: string | null;
}

export function buildAgentWidgetVariableRows(
  definitions: VariableDefinition[],
  values: Record<string, unknown>,
): AgentWidgetVariableRow[] {
  return definitions.map((def) => {
    const current = values[def.name];
    return {
      name: def.name,
      required: Boolean(def.required),
      help_text: def.helpText ?? null,
      input_kind:
        def.customComponent?.type === "number" ||
        def.customComponent?.type === "slider"
          ? "number"
          : "text",
      default_value: def.defaultValue,
      current_value: current,
      filled: current !== undefined && current !== null && current !== "",
      bound_to_context_item: def.binding?.itemKey ?? null,
    };
  });
}

/** The human "Copy" flavor of the widget tester's live on-screen state. */
export function agentWidgetTesterSummary(input: {
  agentId: string;
  agentName: string;
  kpis: AgentWidgetTesterKpis;
  variables: AgentWidgetVariableRow[];
  userInput: string;
  jsonError: string | null;
  isLoading: boolean;
  displayModes: string[];
}): string {
  const lines: string[] = [
    `Agent widget tester: ${input.agentName}`,
    `Agent ID: ${input.agentId}`,
    input.isLoading
      ? "State: loading agent definition…"
      : `Variables: ${input.kpis.variables_filled}/${input.kpis.variables_defined} filled` +
        (input.kpis.required_unfilled > 0
          ? ` (${input.kpis.required_unfilled} required still empty)`
          : ""),
    `Launchable display modes: ${input.displayModes.join(", ") || "none"}`,
  ];

  if (input.jsonError) {
    lines.push("", `ERROR ON SCREEN: ${input.jsonError}`);
  }

  if (input.variables.length) {
    lines.push("", "Variable values (live, as typed):");
    for (const row of input.variables) {
      lines.push(
        `- ${row.name}${row.required ? " *" : ""}: ${
          row.filled ? JSON.stringify(row.current_value) : "(empty)"
        }`,
      );
    }
  } else {
    lines.push("", "This agent has no variable definitions.");
  }

  lines.push(
    "",
    input.userInput ? `User input:\n${input.userInput}` : "User input: (empty)",
  );
  return lines.join("\n");
}
