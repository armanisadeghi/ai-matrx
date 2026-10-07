"use client";

/**
 * @registry-status: inline-window
 * CreatorRunPanel — Creator Run Panel
 *
 * A collapsible, always-visible tabbed panel between conversation and input.
 * Collapsed: single compact row with the conversation title + Cloud/Sandbox pill.
 * Expanded: fixed-height tabbed panel (h-72).
 *
 * The per-tab content and the two embedded windows (Stream Debug, Run Settings)
 * are shared with the global Creator Hub via `CreatorRunTabContent` and
 * `useCreatorRunWindows` — this component only owns the collapsible bottom-bar
 * chrome. Window panels render outside the collapsed/expanded branches so they
 * stay mounted even when collapsed.
 */

import { Badge, Button } from "@ai-matrx/design-system/controls";
import { useState, useCallback, useEffect } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useAppSelector } from "@ai-matrx/chat/store/hooks";
import { selectConversationTitle } from "@ai-matrx/chat/agents/redux/execution-system/messages/messages.selectors";
import { selectInstanceUIState } from "@ai-matrx/chat/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import { cn } from "@ai-matrx/design-system";
import CreatorRunTabContent, {
  useCreatorRunWindows,
  ALL_RUN_TABS,
  RUN_TAB_LABELS,
  type RunTabId,
} from "./CreatorRunTabContent";
export interface CreatorRunPanelProps {
  /**
   * The INPUT conversation — where the user is typing and which settings
   * adjustments target (Run Settings, System Prompt, Payload, Context,
   * Widget Invoker). Equals the display conversation in normal mode; under
   * autoClear=true after a split, this is the freshly-prepped instance the
   * input area was just moved to.
   */
  conversationId: string;
  /**
   * The DISPLAY conversation — where the streaming response lives and where
   * telemetry/recovery data is keyed (Last Request, Session, Client, Backend,
   * Reset). Falls back to `conversationId` when not provided.
   */
  displayConversationId?: string;
  /** Focus surface for startNewConversation (reset conversation). */
  surfaceKey: string;
  /** Restrict which tabs are visible. Defaults to all tabs when omitted. */
  tabs?: RunTabId[];
}

export function CreatorRunPanel({
  conversationId,
  displayConversationId,
  surfaceKey,
  tabs: allowedTabs,
}: CreatorRunPanelProps) {
  // Telemetry / response-context tabs read from the DISPLAY id (where the
  // just-completed request actually landed). Settings tabs that configure the
  // next submit stay on the INPUT id (`conversationId`).
  const displayId = displayConversationId ?? conversationId;
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<RunTabId>(() =>
    allowedTabs && allowedTabs.length > 0 ? allowedTabs[0] : "actions",
  );

  const { openStreamDebugWindow, openRunSettingsWindow, windowPanels } =
    useCreatorRunWindows({ conversationId, displayId });

  // Title belongs to the conversation that was just labeled by the server —
  // the display id (where the response carrying the title landed).
  const conversationTitle = useAppSelector(selectConversationTitle(displayId));

  // At-a-glance API target indicator for the collapsed bar (cloud vs sandbox).
  const instanceUIForBadge = useAppSelector(selectInstanceUIState(displayId));
  const isOverridden = Boolean(instanceUIForBadge?.serverOverrideUrl);

  // Session count across ALL instances for the tab label.
  const totalRequestCount = useAppSelector((state) => {
    let count = 0;
    for (const id of state.conversations.allConversationIds) {
      count += (state.activeRequests.byConversationId[id] ?? []).length;
    }
    return count;
  });

  const handleExpand = useCallback(() => setIsExpanded(true), []);
  const handleCollapse = useCallback(() => setIsExpanded(false), []);

  // Deep-link from external triggers (e.g. the header ContextGaugeWidget):
  // listen for `matrx:openCreatorTab` and switch tabs / expand. Gated on
  // conversationId so unrelated panels in a multi-pane layout ignore it.
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    type Detail = { tab?: RunTabId; conversationId?: string };
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<Detail>).detail ?? {};
      if (
        detail.conversationId &&
        detail.conversationId !== conversationId &&
        detail.conversationId !== displayId
      ) {
        return;
      }
      if (!detail.tab) return;
      const allowed = allowedTabs ?? ALL_RUN_TABS;
      if (!allowed.includes(detail.tab)) return;
      setActiveTab(detail.tab);
      setIsExpanded(true);
    };
    window.addEventListener("matrx:openCreatorTab", handler);
    return () => window.removeEventListener("matrx:openCreatorTab", handler);
  }, [conversationId, displayId, allowedTabs]);

  // ── Collapsed view ────────────────────────────────────────────────────────
  if (!isExpanded) {
    return (
      <>
        <div className="border-t border-l border-r border-border">
          <button
            type="button"
            onClick={handleExpand}
            className="flex items-center gap-2 w-full pl-2 pr-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors min-w-0"
          >
            <span className="font-medium text-foreground truncate shrink-0 max-w-[120px] sm:max-w-none">
              {conversationTitle ?? "Creator Panel"}
            </span>
            <Badge
              className="ml-2 shrink-0"
              tone={isOverridden ? "success" : "neutral"}
              title={
                isOverridden
                  ? "AI calls for this conversation are routed to the sandbox proxy"
                  : "AI calls for this conversation use the global cloud server"
              }
            >
              {isOverridden ? "Sandbox" : "Cloud"}
            </Badge>
            <ChevronDown className="w-3 h-3 shrink-0 ml-auto" />
          </button>
        </div>
        {windowPanels}
      </>
    );
  }

  // ── Expanded view ─────────────────────────────────────────────────────────
  const visibleTabIds = allowedTabs ?? ALL_RUN_TABS;
  const tabs = visibleTabIds.map((id) => ({
    id,
    label:
      id === "session" && totalRequestCount > 0
        ? `Session (${totalRequestCount})`
        : RUN_TAB_LABELS[id],
  }));

  return (
    <>
      <div className="border-t border-border bg-card">
        {/* Tab header */}
        <div className="flex items-center border-b border-border min-w-0">
          <div className="flex items-center gap-0 overflow-x-auto min-w-0 flex-1 scrollbar-none">
            {tabs.map((tab) => (
              <Button variant="quiet" pressed={!!(activeTab === tab.id)} key={tab.id} onClick={() => setActiveTab(tab.id)} className="-mb-px shrink-0">{tab.label}</Button>
            ))}
          </div>

          <Button variant="quiet" icon={<ChevronUp />} onClick={handleCollapse} title="Collapse" aria-label="Collapse" className="ml-1 shrink-0" />
        </div>

        {/* Tab content — fixed height (shorter on mobile so it doesn't dominate the viewport) */}
        <div className="h-[50dvh] sm:h-72 overflow-y-auto">
          <CreatorRunTabContent
            tabId={activeTab}
            conversationId={conversationId}
            displayConversationId={displayConversationId}
            surfaceKey={surfaceKey}
            onOpenStreamDebugWindow={openStreamDebugWindow}
            onOpenRunSettingsWindow={openRunSettingsWindow}
          />
        </div>
      </div>
      {windowPanels}
    </>
  );
}
