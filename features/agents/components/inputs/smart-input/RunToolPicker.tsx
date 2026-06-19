"use client";

/**
 * RunToolPicker — the Smart Input's Tools tab. Two stacked sections:
 *
 *   1. "This agent's tools" — the agent's REAL configured tool set, read live
 *      from the agentDefinition slice (built-in registry tools resolved to
 *      names + custom tools + MCP servers). Read-only here; this is the agent's
 *      saved definition, edited in the Agent Builder, not per-conversation.
 *      Also surfaces the auto-tool-injection kill switch state so the user
 *      knows whether surface/capability tools get added at run time.
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
  Wrench,
  Code2,
  Server,
  ShieldOff,
} from "lucide-react";
import type { DatabaseTool } from "@/utils/supabase/tools-service";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { Input } from "@/components/ui/input";
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
import { selectBuilderAdvancedSettings } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import { setBuilderAdvancedSettings } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.slice";
import { DEFAULT_BUILDER_ADVANCED_SETTINGS } from "@/features/agents/types/instance.types";
import { filterAndSortBySearch } from "@/utils/search-scoring";

export function RunToolPicker({ conversationId }: { conversationId: string }) {
  const dispatch = useAppDispatch();
  const tools = useAppSelector(selectAllTools);
  const status = useAppSelector(selectToolsStatus);

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

  const settings =
    useAppSelector(selectBuilderAdvancedSettings(conversationId)) ??
    DEFAULT_BUILDER_ADVANCED_SETTINGS;
  const addedList = settings.addedTools ?? [];
  const added = new Set(addedList);
  const [search, setSearch] = useState("");
  // Accordion: one description open at a time keeps the list scannable.
  const [expandedToolId, setExpandedToolId] = useState<string | null>(null);

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
      {/* ── Section 1: the agent's REAL configured tools ──────────────── */}
      <div className="shrink-0 border-b border-border">
        <div className="flex items-center gap-1.5 px-2.5 pt-2 pb-1">
          <Wrench className="h-3.5 w-3.5 text-primary" />
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            This agent&apos;s tools
          </span>
          <span className="text-[10px] text-muted-foreground/70">
            {agentLoading ? "loading…" : `${agentToolCount} configured`}
          </span>
        </div>

        <div className="max-h-40 overflow-y-auto px-2.5 pb-2">
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
              {mcpList.map((id) => (
                <AgentToolBadge
                  key={id}
                  icon={<Server className="h-3 w-3" />}
                  label={id}
                  sub="MCP"
                />
              ))}
            </div>
          )}
        </div>

        {agentId && (
          <div className="flex items-center gap-1.5 border-t border-border/60 px-2.5 py-1.5">
            <ShieldOff
              className={cn(
                "h-3 w-3 shrink-0",
                autoToolsDisabled
                  ? "text-amber-500"
                  : "text-muted-foreground/50",
              )}
            />
            <span className="text-[10px] leading-tight text-muted-foreground">
              {autoToolsDisabled
                ? "Automatic tool injection is OFF — only the tools above run."
                : "Automatic tool injection is ON — surface & capability tools may be added at run time."}
            </span>
          </div>
        )}
      </div>

      {/* ── Section 2: add registry tools to THIS run ─────────────────── */}
      <div className="shrink-0 border-b border-border px-2 pb-1.5 pt-2">
        <p className="mb-1.5 text-[11px] leading-tight text-muted-foreground">
          Add tools to this run — on top of the agent&apos;s own tools.
          {added.size > 0 && (
            <span className="ml-1 font-medium text-primary">
              {added.size} added
            </span>
          )}
        </p>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tools…"
            className="h-7 pl-7 pr-7 text-xs"
            style={{ fontSize: "16px" }}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {loadingEmpty ? (
          <p className="px-3 py-3 text-xs text-muted-foreground">
            Loading tools…
          </p>
        ) : visible.length === 0 ? (
          <p className="px-3 py-3 text-xs text-muted-foreground">
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

      {added.size > 0 && (
        <div className="shrink-0 border-t border-border px-2 py-1.5">
          <button
            type="button"
            onClick={() => setAdded([])}
            className="text-[10px] text-muted-foreground hover:text-destructive"
          >
            Clear {added.size} added tool{added.size === 1 ? "" : "s"}
          </button>
        </div>
      )}
    </div>
  );
}

/** Compact read-only row for one of the agent's configured tools. */
function AgentToolBadge({
  icon,
  label,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  sub?: string;
}) {
  return (
    <div className="flex items-baseline gap-1.5 rounded bg-muted/40 px-1.5 py-0.5 text-[11px]">
      <span className="self-center text-muted-foreground">{icon}</span>
      <span className="min-w-0 flex-1 truncate font-medium text-foreground">
        {label}
      </span>
      {sub && (
        <span className="shrink-0 truncate text-[9px] text-muted-foreground/70">
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
        className="flex h-8 w-full cursor-pointer items-center gap-2 px-2.5 text-left transition-colors hover:bg-accent/60"
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
        <p className="px-2.5 pb-1.5 pl-8 text-[11px] leading-snug text-muted-foreground">
          {tool.description}
        </p>
      )}
    </div>
  );
}
