"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Boxes,
  ChevronDown,
  Filter,
  Loader2,
  Search,
  Settings2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectActiveAgents,
  selectAgentsSliceStatus,
} from "@/features/agents/redux/agent-definition/selectors";
import { fetchAgentsListFull } from "@/features/agents/redux/agent-definition/thunks";
import {
  describeFilter,
  makeSelectAgentsForFilter,
} from "@/features/agents/redux/agent-filter/selectors";
import type { AgentDefinitionRecord } from "@/features/agents/types/agent-definition.types";
import type { CodeAgentFilter } from "@/lib/redux/preferences/userPreferencesSlice";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import { setPreference } from "@/lib/redux/preferences/userPreferencesSlice";
import { HOVER_ROW } from "../styles/tokens";

interface AgentPickerProps {
  /** Shown inside the empty chat panel. */
  variant?: "empty-state" | "inline";
  /**
   * Filter applied to the agent roster before display. Pass `null` to
   * surface every active agent (legacy behavior). The picker still shows
   * a "Filter: …" chip + "clear filter" affordance whenever a filter is
   * present, so the user can always bypass it.
   */
  filter?: CodeAgentFilter | null;
  /**
   * Settings tab opened by the picker's settings cog. Defaults to the
   * /code workspace tab; other consumers can point this elsewhere.
   */
  settingsTabId?: string;
  className?: string;
}

/**
 * Small picker that writes `?agentId=…` into the current URL, which is how
 * the code workspace's chat + history slots resolve which agent to render.
 *
 * When a `filter` is provided the picker honours it — but a header chip
 * lets the user temporarily turn the filter off to reach any of their
 * other agents without leaving the workspace.
 */
export const AgentPicker: React.FC<AgentPickerProps> = ({
  variant = "empty-state",
  filter = null,
  settingsTabId = "editor.codeWorkspace",
  className,
}) => {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentAgentId = searchParams.get("agentId");

  const status = useAppSelector(selectAgentsSliceStatus);
  const allAgents = useAppSelector(selectActiveAgents);

  // The picker supports a local "bypass filter" toggle — if the user wants
  // to jump to an agent outside the saved filter, they can flip this on for
  // the session without editing preferences.
  const [bypassFilter, setBypassFilter] = useState(false);

  // The saved `filter` flows in from `useCodeWorkspaceHistory`, which reads
  // user preferences. Those prefs are hydrated client-side from Supabase /
  // localStorage and are NOT in the SSR snapshot, so the server renders
  // `filter` as the default ("all") while the client renders the user's
  // saved value (e.g. "explicit"). That divergence reshapes the picker's
  // children (header chip + footer button + agent roster) and triggers a
  // hydration mismatch.
  //
  // Gate every filter-dependent piece behind a single `mounted` flag so the
  // FIRST render on both server and client matches a "no filter" picker;
  // after hydration, swap in the real saved filter.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const effectiveFilter: CodeAgentFilter | null = mounted ? filter : null;

  const selectFilteredAgents = useMemo(() => makeSelectAgentsForFilter(), []);
  const filteredAgents = useAppSelector((state) =>
    selectFilteredAgents(state, effectiveFilter),
  );

  const agents: AgentDefinitionRecord[] =
    bypassFilter || !effectiveFilter || effectiveFilter.mode === "all"
      ? allAgents
      : filteredAgents;

  const [open, setOpen] = useState(variant === "empty-state");
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (status === "idle") {
      void dispatch(fetchAgentsListFull());
    }
  }, [status, dispatch]);

  const filteredList = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return agents.slice(0, 50);
    return agents
      .filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.id.toLowerCase().includes(q) ||
          (a.description?.toLowerCase().includes(q) ?? false),
      )
      .slice(0, 50);
  }, [agents, query]);

  const select = useCallback(
    (agentId: string) => {
      const next = new URLSearchParams(searchParams.toString());
      next.set("agentId", agentId);
      next.delete("conversationId");
      router.replace(`${pathname}?${next.toString()}`);
      setOpen(false);
    },
    [pathname, router, searchParams],
  );

  const openFilterSettings = useCallback(() => {
    dispatch(
      openOverlay({
        overlayId: "userPreferencesWindow",
        data: { initialTabId: settingsTabId },
      }),
    );
  }, [dispatch, settingsTabId]);

  const clearFilterPreference = useCallback(() => {
    // Permanently switch the saved filter back to "all". The user can still
    // reopen settings to narrow it again later.
    dispatch(
      setPreference({
        module: "coding",
        preference: "agentFilter",
        value: {
          mode: "all" as const,
          tags: [] as string[],
          categories: [] as string[],
          agentIds: [] as string[],
        } satisfies CodeAgentFilter,
      }),
    );
    setBypassFilter(false);
  }, [dispatch]);

  const currentAgent = currentAgentId
    ? allAgents.find((a) => a.id === currentAgentId)
    : null;

  const filterChip =
    effectiveFilter && effectiveFilter.mode !== "all" ? (
      <FilterChip
        label={describeFilter(effectiveFilter)}
        bypassed={bypassFilter}
        onToggleBypass={() => setBypassFilter((v) => !v)}
        onEdit={openFilterSettings}
        onClear={clearFilterPreference}
      />
    ) : null;

  if (variant === "inline") {
    return (
      <div className={cn("relative", className)}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={cn(
            "flex h-7 items-center gap-1.5 rounded border border-neutral-300 bg-white px-2 text-[12px] text-neutral-700",
            "hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800",
          )}
        >
          <Boxes size={12} />
          <span className="max-w-[160px] truncate">
            {currentAgent?.name ?? "Pick agent"}
          </span>
          <ChevronDown size={12} />
        </button>
        {open && (
          <AgentList
            agents={filteredList}
            currentAgentId={currentAgentId}
            query={query}
            setQuery={setQuery}
            status={status}
            onSelect={select}
            onClose={() => setOpen(false)}
            header={filterChip}
            footer={
              <FilterFooter
                filter={effectiveFilter}
                bypassFilter={bypassFilter}
                onOpenSettings={openFilterSettings}
              />
            }
            className="absolute right-0 top-8 z-10 w-80 rounded border border-neutral-200 bg-white shadow-md dark:border-neutral-800 dark:bg-neutral-950"
          />
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex h-full w-full flex-col items-center justify-center gap-3 p-6 text-center",
        className,
      )}
    >
      <Boxes
        size={36}
        strokeWidth={1.2}
        className="text-neutral-400 dark:text-neutral-500"
      />
      <div className="text-[13px] font-medium text-neutral-700 dark:text-neutral-200">
        Pick an agent to start chatting
      </div>
      <div className="text-[11px] text-neutral-500 dark:text-neutral-400">
        The chat panel and conversation history both run against the agent you
        select.
      </div>
      <AgentList
        agents={filteredList}
        currentAgentId={currentAgentId}
        query={query}
        setQuery={setQuery}
        status={status}
        onSelect={select}
        header={filterChip}
        footer={
          <FilterFooter
            filter={effectiveFilter}
            bypassFilter={bypassFilter}
            onOpenSettings={openFilterSettings}
          />
        }
        className="w-full max-w-sm rounded border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950"
      />
    </div>
  );
};

// ── Inline components ────────────────────────────────────────────────────────

function FilterChip({
  label,
  bypassed,
  onToggleBypass,
  onEdit,
  onClear,
}: {
  label: string;
  bypassed: boolean;
  onToggleBypass: () => void;
  onEdit: () => void;
  onClear: () => void;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-1 border-b px-2 py-1 text-[11px]",
        "border-neutral-200 bg-neutral-50 text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300",
      )}
    >
      <Filter size={11} className="shrink-0" />
      <span className="min-w-0 truncate">
        {bypassed ? "Filter off — showing all" : label}
      </span>
      <div className="ml-auto flex items-center gap-0.5">
        <button
          type="button"
          onClick={onToggleBypass}
          className="rounded px-1.5 py-0.5 text-[10px] hover:bg-neutral-200 dark:hover:bg-neutral-800"
          title={bypassed ? "Re-apply filter" : "Show all agents (temp)"}
        >
          {bypassed ? "Re-apply" : "Show all"}
        </button>
        <button
          type="button"
          onClick={onEdit}
          className="rounded p-0.5 hover:bg-neutral-200 dark:hover:bg-neutral-800"
          title="Edit filter in Settings"
          aria-label="Edit filter in settings"
        >
          <Settings2 size={11} />
        </button>
        <button
          type="button"
          onClick={onClear}
          className="rounded p-0.5 hover:bg-neutral-200 dark:hover:bg-neutral-800"
          title="Clear filter permanently"
          aria-label="Clear filter"
        >
          <X size={11} />
        </button>
      </div>
    </div>
  );
}

function FilterFooter({
  filter,
  bypassFilter,
  onOpenSettings,
}: {
  filter: CodeAgentFilter | null;
  bypassFilter: boolean;
  onOpenSettings: () => void;
}) {
  const hasFilter = Boolean(filter && filter.mode !== "all");
  if (!hasFilter && !bypassFilter) {
    return (
      <button
        type="button"
        onClick={onOpenSettings}
        className="flex w-full items-center gap-1.5 border-t border-neutral-200 px-3 py-1.5 text-left text-[11px] text-neutral-500 hover:bg-neutral-50 hover:text-neutral-700 dark:border-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-900 dark:hover:text-neutral-200"
      >
        <Settings2 size={11} />
        Filter which agents show up here
      </button>
    );
  }
  return null;
}

function AgentList({
  agents,
  currentAgentId,
  query,
  setQuery,
  status,
  onSelect,
  onClose,
  header,
  footer,
  className,
}: {
  agents: ReturnType<typeof selectActiveAgents>;
  currentAgentId: string | null;
  query: string;
  setQuery: (v: string) => void;
  status: string;
  onSelect: (id: string) => void;
  onClose?: () => void;
  header?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      {header}
      <div className="flex items-center gap-1.5 border-b border-neutral-200 px-2 py-1.5 dark:border-neutral-800">
        <Search size={12} className="text-neutral-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search agents…"
          className="flex-1 bg-transparent text-[12px] outline-none placeholder:text-neutral-400"
          autoFocus
        />
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="text-[11px] text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
          >
            Close
          </button>
        )}
      </div>
      <div className="max-h-72 overflow-y-auto py-1">
        {status === "loading" && agents.length === 0 && (
          <div className="flex items-center gap-2 px-3 py-2 text-[12px] text-neutral-500">
            <Loader2 size={12} className="animate-spin" />
            Loading agents…
          </div>
        )}
        {status !== "loading" && agents.length === 0 && (
          <div className="px-3 py-2 text-[12px] text-neutral-500">
            No agents match.
          </div>
        )}
        {agents.map((agent) => (
          <button
            key={agent.id}
            type="button"
            onClick={() => onSelect(agent.id)}
            className={cn(
              "flex w-full items-start gap-2 px-3 py-1.5 text-left text-[12px]",
              HOVER_ROW,
              currentAgentId === agent.id &&
                "bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200",
            )}
          >
            <Boxes size={12} className="mt-[3px] shrink-0" />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-medium">{agent.name}</span>
              {agent.description && (
                <span className="truncate text-[11px] text-neutral-500 dark:text-neutral-400">
                  {agent.description}
                </span>
              )}
            </div>
          </button>
        ))}
      </div>
      {footer}
    </div>
  );
}

export default AgentPicker;
