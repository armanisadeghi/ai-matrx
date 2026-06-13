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
 * the `ItemRow` primitive (`buildConversationMenu` for the kebab). We just
 * render it differently.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Loader2, Search, Star, X } from "lucide-react";
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
import { ItemRow } from "@/components/official/item/ItemRow";
import { buildConversationMenu } from "@/features/agents/components/conversation-actions/conversationActionRegistry";
import { renameConversation } from "@/features/agents/redux/conversation-list/conversation-row-actions.thunks";

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
  /**
   * `cx_conversation.source_feature` values to hide. `/chat` passes
   * `['voice-agent']` so voice transcripts (which can't be replayed in the
   * text-chat view) don't pollute the history. Stored on the scope so paging
   * + refresh re-apply automatically.
   */
  excludeSourceFeatures?: string[];
  /**
   * Start with the search field open and focused. Used when this list is
   * summoned specifically to search (e.g. the collapsed-rail "Search chats"
   * popover) rather than as the always-on sidebar where search is quiet.
   */
  initialSearchOpen?: boolean;
  /**
   * Suppress the built-in inline "Search chats" affordance. Used when the
   * surrounding chrome provides its own search entry point (e.g. the chat
   * route menu's top-level Search Chats nav item) so we don't ship two
   * search UIs stacked on top of each other.
   */
  hideSearchAffordance?: boolean;
  className?: string;
}

const PAGE_SIZE = 30;

export function ChatHistorySidebar({
  scopeId,
  activeConversationId,
  onOpenConversation,
  headerSlot,
  topSlot,
  excludeSourceFeatures,
  initialSearchOpen = false,
  hideSearchAffordance = false,
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
  // `excludeSourceFeatures` is keyed in the dep array via JSON.stringify so
  // re-fetches only happen when the actual set changes (callers passing a
  // fresh array literal each render shouldn't cause loops).
  const excludeKey = JSON.stringify(excludeSourceFeatures ?? []);
  useEffect(() => {
    dispatch(setScopeAgentIds({ scopeId, agentIds: [] }));
    void dispatch(
      fetchConversationHistory({
        scopeId,
        agentIds: [],
        excludeSourceFeatures: excludeSourceFeatures ?? [],
        pageSize: PAGE_SIZE,
        replace: true,
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, scopeId, excludeKey]);

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
  const [searchOpen, setSearchOpen] = useState(initialSearchOpen);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const openSearch = useCallback(() => {
    setSearchOpen(true);
    requestAnimationFrame(() => searchInputRef.current?.focus());
  }, []);
  // When summoned in search mode, focus the field on mount so the user can
  // start typing immediately.
  useEffect(() => {
    if (initialSearchOpen) {
      requestAnimationFrame(() => searchInputRef.current?.focus());
    }
  }, [initialSearchOpen]);
  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    dispatch(setScopeSearch({ scopeId, searchTerm: "" }));
  }, [dispatch, scopeId]);

  return (
    <div className={cn("flex h-full min-h-0 flex-col bg-card", className)}>
      {headerSlot}

      {/* Search affordance — quiet by default, expands inline on click.
          Suppressed via `hideSearchAffordance` when the surrounding chrome
          already exposes a Search Chats entry point. */}
      {!hideSearchAffordance && (
      <div className="shrink-0 px-1 pt-2">
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
            className="flex h-8 w-full items-center gap-1.5 rounded-lg px-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            aria-label="Search conversations"
          >
            <Search className="h-3.5 w-3.5" />
            <span>Search chats</span>
          </button>
        )}
      </div>
      )}

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
    </div>
  );
}

// ── Section ────────────────────────────────────────────────────────────────

interface SectionProps {
  label: string;
  children: React.ReactNode;
}

const Section: React.FC<SectionProps> = ({ label, children }) => (
  <div className="mb-2">
    {/* Label and rows share the SAME 12px left edge (px-3 here, mx-1+px-2 on
        rows). Hierarchy comes from type — uppercase/semibold/muted — not from
        indentation. */}
    <div className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">
      {label}
    </div>
    <div>{children}</div>
  </div>
);

// ── Row ────────────────────────────────────────────────────────────────────

interface RowProps {
  conv: ConversationListItem;
  active: boolean;
  onOpen?: (conv: ConversationListItem) => void;
}

const Row: React.FC<RowProps> = ({ conv, active, onOpen }) => {
  const dispatch = useAppDispatch();
  const title = conv.title?.trim() || untitled(conv);
  const isStreaming = useAppSelector(selectIsStreaming(conv.conversationId));

  return (
    <ItemRow
      className="mx-1"
      label={title}
      active={active}
      onOpen={() => onOpen?.(conv)}
      menu={() =>
        buildConversationMenu({
          conversationId: conv.conversationId,
          title: conv.title,
          isFavorite: conv.isFavorite ?? false,
          isArchived: conv.status === "archived",
          excludeFromKg: conv.excludeFromKg ?? false,
          isOwner: true,
          href: `/chat/${conv.conversationId}`,
          dispatch,
        })
      }
      rename={{
        value: conv.title ?? "",
        emptyFallback: untitled(conv),
        onCommit: (next) =>
          void dispatch(
            renameConversation({
              conversationId: conv.conversationId,
              title: next,
            }),
          ),
      }}
      trailing={
        isStreaming ? (
          <span className="relative flex h-1.5 w-1.5" aria-hidden>
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
          </span>
        ) : conv.isFavorite ? (
          <Star
            className="h-3 w-3 text-amber-500"
            fill="currentColor"
            aria-hidden
          />
        ) : null
      }
    />
  );
};

function untitled(conv: ConversationListItem): string {
  return `Conversation ${conv.conversationId.slice(0, 6)}`;
}
