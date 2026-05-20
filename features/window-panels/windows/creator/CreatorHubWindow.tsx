/**
 * features/window-panels/windows/creator/CreatorHubWindow.tsx
 *
 * The Creator Hub — a global home for creator chrome, opened from the Crown in
 * the main sidebar. The creator analogue of the admin Bug indicator.
 *
 * Layout: a WindowPanel whose left sidebar is the tab list; each entry is a tab
 * page. Settings (creator-debug master toggle + prefs) and Data (the arbitrary
 * creator debug bag) are real and page-agnostic. The remaining tabs render the
 * SAME run-control panels as the inline CreatorRunPanel via the shared
 * CreatorRunTabContent, bound to the conversation the user was last active in
 * (sourced from the conversation-focus slice). When no conversation is active,
 * those tabs show an empty state.
 */

"use client";

import { useState } from "react";
import {
  Settings,
  Database,
  Play,
  Layers,
  FileJson,
  ToyBrick,
  SlidersHorizontal,
  ScrollText,
  Activity,
  Brain,
  BarChart3,
  Gauge,
  Server,
  MessageSquare,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import {
  selectLastFocusedInputConversation,
  selectLastFocusedDisplayConversation,
  selectLastFocusedSurfaceKey,
} from "@/features/agents/redux/execution-system/conversation-focus/conversation-focus.selectors";
import CreatorRunTabContent, {
  useCreatorRunWindows,
  type RunTabId,
} from "@/features/agents/components/run-controls/CreatorRunTabContent";
import type { CreatorHubTabId } from "@/features/overlays/openers/creatorHub";
import { selectIsCreator } from "@/lib/redux/selectors/userSelectors";
import { selectAgentName } from "@/features/agents/redux/agent-definition/selectors";
import CreatorSettingsTab from "./tabs/CreatorSettingsTab";
import CreatorDataTab from "./tabs/CreatorDataTab";

interface CreatorHubTabDef {
  id: CreatorHubTabId;
  label: string;
  icon: LucideIcon;
  /** Present for conversation-scoped tabs that defer to CreatorRunTabContent. */
  runTabId?: RunTabId;
}

// Settings + Data first (page-agnostic), then the run-control tabs — a faithful
// duplicate of CreatorRunPanel's tab list. The run panel's Run tab is id
// "settings" there; here it's id "run" so the creator Settings page owns
// "settings".
const CREATOR_HUB_TABS: CreatorHubTabDef[] = [
  { id: "settings", label: "Settings", icon: Settings },
  { id: "data", label: "Data", icon: Database },
  { id: "actions", label: "Actions", icon: Play, runTabId: "actions" },
  { id: "context", label: "Context", icon: Layers, runTabId: "context" },
  { id: "payload", label: "Payload", icon: FileJson, runTabId: "payload" },
  {
    id: "widget_invoker",
    label: "Widgets",
    icon: ToyBrick,
    runTabId: "widget_invoker",
  },
  { id: "run", label: "Run", icon: SlidersHorizontal, runTabId: "settings" },
  { id: "sysprompt", label: "System", icon: ScrollText, runTabId: "sysprompt" },
  { id: "last", label: "Request", icon: Activity, runTabId: "last" },
  {
    id: "model_context",
    label: "Model Context",
    icon: Brain,
    runTabId: "model_context",
  },
  { id: "session", label: "Session", icon: BarChart3, runTabId: "session" },
  { id: "client", label: "Client", icon: Gauge, runTabId: "client" },
  { id: "backend", label: "Backend", icon: Server, runTabId: "backend" },
];

function HubEmptyConversation() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
      <MessageSquare className="h-6 w-6 text-muted-foreground/50" />
      <p className="text-sm font-medium text-foreground">
        No active conversation
      </p>
      <p className="max-w-xs text-xs text-muted-foreground">
        Open an agent run or chat to populate this tab. The hub reflects the
        conversation you were last working in.
      </p>
    </div>
  );
}

export interface CreatorHubWindowProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: CreatorHubTabId;
}

export default function CreatorHubWindow({
  isOpen,
  onClose,
  initialTab = "settings",
}: CreatorHubWindowProps) {
  const [activeTab, setActiveTab] = useState<CreatorHubTabId>(initialTab);

  // Source the conversation the user was last active in (page-agnostic).
  const inputConvId = useAppSelector(selectLastFocusedInputConversation);
  const displayConvId = useAppSelector(selectLastFocusedDisplayConversation);
  const surfaceKey = useAppSelector(selectLastFocusedSurfaceKey);

  // Detected active context — shown in a banner so the user can see which
  // agent/conversation the hub is referencing (and spot a wrong guess). Run /
  // chat surface keys embed the agentId after the ":".
  const isCreator = useAppSelector(selectIsCreator);
  const activeAgentId =
    surfaceKey && surfaceKey.includes(":")
      ? surfaceKey.slice(surfaceKey.indexOf(":") + 1)
      : null;
  const activeAgentName = useAppSelector((state) =>
    activeAgentId ? selectAgentName(state, activeAgentId) : null,
  );

  // Shared embedded windows (Stream Debug, Run Settings) for the Actions tab.
  // Called unconditionally (rules of hooks); the open callbacks are only
  // reachable when a conversation exists, so empty ids never produce windows.
  const { openStreamDebugWindow, openRunSettingsWindow, windowPanels } =
    useCreatorRunWindows({
      conversationId: inputConvId ?? "",
      displayId: displayConvId ?? inputConvId ?? "",
    });

  if (!isOpen) return null;

  const active =
    CREATOR_HUB_TABS.find((t) => t.id === activeTab) ?? CREATOR_HUB_TABS[0];

  const sidebar = (
    <nav className="flex h-full flex-col gap-0.5 overflow-y-auto p-2">
      {CREATOR_HUB_TABS.map((tab) => {
        const Icon = tab.icon;
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs font-medium transition-colors",
              isActive
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );

  let body: React.ReactNode;
  if (active.id === "settings") {
    body = <CreatorSettingsTab />;
  } else if (active.id === "data") {
    body = <CreatorDataTab />;
  } else if (active.runTabId) {
    body = inputConvId ? (
      <div className="h-full overflow-y-auto">
        <CreatorRunTabContent
          tabId={active.runTabId}
          conversationId={inputConvId}
          displayConversationId={displayConvId ?? undefined}
          surfaceKey={surfaceKey ?? "creator-hub"}
          onOpenStreamDebugWindow={openStreamDebugWindow}
          onOpenRunSettingsWindow={openRunSettingsWindow}
        />
      </div>
    ) : (
      <HubEmptyConversation />
    );
  }

  return (
    <>
      <WindowPanel
        title="Creator Hub"
        width={900}
        height={620}
        minWidth={600}
        minHeight={420}
        urlSyncKey="creator_hub"
        overlayId="creatorHub"
        onClose={onClose}
        sidebar={sidebar}
        sidebarDefaultSize={190}
        sidebarMinSize={150}
        onCollectData={() => ({ activeTab })}
      >
        <div className="flex h-full w-full flex-col overflow-hidden bg-background">
          <div
            className="flex flex-wrap items-center gap-x-3 gap-y-0.5 border-b border-border bg-muted/40 px-3 py-1.5 text-[11px]"
            title={surfaceKey ? `Surface: ${surfaceKey}` : undefined}
          >
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Active
            </span>
            <span className="text-foreground">
              Agent:{" "}
              <span className="font-medium">
                {activeAgentName ??
                  (activeAgentId ? `${activeAgentId.slice(0, 8)}…` : "none")}
              </span>
            </span>
            <span className="text-muted-foreground">
              Conversation:{" "}
              <span className="font-mono">
                {inputConvId ? `${inputConvId.slice(0, 8)}…` : "none"}
              </span>
            </span>
            <span
              className={cn(
                "ml-auto rounded px-1.5 py-0.5 text-[10px] font-medium",
                isCreator
                  ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                  : "bg-muted text-muted-foreground",
              )}
              title={
                isCreator
                  ? "You are detected as the creator/owner of this agent"
                  : "You are not detected as the creator of this agent"
              }
            >
              {isCreator ? "Creator" : "Not creator"}
            </span>
          </div>
          {body}
        </div>
      </WindowPanel>
      {windowPanels}
    </>
  );
}
