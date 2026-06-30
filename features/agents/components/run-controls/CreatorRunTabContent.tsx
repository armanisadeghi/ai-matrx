"use client";

/**
 * CreatorRunTabContent — the shared body of the creator run panels.
 *
 * Renders a single run-control tab's content for a given conversation. Used by
 * both the inline CreatorRunPanel (above the agent input) and the global
 * Creator Hub window. The hosts differ only in chrome (CreatorRunPanel: a
 * collapsible bottom bar; Creator Hub: a WindowPanel with a tab sidebar) — the
 * per-tab content lives here so there is exactly one source of truth.
 *
 * The Actions tab's two embedded windows (Stream Debug, Run Settings) are
 * managed by `useCreatorRunWindows` so the host can render the windows OUTSIDE
 * the tab body — CreatorRunPanel keeps them mounted even while collapsed.
 */

import {
  useState,
  useCallback,
  type ComponentType,
  type ReactNode,
} from "react";
import { RotateCcw, AppWindow, SlidersHorizontal, Brain } from "lucide-react";
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
import { SystemInstructionEditor } from "../builder/message-builders/system-instructions/SystemInstructionEditor";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { StreamDebugPanel } from "../debug/StreamDebugPanel";
import { AgentWidgetInvokerTester } from "./AgentWidgetInvokerTester";
import { RequestStatsPanel } from "./panels/RequestStatsPanel";
import { SessionStatsPanel } from "./panels/SessionStatsPanel";
import { ClientMetricsPanel } from "./panels/ClientMetricsPanel";
import { BackendTargetPanel } from "./panels/BackendTargetPanel";
import { ModelContextPanel } from "./panels/ModelContextPanel";
import { cn } from "@/lib/utils";

// =============================================================================
// Tab ids + labels (shared source of truth for both hosts' tab lists)
// =============================================================================

export type RunTabId =
  | "actions"
  | "context"
  | "payload"
  | "widget_invoker"
  | "settings"
  | "sysprompt"
  | "last"
  | "model_context"
  | "session"
  | "client"
  | "backend";

export const ALL_RUN_TABS: RunTabId[] = [
  "actions",
  "context",
  "payload",
  "widget_invoker",
  "settings",
  "sysprompt",
  "last",
  "model_context",
  "session",
  "client",
  "backend",
];

export const RUN_TAB_LABELS: Record<RunTabId, string> = {
  actions: "Actions",
  context: "Context",
  payload: "Payload",
  widget_invoker: "Widgets",
  settings: "Run",
  sysprompt: "System",
  last: "Request",
  model_context: "Model Context",
  session: "Session",
  client: "Client",
  backend: "Backend",
};

// =============================================================================
// Actions tab
// =============================================================================

function ActionButton({
  onClick,
  icon: Icon,
  label,
  iconClassName,
}: {
  onClick: () => void;
  icon: ComponentType<{ className?: string }>;
  label: ReactNode;
  iconClassName?: string;
}) {
  return (
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
}

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
        data: { initialSelectedConversationId: conversationId },
      }),
    );
  }, [dispatch, conversationId]);

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
          {isMemoryEnabled && memoryCounters != null && (
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
// System prompt tab
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
// Embedded windows (Stream Debug + Run Settings) — shared hook
// =============================================================================

/**
 * Owns the two embedded WindowPanels the Actions tab opens. Returns open
 * callbacks for the Actions tab plus the `windowPanels` JSX the host renders.
 * Window ids are frozen at first render so they never change even if
 * conversationId changes (otherwise the hook cleanup unregisters the window
 * and the tray chip disappears).
 */
export function useCreatorRunWindows({
  conversationId,
  displayId,
}: {
  conversationId: string;
  displayId: string;
}) {
  const dispatch = useAppDispatch();
  const [streamDebugWindowOpen, setStreamDebugWindowOpen] = useState(false);
  const [runSettingsWindowOpen, setRunSettingsWindowOpen] = useState(false);

  // Frozen at first render via lazy useState — the ids must never change even
  // if conversationId changes, otherwise the hook cleanup unregisters the
  // window and the tray chip disappears.
  const [streamDebugId] = useState(() => `stream-debug-${displayId}`);
  const [runSettingsId] = useState(() => `run-settings-${conversationId}`);

  const streamDebugEntry = useAppSelector(selectWindow(streamDebugId));
  const runSettingsEntry = useAppSelector(selectWindow(runSettingsId));

  const openStreamDebugWindow = useCallback(() => {
    if (streamDebugEntry) {
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
          bodyClassName="flex min-h-0 flex-col overflow-hidden p-0"
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

  return { openStreamDebugWindow, openRunSettingsWindow, windowPanels };
}

// =============================================================================
// Content switch
// =============================================================================

export interface CreatorRunTabContentProps {
  tabId: RunTabId;
  /** Input conversation — settings/context/payload/system/widgets target this. */
  conversationId: string;
  /** Display conversation — telemetry tabs key off this. Falls back to input. */
  displayConversationId?: string;
  /** Focus surface for startNewConversation (reset). */
  surfaceKey: string;
  onOpenStreamDebugWindow: () => void;
  onOpenRunSettingsWindow: () => void;
}

export default function CreatorRunTabContent({
  tabId,
  conversationId,
  displayConversationId,
  surfaceKey,
  onOpenStreamDebugWindow,
  onOpenRunSettingsWindow,
}: CreatorRunTabContentProps) {
  const displayId = displayConversationId ?? conversationId;

  switch (tabId) {
    case "actions":
      return (
        <ActionsTab
          conversationId={displayId}
          surfaceKey={surfaceKey}
          onOpenStreamDebugWindow={onOpenStreamDebugWindow}
          onOpenRunSettingsWindow={onOpenRunSettingsWindow}
        />
      );
    case "context":
      return <ContextSlotsTab conversationId={conversationId} />;
    case "payload":
      return <PayloadTab conversationId={conversationId} />;
    case "settings":
      return (
        <div className="px-3 py-2">
          <RunSettingsEditor conversationId={conversationId} />
        </div>
      );
    case "sysprompt":
      return <SystemPromptTab conversationId={conversationId} />;
    case "last":
      return <RequestStatsPanel conversationId={displayId} />;
    case "model_context":
      return <ModelContextPanel conversationId={displayId} />;
    case "session":
      return <SessionStatsPanel conversationId={displayId} />;
    case "client":
      return <ClientMetricsPanel conversationId={displayId} />;
    case "widget_invoker":
      return (
        <AgentWidgetInvokerTester
          conversationId={conversationId}
          sourceFeature="agent-creator-panel"
          surfaceKey={`creator-widget-tester:${conversationId}`}
        />
      );
    case "backend":
      return <BackendTargetPanel conversationId={displayId} />;
    default:
      return null;
  }
}
