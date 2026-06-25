"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Filter, Plus, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppDispatch } from "@/lib/redux/hooks";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import type { ConversationListItem } from "@/features/agents/redux/conversation-list/conversation-list.types";
import { ConversationHistorySidebar } from "@/features/agents/components/conversation-history/ConversationHistorySidebar";
import { describeFilter } from "@/features/agents/redux/agent-filter/selectors";
import { SidePanelHeader, SidePanelAction } from "../views/SidePanelChrome";
import { AVATAR_RESERVE } from "../styles/tokens";
import { useCodeWorkspaceHistory } from "./useCodeWorkspaceHistory";

interface ChatHistorySlotProps {
  className?: string;
  /** When true, the top row reserves space for the app's floating avatar. */
  rightmost?: boolean;
}

const CODE_HISTORY_SCOPE = "code-workspace";
const CODE_WORKSPACE_SETTINGS_TAB = "editor.codeWorkspace";

/**
 * Conversation history for the /code workspace.
 *
 * Replaces the previous version-grouped "runner" sidebar with a date- /
 * agent-grouped, paginated, favorite-aware list driven by the reusable
 * `ConversationHistorySidebar`. The set of agents shown comes from the
 * user's saved `coding.agentFilter` preference — editable via the
 * Settings window's "Code Workspace" tab.
 */
export const ChatHistorySlot: React.FC<ChatHistorySlotProps> = ({
  className,
  rightmost = false,
}) => {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeConversationId = searchParams.get("conversationId");
  const agentId = searchParams.get("agentId");

  const {
    filter,
    filteredAgentIds,
    defaultGrouping,
    pageSize,
    isFavorite,
    onToggleFavorite,
  } = useCodeWorkspaceHistory();

  const openConversation = useCallback(
    (conv: ConversationListItem) => {
      const next = new URLSearchParams(searchParams.toString());
      next.set("conversationId", conv.conversationId);
      if (conv.agentId) next.set("agentId", conv.agentId);
      router.replace(`${pathname}?${next.toString()}`);
    },
    [pathname, router, searchParams],
  );

  const openSettings = useCallback(() => {
    dispatch(
      openOverlay({
        overlayId: "userPreferencesWindow",
        data: { initialTabId: CODE_WORKSPACE_SETTINGS_TAB },
      }),
    );
  }, [dispatch]);

  const handleNewChat = useCallback(() => {
    if (!agentId) return;
    const next = new URLSearchParams(searchParams.toString());
    next.delete("conversationId");
    router.replace(`${pathname}?${next.toString()}`);
  }, [agentId, pathname, router, searchParams]);

  const filterLabel = useMemo(() => describeFilter(filter), [filter]);

  // User preferences hydrate client-side AFTER the Redux store init, so the
  // server renders with the slice default (`filter.mode === "all"` → no
  // subtitle) while the client's first paint already reflects the saved
  // value (e.g. "explicit" → "Specific (10)" subtitle). React then sees a
  // missing `<span>` on the server and bails on hydration. Defer the
  // subtitle until after mount so the FIRST render on both sides agrees.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const headerSubtitle =
    mounted && filter.mode !== "all" ? filterLabel : undefined;

  // Same SSR-mismatch concern as headerSubtitle above — `filterLabel` derives
  // from the user-prefs slice that hydrates client-side after init, so we
  // defer the dynamic value until after mount and render a stable copy on
  // the server's first paint. `suppressHydrationWarning` belt-and-braces in
  // case any wrapper React mounts before our effect fires.
  const emptyState = useMemo(
    () => (
      <div className="flex flex-col items-center gap-2 px-4 py-6 text-center">
        <Filter
          size={22}
          strokeWidth={1.2}
          className="text-neutral-400 dark:text-neutral-500"
        />
        <div className="text-[12px] font-medium text-neutral-700 dark:text-neutral-200">
          No conversations yet
        </div>
        <div className="text-[11px] text-neutral-500 dark:text-neutral-400">
          Matching filter{" "}
          <span
            className="font-medium text-neutral-700 dark:text-neutral-200"
            suppressHydrationWarning
          >
            {mounted ? filterLabel : "your saved filter"}
          </span>
          .
        </div>
        <button
          type="button"
          onClick={openSettings}
          className="mt-1 rounded border border-neutral-200 px-2 py-0.5 text-[11px] text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
        >
          Change filter
        </button>
      </div>
    ),
    [filterLabel, mounted, openSettings],
  );

  return (
    <div className={cn("flex h-full min-h-0 flex-col", className)}>
      <SidePanelHeader
        title="History"
        subtitle={headerSubtitle}
        actions={
          <>
            {agentId && (
              <SidePanelAction
                icon={Plus}
                label="New chat"
                onClick={handleNewChat}
              />
            )}
            <SidePanelAction
              icon={Settings2}
              label="History settings"
              onClick={openSettings}
            />
          </>
        }
        className={rightmost ? AVATAR_RESERVE : undefined}
      />
      <div className="min-h-0 flex-1">
        <ConversationHistorySidebar
          scopeId={CODE_HISTORY_SCOPE}
          agentIds={filteredAgentIds}
          activeConversationId={activeConversationId}
          onOpenConversation={openConversation}
          openInPlace
          defaultGrouping={defaultGrouping}
          pageSize={pageSize}
          isFavorite={isFavorite}
          onToggleFavorite={onToggleFavorite}
          emptyState={emptyState}
        />
      </div>
    </div>
  );
};

export default ChatHistorySlot;
