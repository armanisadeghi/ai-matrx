"use client";

/**
 * @registry-status: inline-window
 * CreatorRunPanel — Creator Run Panel
 *
 * A collapsible, always-visible tabbed panel between conversation and input.
 * Collapsed: single compact row with "Creator Panel" + stats pills.
 * Expanded: fixed-height tabbed panel (h-72).
 *
 * Tabs:
 *   Actions | Run Settings | System Prompt | Last Request | Session | Client
 *
 * Rendered inline by AgentConversationColumn — uses <WindowPanel> as styling
 * chrome for two embedded sub-panels but is NOT mounted via the unified
 * registry/controller. Its props are driven by the parent column, not Redux.
 * Do NOT add a registry entry without first converting it to the callback-bus
 * pattern (see ImageUploaderWindow for the model).
 */

import { useState, useCallback, useRef } from "react";
import {
  ChevronDown,
  ChevronUp,
  RotateCcw,
  AppWindow,
  SlidersHorizontal,
  Brain,
} from "lucide-react";
import { useAppSelector, useAppDispatch } from "@/lib/redux/hooks";
import {
  restoreWindow,
  focusWindow,
  selectWindow,
} from "@/lib/redux/slices/windowManagerSlice";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import { selectIsSuperAdmin } from "@/lib/redux/slices/userSlice";
import {
  selectIsMemoryEnabledForConversation,
  selectMemoryCounters,
  selectMemoryDegraded,
} from "@/features/agents/redux/execution-system/observational-memory/observational-memory.selectors";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { startNewConversation } from "@/features/agents/redux/execution-system/thunks/create-instance.thunk";
import { setBuilderAdvancedSettings } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.slice";
import { selectUseStructuredSystemInstruction } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import { RunSettingsEditor } from "./RunSettingsEditor";
import { ContextSlotsTab } from "./ContextSlotsTab";
import { PayloadTab } from "./PayloadTab";
import { selectConversationTitle } from "@/features/agents/redux/execution-system/messages/messages.selectors";
import { selectInstanceUIState } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import { SystemInstructionEditor } from "../builder/message-builders/system-instructions/SystemInstructionEditor";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { StreamDebugPanel } from "../debug/StreamDebugPanel";
import { AgentWidgetInvokerTester } from "./AgentWidgetInvokerTester";
import { RequestStatsPanel } from "./panels/RequestStatsPanel";
import { SessionStatsPanel } from "./panels/SessionStatsPanel";
import { ClientMetricsPanel } from "./panels/ClientMetricsPanel";
import { BackendTargetPanel } from "./panels/BackendTargetPanel";
import { cn } from "@/lib/utils";

// =============================================================================
// Tab type
// =============================================================================

type TabId =
  | "actions"
  | "context"
  | "payload"
  | "widget_invoker"
  | "settings"
  | "sysprompt"
  | "last"
  | "session"
  | "client"
  | "backend";

// =============================================================================
// Tab 1: Actions
// =============================================================================

function ActionsTab({
  conversationId,
  surfaceKey,
  onOpenStreamDebugWindow,
  onOpenRunSettingsWindow,
}: {
  conversationId: string;
  surfaceKey: string;
  onOpenStreamDebugWindow: () => void;
  onOpenRunSettingsWindow: () => void;
}) {
  const dispatch = useAppDispatch();
  const isAdmin = useAppSelector(selectIsSuperAdmin);
  const isMemoryEnabled = useAppSelector(
    selectIsMemoryEnabledForConversation(conversationId),
  );
  const memoryDegraded = useAppSelector(selectMemoryDegraded(conversationId));
  const memoryCounters = useAppSelector(selectMemoryCounters(conversationId));

  const handleReset = useCallback(() => {
    dispatch(
      startNewConversation({
        currentConversationId: conversationId,
        surfaceKey,
      }),
    )
      .unwrap()
      .catch((err) => console.error("Failed to reset test instance:", err));
  }, [conversationId, surfaceKey, dispatch]);

  const handleOpenMemoryInspector = useCallback(() => {
    dispatch(
      openOverlay({
        overlayId: "observationalMemoryWindow",
        data: { selectedConversationId: conversationId },
      }),
    );
  }, [dispatch, conversationId]);

  const ActionButton = ({
    onClick,
    icon: Icon,
    label,
    iconClassName,
  }: {
    onClick: () => void;
    icon: React.ComponentType<{ className?: string }>;
    label: React.ReactNode;
    iconClassName?: string;
  }) => (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center justify-center gap-1.5 w-[84px] h-[84px] text-muted-foreground hover:text-foreground bg-muted/10 hover:bg-muted/30 border border-transparent hover:border-border rounded-xl transition-all shrink-0"
    >
      <Icon className={cn("w-7 h-7", iconClassName)} />
      <span className="text-[10px] text-center leading-tight font-medium px-1">
        {label}
      </span>
    </button>
  );

  return (
    <div className="p-2 flex flex-wrap content-start gap-2 h-full overflow-y-auto">
      <ActionButton
        onClick={handleReset}
        icon={RotateCcw}
        iconClassName="text-amber-500"
        label={
          <>
            Reset
            <br />
            Conversation
          </>
        }
      />
      <ActionButton
        onClick={onOpenStreamDebugWindow}
        icon={AppWindow}
        iconClassName="text-blue-500"
        label={
          <>
            Debug
            <br />
            Window
          </>
        }
      />
      <ActionButton
        onClick={onOpenRunSettingsWindow}
        icon={SlidersHorizontal}
        iconClassName="text-green-500"
        label={
          <>
            Run
            <br />
            Settings
          </>
        }
      />
      {isAdmin && (
        <button
          type="button"
          onClick={handleOpenMemoryInspector}
          className={cn(
            "relative flex flex-col items-center justify-center gap-1.5 w-[84px] h-[84px] text-muted-foreground hover:text-foreground bg-muted/10 hover:bg-muted/30 border border-transparent hover:border-border rounded-xl transition-all shrink-0",
            isMemoryEnabled &&
              "bg-purple-500/10 border-purple-500/30 text-foreground",
          )}
        >
          <Brain
            className={cn(
              "w-7 h-7",
              isMemoryEnabled ? "text-purple-500" : "text-purple-500/60",
            )}
          />
          <span className="text-[10px] text-center leading-tight font-medium px-1">
            Memory
            <br />
            Inspector
          </span>
          {isMemoryEnabled && (
            <span className="absolute top-1 right-1 flex items-center gap-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse" />
              {memoryCounters.totalEvents > 0 && (
                <span className="text-[9px] font-mono text-purple-500 leading-none">
                  {memoryCounters.totalEvents}
                </span>
              )}
            </span>
          )}
          {memoryDegraded && (
            <span className="absolute top-1 left-1 w-1.5 h-1.5 rounded-full bg-amber-500" />
          )}
        </button>
      )}
    </div>
  );
}

// =============================================================================
// Tab 2: Run Settings
// =============================================================================

function RunSettingsTab({ conversationId }: { conversationId: string }) {
  return (
    <div className="px-3 py-2">
      <RunSettingsEditor conversationId={conversationId} />
    </div>
  );
}

// =============================================================================
// Tab 3: System Prompt
// =============================================================================

function SystemPromptTab({ conversationId }: { conversationId: string }) {
  const dispatch = useAppDispatch();
  const isActive = useAppSelector(
    selectUseStructuredSystemInstruction(conversationId),
  );

  return (
    <div className="px-3 py-2">
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-border">
        <Label
          htmlFor={`sysprompt-active-${conversationId}`}
          className="text-xs text-muted-foreground cursor-pointer"
        >
          Structured system prompt
        </Label>
        <Switch
          id={`sysprompt-active-${conversationId}`}
          checked={isActive}
          onCheckedChange={(v) =>
            dispatch(
              setBuilderAdvancedSettings({
                conversationId,
                changes: { useStructuredSystemInstruction: v },
              }),
            )
          }
          className="scale-75 origin-right"
        />
      </div>

      {isActive ? (
        <SystemInstructionEditor conversationId={conversationId} />
      ) : (
        <p className="text-xs text-muted-foreground/60">
          Enable to configure structured system instruction fields (intro,
          outro, content blocks, etc.)
        </p>
      )}
    </div>
  );
}

// =============================================================================
// Main component
// =============================================================================

const ALL_TABS: TabId[] = [
  "actions",
  "context",
  "payload",
  "widget_invoker",
  "settings",
  "sysprompt",
  "last",
  "session",
  "client",
  "backend",
];

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
   * The DISPLAY conversation — where the streaming response lives and
   * where telemetry/recovery data is keyed (Last Request, Session, Client,
   * Backend, Reset). Falls back to `conversationId` when not provided.
   *
   * Why both: under autoClear=true, smart-execute fires the request on the
   * current conversation, then splits — input focus moves to a new instance
   * while display focus stays put. The just-completed request's stats live
   * on the DISPLAY id; settings the engineer is configuring for the NEXT
   * call live on the INPUT id. Threading both is the only way both
   * surfaces stay coherent.
   */
  displayConversationId?: string;
  /** Focus surface for startNewConversation (reset conversation). */
  surfaceKey: string;
  /** Restrict which tabs are visible. Defaults to all tabs when omitted. */
  tabs?: TabId[];
}

export function CreatorRunPanel({
  conversationId,
  displayConversationId,
  surfaceKey,
  tabs: allowedTabs,
}: CreatorRunPanelProps) {
  // Telemetry / response-context tabs read from the DISPLAY id (where the
  // just-completed request actually landed). Settings tabs that configure
  // the next submit stay on the INPUT id (`conversationId`).
  const displayId = displayConversationId ?? conversationId;
  const dispatch = useAppDispatch();
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>(() =>
    allowedTabs && allowedTabs.length > 0 ? allowedTabs[0] : "actions",
  );
  // Window panels stay mounted once opened (never unmounted while minimized).
  // Only set to false when the user explicitly closes via onClose.
  const [streamDebugWindowOpen, setStreamDebugWindowOpen] = useState(false);
  const [runSettingsWindowOpen, setRunSettingsWindowOpen] = useState(false);

  // Freeze window ids at first render — they must never change even if
  // conversationId changes (e.g. after reset), otherwise the hook cleanup
  // fires, unregisters the window from Redux, and the tray chip disappears.
  // Stream Debug is keyed to displayId (where the response lives); Run
  // Settings is keyed to the input id (where the next call fires).
  const streamDebugIdRef = useRef(`stream-debug-${displayId}`);
  const runSettingsIdRef = useRef(`run-settings-${conversationId}`);
  const streamDebugId = streamDebugIdRef.current;
  const runSettingsId = runSettingsIdRef.current;

  const streamDebugEntry = useAppSelector(selectWindow(streamDebugId));
  const runSettingsEntry = useAppSelector(selectWindow(runSettingsId));

  const openStreamDebugWindow = useCallback(() => {
    if (streamDebugEntry) {
      // Already registered — restore if minimized, then focus
      dispatch(restoreWindow(streamDebugId));
      dispatch(focusWindow(streamDebugId));
    } else {
      setStreamDebugWindowOpen(true);
    }
  }, [dispatch, streamDebugEntry, streamDebugId]);

  const openRunSettingsWindow = useCallback(() => {
    if (runSettingsEntry) {
      dispatch(restoreWindow(runSettingsId));
      dispatch(focusWindow(runSettingsId));
    } else {
      setRunSettingsWindowOpen(true);
    }
  }, [dispatch, runSettingsEntry, runSettingsId]);

  // Title belongs to the conversation that was just labeled by the server —
  // that's the display id (where the response carrying the title landed).
  const conversationTitle = useAppSelector(
    selectConversationTitle(displayId),
  );

  // At-a-glance API target indicator — appears on the collapsed creator bar
  // so an admin can see whether THIS conversation is talking to the cloud
  // server or to a sandbox proxy without expanding the panel. Source of
  // truth lives in `instanceUIState[displayId].serverOverrideUrl`; see
  // BackendTargetPanel for the full breakdown. Tied to displayId so the
  // badge describes the run the user is currently looking at.
  const instanceUIForBadge = useAppSelector(
    selectInstanceUIState(displayId),
  );
  const isOverridden = Boolean(instanceUIForBadge?.serverOverrideUrl);
  // Session count across ALL instances for the tab label
  const totalRequestCount = useAppSelector((state) => {
    let count = 0;
    for (const id of state.conversations.allConversationIds) {
      count += (state.activeRequests.byConversationId[id] ?? []).length;
    }
    return count;
  });

  const handleExpand = useCallback(() => setIsExpanded(true), []);
  const handleCollapse = useCallback(() => setIsExpanded(false), []);

  // ── Window panels — rendered OUTSIDE the collapsed/expanded branches ───────
  // They must always stay mounted once opened so the hook's cleanup never fires
  // and the minimized tray chip keeps working. Only unmounted on explicit close.
  const windowPanels = (
    <>
      {streamDebugWindowOpen && (
        <WindowPanel
          id={streamDebugId}
          title="Stream Debug"
          width={680}
          height={720}
          onClose={() => setStreamDebugWindowOpen(false)}
          urlSyncKey="debug"
          urlSyncId={displayId}
        >
          <StreamDebugPanel conversationId={displayId} />
        </WindowPanel>
      )}
      {runSettingsWindowOpen && (
        <WindowPanel
          id={runSettingsId}
          title="Run Settings"
          width={420}
          height={480}
          onClose={() => setRunSettingsWindowOpen(false)}
          urlSyncKey="run_settings"
          urlSyncId={conversationId}
        >
          <div className="p-3">
            <RunSettingsEditor conversationId={conversationId} />
          </div>
        </WindowPanel>
      )}
    </>
  );

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
  const visibleTabIds = allowedTabs ?? ALL_TABS;

  const allTabDefs: Array<{ id: TabId; label: string }> = [
    { id: "actions", label: "Actions" },
    { id: "context", label: "Context" },
    { id: "payload", label: "Payload" },
    { id: "widget_invoker", label: "Widgets" },
    { id: "settings", label: "Run" },
    { id: "sysprompt", label: "System" },
    { id: "last", label: "Request" },
    {
      id: "session",
      label:
        totalRequestCount > 0 ? `Session (${totalRequestCount})` : "Session",
    },
    { id: "client", label: "Client" },
    { id: "backend", label: "Backend" },
  ];

  const tabs = allTabDefs.filter((t) => visibleTabIds.includes(t.id));

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
          {/* Actions: reset clears the displayed conversation; memory + */}
          {/* debug windows describe the displayed run. */}
          {activeTab === "actions" && (
            <ActionsTab
              conversationId={displayId}
              surfaceKey={surfaceKey}
              onOpenStreamDebugWindow={openStreamDebugWindow}
              onOpenRunSettingsWindow={openRunSettingsWindow}
            />
          )}
          {/* Context / payload / run settings / system prompt / widgets */}
          {/* configure the NEXT submit — keep them on the input id. */}
          {activeTab === "context" && (
            <ContextSlotsTab conversationId={conversationId} />
          )}
          {activeTab === "payload" && (
            <PayloadTab conversationId={conversationId} />
          )}
          {activeTab === "settings" && (
            <RunSettingsTab conversationId={conversationId} />
          )}
          {activeTab === "sysprompt" && (
            <SystemPromptTab conversationId={conversationId} />
          )}
          {/* Telemetry — every panel keyed to the request that just ran, */}
          {/* which lives on the display id (not the input one). */}
          {activeTab === "last" && (
            <RequestStatsPanel conversationId={displayId} />
          )}
          {activeTab === "session" && (
            <SessionStatsPanel conversationId={displayId} />
          )}
          {activeTab === "client" && (
            <ClientMetricsPanel conversationId={displayId} />
          )}
          {activeTab === "widget_invoker" && (
            <AgentWidgetInvokerTester
              conversationId={conversationId}
              sourceFeature="agent-creator-panel"
              surfaceKey={`creator-widget-tester:${conversationId}`}
            />
          )}
          {activeTab === "backend" && (
            <BackendTargetPanel conversationId={displayId} />
          )}
        </div>
      </div>
      {windowPanels}
    </>
  );
}
