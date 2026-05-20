"use client";

/**
 * ChatHistorySidebar — modern, user-facing conversation sidebar for `/chat`.
 *
 * Purpose-built for the consumer chat surface. Modeled on
 * ChatGPT / Claude / Gemini: quiet section labels, comfortable row height,
 * rounded hover, no permanent search bar, no inline timestamp clutter.
 *
 * Deliberately does NOT extend the dense `ConversationHistorySidebar`
 * (which is used by /code) — that one is staying as-is for the workspace
 * surface, so the two are free to evolve independently.
 *
 * Backed by the same Redux pipeline as ConversationHistorySidebar:
 * `fetchConversationHistory` thunk + `makeSelectGroupedByDate` selector +
 * `useConversationRowMenu` for the kebab. We just render it differently.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Loader2, MoreHorizontal, Search, Star, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { fetchConversationHistory } from "@/features/agents/redux/conversation-history/thunks";
import {
  makeSelectConversationHistoryScope,
  makeSelectConversationHistoryStatus,
  makeSelectGroupedByDate,
} from "@/features/agents/redux/conversation-history/selectors";
import { selectIsStreaming } from "@/features/agents/redux/execution-system/selectors/aggregate.selectors";
import {
  setScopeAgentIds,
  setScopeSearch,
} from "@/features/agents/redux/conversation-history/slice";
import type { ConversationListItem } from "@/features/agents/redux/conversation-list/conversation-list.types";
import {
  useConversationRowMenu,
  type ConversationRowMenuData,
  type MenuAnchor,
} from "@/features/agents/components/conversation-actions/useConversationRowMenu";
import { ConversationRowMenu } from "@/features/agents/components/conversation-actions/ConversationRowMenu";

export interface ChatHistorySidebarProps {
  /** Unique scope key — shares fetched state across mounts with the same id. */
  scopeId: string;
  /** Active conversation (highlights the row). */
  activeConversationId?: string | null;
  /** Called when a row is clicked. */
  onOpenConversation?: (conv: ConversationListItem) => void;
  /** Optional header rendered above the list (toggle + picker + new chat). */
  headerSlot?: React.ReactNode;
  /** Optional surface rendered between header and list (e.g. pinned agents). */
  topSlot?: React.ReactNode;
  className?: string;
}

const PAGE_SIZE = 30;

export function ChatHistorySidebar({
  scopeId,
  activeConversationId,
  onOpenConversation,
  headerSlot,
  topSlot,
  className,
}: ChatHistorySidebarProps) {
  const dispatch = useAppDispatch();

  // Stable selectors per scopeId
  const selectScope = useMemo(
    () => makeSelectConversationHistoryScope(scopeId),
    [scopeId],
  );
  const selectByDate = useMemo(
    () => makeSelectGroupedByDate(scopeId),
    [scopeId],
  );
  const selectStatus = useMemo(
    () => makeSelectConversationHistoryStatus(scopeId),
    [scopeId],
  );

  const scope = useAppSelector(selectScope);
  const byDate = useAppSelector(selectByDate);
  const { status, hasMore, error, count } = useAppSelector(selectStatus);

  const searchTerm = scope.searchTerm;

  // Initial fetch — sidebar mounts owning the scope, so this is the single
  // source of fetch authority. Idempotent at the slice level.
  useEffect(() => {
    dispatch(setScopeAgentIds({ scopeId, agentIds: [] }));
    void dispatch(
      fetchConversationHistory({
        scopeId,
        agentIds: [],
        pageSize: PAGE_SIZE,
        replace: true,
      }),
    );
  }, [dispatch, scopeId]);

  const onLoadMore = useCallback(() => {
    if (!hasMore || status === "loading" || status === "loading-more") return;
    void dispatch(
      fetchConversationHistory({
        scopeId,
        replace: false,
      }),
    );
  }, [dispatch, scopeId, hasMore, status]);

  // ── Search — collapsed by default, expands inline when the user clicks
  //    the icon. Mirrors ChatGPT/Claude where search is summoned, not always
  //    eating header real estate.
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const openSearch = useCallback(() => {
    setSearchOpen(true);
    requestAnimationFrame(() => searchInputRef.current?.focus());
  }, []);
  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    dispatch(setScopeSearch({ scopeId, searchTerm: "" }));
  }, [dispatch, scopeId]);

  // ── Row context menu (singleton — one menu shared by every row) ────────
  const rowMenu = useConversationRowMenu();

  const openRowMenu = useCallback(
    (conv: ConversationListItem, anchor: MenuAnchor) => {
      const data: ConversationRowMenuData = {
        conversationId: conv.conversationId,
        title: conv.title,
        isFavorite: conv.isFavorite ?? false,
        isArchived: conv.status === "archived",
        isOwner: true,
        href: `/chat/${conv.conversationId}`,
      };
      rowMenu.openForRow(data, anchor);
    },
    [rowMenu],
  );

  return (
    <div className={cn("flex h-full min-h-0 flex-col bg-card", className)}>
      {headerSlot}

      {/* Search affordance — quiet by default, expands inline on click. */}
      <div className="shrink-0 px-2 pt-2">
        {searchOpen ? (
          <div className="relative flex items-center">
            <Search className="absolute left-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <input
              ref={searchInputRef}
              type="search"
              value={searchTerm}
              onChange={(e) =>
                dispatch(
                  setScopeSearch({ scopeId, searchTerm: e.target.value }),
                )
              }
              onKeyDown={(e) => {
                if (e.key === "Escape") closeSearch();
              }}
              placeholder="Search chats"
              className="h-8 w-full rounded-lg border border-border bg-background pl-8 pr-8 text-sm text-foreground placeholder:text-muted-foreground/70 outline-none focus:border-ring/40"
              aria-label="Search conversations"
            />
            <button
              type="button"
              onClick={closeSearch}
              className="absolute right-1.5 flex h-5 w-5 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="Close search"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={openSearch}
            className="flex h-8 w-full items-center gap-2 rounded-lg px-2.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            aria-label="Search conversations"
          >
            <Search className="h-3.5 w-3.5" />
            <span>Search chats</span>
          </button>
        )}
      </div>

      {topSlot}

      {/* List */}
      <div className="min-h-0 flex-1 overflow-y-auto pt-1">
        {error && (
          <div className="px-3 py-3 text-xs text-destructive">{error}</div>
        )}

        {status === "loading" && count === 0 && (
          <div className="flex items-center gap-2 px-3 py-3 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Loading conversations…
          </div>
        )}

        {status !== "loading" &&
          count === 0 &&
          !searchTerm.trim() && (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground">
              No conversations yet.
            </div>
          )}

        {byDate.map((bucket) => (
          <Section key={bucket.key} label={bucket.label}>
            {bucket.items.map((conv) => (
              <Row
                key={conv.conversationId}
                conv={conv}
                active={conv.conversationId === activeConversationId}
                onOpen={onOpenConversation}
                onOpenMenu={openRowMenu}
              />
            ))}
          </Section>
        ))}

        {hasMore && (
          <div className="px-3 py-2">
            <button
              type="button"
              onClick={onLoadMore}
              disabled={status === "loading-more"}
              className="flex h-8 w-full items-center justify-center gap-1.5 rounded-lg text-xs text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-60 transition-colors"
            >
              {status === "loading-more" ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Loading…
                </>
              ) : (
                "Load more"
              )}
            </button>
          </div>
        )}
      </div>

      {/* Singleton row context menu — one DOM portal, every row anchors to it */}
      <ConversationRowMenu {...rowMenu.menuProps} />
    </div>
  );
}

// ── Section ────────────────────────────────────────────────────────────────

interface SectionProps {
  label: string;
  children: React.ReactNode;
}

const Section: React.FC<SectionProps> = ({ label, children }) => (
  <div className="mb-3">
    <div className="px-3 pb-1 pt-3 text-[11px] font-medium text-muted-foreground/80">
      {label}
    </div>
    <div className="px-2">{children}</div>
  </div>
);

// ── Row ────────────────────────────────────────────────────────────────────

interface RowProps {
  conv: ConversationListItem;
  active: boolean;
  onOpen?: (conv: ConversationListItem) => void;
  onOpenMenu?: (conv: ConversationListItem, anchor: MenuAnchor) => void;
}

const Row: React.FC<RowProps> = ({ conv, active, onOpen, onOpenMenu }) => {
  const title = conv.title?.trim() || untitled(conv);
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const isStreaming = useAppSelector(selectIsStreaming(conv.conversationId));

  return (
    <div
      className={cn(
        "group relative flex h-9 items-center gap-2 rounded-lg px-2.5 text-sm cursor-pointer",
        "text-foreground/90 transition-colors",
        active
          ? "bg-accent text-foreground"
          : "hover:bg-accent/60 hover:text-foreground",
      )}
      onClick={() => onOpen?.(conv)}
      onContextMenu={(e) => {
        if (!onOpenMenu) return;
        e.preventDefault();
        onOpenMenu(conv, e);
      }}
    >
      {/* Status / favorite indicator on the left — only renders when there's
          something to show (streaming OR starred). Idle rows get no glyph,
          matching ChatGPT/Claude minimalism. */}
      {isStreaming ? (
        <span className="relative flex h-2 w-2 shrink-0" aria-hidden>
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
        </span>
      ) : conv.isFavorite ? (
        <Star
          className="h-3 w-3 shrink-0 text-amber-500"
          fill="currentColor"
          aria-hidden
        />
      ) : null}

      <span className="min-w-0 flex-1 truncate">{title}</span>

      {/* Kebab — reserved width via `w-6`, invisible until row hover so the
          title doesn't shift. On mobile we keep it always visible because
          there's no hover signal. */}
      {onOpenMenu && (
        <button
          ref={menuBtnRef}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (menuBtnRef.current) onOpenMenu(conv, menuBtnRef.current);
          }}
          className={cn(
            "flex h-6 w-6 shrink-0 items-center justify-center rounded-md",
            "text-muted-foreground hover:bg-background hover:text-foreground",
            "opacity-100 md:opacity-0 md:group-hover:opacity-100",
            "md:focus-visible:opacity-100",
            active && "md:opacity-100",
          )}
          aria-label="More options"
          title="More options"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      )}
    </div>
  );
};

function untitled(conv: ConversationListItem): string {
  return `Conversation ${conv.conversationId.slice(0, 6)}`;
}
