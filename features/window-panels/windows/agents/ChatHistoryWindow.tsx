"use client";

/**
 * ChatHistoryWindow — cross-agent conversation history.
 *
 * Same model as the per-agent History tab in `AgentContentHistoryPanel`, but
 * for the **entire user's conversations across every agent**. The sidebar
 * supports two grouping modes (date / agent) plus a search filter and an
 * agent-multi-select filter. Selecting a conversation renders it read-only in
 * the main pane via `AgentConversationDisplay`.
 *
 * Replaces the legacy `quickChatHistory` sheet that pointed at
 * `features/prompts/components/results-display/QuickChatHistorySheet.tsx`.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  SquareStack,
  ChevronDown,
  ChevronRight,
  CalendarDays,
  Filter,
  History,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  Search,
  Flame,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";

import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import type { RootState } from "@/lib/redux/store";

import { fetchGlobalConversations } from "@/features/agents/redux/conversation-list/conversation-list.thunks";
import {
  selectGlobalConversationList,
  selectGlobalListStatus,
  selectGlobalListError,
  selectGlobalListIsFresh,
} from "@/features/agents/redux/conversation-list/conversation-list.selectors";
import type { ConversationListItem } from "@/features/agents/redux/conversation-list/conversation-list.types";
import {
  selectAgentById,
  selectAllAgentsArray,
} from "@/features/agents/redux/agent-definition/selectors";
import { AgentConversationDisplay } from "@/features/agents/components/messages-display/AgentConversationDisplay";
import { loadConversation } from "@/features/agents/redux/execution-system/thunks/load-conversation.thunk";
import { createManualInstance } from "@/features/agents/redux/execution-system/thunks/create-instance.thunk";
import {
  useConversationRowMenu,
  type ConversationRowMenuData,
  type MenuAnchor,
} from "@/features/agents/components/conversation-actions/useConversationRowMenu";
import { ConversationRowMenu } from "@/features/agents/components/conversation-actions/ConversationRowMenu";

const SURFACE_KEY = "ai-results-window";

// ── Types & helpers ──────────────────────────────────────────────────────────

type GroupBy = "date" | "agent";

interface ConversationGroup {
  /** Stable id for collapsed-state tracking (e.g. "today", "agent::abc"). */
  key: string;
  /** Title shown in the group header. */
  label: string;
  /** Sort weight — lower comes first. */
  weight: number;
  conversations: ConversationListItem[];
}

/**
 * Bucket label + sort weight for "today / yesterday / this week / this month
 * / earlier this year / older" date grouping.
 */
function dateBucket(iso: string | undefined | null): {
  key: string;
  label: string;
  weight: number;
} {
  if (!iso) return { key: "older", label: "Older", weight: 99 };
  const d = new Date(iso);
  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );
  const days = Math.floor((startOfToday.getTime() - d.getTime()) / 86_400_000);

  if (days <= 0) return { key: "today", label: "Today", weight: 0 };
  if (days === 1) return { key: "yesterday", label: "Yesterday", weight: 1 };
  if (days < 7) return { key: "this-week", label: "This Week", weight: 2 };
  if (days < 30) return { key: "this-month", label: "This Month", weight: 3 };
  if (days < 365)
    return { key: "this-year", label: "Earlier This Year", weight: 4 };
  return { key: "older", label: "Older", weight: 5 };
}

function formatRelative(iso: string | undefined | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (diffDays === 0)
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

// ── Sidebar group row ────────────────────────────────────────────────────────

interface ConversationGroupRowProps {
  group: ConversationGroup;
  selectedId: string | null;
  agentNameById: Map<string, string>;
  onSelect: (id: string) => void;
  defaultOpen: boolean;
  /** When true, render an agent name next to each conversation (date-grouping). */
  showAgentBadge: boolean;
  onOpenMenu: (conv: ConversationListItem, anchor: MenuAnchor) => void;
}

function ConversationGroupRow({
  group,
  selectedId,
  agentNameById,
  onSelect,
  defaultOpen,
  showAgentBadge,
  onOpenMenu,
}: ConversationGroupRowProps) {
  const [open, setOpen] = useState(defaultOpen);
  const hasActive = group.conversations.some(
    (c) => c.conversationId === selectedId,
  );

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-1.5 w-full px-2 py-1.5 text-left transition-colors",
          "hover:bg-muted/40",
          hasActive && "text-primary",
        )}
      >
        {open ? (
          <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />
        )}
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide flex-1 min-w-0 truncate">
          {group.label}
        </span>
        <span className="text-[10px] text-muted-foreground/60 shrink-0 ml-1">
          {group.conversations.length}
        </span>
      </button>

      {open && (
        <div className="pl-2">
          {group.conversations.map((conv) => (
            <ConversationRowItem
              key={conv.conversationId}
              conv={conv}
              isActive={conv.conversationId === selectedId}
              agentName={
                conv.agentId ? (agentNameById.get(conv.agentId) ?? null) : null
              }
              showAgentBadge={showAgentBadge}
              onSelect={onSelect}
              onOpenMenu={onOpenMenu}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ConversationRowItem({
  conv,
  isActive,
  agentName,
  showAgentBadge,
  onSelect,
  onOpenMenu,
}: {
  conv: ConversationListItem;
  isActive: boolean;
  agentName: string | null;
  showAgentBadge: boolean;
  onSelect: (id: string) => void;
  onOpenMenu: (conv: ConversationListItem, anchor: MenuAnchor) => void;
}) {
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const date = formatRelative(conv.updatedAt);

  return (
    <div
      className={cn(
        "group flex items-start gap-2 w-full pr-1 transition-colors border-l-2",
        isActive
          ? "border-primary bg-primary/8 text-primary"
          : "border-transparent hover:bg-muted/40 text-foreground",
      )}
      onContextMenu={(e) => {
        e.preventDefault();
        onOpenMenu(conv, e);
      }}
    >
      <button
        type="button"
        onClick={() => onSelect(conv.conversationId)}
        className="flex-1 min-w-0 flex items-start gap-2 px-2 py-1.5 text-left"
      >
        <div className="flex-1 min-w-0">
          <p
            className={cn(
              "text-xs font-medium truncate leading-tight",
              isActive ? "text-primary" : "text-foreground",
            )}
          >
            {conv.title?.trim() || "Untitled"}
          </p>
          <div className="flex items-center gap-1 mt-0.5 flex-wrap">
            <MessageSquare className="w-2.5 h-2.5 text-muted-foreground/70 shrink-0" />
            <span className="text-[10px] text-muted-foreground/70">
              {conv.messageCount}
              {date ? ` · ${date}` : ""}
            </span>
            {showAgentBadge && agentName && (
              <span className="text-[10px] text-muted-foreground/70 truncate">
                · {agentName}
              </span>
            )}
          </div>
        </div>
        {isActive && (
          <ChevronRight className="w-3 h-3 text-primary shrink-0 mt-0.5" />
        )}
      </button>
      <button
        ref={menuBtnRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (menuBtnRef.current) onOpenMenu(conv, menuBtnRef.current);
        }}
        className={cn(
          "shrink-0 self-start mt-1.5 flex h-5 w-5 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground",
          "opacity-100 md:opacity-0 md:group-hover:opacity-100",
        )}
        aria-label="More options"
        title="More options"
      >
        <MoreHorizontal size={12} />
      </button>
    </div>
  );
}

// ── Agent multi-select filter ────────────────────────────────────────────────

interface AgentFilterPopoverProps {
  agents: { id: string; name: string }[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}

function AgentFilterPopover({
  agents,
  selected,
  onChange,
}: AgentFilterPopoverProps) {
  const [open, setOpen] = useState(false);
  const selectedCount = selected.size;

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-7 px-2 text-[11px] gap-1.5"
        >
          <Filter className="w-3 h-3" />
          {selectedCount > 0 ? (
            <>
              Filter
              <Badge
                variant="secondary"
                className="h-4 px-1 text-[9px] tabular-nums"
              >
                {selectedCount}
              </Badge>
            </>
          ) : (
            "Filter"
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-64 p-0"
        side="bottom"
        sideOffset={4}
      >
        <div className="px-3 py-2 border-b border-border flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Filter by agent
          </span>
          {selectedCount > 0 && (
            <button
              type="button"
              onClick={() => onChange(new Set())}
              className="text-[10px] text-muted-foreground hover:text-foreground"
            >
              Clear
            </button>
          )}
        </div>
        <ScrollArea className="max-h-72">
          <div className="py-1">
            {agents.length === 0 && (
              <p className="px-3 py-2 text-xs text-muted-foreground">
                No agents available
              </p>
            )}
            {agents.map((agent) => {
              const isOn = selected.has(agent.id);
              return (
                <button
                  key={agent.id}
                  type="button"
                  onClick={() => toggle(agent.id)}
                  className={cn(
                    "flex items-center gap-2 w-full px-3 py-1.5 text-left text-xs transition-colors",
                    isOn ? "bg-primary/10 text-primary" : "hover:bg-muted/40",
                  )}
                >
                  <span
                    className={cn(
                      "w-3 h-3 rounded-sm border flex items-center justify-center shrink-0",
                      isOn
                        ? "bg-primary border-primary"
                        : "border-muted-foreground/40",
                    )}
                  >
                    {isOn && (
                      <span className="w-1.5 h-1.5 bg-primary-foreground rounded-[1px]" />
                    )}
                  </span>
                  <span className="truncate">{agent.name}</span>
                </button>
              );
            })}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

// ── Sidebar ──────────────────────────────────────────────────────────────────

interface SidebarProps {
  conversations: ConversationListItem[];
  status: ReturnType<typeof selectGlobalListStatus>;
  error: string | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  groupBy: GroupBy;
  onGroupByChange: (g: GroupBy) => void;
  search: string;
  onSearchChange: (s: string) => void;
  agentFilter: Set<string>;
  onAgentFilterChange: (next: Set<string>) => void;
  agentNameById: Map<string, string>;
  agentList: { id: string; name: string }[];
  onOpenMenu: (conv: ConversationListItem, anchor: MenuAnchor) => void;
}

function ChatHistorySidebar({
  conversations,
  status,
  error,
  selectedId,
  onSelect,
  groupBy,
  onGroupByChange,
  search,
  onSearchChange,
  agentFilter,
  onAgentFilterChange,
  agentNameById,
  agentList,
  onOpenMenu,
}: SidebarProps) {
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return conversations.filter((c) => {
      if (agentFilter.size > 0) {
        if (!c.agentId || !agentFilter.has(c.agentId)) return false;
      }
      if (!term) return true;
      const haystack = [
        c.title,
        c.description,
        c.agentId ? agentNameById.get(c.agentId) : null,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [conversations, search, agentFilter, agentNameById]);

  const groups = useMemo<ConversationGroup[]>(() => {
    if (groupBy === "agent") {
      const map = new Map<string, ConversationListItem[]>();
      for (const c of filtered) {
        const key = c.agentId ?? "__unassigned__";
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(c);
      }
      return Array.from(map.entries())
        .map(([agentId, convs], idx) => {
          const name =
            agentId === "__unassigned__"
              ? "Unassigned"
              : (agentNameById.get(agentId) ?? "Unknown agent");
          return {
            key: `agent::${agentId}`,
            label: name,
            weight: idx,
            conversations: [...convs].sort(
              (a, b) =>
                new Date(b.updatedAt).getTime() -
                new Date(a.updatedAt).getTime(),
            ),
          };
        })
        .sort((a, b) => a.label.localeCompare(b.label));
    }

    // Default: by date
    const map = new Map<
      string,
      { label: string; weight: number; convs: ConversationListItem[] }
    >();
    for (const c of filtered) {
      const bucket = dateBucket(c.updatedAt);
      const existing = map.get(bucket.key);
      if (existing) existing.convs.push(c);
      else
        map.set(bucket.key, {
          label: bucket.label,
          weight: bucket.weight,
          convs: [c],
        });
    }
    return Array.from(map.entries())
      .map(([key, value]) => ({
        key,
        label: value.label,
        weight: value.weight,
        conversations: [...value.convs].sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        ),
      }))
      .sort((a, b) => a.weight - b.weight);
  }, [filtered, groupBy, agentNameById]);

  const totalCount = conversations.length;
  const visibleCount = filtered.length;

  return (
    <div className="h-full min-h-0 flex flex-col bg-card/30">
      {/* Search + grouping controls */}
      <div className="px-2 py-2 border-b border-border shrink-0 space-y-1.5">
        <div className="relative">
          <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search conversations…"
            className="h-7 pl-7 pr-7 text-xs"
          />
          {search && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <div className="inline-flex border border-border rounded-md overflow-hidden">
            <button
              type="button"
              onClick={() => onGroupByChange("date")}
              className={cn(
                "px-2 py-1 text-[11px] font-medium flex items-center gap-1 transition-colors",
                groupBy === "date"
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted/40",
              )}
            >
              <CalendarDays className="w-3 h-3" />
              Date
            </button>
            <button
              type="button"
              onClick={() => onGroupByChange("agent")}
              className={cn(
                "px-2 py-1 text-[11px] font-medium flex items-center gap-1 transition-colors border-l border-border",
                groupBy === "agent"
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted/40",
              )}
            >
              <SquareStack className="w-3 h-3" />
              Agent
            </button>
          </div>

          <AgentFilterPopover
            agents={agentList}
            selected={agentFilter}
            onChange={onAgentFilterChange}
          />
        </div>
      </div>

      {/* Counts + loading */}
      <div className="px-2 py-1 border-b border-border/50 shrink-0 flex items-center justify-between">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
          {visibleCount === totalCount
            ? `${totalCount} conversation${totalCount === 1 ? "" : "s"}`
            : `${visibleCount} of ${totalCount}`}
        </span>
        {status === "loading" && (
          <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
        )}
      </div>

      {/* List */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {status === "failed" && (
          <p className="px-3 py-2 text-[10px] text-destructive">
            {error ?? "Failed to load"}
          </p>
        )}

        {status === "succeeded" && totalCount === 0 && (
          <div className="flex flex-col items-center justify-center py-8 px-3 text-center">
            <History className="w-6 h-6 text-muted-foreground mb-2 opacity-40" />
            <p className="text-xs text-muted-foreground">
              No conversations yet
            </p>
          </div>
        )}

        {status === "succeeded" && totalCount > 0 && visibleCount === 0 && (
          <div className="flex flex-col items-center justify-center py-8 px-3 text-center">
            <Search className="w-6 h-6 text-muted-foreground mb-2 opacity-40" />
            <p className="text-xs text-muted-foreground">
              No matches for these filters
            </p>
          </div>
        )}

        {groups.map((group, i) => (
          <ConversationGroupRow
            key={group.key}
            group={group}
            selectedId={selectedId}
            agentNameById={agentNameById}
            onSelect={onSelect}
            defaultOpen={i < 2}
            showAgentBadge={groupBy === "date"}
            onOpenMenu={onOpenMenu}
          />
        ))}
      </div>
    </div>
  );
}

// ── Window component ─────────────────────────────────────────────────────────

interface ChatHistoryWindowProps {
  isOpen: boolean;
  onClose: () => void;
  /** Initial conversation to focus (e.g. when launched from a deep-link). */
  initialSelectedConversationId?: string | null;
  /** Initial grouping mode. Default `"date"` — that's how people use it. */
  initialGroupBy?: GroupBy;
}

export default function ChatHistoryWindow({
  isOpen,
  onClose,
  initialSelectedConversationId,
  initialGroupBy,
}: ChatHistoryWindowProps) {
  if (!isOpen) return null;
  return (
    <ChatHistoryWindowInner
      onClose={onClose}
      initialSelectedConversationId={initialSelectedConversationId ?? null}
      initialGroupBy={initialGroupBy ?? "date"}
    />
  );
}

function ChatHistoryWindowInner({
  onClose,
  initialSelectedConversationId,
  initialGroupBy,
}: {
  onClose: () => void;
  initialSelectedConversationId: string | null;
  initialGroupBy: GroupBy;
}) {
  const dispatch = useAppDispatch();
  const store = useAppStore();

  const conversations = useAppSelector(selectGlobalConversationList);
  const status = useAppSelector(selectGlobalListStatus);
  const error = useAppSelector(selectGlobalListError);
  const isFresh = useAppSelector(selectGlobalListIsFresh());

  const allAgents = useAppSelector(selectAllAgentsArray);

  const [selectedId, setSelectedId] = useState<string | null>(
    initialSelectedConversationId,
  );
  const [groupBy, setGroupBy] = useState<GroupBy>(initialGroupBy);
  const [search, setSearch] = useState("");
  const [agentFilter, setAgentFilter] = useState<Set<string>>(new Set());

  // Initial load — fetch if we don't have a fresh global list yet.
  useEffect(() => {
    if (status === "idle") {
      dispatch(fetchGlobalConversations());
      return;
    }
    if (!isFresh && status !== "loading") {
      dispatch(fetchGlobalConversations());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const agentNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of allAgents) {
      if (a?.id && a.name) map.set(a.id, a.name);
    }
    return map;
  }, [allAgents]);

  const agentsWithConversations = useMemo(() => {
    const ids = new Set<string>();
    for (const c of conversations) {
      if (c.agentId) ids.add(c.agentId);
    }
    return Array.from(ids)
      .map((id) => ({ id, name: agentNameById.get(id) ?? "Unknown agent" }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [conversations, agentNameById]);

  // Singleton row menu — one menu instance for the entire sidebar.
  const rowMenu = useConversationRowMenu();
  const openRowMenu = useCallback(
    (conv: ConversationListItem, anchor: MenuAnchor) => {
      const data: ConversationRowMenuData = {
        conversationId: conv.conversationId,
        title: conv.title,
        isFavorite: conv.isFavorite ?? false,
        isArchived: conv.status === "archived",
        isOwner: true,
        href: conv.agentId
          ? `/agents/${conv.agentId}/run?conversationId=${conv.conversationId}`
          : `/chat?conversationId=${conv.conversationId}`,
      };
      rowMenu.openForRow(data, anchor);
    },
    [rowMenu],
  );

  const handleSelect = useCallback(
    async (conversationId: string) => {
      setSelectedId(conversationId);

      const exists = !!(store.getState() as RootState).conversations
        ?.byConversationId?.[conversationId];

      if (!exists) {
        const list = (store.getState() as RootState).conversationList;
        const item = list?.byConversationId?.[conversationId];
        const agentId = item?.agentId;
        if (agentId) {
          await dispatch(
            createManualInstance({
              agentId,
              conversationId,
              apiEndpointMode: "agent",
            }),
          );
        }
      }

      dispatch(
        loadConversation({
          conversationId,
          surfaceKey: SURFACE_KEY,
        }),
      );
    },
    [dispatch, store],
  );

  const collectData = useCallback(
    (): Record<string, unknown> => ({
      selectedConversationId: selectedId,
      groupBy,
    }),
    [selectedId, groupBy],
  );

  // Subtitle shows the active conversation's agent name when one is picked.
  const selectedAgentName = useAppSelector((state: RootState) => {
    if (!selectedId) return null;
    const item = state.conversationList?.byConversationId?.[selectedId];
    if (!item?.agentId) return null;
    const agent = selectAgentById(state, item.agentId);
    return agent?.name ?? null;
  });

  const titleSuffix = selectedAgentName ? ` — ${selectedAgentName}` : "";

  return (
    <WindowPanel
      id="ai-results-window"
      title={`AI Results${titleSuffix}`}
      onClose={onClose}
      width={920}
      height={640}
      minWidth={520}
      minHeight={360}
      overlayId="quickChatHistory"
      onCollectData={collectData}
      sidebarDefaultSize={280}
      sidebarMinSize={220}
      defaultSidebarOpen
      sidebar={
        <ChatHistorySidebar
          conversations={conversations}
          status={status}
          error={error}
          selectedId={selectedId}
          onSelect={handleSelect}
          groupBy={groupBy}
          onGroupByChange={setGroupBy}
          search={search}
          onSearchChange={setSearch}
          agentFilter={agentFilter}
          onAgentFilterChange={setAgentFilter}
          agentNameById={agentNameById}
          agentList={agentsWithConversations}
          onOpenMenu={openRowMenu}
        />
      }
    >
      <div className="h-full min-h-0 overflow-hidden">
        {selectedId ? (
          <div className="h-full w-full overflow-y-auto">
            <div className="mx-auto max-w-3xl w-full p-3">
              <AgentConversationDisplay conversationId={selectedId} />
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center px-6 text-muted-foreground">
            <Flame className="w-10 h-10 mb-3 opacity-20" />
            <p className="text-sm font-medium">Select a conversation</p>
            <p className="text-xs opacity-60 mt-1">
              Pick any past run from the list to view it here. Switch between
              grouping by <strong>date</strong> or <strong>agent</strong> in the
              sidebar.
            </p>
          </div>
        )}
      </div>

      <ConversationRowMenu {...rowMenu.menuProps} />
    </WindowPanel>
  );
}
