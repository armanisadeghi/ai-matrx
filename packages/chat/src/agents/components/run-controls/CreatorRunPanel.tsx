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

import { useState, useCallback, useEffect } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectConversationTitle } from "@/features/agents/redux/execution-system/messages/messages.selectors";
import { selectInstanceUIState } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import { cn } from "@/lib/utils";
import CreatorRunTabContent, {
  useCreatorRunWindows,
  ALL_RUN_TABS,
  RUN_TAB_LABELS,
  type RunTabId,
} from "./CreatorRunTabContent";
interface CreatorRunPanelProps {
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
            <span
              className={cn(
                "ml-2 inline-flex items-center px-1.5 py-0.5 rounded border text-[9px] font-mono uppercase tracking-wider shrink-0",
                isOverridden
                  ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                  : "bg-muted text-muted-foreground border-border",
              )}
              title={
                isOverridden
                  ? "AI calls for this conversation are routed to the sandbox proxy"
                  : "AI calls for this conversation use the global cloud server"
              }
            >
              {isOverridden ? "Sandbox" : "Cloud"}
            </span>
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
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`px-2 py-1.5 text-[11px] font-medium transition-colors border-b-2 -mb-px whitespace-nowrap shrink-0 ${
                  activeTab === tab.id
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={handleCollapse}
            className="p-1.5 ml-1 text-muted-foreground hover:text-foreground transition-colors shrink-0"
            title="Collapse"
          >
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
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
