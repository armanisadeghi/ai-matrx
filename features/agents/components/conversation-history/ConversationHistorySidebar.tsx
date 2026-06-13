"use client";

/**
 * ConversationHistorySidebar — reusable, scoped conversation sidebar.
 *
 * The sidebar is fully decoupled from any specific route or feature:
 * - A `scopeId` identifies the per-scope state in the
 *   `conversationHistory` Redux slice. Multiple consumers can mount with
 *   the same `scopeId` and share state.
 * - `agentIds` controls which agents' conversations are shown. Pass `[]`
 *   to fetch across all of the user's accessible agents.
 * - Grouping, pagination, search, and favorites are all UI-level concerns
 *   handled inside this component. Consumers provide: an active
 *   conversation id (for highlighting), an `onOpenConversation` callback,
 *   and the favorites handlers (since favorites live in the consumer's
 *   preference shape — see `useCodeWorkspaceHistory` for a reference
 *   implementation used by /code).
 *
 * Self-contained data-loading: the component triggers the initial fetch
 * on mount (and whenever `agentIds` changes) via
 * `fetchConversationHistory`. Consumers don't need to prewire a thunk.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Cpu,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Loader2,
  Search,
  Star,
  StarOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { fetchConversationHistory } from "@/features/agents/redux/conversation-history/thunks";
import {
  makeSelectConversationHistoryScope,
  makeSelectConversationHistoryStatus,
  makeSelectGroupedByAgent,
  makeSelectGroupedByDate,
} from "@/features/agents/redux/conversation-history/selectors";
import { selectIsStreaming } from "@/features/agents/redux/execution-system/selectors/aggregate.selectors";
import {
  setScopeAgentIds,
  setScopeGrouping,
  setScopeSearch,
} from "@/features/agents/redux/conversation-history/slice";
import type { HistoryGrouping } from "@/features/agents/redux/conversation-history/types";
import type { ConversationListItem } from "@/features/agents/redux/conversation-list/conversation-list.types";
import {
  renameConversation,
  setConversationFavorite,
} from "@/features/agents/redux/conversation-list/conversation-row-actions.thunks";
import { buildConversationMenu } from "@/features/agents/components/conversation-actions/conversationActionRegistry";
import { ItemRow } from "@/components/official/item/ItemRow";
import { toast } from "sonner";

export interface ConversationHistorySidebarProps {
  /** Unique scope key (same across mounts that should share state). */
  scopeId: string;
  /**
   * Agents whose conversations appear here. Empty = show all accessible
   * conversations for the user. The component manages fetches on change.
   */
  agentIds: string[];
  /** Active conversation (used for highlight). */
  activeConversationId?: string | null;
  /** Called when a row is clicked. Required for interactivity. */
  onOpenConversation?: (conv: ConversationListItem) => void;

  /** Default grouping when the scope is first created. Default: "date". */
  defaultGrouping?: HistoryGrouping;
  /** Page size passed to the fetch thunk. Default: 30. */
  pageSize?: number;

  /**
   * Returns whether a given conversation is a favorite. Optional —
   * defaults to reading `conv.isFavorite` from the DB column. Pass only
   * when the surface needs a non-DB-backed favorites source (legacy
   * client-only preferences, scratch lists, etc.).
   */
  isFavorite?: (conversationId: string) => boolean;
  /**
   * Called when the user toggles the star on a row. Optional — defaults
   * to dispatching `setConversationFavorite` which writes to the DB
   * `cx_conversation.is_favorite` column. Pair with a custom
   * `isFavorite` to override.
   */
  onToggleFavorite?: (conv: ConversationListItem) => void;
  /**
   * Builds the canonical href for "Open in new tab" / "Copy link" in the
   * row context menu. Defaults to `/chat/<id>` — chat-style surfaces can
   * accept the default; runner surfaces should pass a builder that
   * returns `/agents/<agentId>/run?c=<id>` so the new tab lands on the
   * right route.
   */
  getConversationHref?: (conv: ConversationListItem) => string;
  /**
   * Optional surface key passed to `duplicateConversation` — when set,
   * focus jumps to the new copy on success. Sidebars hosted inside a
   * focus-aware surface (runner, /code) should pass their surface id;
   * sidebars without a focus system can omit.
   */
  surfaceKey?: string;

  /** Content rendered above the list when no filter/agents are in scope. */
  emptyState?: React.ReactNode;
  /** Content rendered at the very top of the sidebar header row. */
  headerSlot?: React.ReactNode;
  /**
   * Content rendered below the header but above the search / grouping
   * controls. Use this for surface-specific affordances that should sit
   * above the conversation list — e.g. the chat route injects a Pinned
   * Agents section here. Renders nothing when omitted.
   */
  topSlot?: React.ReactNode;
  /** Extra header actions (shown next to grouping + search toggles). */
  headerActions?: React.ReactNode;

  /**
   * Controls whether the built-in search input is shown. Consumers that
   * host their own search can hide it. Default: true.
   */
  showSearch?: boolean;
  /**
   * Controls whether the built-in grouping toggle is shown. Consumers can
   * hide it when the grouping is locked. Default: true.
   */
  showGroupingToggle?: boolean;

  className?: string;
  /**
   * Extra classes for the built-in search input. Defaults blend with the
   * project's semantic tokens (`bg-background` / `border-border` / etc.).
   * Pass overrides here when a host surface (e.g. the /code workspace)
   * needs a different look.
   */
  searchInputClassName?: string;
  /**
   * Extra classes for each collapsible section's sticky header. Defaults
   * use `bg-card` so the sticky background blends with a card-style
   * sidebar; consumers rendering on a different surface can override.
   */
  sectionHeaderClassName?: string;
}

export const ConversationHistorySidebar: React.FC<
  ConversationHistorySidebarProps
> = ({
  scopeId,
  agentIds,
  activeConversationId,
  onOpenConversation,
  defaultGrouping = "date",
  pageSize = 30,
  isFavorite,
  onToggleFavorite,
  getConversationHref,
  surfaceKey,
  emptyState,
  headerSlot,
  topSlot,
  headerActions,
  showSearch = true,
  showGroupingToggle = true,
  className,
  searchInputClassName,
  sectionHeaderClassName,
}) => {
  const dispatch = useAppDispatch();

  // ── Stable selector instances per scopeId ──────────────────────────────────
  const selectScope = useMemo(
    () => makeSelectConversationHistoryScope(scopeId),
    [scopeId],
  );
  const selectByDate = useMemo(
    () => makeSelectGroupedByDate(scopeId),
    [scopeId],
  );
  const selectByAgent = useMemo(
    () => makeSelectGroupedByAgent(scopeId),
    [scopeId],
  );
  const selectStatus = useMemo(
    () => makeSelectConversationHistoryStatus(scopeId),
    [scopeId],
  );

  const scope = useAppSelector(selectScope);
  const byDate = useAppSelector(selectByDate);
  const byAgent = useAppSelector(selectByAgent);
  const { status, hasMore, error, count } = useAppSelector(selectStatus);

  const grouping = scope.grouping ?? defaultGrouping;
  const searchTerm = scope.searchTerm;

  // ── Sync scope config + trigger fetch on agent set changes ──────────────────
  const agentIdsKey = useMemo(
    () => agentIds.slice().sort().join(","),
    [agentIds],
  );
  const firstRunRef = useRef(true);

  useEffect(() => {
    dispatch(
      setScopeAgentIds({
        scopeId,
        agentIds: agentIds.slice(),
      }),
    );
    void dispatch(
      fetchConversationHistory({
        scopeId,
        agentIds: agentIds.slice(),
        pageSize,
        replace: true,
      }),
    );
    firstRunRef.current = false;
  }, [dispatch, scopeId, agentIdsKey, pageSize]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handlers ────────────────────────────────────────────────────────────────
  const onSearchChange = useCallback(
    (value: string) => {
      dispatch(setScopeSearch({ scopeId, searchTerm: value }));
    },
    [dispatch, scopeId],
  );

  const onGroupingChange = useCallback(
    (next: HistoryGrouping) => {
      dispatch(setScopeGrouping({ scopeId, grouping: next }));
    },
    [dispatch, scopeId],
  );

  const onLoadMore = useCallback(() => {
    if (!hasMore || status === "loading" || status === "loading-more") return;
    void dispatch(
      fetchConversationHistory({
        scopeId,
        replace: false,
      }),
    );
  }, [dispatch, scopeId, hasMore, status]);

  // ── Favorites — DB-backed by default, overridable per surface ────────────
  //
  // The DB-backed default reads `conv.isFavorite` from the entity row
  // (`cx_conversation.is_favorite`). When the host passes its own
  // `isFavorite`/`onToggleFavorite` (e.g. /code's old client-only
  // preferences), we honor that as the source of truth instead — at most
  // one favorites system per surface.
  const isFavoriteResolved = useCallback(
    (conversationId: string): boolean => {
      if (isFavorite) return isFavorite(conversationId);
      const item = scope.items.find((i) => i.conversationId === conversationId);
      return item?.isFavorite ?? false;
    },
    [isFavorite, scope.items],
  );

  const onToggleFavoriteResolved = useCallback(
    async (conv: ConversationListItem) => {
      if (onToggleFavorite) {
        onToggleFavorite(conv);
        return;
      }
      const result = await dispatch(
        setConversationFavorite({
          conversationId: conv.conversationId,
          isFavorite: !conv.isFavorite,
        }),
      );
      if (setConversationFavorite.rejected.match(result)) {
        toast.error(result.payload?.message ?? "Failed to update pin");
      }
    },
    [dispatch, onToggleFavorite],
  );

  const favorites = useMemo(() => {
    return scope.items.filter((i) => isFavoriteResolved(i.conversationId));
  }, [scope.items, isFavoriteResolved]);

  // ── Row context menu href resolver ───────────────────────────────────────
  // Each <ItemRow> builds its OWN menu (kebab + right-click) via
  // `buildConversationMenu`. The parent only owns the surface-specific href
  // convention + surfaceKey; rows reuse the exact href the old singleton menu
  // computed (`getConversationHref` override, else `/chat/<id>`).
  const resolveHref = useCallback(
    (conv: ConversationListItem): string =>
      getConversationHref
        ? getConversationHref(conv)
        : `/chat/${conv.conversationId}`,
    [getConversationHref],
  );

  const empty =
    status !== "loading" && count === 0 && !searchTerm.trim() && emptyState;

  return (
    <div className={cn("flex h-full min-h-0 flex-col", className)}>
      {headerSlot}
      {topSlot}

      {/* ── Controls row: search + grouping toggle + actions ─────────────── */}
      {(showSearch || showGroupingToggle || headerActions) && (
        <div className="flex shrink-0 items-center gap-1 border-b border-border px-2 py-1">
          {showSearch && (
            <div className="relative flex min-w-0 flex-1 items-center">
              <Search
                size={12}
                className="absolute left-1.5 text-muted-foreground"
                aria-hidden
              />
              <input
                type="search"
                value={searchTerm}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Search conversations"
                className={cn(
                  "h-6 w-full rounded-sm border border-border bg-background pl-5 pr-1.5 text-[11px] text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none",
                  searchInputClassName,
                )}
                aria-label="Search conversations"
              />
            </div>
          )}
          {showGroupingToggle && (
            <GroupingToggle value={grouping} onChange={onGroupingChange} />
          )}
          {headerActions}
        </div>
      )}

      {/* ── Main list ────────────────────────────────────────────────────── */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {error && (
          <div className="px-3 py-3 text-[11px] text-destructive">{error}</div>
        )}

        {status === "loading" && count === 0 && (
          <div className="flex items-center gap-2 px-3 py-3 text-[11px] text-muted-foreground">
            <Loader2 size={12} className="animate-spin" />
            Loading conversations…
          </div>
        )}

        {empty && <div className="px-1 py-2">{empty}</div>}

        {favorites.length > 0 && (
          <Section
            id="favorites"
            label="Favorites"
            count={favorites.length}
            icon={<Star size={11} className="text-amber-500" />}
            defaultOpen
            headerClassName={sectionHeaderClassName}
          >
            {favorites.map((conv) => (
              <Row
                key={`fav-${conv.conversationId}`}
                conv={conv}
                active={conv.conversationId === activeConversationId}
                onOpen={onOpenConversation}
                isFavorite={isFavoriteResolved(conv.conversationId)}
                onToggleFavorite={onToggleFavoriteResolved}
                resolveHref={resolveHref}
                surfaceKey={surfaceKey}
              />
            ))}
          </Section>
        )}

        {grouping === "date" &&
          byDate.map((bucket) => (
            <Section
              key={bucket.key}
              id={bucket.key}
              label={bucket.label}
              count={bucket.items.length}
              icon={<CalendarDays size={11} />}
              defaultOpen
              headerClassName={sectionHeaderClassName}
            >
              {bucket.items.map((conv) => (
                <Row
                  key={conv.conversationId}
                  conv={conv}
                  active={conv.conversationId === activeConversationId}
                  onOpen={onOpenConversation}
                  isFavorite={isFavoriteResolved(conv.conversationId)}
                  onToggleFavorite={onToggleFavoriteResolved}
                  resolveHref={resolveHref}
                  surfaceKey={surfaceKey}
                />
              ))}
            </Section>
          ))}

        {grouping === "agent" &&
          byAgent.map((bucket) => (
            <Section
              key={bucket.agentId ?? "unknown"}
              id={bucket.agentId ?? "unknown"}
              label={bucket.label}
              count={bucket.items.length}
              icon={<Cpu size={11} />}
              defaultOpen
              headerClassName={sectionHeaderClassName}
            >
              {bucket.items.map((conv) => (
                <Row
                  key={conv.conversationId}
                  conv={conv}
                  active={conv.conversationId === activeConversationId}
                  onOpen={onOpenConversation}
                  isFavorite={isFavoriteResolved(conv.conversationId)}
                  onToggleFavorite={onToggleFavoriteResolved}
                  resolveHref={resolveHref}
                  surfaceKey={surfaceKey}
                  showAgentHint={false}
                />
              ))}
            </Section>
          ))}

        {hasMore && (
          <div className="px-2 py-2">
            <button
              type="button"
              onClick={onLoadMore}
              disabled={status === "loading-more"}
              className={cn(
                "flex h-6 w-full items-center justify-center rounded-sm border border-border text-[11px] text-foreground hover:bg-accent/60 disabled:opacity-60",
              )}
            >
              {status === "loading-more" ? (
                <>
                  <Loader2 size={11} className="mr-1 animate-spin" />
                  Loading…
                </>
              ) : (
                "Load more"
              )}
            </button>
          </div>
        )}

        {!hasMore && count > 0 && (
          <div className="px-3 py-2 text-center text-[10px] text-muted-foreground">
            {count} conversation{count === 1 ? "" : "s"}
          </div>
        )}
      </div>
    </div>
  );
};

// ── Sub-components ───────────────────────────────────────────────────────────

interface GroupingToggleProps {
  value: HistoryGrouping;
  onChange: (next: HistoryGrouping) => void;
}

const GroupingToggle: React.FC<GroupingToggleProps> = ({ value, onChange }) => {
  return (
    <div
      role="tablist"
      aria-label="Group conversations by"
      className="flex h-6 items-stretch rounded-sm border border-border"
    >
      <ToggleBtn
        active={value === "date"}
        onClick={() => onChange("date")}
        title="Group by date"
        aria-label="Group by date"
      >
        <CalendarDays size={11} />
      </ToggleBtn>
      <ToggleBtn
        active={value === "agent"}
        onClick={() => onChange("agent")}
        title="Group by agent"
        aria-label="Group by agent"
      >
        <Cpu size={11} />
      </ToggleBtn>
    </div>
  );
};

const ToggleBtn: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { active: boolean }
> = ({ active, className, children, ...rest }) => (
  <button
    type="button"
    role="tab"
    aria-selected={active}
    className={cn(
      "flex items-center justify-center px-1.5 text-muted-foreground first:rounded-l-sm last:rounded-r-sm hover:bg-accent/60",
      active && "bg-accent text-accent-foreground",
      className,
    )}
    {...rest}
  >
    {children}
  </button>
);

interface SectionProps {
  id: string;
  label: string;
  count: number;
  icon?: React.ReactNode;
  defaultOpen?: boolean;
  headerClassName?: string;
  children: React.ReactNode;
}

const Section: React.FC<SectionProps> = ({
  label,
  count,
  icon,
  defaultOpen = true,
  headerClassName,
  children,
}) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mb-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "sticky top-0 z-[1] flex w-full items-center gap-1 bg-card px-2 py-1 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground",
          headerClassName,
        )}
      >
        {open ? (
          <ChevronDown size={10} className="shrink-0" />
        ) : (
          <ChevronRight size={10} className="shrink-0" />
        )}
        {icon}
        <span className="truncate">{label}</span>
        <span className="ml-auto shrink-0 text-muted-foreground">{count}</span>
      </button>
      {open && <div>{children}</div>}
    </div>
  );
};

/**
 * Tiny status dot rendered at the start of every conversation row.
 *
 * Idle: subtle muted dot (6px). Streaming: primary-colored dot with an
 * `animate-ping` ring for the breathing/radar effect. Reads
 * `selectIsStreaming(conversationId)` — true while the conversations slice
 * has `status === "streaming"` for this conversation.
 */
const StreamingDot: React.FC<{ conversationId: string }> = ({
  conversationId,
}) => {
  const isStreaming = useAppSelector(selectIsStreaming(conversationId));
  return (
    <span
      className="relative flex h-2 w-2 shrink-0 items-center justify-center"
      aria-hidden
    >
      {isStreaming && (
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
      )}
      <span
        className={cn(
          "relative inline-flex h-1.5 w-1.5 rounded-full transition-colors",
          isStreaming ? "bg-primary" : "bg-muted-foreground/40",
        )}
      />
    </span>
  );
};

interface RowProps {
  conv: ConversationListItem;
  active: boolean;
  onOpen?: (conv: ConversationListItem) => void;
  isFavorite: boolean;
  onToggleFavorite?: (conv: ConversationListItem) => void;
  /** Resolves the surface-specific href for the row's menu (new tab / copy). */
  resolveHref: (conv: ConversationListItem) => string;
  /** Agent-run focus key — when set, Duplicate jumps focus to the new copy. */
  surfaceKey?: string;
  showAgentHint?: boolean;
}

const Row: React.FC<RowProps> = ({
  conv,
  active,
  onOpen,
  isFavorite,
  onToggleFavorite,
  resolveHref,
  surfaceKey,
  showAgentHint = true,
}) => {
  const dispatch = useAppDispatch();
  const title = conv.title?.trim() || untitled(conv);

  // Standalone star toggle — a real one-click button (NOT a menu entry), kept
  // in the trailing slot so users can pin/unpin without opening the menu.
  // Pin/Unpin ALSO exists in the kebab menu for discoverability + keyboard.
  const star = onToggleFavorite ? (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onToggleFavorite(conv);
      }}
      className={cn(
        "flex h-4 w-4 items-center justify-center rounded-sm",
        // Hidden until hover unless already pinned (ItemRow's group/item drives
        // the reveal). Always visible on touch.
        isFavorite
          ? "opacity-100"
          : "opacity-0 group-hover/item:opacity-100 [@media(pointer:coarse)]:opacity-100",
      )}
      aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
      title={isFavorite ? "Remove from favorites" : "Add to favorites"}
    >
      {isFavorite ? (
        <Star size={11} className="text-amber-500" fill="currentColor" />
      ) : (
        <StarOff size={11} className="text-muted-foreground" />
      )}
    </button>
  ) : null;

  const meta = formatRelative(conv.updatedAt);

  // The agent hint (sr-only) only matters in date grouping where the agent is
  // not implied by the section header; folded into the trailing slot so the
  // dense row stays a single ItemRow.
  const trailing =
    showAgentHint && conv.agentId ? (
      <>
        <span className="sr-only">agent {conv.agentId}</span>
        {star}
      </>
    ) : (
      star
    );

  return (
    <ItemRow
      label={title}
      size="sm"
      active={active}
      onOpen={() => onOpen?.(conv)}
      leading={<StreamingDot conversationId={conv.conversationId} />}
      secondaryLabel={meta || undefined}
      trailing={trailing}
      menu={() =>
        buildConversationMenu({
          conversationId: conv.conversationId,
          title: conv.title,
          isFavorite,
          isArchived: conv.status === "archived",
          excludeFromKg: conv.excludeFromKg ?? false,
          isOwner: true,
          href: resolveHref(conv),
          surfaceKey,
          dispatch,
        })
      }
      rename={{
        value: conv.title ?? "",
        emptyFallback: untitled(conv),
        onCommit: (next) =>
          void dispatch(
            renameConversation({ conversationId: conv.conversationId, title: next }),
          ),
      }}
      kebabAriaLabel={`Options for ${title}`}
    />
  );
};

function untitled(conv: ConversationListItem): string {
  return `Conversation ${conv.conversationId.slice(0, 6)}`;
}

function formatRelative(iso: string | undefined): string {
  if (!iso) return "";
  const t = +new Date(iso);
  if (Number.isNaN(t)) return "";
  const now = Date.now();
  const diffMs = now - t;
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "now";
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d`;
  const d = new Date(t);
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export default ConversationHistorySidebar;
