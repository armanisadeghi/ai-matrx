"use client";

/**
 * features/surfaces/components/chrome/SurfaceConversationsSection.tsx
 *
 * "Past conversations" — the bottom section of the header Agents menu.
 *
 * Launching a bound agent always STARTS a conversation. This is the way back
 * to one: the two most recent conversations from this part of the product, and
 * behind "All conversations" every conversation the person has, searchable —
 * so a chat begun on another page, in /chat, or in Quick Chat can be picked up
 * HERE. Either way the conversation reopens in the same floating panel a bound
 * agent runs in, stamped with this page's surface, so the page hands over its
 * live values on the next message (see `resumeConversation`).
 *
 * What "from here" means today: a conversation records the product area it was
 * started in (`source_feature`), not the exact surface — so the recent list is
 * scoped to the page's area (every CMS surface shares "cms").
 *
 * Rendered only inside the lazily-loaded panel, so it costs nothing until the
 * menu is opened.
 */

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, History, Loader2, Search } from "lucide-react";
import { formatRelativeTime } from "@ai-matrx/kit/format";

import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import { Input } from "@ai-matrx/design-system";
import { fetchConversationHistory } from "@/features/agents/redux/conversation-history/thunks";
import { setScopeSearch } from "@/features/agents/redux/conversation-history/slice";
import {
  makeSelectConversationHistoryItems,
  makeSelectConversationHistoryStatus,
} from "@/features/agents/redux/conversation-history/selectors";
import type { ConversationListItem } from "@/features/agents/redux/conversation-list/conversation-list.types";
import { resumeConversation } from "@/features/agents/redux/execution-system/thunks/resume-conversation.thunk";
import { sourceFeatureFromSurfaceName } from "@/features/agents/utils/source-feature-from-surface";
import { useAgentNames } from "@/features/surfaces/hooks/useAgentNames";
import { useEffectiveKnob } from "@/lib/scoped-config/effectiveKnobs";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { selectActiveOrganizationId } from "@/features/scopes/redux/selectors/active-context";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

const RECENT_COUNT = 2;
/**
 * How many past conversations the "All" tab loads at once — the organization's
 * (or the person's) setting, not this file's opinion (law 6). Read through the
 * one cached register read, so it costs no round trip of its own.
 */
const ALL_PAGE_SIZE_KNOB = { feature: "surfaces.conversations", key: "all_page_size" };
/** Voice transcripts render incorrectly in a text conversation view. */
const EXCLUDED_FEATURES = ["voice-agent"];

export interface SurfaceConversationsSectionProps {
  /** The page's surface — what a reopened conversation gets stamped with. */
  surfaceName: string;
  /** Whether that surface has a live runtime mounted right now. */
  hasLiveScope: boolean;
  onOpened?: () => void;
}

function relativeTime(iso: string): string {
  return formatRelativeTime(iso, { style: "short" });
}

function ConversationRows({
  items,
  agentNames,
  openingId,
  onOpen,
}: {
  items: ConversationListItem[];
  agentNames: Record<string, string>;
  openingId: string | null;
  onOpen: (conv: ConversationListItem) => void;
}) {
  return (
    <ul className="flex flex-col gap-0.5">
      {items.map((conv) => {
        const isOpening = openingId === conv.conversationId;
        const agentName = conv.agentId ? agentNames[conv.agentId] : undefined;
        return (
          <li key={conv.conversationId}>
            <button
              type="button"
              disabled={openingId !== null}
              onClick={() => onOpen(conv)}
              className="flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent disabled:opacity-60"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium text-foreground">
                  {conv.title?.trim() || "Untitled conversation"}
                </span>
                <span className="block truncate text-[10px] text-muted-foreground">
                  {agentName ? `${agentName} · ` : ""}
                  {relativeTime(conv.updatedAt)}
                </span>
              </span>
              {isOpening && (
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function SurfaceConversationsSection({
  surfaceName,
  hasLiveScope,
  onOpened,
}: SurfaceConversationsSectionProps) {
  const dispatch = useAppDispatch();
  const feature = sourceFeatureFromSurfaceName(surfaceName);
  const [showAll, setShowAll] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);

  const organizationId = useAppSelector(selectActiveOrganizationId);
  const userId = useAppSelector(selectUserId);
  const rawAllPageSize = useEffectiveKnob(organizationId, userId, ALL_PAGE_SIZE_KNOB);
  // `undefined` is "not answered yet", never a number nobody chose: the read
  // below simply does not run until the register answers, and the section keeps
  // saying it is fetching. A read that FAILS is named in the console by
  // `useEffectiveKnob` itself, with the remedy.
  const allPageSize = typeof rawAllPageSize === "number" ? rawAllPageSize : null;

  const recentScopeId = `surface-chrome:recent:${feature ?? "none"}`;
  const allScopeId = "surface-chrome:all";
  const scopeId = showAll ? allScopeId : recentScopeId;

  // Selector factories — one instance per scope, same as the history sidebar.
  const selectItems = useMemo(
    () => makeSelectConversationHistoryItems(scopeId),
    [scopeId],
  );
  const selectStatus = useMemo(
    () => makeSelectConversationHistoryStatus(scopeId),
    [scopeId],
  );
  const items = useAppSelector(selectItems);
  const { status, hasMore, error } = useAppSelector(selectStatus);

  useEffect(() => {
    if (showAll) {
      if (allPageSize === null) return;
      void dispatch(
        fetchConversationHistory({
          scopeId: allScopeId,
          excludeSourceFeatures: EXCLUDED_FEATURES,
          includeSourceFeatures: [],
          pageSize: allPageSize,
          replace: true,
        }),
      );
      return;
    }
    // No product area for this surface → nothing honest to call "from here";
    // the section goes straight to the all-conversations door.
    if (!feature) return;
    void dispatch(
      fetchConversationHistory({
        scopeId: recentScopeId,
        excludeSourceFeatures: EXCLUDED_FEATURES,
        includeSourceFeatures: [feature],
        // A few spare rows: agent-less conversations are dropped below.
        pageSize: RECENT_COUNT + 6,
        replace: true,
      }),
    );
  }, [dispatch, showAll, feature, recentScopeId, allPageSize]);

  // A conversation with no agent cannot be resumed — never offer a dead row.
  const resumable = items.filter((c) => !!c.agentId);
  const visible = showAll ? resumable : resumable.slice(0, RECENT_COUNT);
  const agentNames = useAgentNames(
    visible.map((c) => c.agentId).filter((id): id is string => !!id),
  );

  const handleOpen = async (conv: ConversationListItem) => {
    if (!conv.agentId || openingId) return;
    setOpeningId(conv.conversationId);
    try {
      const result = await dispatch(
        resumeConversation({
          conversationId: conv.conversationId,
          agentId: conv.agentId,
          surfaceKey: `surface-chrome:resume:${conv.conversationId}`,
          surfaceName,
          displayMode: "flexible-panel",
        }),
      ).unwrap();
      dispatch(
        openOverlay({
          overlayId: "agentFlexiblePanel",
          instanceId: result.conversationId,
          data: { conversationId: result.conversationId },
        }),
      );
      if (!hasLiveScope) {
        toast.message("Opened without live page context", {
          description:
            "This page has not registered live values yet, so the conversation continues with what it already knows.",
        });
      }
      onOpened?.();
    } catch (err) {
      toast.error("Could not reopen that conversation", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setOpeningId(null);
    }
  };

  const isLoading = status === "loading" || status === "idle";

  if (showAll) {
    return (
      <div className="flex min-w-0 flex-col gap-1.5 border-t border-border pt-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setShowAll(false)}
            aria-label="Back to recent conversations"
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            All conversations
          </p>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            placeholder="Search conversations"
            onChange={(e) =>
              dispatch(
                setScopeSearch({ scopeId: allScopeId, searchTerm: e.target.value }),
              )
            }
            className="h-8 pl-7 text-base md:text-xs"
          />
        </div>
        <div className="max-h-64 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center gap-2 px-2 py-3 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Fetching your conversations
            </div>
          ) : status === "failed" ? (
            <p className="px-2 py-2 text-xs text-destructive">
              Could not load conversations{error ? ` — ${error}` : ""}.
              <ErrorAlchemyMenu />
            </p>
          ) : visible.length === 0 ? (
            <p className="px-2 py-2 text-xs text-muted-foreground">
              No conversations match.
            </p>
          ) : (
            <>
              <ConversationRows
                items={visible}
                agentNames={agentNames}
                openingId={openingId}
                onOpen={handleOpen}
              />
              {hasMore && (
                <button
                  type="button"
                  disabled={status === "loading-more"}
                  onClick={() =>
                    void dispatch(
                      fetchConversationHistory({
                        scopeId: allScopeId,
                        replace: false,
                      }),
                    )
                  }
                  className="mt-1 w-full rounded-md px-2 py-1.5 text-center text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-60"
                >
                  {status === "loading-more" ? "Loading more" : "Load more"}
                </button>
              )}
            </>
          )}
        </div>
        <p className="px-2 text-[10px] leading-relaxed text-muted-foreground">
          The conversation opens here and receives this page&apos;s context on
          your next message.
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-1 border-t border-border pt-2">
      <p className="px-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        Past conversations
      </p>
      {feature && isLoading ? (
        <div className="flex items-center gap-2 px-2 py-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Finding recent conversations
        </div>
      ) : feature && status === "failed" ? (
        <p className="px-2 py-1 text-xs text-destructive">
          Could not load recent conversations{error ? ` — ${error}` : ""}.
          <ErrorAlchemyMenu />
        </p>
      ) : visible.length > 0 ? (
        <ConversationRows
          items={visible}
          agentNames={agentNames}
          openingId={openingId}
          onOpen={handleOpen}
        />
      ) : (
        <p className="px-2 py-1 text-xs text-muted-foreground">
          Nothing started from here yet.
        </p>
      )}
      <button
        type="button"
        onClick={() => setShowAll(true)}
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
        )}
      >
        <History className="h-3.5 w-3.5 shrink-0" />
        All conversations
      </button>
    </div>
  );
}
