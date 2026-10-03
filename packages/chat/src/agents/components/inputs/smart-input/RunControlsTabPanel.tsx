"use client";

/**
 * RunControlsTabPanel — the shared core of the run-controls surface.
 *
 * One set of tab definitions, one state hook, one tab-content renderer,
 * consumed by every presentation of the run controls:
 *
 *   - RunControlsWindow  — the canonical desktop presentation (WindowPanel,
 *     non-blocking, minimizable to the tray, maximizable)
 *   - RunControlsMenu    — the trigger button; renders the mobile
 *     TabbedBottomSheet and the in-dialog popover fallback
 *
 * Keep tab content and badge logic HERE so the presentations can never drift.
 */

import { type ComponentType, type ReactNode } from "react";
import {
  Paperclip,
  Box,
  AppWindow,
  Cpu,
  Layers,
  Crown,
  Bug,
  ScrollText,
  FileText,
  Brain,
  Zap,
} from "lucide-react";
import { useAppSelector, useAppDispatch, useAppStore } from "../../../../store/hooks";
import { cn } from "@ai-matrx/design-system";

import { NonEditableContextMenu } from "@host/features/context-menu-v3/NonEditableContextMenu";
import { CHAT_CONTEXT_MENU_PROPS } from "../../chat/agent-context/buildChatContextData";
import { buildRunControlsApplicationScope } from "../../chat/agent-context/buildChatRunConfiguration";

import { ResourcePickerMenu } from "@host/features/resource-manager/resource-picker/ResourcePickerMenu";
import { flattenResourcePickerItems } from "@host/features/resource-manager/resource-picker/resource-picker-menu-items";
import { ComposerConnectorsPanel } from "./composer/ComposerConnectorsPanel";
import { RunToolPicker } from "./RunToolPicker";
import { RunSkillPicker } from "./RunSkillPicker";
import { SandboxPanel } from "../../chat/SandboxPanel";
import { RunSettingsEditor } from "../../run-controls/RunSettingsEditor";
import { RunModelPicker } from "../../run-controls/RunModelPicker";
import { RunConfigOverrides } from "../../run-controls/RunConfigOverrides";
import { RunInputCapabilities } from "../../run-controls/RunInputCapabilities";
import { DocumentsWorkspace } from "../../working-document/documents-workspace/DocumentsWorkspace";
import { selectWorkingDocEnabled } from "../../../redux/execution-system/instance-working-document/instance-working-document.selectors";
import { ActiveContextTree } from "@host/features/scopes/components/active-context/ActiveContextTree";
import { selectHasActiveContext } from "@host/features/scopes/redux/selectors/active-context";
import { selectInstanceOverrideState } from "../../../redux/execution-system/instance-model-overrides/instance-model-overrides.selectors";
import { selectAttachmentCapabilities } from "../../../redux/execution-system/instance-input-capabilities/instance-input-capabilities.selectors";
import {
  selectBuilderAdvancedSettings,
  selectIsCreator,
} from "../../../redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import { selectChatIncognitoActive } from "../../../redux/chat/chat-incognito.slice";
import { useVerifiedSandboxBinding } from "@host/hooks/sandbox/use-verified-binding";
import { selectShowCreatorPanel, toggleShowCreatorPanel } from "../../../../host/prefs";
import { selectIsSuperAdminDebugger } from "../../../../host/prefs";
import { selectIsDebugMode } from "../../../../host/prefs";
import { useOpenChatDebugWindow } from "../../../../host/window-openers";
import { useOpenPromptPreviewWindow } from "../../../../host/window-openers";
import { AgentMemoryInlinePanel } from "../../memory/components/AgentMemoryInlinePanel";
import { QuicksetPanel } from "./QuicksetPanel";
import type { Resource } from "../../../resources/types";
import { selectIsSuperAdmin } from "../../../../host/identity";

export type RunControlsTab =
  | "quickset"
  | "attach"
  | "context"
  | "document"
  | "model"
  | "connections"
  | "tools"
  | "skills"
  | "sandbox"
  | "memory"
  | "settings"
  | "creator";

export interface RunControlsTabDef {
  id: RunControlsTab;
  label: string;
  icon: ComponentType<{ className?: string }>;
}

const ATTACH_TAB: RunControlsTabDef = {
  id: "attach",
  label: "Attach",
  icon: Paperclip,
};
const QUICKSET_TAB: RunControlsTabDef = {
  id: "quickset",
  label: "Quickset",
  icon: Zap,
};
const CONTEXT_TAB: RunControlsTabDef = {
  id: "context",
  label: "Scopes",
  icon: Layers,
};
const DOCUMENT_TAB: RunControlsTabDef = {
  id: "document",
  label: "Document",
  icon: FileText,
};
const MODEL_TAB: RunControlsTabDef = {
  id: "model",
  label: "Overrides",
  icon: Cpu,
};
const CREATOR_TAB: RunControlsTabDef = {
  id: "creator",
  label: "Creator",
  icon: Crown,
};
function pickerTab(id: "tools" | "connections" | "skills"): RunControlsTabDef {
  const item = flattenResourcePickerItems().find((i) => i.id === id);
  if (!item) throw new Error(`RunControlsTabPanel: no picker item "${id}"`);
  return { id, label: item.label, icon: item.icon as RunControlsTabDef["icon"] };
}

const BASE_TABS: RunControlsTabDef[] = [
  // Tools / Connections / Skills are attach-menu doors: label and icon come
  // from the ONE item list, never typed twice.
  pickerTab("tools"),
  pickerTab("connections"),
  pickerTab("skills"),
  { id: "sandbox", label: "Sandbox", icon: Box },
  { id: "memory", label: "Memory", icon: Brain },
  { id: "settings", label: "Advanced Settings", icon: AppWindow },
];

export function TabStatusDot({ label }: { label?: string }) {
  return (
    <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-label={label} />
  );
}

/**
 * All Redux-derived run-controls state, shared by every presentation.
 * Does NOT mount the conversation-documents bridge — the always-mounted
 * trigger (RunControlsMenu) owns that; this hook only reads.
 */
export function useRunControlsState(
  conversationId: string,
  includeAttach: boolean,
) {
  const dispatch = useAppDispatch();

  const settings = useAppSelector(
    selectBuilderAdvancedSettings(conversationId),
  );
  const sourceFeature = useAppSelector(
    (s) =>
      s.conversations.byConversationId[conversationId]?.sourceFeature ?? null,
  );
  const chatIncognito = useAppSelector(selectChatIncognitoActive);
  const sandboxBlocked = chatIncognito && sourceFeature === "chat-route";
  const sandboxBinding = useVerifiedSandboxBinding(conversationId);
  const overrideState = useAppSelector(
    selectInstanceOverrideState(conversationId),
  );
  const attachmentCapabilities = useAppSelector(
    selectAttachmentCapabilities(conversationId),
  );

  const isCreator = useAppSelector(selectIsCreator(conversationId));
  const isAdmin = useAppSelector(selectIsSuperAdmin);
  const isDebugMode = useAppSelector(selectIsDebugMode);
  const showCreatorPanel = useAppSelector(selectShowCreatorPanel);
  const showCreatorTab = isCreator || isAdmin;
  const isAdminDebugger = useAppSelector(selectIsSuperAdminDebugger);
  const showDebugAction = isAdminDebugger && isDebugMode;

  const workingDocEnabled = useAppSelector(
    selectWorkingDocEnabled(conversationId),
  );
  // The scratchpad counts as "document active" when THIS conversation opted in
  // (per-conversation gate, default OFF — publication also skips empty content).
  const scratchEnabled = useAppSelector(
    selectWorkingDocEnabled(conversationId, "scratch"),
  );
  const anyDocActive = workingDocEnabled || scratchEnabled;
  const hasActiveContext = useAppSelector(selectHasActiveContext);

  const openChatDebug = useOpenChatDebugWindow();

  const hasOverrideLayer = !!overrideState;
  const hasModelOverride = !!(
    overrideState?.overrides && "model" in overrideState.overrides
  );
  const baseTabsForRun: RunControlsTabDef[] = sandboxBlocked
    ? BASE_TABS.filter((tab) => tab.id !== "sandbox")
    : BASE_TABS;
  const tabs: RunControlsTabDef[] = [
    QUICKSET_TAB,
    ...(includeAttach ? [ATTACH_TAB] : []),
    CONTEXT_TAB,
    DOCUMENT_TAB,
    ...(hasOverrideLayer ? [MODEL_TAB] : []),
    ...baseTabsForRun,
    ...(showCreatorTab ? [CREATOR_TAB] : []),
  ];

  const defaultTab: RunControlsTab = "quickset";

  const resolveTab = (tab: RunControlsTab): RunControlsTab =>
    (tab === "model" && !hasOverrideLayer) ||
    (tab === "attach" && !includeAttach) ||
    (tab === "creator" && !showCreatorTab) ||
    (tab === "sandbox" && sandboxBlocked)
      ? "tools"
      : tab;

  const addedCount = settings?.addedTools?.length ?? 0;
  const addedSkillsCount = settings?.addedSkills?.length ?? 0;
  const hasSandbox = !sandboxBlocked && sandboxBinding.status === "verified";
  const isCustomized =
    addedCount > 0 ||
    addedSkillsCount > 0 ||
    hasSandbox ||
    hasModelOverride ||
    anyDocActive ||
    hasActiveContext ||
    (settings?.autoTools ?? null) !== null ||
    (settings?.removedTools?.length ?? 0) > 0 ||
    !!settings?.surfaceOverride;

  const tabTrailing = (tabId: RunControlsTab): ReactNode => {
    if (tabId === "tools" && addedCount > 0) {
      return (
        <span className="rounded-full bg-primary/15 px-1.5 text-xs font-semibold text-primary">
          {addedCount}
        </span>
      );
    }
    if (tabId === "model" && hasModelOverride) {
      return <TabStatusDot label="overridden" />;
    }
    if (tabId === "context" && hasActiveContext) {
      return <TabStatusDot label="scopes set" />;
    }
    if (tabId === "document" && anyDocActive) {
      return <TabStatusDot label="document active" />;
    }
    return null;
  };

  return {
    tabs,
    defaultTab,
    resolveTab,
    tabTrailing,
    addedCount,
    hasModelOverride,
    hasActiveContext,
    anyDocActive,
    isCustomized,
    attachmentCapabilities,
    panelProps: {
      conversationId,
      attachmentCapabilities,
      isCreator,
      showCreatorPanel,
      showDebugAction,
      onToggleCreatorPanel: () => dispatch(toggleShowCreatorPanel()),
      onOpenDebug: () => openChatDebug({ sessionId: conversationId }),
    },
  };
}

export interface RunControlsTabPanelProps {
  activeTab: RunControlsTab;
  conversationId: string;
  /** true → fill the host's height (window body, fullscreen popover, mobile sheet). */
  fill: boolean;
  /** Fixed height when not filling. One size for every tab — never per-tab. */
  heightClassName?: string;
  attachmentCapabilities?: {
    supportsImageUrls?: boolean;
    supportsFileUrls?: boolean;
    supportsYoutubeVideos?: boolean;
    supportsAudio?: boolean;
  };
  onResourceSelected: (resource: Resource) => void;
  onResourceDeselected?: (resource: Resource) => void;
  onClose: () => void;
  /** Attach tab: after a pick, instead of onClose (see ResourcePickerMenu). */
  onPicked?: () => void;
  isCreator: boolean;
  showCreatorPanel: boolean;
  showDebugAction: boolean;
  onToggleCreatorPanel: () => void;
  onOpenDebug: () => void;
}

export function RunControlsTabPanel({
  activeTab,
  conversationId,
  fill,
  heightClassName = "h-[32rem]",
  attachmentCapabilities,
  onResourceSelected,
  onResourceDeselected,
  onClose,
  onPicked,
  isCreator,
  showCreatorPanel,
  showDebugAction,
  onToggleCreatorPanel,
  onOpenDebug,
}: RunControlsTabPanelProps) {
  const panelClass = cn(
    "overflow-hidden",
    fill ? "min-h-0 flex-1" : heightClassName,
  );
  const scrollClass = "h-full overflow-y-auto overscroll-contain";
  const openPromptPreview = useOpenPromptPreviewWindow();
  const store = useAppStore();

  // Live chat-surface scope (conversation identity + run_configuration) for
  // the canonical v3 menu mounted on the run-controls-native tabs. Plain fn —
  // React Compiler memoizes; reads the store at menu-open time, never stale.
  const getApplicationScope = () =>
    buildRunControlsApplicationScope(store.getState(), conversationId);

  // The canonical right-click menu for run-controls-native regions. Tabs whose
  // bodies belong to OTHER surfaces (attach / context / document / memory)
  // keep their own wiring and are not wrapped here.
  const menuWrap = (child: ReactNode) => (
    <NonEditableContextMenu
      sourceFeature={CHAT_CONTEXT_MENU_PROPS.sourceFeature}
      surfaceName={CHAT_CONTEXT_MENU_PROPS.surfaceName}
      getApplicationScope={getApplicationScope}
    >
      <div className="h-full min-h-0">{child}</div>
    </NonEditableContextMenu>
  );

  return (
    <div className={panelClass}>
      {activeTab === "attach" && (
        <div className="h-full min-h-0 overflow-hidden">
          <ResourcePickerMenu
            conversationId={conversationId}
            fillHost
            onResourceSelected={onResourceSelected}
            onResourceDeselected={onResourceDeselected}
            onClose={onClose}
            onPicked={onPicked}
            attachmentCapabilities={attachmentCapabilities}
          />
        </div>
      )}
      {activeTab === "quickset" &&
        menuWrap(
          <QuicksetPanel
            conversationId={conversationId}
            isCreator={isCreator}
            showCreatorPanel={showCreatorPanel}
            onToggleCreatorPanel={onToggleCreatorPanel}
          />,
        )}
      {activeTab === "context" && (
        <div className={cn(scrollClass, "p-2")}>
          {/* THE canonical compact Surface-A picker — same component as the
              chat header's lens chip. */}
          <ActiveContextTree conversationId={conversationId} maxHeight={420} />
        </div>
      )}
      {activeTab === "document" && (
        <div className="h-full overflow-hidden">
          <DocumentsWorkspace
            conversationId={conversationId}
            defaultRailOpen={false}
            className="h-full"
          />
        </div>
      )}
      {activeTab === "model" &&
        menuWrap(
          <div className={scrollClass}>
            <RunModelPicker conversationId={conversationId} />
            <RunConfigOverrides conversationId={conversationId} />
            <RunInputCapabilities conversationId={conversationId} />
          </div>,
        )}
      {activeTab === "connections" && (
        <div className="flex h-full min-h-0 flex-col overflow-hidden">
          <ComposerConnectorsPanel conversationId={conversationId} onNavigate={onClose} />
        </div>
      )}
      {activeTab === "tools" &&
        menuWrap(
          <div className="h-full overflow-hidden">
            <RunToolPicker conversationId={conversationId} />
          </div>,
        )}
      {activeTab === "skills" &&
        menuWrap(
          <div className="h-full overflow-hidden">
            <RunSkillPicker conversationId={conversationId} />
          </div>,
        )}
      {activeTab === "sandbox" &&
        menuWrap(
          <div className={scrollClass}>
            <SandboxPanel conversationId={conversationId} />
          </div>,
        )}
      {activeTab === "memory" && (
        <div className="h-full overflow-hidden">
          <AgentMemoryInlinePanel />
        </div>
      )}
      {activeTab === "settings" &&
        menuWrap(
          <div className={cn(scrollClass, "px-3 py-2")}>
            <RunSettingsEditor conversationId={conversationId} />
          </div>,
        )}
      {activeTab === "creator" &&
        menuWrap(
          <div className={cn(scrollClass, "px-3 py-2")}>
            <div className="space-y-0.5">
              {isCreator && (
                <button
                  type="button"
                  onClick={onToggleCreatorPanel}
                  aria-pressed={showCreatorPanel}
                  className={cn(
                    "flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-xs transition-colors",
                    showCreatorPanel
                      ? "bg-amber-500/10 text-foreground"
                      : "text-foreground hover:bg-muted/60",
                  )}
                >
                  <Crown className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                  <span className="min-w-0 flex-1 truncate">Creator panel</span>
                  {showCreatorPanel && (
                    <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
                      on
                    </span>
                  )}
                </button>
              )}

              {showDebugAction && (
                <button
                  type="button"
                  onClick={onOpenDebug}
                  className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-xs text-foreground transition-colors hover:bg-muted/60"
                >
                  <Bug className="h-3.5 w-3.5 shrink-0 text-orange-500" />
                  <span className="min-w-0 flex-1 truncate">
                    Debug instance state
                  </span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  openPromptPreview({ conversationId });
                }}
                className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-xs text-foreground transition-colors hover:bg-muted/60"
              >
                <ScrollText className="h-3.5 w-3.5 shrink-0 text-sky-500" />
                <span className="min-w-0 flex-1 truncate">
                  Preview full prompt
                </span>
              </button>
            </div>
          </div>,
        )}
    </div>
  );
}
