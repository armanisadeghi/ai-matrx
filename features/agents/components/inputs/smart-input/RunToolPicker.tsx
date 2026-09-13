"use client";

/**
 * RunToolPicker — the Smart Input's Tools tab. Two stacked sections:
 *
 *   1. "This agent's tools" — the agent's REAL configured tool set, read live
 *      from the agentDefinition slice (built-in registry tools resolved to
 *      names + custom tools + MCP servers). Read-only here; this is the agent's
 *      saved definition, edited in the Agent Builder, not per-conversation.
 *      Rendered as ONE collapsible header row (count + auto-injection state
 *      always visible) so the actionable add-list below gets the space.
 *
 *   2. "Add tools to this run" — additive registry picks stored on
 *      `builderAdvancedSettings.addedTools`, folded into the request by
 *      `buildToolInjection`. Per-conversation, ephemeral, on TOP of the
 *      agent's own tools.
 *
 * Before this rework the tab showed ONLY the add-picker against the full
 * registry and never reflected the agent's actual tools — model/settings were
 * snapshotted into the instance but tools never were, so there was nothing
 * "real" to show. We read the agent definition directly here instead.
 */

import { useEffect, useState } from "react";
import {
  Search,
  X,
  Check,
  ChevronDown,
  ChevronRight,
  Wrench,
  Code2,
  Server,
  ShieldOff,
  AlertTriangle,
  Plus,
  RefreshCw,
} from "lucide-react";
import type { DatabaseTool } from "@/utils/supabase/tools-service";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { ProInput } from "@/components/official/ProInput";
import { cn } from "@/lib/utils";
import {
  selectAllTools,
  selectToolsStatus,
} from "@/features/agents/redux/tools/tools.selectors";
import { fetchAvailableTools } from "@/features/agents/redux/tools/tools.thunks";
import {
  selectAgentTools,
  selectAgentCustomTools,
  selectAgentMcpServers,
  selectAgentAutoToolsDisabled,
  selectAgentReadyForCustomExecution,
} from "@/features/agents/redux/agent-definition/selectors";
import { fetchAgentExecutionFull } from "@/features/agents/redux/agent-definition/thunks";
import { selectAgentIdFromInstance } from "@/features/agents/redux/execution-system/conversations/conversations.selectors";
import {
  selectAllModels,
  selectModelFullyLoaded,
  fetchModelById,
} from "@/features/ai-models/redux/modelRegistrySlice";
import {
  useModelControls,
  supportsTools,
} from "@/features/agents/hooks/useModelControls";
import { selectInstanceOverrideState } from "@/features/agents/redux/execution-system/instance-model-overrides/instance-model-overrides.selectors";
import { selectBuilderAdvancedSettings } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import { setBuilderAdvancedSettings } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.slice";
import { DEFAULT_BUILDER_ADVANCED_SETTINGS } from "@/features/agents/types/instance.types";
import { filterAndSortBySearch } from "@ai-matrx/kit/search-scoring";
import { useMcpCatalog } from "@/features/agents/hooks/useMcpTools";
import type { McpServerState } from "@/features/agents/hooks/useMcpTools";
import { MCP_STATE_LABEL } from "@/features/connectors/connection-state";
import {
  indexRunMcpAttachments,
  mcpChipPresentation,
  readRunMcpAttachments,
  type RunMcpAttachment,
} from "@/features/connectors/run-attachments";
import { useConnectMcpServer } from "@/features/connectors/useConnectMcpServer";
import { selectPrimaryRequest } from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";

export function RunToolPicker({ conversationId }: { conversationId: string }) {
  const dispatch = useAppDispatch();
  const tools = useAppSelector(selectAllTools);
  const status = useAppSelector(selectToolsStatus);
  const { serverStates, availabilityStatus } = useMcpCatalog();
  const { connect: connectMcp, connectingSlug } = useConnectMcpServer();
  // What the LAST run actually got. A chip claims nothing the run denies.
  const primaryRequest = useAppSelector(selectPrimaryRequest(conversationId));
  const runAttachments = indexRunMcpAttachments(
    readRunMcpAttachments(
      primaryRequest?.infoEvents,
      primaryRequest?.warnings,
    ),
  );

  // The agent that owns this conversation — the source of the REAL tool set.
  const agentId = useAppSelector(selectAgentIdFromInstance(conversationId));
  const agentToolIds = useAppSelector((s) =>
    agentId ? selectAgentTools(s, agentId) : undefined,
  );
  const agentCustomTools = useAppSelector((s) =>
    agentId ? selectAgentCustomTools(s, agentId) : undefined,
  );
  const agentMcpServers = useAppSelector((s) =>
    agentId ? selectAgentMcpServers(s, agentId) : undefined,
  );
  const autoToolsDisabled = useAppSelector((s) =>
    agentId ? selectAgentAutoToolsDisabled(s, agentId) : false,
  );
  const agentReady = useAppSelector((s) =>
    agentId ? selectAgentReadyForCustomExecution(s, agentId) : false,
  );

  // Tool support is a MODEL capability — the server drops added tools for
  // models that can't use them. Read the effective (override ?? base) model for
  // this run and gate the add-picker so we don't offer tools that will be
  // silently dropped. Permissive default (see supportsTools).
  const overrideState = useAppSelector(
    selectInstanceOverrideState(conversationId),
  );
  const effectiveModelId =
    (overrideState?.overrides?.model as string | undefined) ??
    (overrideState?.baseSettings?.model as string | undefined) ??
    "";
  const models = useAppSelector(selectAllModels);
  const modelIsFull = useAppSelector((s) =>
    selectModelFullyLoaded(s, effectiveModelId),
  );
  const modelRegistryLoading = useAppSelector((s) => s.modelRegistry.isLoading);
  // The registry may hold only the lightweight "options" record (no controls).
  // Pull the full record so the capability read is accurate; the thunk no-ops
  // when already loaded.
  useEffect(() => {
    if (effectiveModelId && !modelIsFull && !modelRegistryLoading) {
      void dispatch(fetchModelById(effectiveModelId));
    }
  }, [effectiveModelId, modelIsFull, modelRegistryLoading, dispatch]);
  const { normalizedControls } = useModelControls(models, effectiveModelId);
  // Unknown model (none selected / not loaded) → permissive, don't gate.
  const modelSupportsTools = effectiveModelId
    ? supportsTools(normalizedControls)
    : true;

  const settings =
    useAppSelector(selectBuilderAdvancedSettings(conversationId)) ??
    DEFAULT_BUILDER_ADVANCED_SETTINGS;
  const addedList = settings.addedTools ?? [];
  const added = new Set(addedList);
  const addedMcpList = settings.addedMcpServers ?? [];
  const addedMcp = new Set(addedMcpList);
  const [search, setSearch] = useState("");
  // Accordion: one description open at a time keeps the list scannable.
  const [expandedToolId, setExpandedToolId] = useState<string | null>(null);
  // The agent's configured set is read-only reference — collapsed by default
  // so the actionable add-list owns the vertical space.
  const [agentSectionOpen, setAgentSectionOpen] = useState(false);
  // The public no-auth servers stay one click away rather than crowding out
  // the ones this person connected.
  const [showAllMcp, setShowAllMcp] = useState(false);

  // The registry catalog — needed to resolve the agent's tool UUIDs to names
  // AND to drive the add-picker. Load it once.
  useEffect(() => {
    if (status !== "succeeded" && status !== "loading") {
      void dispatch(fetchAvailableTools());
    }
  }, [status, dispatch]);

  // The agent's tools/customTools/mcp live in the customExecution payload,
  // which the chat path may not have fetched. Pull it on demand so the "real"
  // section isn't silently empty for a tool-carrying agent.
  useEffect(() => {
    if (agentId && !agentReady) {
      void dispatch(fetchAgentExecutionFull(agentId));
    }
  }, [agentId, agentReady, dispatch]);

  const setAdded = (next: string[]) =>
    dispatch(
      setBuilderAdvancedSettings({
        conversationId,
        changes: { addedTools: next },
      }),
    );

  const toggle = (id: string) =>
    setAdded(
      added.has(id) ? addedList.filter((t) => t !== id) : [...addedList, id],
    );

  const toggleMcp = (slug: string) =>
    dispatch(
      setBuilderAdvancedSettings({
        conversationId,
        changes: {
          addedMcpServers: addedMcp.has(slug)
            ? addedMcpList.filter((server) => server !== slug)
            : [...addedMcpList, slug],
        },
      }),
    );

  // Two tiers, because "usable" is far wider than "yours": dozens of public
  // no-auth servers are reachable by everyone, and dumping all of them here
  // would bury the handful this person actually set up. Tier one is the
  // user's own set — a connection on file, attached to this chat, or wanting
  // attention (an attached server must NEVER disappear because it broke).
  // Tier two is everything else that is genuinely usable, one click away.
  const myServers = serverStates.filter(
    (s) =>
      s.entry.connectionId !== null ||
      s.truth.state === "needs_reauth" ||
      addedMcp.has(s.entry.slug) ||
      Boolean(runAttachments[s.entry.slug]),
  );
  const otherServers = serverStates.filter(
    (s) => !myServers.includes(s) && s.truth.state === "connected",
  );
  const relevantServers = showAllMcp ? [...myServers, ...otherServers] : myServers;

  // No useMemo — React Compiler memoizes (CLAUDE.md core invariant).
  const list = tools ?? [];
  const toolMap = new Map(list.map((t) => [t.id, t]));

  const builtInIds = Array.isArray(agentToolIds) ? agentToolIds : [];
  const customList = Array.isArray(agentCustomTools) ? agentCustomTools : [];
  const mcpList = Array.isArray(agentMcpServers) ? agentMcpServers : [];
  const agentToolCount = builtInIds.length + customList.length + mcpList.length;

  const visible = !search.trim()
    ? // Selected first so the user can see/remove their picks at a glance.
      [
        ...list.filter((t) => added.has(t.id)),
        ...list.filter((t) => !added.has(t.id)),
      ]
    : filterAndSortBySearch(list, search, [
        { get: (t) => t.name, weight: "title" },
        { get: (t) => t.description, weight: "body" },
        { get: (t) => t.category, weight: "tag" },
      ]);

  const loadingEmpty = status === "loading" && (tools?.length ?? 0) === 0;
  const agentLoading = !!agentId && !agentReady;

  return (
    <div className="flex h-full flex-col">
      {/* ── Section 1: the agent's REAL configured tools (collapsible) ── */}
      <div className="shrink-0 border-b border-border">
        <button
          type="button"
          onClick={() => setAgentSectionOpen((o) => !o)}
          aria-expanded={agentSectionOpen}
          className="flex h-7 w-full items-center gap-1.5 px-2.5 text-left transition-colors hover:bg-accent/50"
        >
          <ChevronRight
            className={cn(
              "h-3 w-3 shrink-0 text-muted-foreground/70 transition-transform",
              agentSectionOpen && "rotate-90",
            )}
          />
          <Wrench className="h-3.5 w-3.5 shrink-0 text-primary" />
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            This agent&apos;s tools
          </span>
          <span className="text-[11px] tabular-nums text-muted-foreground/80">
            {agentLoading ? "…" : agentToolCount}
          </span>
          {agentId && (
            <span
              title={
                autoToolsDisabled
                  ? "Automatic tool injection is OFF — only the agent's configured tools run."
                  : "Automatic tool injection is ON — surface & capability tools may be added at run time."
              }
              className={cn(
                "ml-auto flex shrink-0 items-center gap-1 text-[11px]",
                autoToolsDisabled
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-muted-foreground/70",
              )}
            >
              <ShieldOff className="h-3 w-3" />
              {autoToolsDisabled ? "auto-inject off" : "auto-inject on"}
            </span>
          )}
        </button>

        {agentSectionOpen && (
          <div className="max-h-36 overflow-y-auto px-2.5 pb-1.5">
            {agentLoading ? (
              <p className="py-1 text-[11px] text-muted-foreground">
                Loading the agent&apos;s tools…
              </p>
            ) : agentToolCount === 0 ? (
              <p className="py-1 text-[11px] text-muted-foreground">
                This agent has no tools of its own.
                {!autoToolsDisabled &&
                  " Surface tools may still be added at run."}
              </p>
            ) : (
              <div className="flex flex-col gap-0.5">
                {builtInIds.map((id) => {
                  const t = toolMap.get(id);
                  return (
                    <AgentToolBadge
                      key={id}
                      icon={<Wrench className="h-3 w-3" />}
                      label={t?.name ?? id}
                      sub={t?.category ?? undefined}
                    />
                  );
                })}
                {customList.map((t) => (
                  <AgentToolBadge
                    key={t.name}
                    icon={<Code2 className="h-3 w-3" />}
                    label={t.name}
                    sub={t.description ?? "custom"}
                  />
                ))}
                {/* The agent's own MCP servers ride EVERY run, so their real
                    state belongs here too — a slug alone told the user
                    nothing about whether the agent can actually reach it. */}
                {mcpList.map((id) => {
                  const server = serverStates.find((s) => s.entry.slug === id);
                  const attachment = runAttachments[id];
                  const state = attachment?.state ?? server?.truth.state;
                  return (
                    <AgentToolBadge
                      key={id}
                      icon={<Server className="h-3 w-3" />}
                      label={server?.entry.name ?? id}
                      sub={
                        state === undefined
                          ? "MCP"
                          : state === "connected"
                            ? attachment?.toolCount != null
                              ? `MCP · ${attachment.toolCount} tools`
                              : "MCP · connected"
                            : `MCP · ${MCP_STATE_LABEL[state]}`
                      }
                      tone={
                        state === undefined || state === "connected"
                          ? "muted"
                          : "warning"
                      }
                    />
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Model-capability advisory — the selected model can't use tools; the
            server drops them all at run time. Non-blocking, always visible. */}
        {!modelSupportsTools && (
          <div className="flex items-start gap-1.5 border-t border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" />
            <span className="text-[11px] leading-tight text-amber-700 dark:text-amber-300">
              This model doesn&apos;t support tools — any tools above or added
              here are dropped at run time. Switch to a tool-capable model to use
              them.
            </span>
          </div>
        )}
      </div>

      {/* ── MCP servers for this chat — three honest states ────────────── */}
      {/* Every chip says what is actually true: Connected (usable now),
          Needs re-auth (with the door that fixes it), or Not connected. The
          Check icon means "attached to this chat AND connected" and nothing
          else — a checkmark over a dead connection is exactly what made the
          screen lie (Arman, 2026-09-13). Servers the user has no relationship
          with stay out of this list; the full catalog lives in Connections. */}
      {(relevantServers.length > 0 || otherServers.length > 0) && (
        <div className="shrink-0 border-b border-border px-2.5 py-2">
          <div className="mb-1 flex items-center gap-1.5">
            <Server className="h-3.5 w-3.5 text-primary" />
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Services for this chat
            </span>
          </div>
          <p className="mb-1.5 text-[11px] leading-tight text-muted-foreground">
            Add a connected MCP server to this conversation without changing
            the agent&apos;s saved definition.
          </p>
          {/* A stand-in announces itself: when the health check cannot be
              reached these states come from saved connection rows alone, and
              that is said out loud rather than passed off as the truth. */}
          {availabilityStatus === "failed" && (
            <p className="mb-1.5 flex items-start gap-1 text-[11px] leading-tight text-amber-600 dark:text-amber-400">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              Live connection health is unavailable right now — the states
              below come from your saved connections and may be out of date.
            </p>
          )}
          <div className="flex max-h-28 flex-wrap gap-1 overflow-y-auto">
            {relevantServers.map((server) => (
              <McpServerChip
                key={server.entry.serverId}
                server={server}
                attached={addedMcp.has(server.entry.slug)}
                runAttachment={runAttachments[server.entry.slug]}
                connecting={connectingSlug === server.entry.slug}
                onToggle={() => toggleMcp(server.entry.slug)}
                onReconnect={() => void connectMcp(server.entry)}
              />
            ))}
            {otherServers.length > 0 && (
              <button
                type="button"
                onClick={() => setShowAllMcp(!showAllMcp)}
                className="flex h-7 items-center gap-1 rounded-md border border-dashed border-border px-2 text-[11px] text-muted-foreground hover:bg-accent"
              >
                {showAllMcp
                  ? "Show fewer"
                  : `${otherServers.length} more available`}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Section 2: add registry tools to THIS run ─────────────────── */}
      {!modelSupportsTools ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-1.5 px-4 py-4 text-center">
          <p className="text-xs text-muted-foreground">
            Tools can&apos;t be added while this model is selected.
          </p>
          {/* Clear stays reachable so a user can clean up a set that would
              otherwise be silently dropped at run time. */}
          {added.size > 0 && (
            <button
              type="button"
              onClick={() => setAdded([])}
              className="text-[11px] text-muted-foreground hover:text-destructive"
            >
              Clear {added.size} added tool{added.size === 1 ? "" : "s"}
            </button>
          )}
        </div>
      ) : (
        <>
          {/* One-row header: search + added-count chip with inline clear. */}
          <div
            className="flex shrink-0 items-center gap-1.5 border-b border-border px-2 py-1.5"
            title="Add tools to this run — on top of the agent's own tools."
          >
            <ProInput
              enableCleanup={false}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tools to add…"
              startIcon={<Search className="h-3.5 w-3.5" />}
              clearable
              onClear={() => setSearch("")}
              enableVoice={false}
              wrapperClassName="min-w-0 flex-1"
              className="h-7"
            />
            {added.size > 0 && (
              <span className="flex h-6 shrink-0 items-center gap-1 rounded-full border border-primary/30 bg-primary/10 pl-2 pr-1 text-[11px] font-medium text-primary">
                {added.size} added
                <button
                  type="button"
                  onClick={() => setAdded([])}
                  title="Clear all added tools"
                  aria-label="Clear all added tools"
                  className="flex h-4 w-4 items-center justify-center rounded-full transition-colors hover:bg-primary/20"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}
          </div>

          {/* min-h-0: a flex child's default min-height:auto floors it at
              content height, so without it this list grows past the panel and
              never scrolls (the whole surface just gets clipped). */}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-0.5">
            {loadingEmpty ? (
              <p className="px-3 py-2 text-xs text-muted-foreground">
                Loading tools…
              </p>
            ) : visible.length === 0 ? (
              <p className="px-3 py-2 text-xs text-muted-foreground">
                {search ? `No tools match "${search}"` : "No tools available."}
              </p>
            ) : (
              visible.map((t) => (
                <ToolRow
                  key={t.id}
                  tool={t}
                  selected={added.has(t.id)}
                  expanded={expandedToolId === t.id}
                  onToggle={() => toggle(t.id)}
                  onToggleExpand={() =>
                    setExpandedToolId((cur) => (cur === t.id ? null : t.id))
                  }
                />
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** Compact read-only row for one of the agent's configured tools. */
function AgentToolBadge({
  icon,
  label,
  sub,
  tone = "muted",
}: {
  icon: React.ReactNode;
  label: string;
  sub?: string;
  /** `warning` marks a row whose backing connection is not usable right now. */
  tone?: "muted" | "warning";
}) {
  return (
    <div className="flex items-baseline gap-1.5 rounded bg-muted/40 px-1.5 py-0.5 text-[11px]">
      <span className="self-center text-muted-foreground">{icon}</span>
      <span className="min-w-0 flex-1 truncate font-medium text-foreground">
        {label}
      </span>
      {sub && (
        <span
          className={cn(
            "shrink-0 truncate text-[11px]",
            tone === "warning"
              ? "text-amber-600 dark:text-amber-400"
              : "text-muted-foreground/60",
          )}
        >
          {sub}
        </span>
      )}
    </div>
  );
}

/**
 * Single-line tool row: checkbox + name + expand chevron. Clicking the row
 * toggles selection; the chevron expands the full description below. The row
 * is a div[role=button] (not <button>) so the chevron can be a real button —
 * nested buttons are invalid HTML.
 */
function ToolRow({
  tool,
  selected,
  expanded,
  onToggle,
  onToggleExpand,
}: {
  tool: DatabaseTool;
  selected: boolean;
  expanded: boolean;
  onToggle: () => void;
  onToggleExpand: () => void;
}) {
  return (
    <div className={cn(selected && "bg-primary/5")}>
      <div
        role="button"
        tabIndex={0}
        aria-pressed={selected}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
        className="flex h-7 w-full cursor-pointer items-center gap-2 px-2.5 text-left transition-colors hover:bg-accent/60"
      >
        <span
          className={cn(
            "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border",
            selected
              ? "border-primary bg-primary text-primary-foreground"
              : "border-muted-foreground/40",
          )}
        >
          {selected && <Check className="h-2.5 w-2.5" />}
        </span>
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
          {tool.name}
        </span>
        {tool.description && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand();
            }}
            aria-expanded={expanded}
            aria-label={expanded ? "Hide description" : "Show description"}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground"
          >
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 transition-transform",
                expanded && "rotate-180",
              )}
            />
          </button>
        )}
      </div>
      {expanded && tool.description && (
        <p className="px-2.5 pb-1.5 pl-8 text-xs leading-snug text-muted-foreground">
          {tool.description}
        </p>
      )}
    </div>
  );
}

/**
 * One MCP server, told truthfully.
 *
 * Three states, three distinct renderings, and never a dead control: a server
 * that needs re-authorization carries the Reconnect door, and a server that
 * failed THIS run wears its own error text in red rather than a checkmark.
 */
function McpServerChip({
  server,
  attached,
  runAttachment,
  connecting,
  onToggle,
  onReconnect,
}: {
  server: McpServerState;
  attached: boolean;
  runAttachment: RunMcpAttachment | undefined;
  connecting: boolean;
  onToggle: () => void;
  onReconnect: () => void;
}) {
  const chip = mcpChipPresentation(
    server.truth.state,
    server.truth.reason,
    attached,
    runAttachment,
  );

  if (chip.kind !== "broken") {
    return (
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={attached}
        title={
          chip.toolCount !== null
            ? `${server.entry.name} gave this chat ${chip.toolCount} tool${chip.toolCount === 1 ? "" : "s"}`
            : `${server.entry.name} — connected`
        }
        className={cn(
          "flex h-7 items-center gap-1 rounded-md border px-2 text-[11px] transition-colors",
          attached
            ? "border-primary/40 bg-primary/10 text-primary"
            : "border-border text-foreground hover:bg-accent",
        )}
      >
        {chip.kind === "check" ? (
          <Check className="h-3 w-3" />
        ) : (
          <Plus className="h-3 w-3" />
        )}
        {server.entry.name}
        {chip.toolCount !== null && (
          <span className="text-[10px] opacity-70">{chip.toolCount}</span>
        )}
      </button>
    );
  }

  const severe = chip.status !== "needs re-auth";
  return (
    <button
      type="button"
      onClick={onReconnect}
      disabled={connecting}
      title={chip.reason ?? undefined}
      className={cn(
        "flex h-7 max-w-full items-center gap-1 rounded-md border px-2 text-[11px] transition-colors disabled:opacity-60",
        severe
          ? "border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/20"
          : "border-amber-500/40 bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 dark:text-amber-300",
      )}
    >
      {connecting ? (
        <RefreshCw className="h-3 w-3 animate-spin" />
      ) : (
        <AlertTriangle className="h-3 w-3 shrink-0" />
      )}
      <span className="truncate">{server.entry.name}</span>
      <span className="shrink-0 opacity-80">{chip.status}</span>
      <span className="shrink-0 underline underline-offset-2">
        {connecting ? "Connecting…" : "Reconnect"}
      </span>
    </button>
  );
}
