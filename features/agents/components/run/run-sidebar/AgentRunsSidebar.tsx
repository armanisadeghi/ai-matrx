"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  Loader2,
  ChevronRight,
  MessageSquare,
  MoreHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectAgentById,
  selectAgentName,
} from "@/features/agents/redux/agent-definition/selectors";
import { selectLatestConversationId } from "@/features/agents/redux/execution-system/selectors/aggregate.selectors";
import { fetchAgentConversations } from "@/features/agents/redux/conversation-list/conversation-list.thunks";
import { makeSelectAgentConversations } from "@/features/agents/redux/conversation-list/conversation-list.selectors";
import type { ConversationListItem } from "@/features/agents/redux/conversation-list/conversation-list.types";
import { AgentLauncherSidebarTester } from "../../run-controls/AgentLauncherSidebarTester";
import { SidebarHeader } from "./SidebarHeader";
import { ConversationHoverPreview } from "@/features/agents/components/previews/ConversationHoverPreview";
import {
  useConversationRowMenu,
  type ConversationRowMenuData,
  type MenuAnchor,
} from "@/features/agents/components/conversation-actions/useConversationRowMenu";
import { ConversationRowMenu } from "@/features/agents/components/conversation-actions/ConversationRowMenu";

interface AgentRunsSidebarProps {
  agentId: string;
  conversationId: string;
  surfaceKey: string;
  conversationIdFromUrl?: string;
  currentRunId?: string;
  onToggleSidebar: () => void;
  /** Base path for the embedded header's back-link + agent switcher.
   *  Defaults to `/agents`. Admin surfaces should pass
   *  `/administration/system-agents/agents`. */
  basePath?: string;
  backHref?: string;
}

export function AgentRunsSidebar({
  agentId,
  conversationId,
  surfaceKey,
  conversationIdFromUrl,
  onToggleSidebar,
  basePath,
  backHref,
}: AgentRunsSidebarProps) {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const canonicalAgentId = useAppSelector((state) => {
    const agent = selectAgentById(state, agentId);
    return agent?.parentAgentId ?? agent?.id ?? agentId;
  });

  const selectConversations = useMemo(
    () => makeSelectAgentConversations(canonicalAgentId, null),
    [canonicalAgentId],
  );

  const {
    status: convStatus,
    conversations,
    error: convError,
  } = useAppSelector((state) => selectConversations(state));

  useEffect(() => {
    if (convStatus === "idle") {
      dispatch(
        fetchAgentConversations({
          agentId: canonicalAgentId,
          versionFilter: null,
        }),
      );
    }
  }, [canonicalAgentId, convStatus, dispatch]);

  const liveConversationId = useAppSelector((state) =>
    conversationId ? selectLatestConversationId(conversationId)(state) : null,
  );
  const activeConversationId =
    conversationIdFromUrl ?? liveConversationId ?? undefined;

  const handleConversationSelect = (conversationId: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("conversationId", conversationId);
    router.push(`${pathname}?${params.toString()}`);
  };

  // Singleton row menu — one instance, every row shares it.
  const rowMenu = useConversationRowMenu();

  const openRowMenu = useCallback(
    (conv: ConversationListItem, anchor: MenuAnchor) => {
      const data: ConversationRowMenuData = {
        conversationId: conv.conversationId,
        title: conv.title,
        isFavorite: conv.isFavorite ?? false,
        isArchived: conv.status === "archived",
        excludeFromKg: conv.excludeFromKg ?? false,
        isOwner: true,
        href: `/agents/${agentId}/run?conversationId=${conv.conversationId}`,
        surfaceKey,
      };
      rowMenu.openForRow(data, anchor);
    },
    [agentId, surfaceKey, rowMenu],
  );

  const agentName = useAppSelector((state) => selectAgentName(state, agentId));

  const conversationSectionLoading = convStatus === "loading";
  const conversationSectionFailed = convStatus === "failed";

  const sourceFeature = "agent-runs-sidebar";

  const launcherSurfaceKey = `${sourceFeature}-launcher:${agentId}`;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <SidebarHeader
        agentId={agentId}
        conversationId={conversationId}
        surfaceKey={surfaceKey}
        conversationIdFromUrl={conversationIdFromUrl}
        onToggleSidebar={onToggleSidebar}
        basePath={basePath}
        backHref={backHref}
      />
      <div className="flex-1 overflow-y-auto min-h-0 flex flex-col">
        {/* Conversations (agent / AI threads) */}
        <div className="shrink-0 pt-2">
          <div className="px-3 py-1.5 flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {agentName} History
            </span>
          </div>
          {conversationSectionLoading && (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          )}
          {conversationSectionFailed && (
            <p className="px-3 pb-2 text-[10px] text-destructive">
              {convError ?? "Failed to load conversations"}
            </p>
          )}
          {convStatus === "succeeded" && conversations.length === 0 && (
            <div className="px-3 pb-3 text-center">
              <p className="text-[10px] text-muted-foreground">
                No conversations yet
              </p>
            </div>
          )}
          {conversations.map((conv) => (
            <ConversationListRow
              key={conv.conversationId}
              conv={conv}
              isActive={conv.conversationId === activeConversationId}
              onSelect={() => handleConversationSelect(conv.conversationId)}
              onOpenMenu={openRowMenu}
            />
          ))}
        </div>
      </div>
      <div className="shrink-0 border-t border-border pb-2">
        <AgentLauncherSidebarTester
          conversationId={conversationId}
          surfaceKey={launcherSurfaceKey}
        />
      </div>

      <ConversationRowMenu {...rowMenu.menuProps} />
    </div>
  );
}

function ConversationListRow({
  conv,
  isActive,
  onSelect,
  onOpenMenu,
}: {
  conv: ConversationListItem;
  isActive: boolean;
  onSelect: () => void;
  onOpenMenu: (conv: ConversationListItem, anchor: MenuAnchor) => void;
}) {
  const date = conv.updatedAt
    ? new Date(conv.updatedAt).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      })
    : null;

  const menuBtnRef = useRef<HTMLButtonElement>(null);

  return (
    <ConversationHoverPreview
      conversationId={conv.conversationId}
      side="right"
      align="start"
      onOpen={onSelect}
    >
      <div
        className={cn(
          "group flex items-center gap-2 w-full pr-1 transition-colors",
          isActive
            ? "bg-primary/10 text-primary"
            : "hover:bg-muted/50 text-foreground",
        )}
        onContextMenu={(e) => {
          e.preventDefault();
          onOpenMenu(conv, e);
        }}
      >
        <button
          type="button"
          onClick={onSelect}
          className="flex-1 min-w-0 flex items-center gap-2 px-3 py-2 text-left"
        >
          <div className="flex-1 min-w-0">
            <p
              className={cn(
                "text-xs font-medium truncate",
                isActive && "text-primary",
              )}
            >
              {conv.title?.trim() ? conv.title : "Untitled"}
            </p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <MessageSquare className="w-2.5 h-2.5 text-muted-foreground shrink-0" />
              <span className="text-[10px] text-muted-foreground">
                {conv.messageCount} msg{conv.messageCount === 1 ? "" : "s"}
                {date ? ` · ${date}` : ""}
              </span>
            </div>
          </div>
          {isActive && (
            <ChevronRight className="w-3 h-3 text-primary shrink-0" />
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
            "shrink-0 flex h-5 w-5 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground",
            "opacity-100 md:opacity-0 md:group-hover:opacity-100",
          )}
          aria-label="More options"
          title="More options"
        >
          <MoreHorizontal size={12} />
        </button>
      </div>
    </ConversationHoverPreview>
  );
}
