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

import { useState, type ComponentType, type ReactNode } from "react";
import {
  Paperclip,
  Wrench,
  Lightbulb,
  Box,
  Settings2,
  Cpu,
  Layers,
  Crown,
  Bug,
  ScrollText,
  SlidersVertical,
  FileText,
  Brain,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useAppSelector, useAppDispatch } from "@/lib/redux/hooks";
import { cn } from "@/lib/utils";
import { PromptPreviewModal } from "@/features/agents/prompt-preview/PromptPreviewModal";

import { ResourcePickerMenu } from "@/features/resource-manager/resource-picker/ResourcePickerMenu";
import { RunToolPicker } from "./RunToolPicker";
import { RunSkillPicker } from "./RunSkillPicker";
import { SandboxPanel } from "@/features/agents/components/chat/SandboxPanel";
import { RunSettingsEditor } from "@/features/agents/components/run-controls/RunSettingsEditor";
import { RunModelPicker } from "@/features/agents/components/run-controls/RunModelPicker";
import { RunConfigOverrides } from "@/features/agents/components/run-controls/RunConfigOverrides";
import { DocumentsWorkspace } from "@/features/agents/components/working-document/documents-workspace/DocumentsWorkspace";
import { scratchScopeId } from "@/features/agents/redux/execution-system/instance-working-document/instance-working-document.slice";
import {
  selectActiveScratchpadId,
  selectWorkingDocContent,
  selectWorkingDocEnabled,
} from "@/features/agents/redux/execution-system/instance-working-document/instance-working-document.selectors";
import { ActiveContextPanel } from "@/features/scopes/components/active-context/ActiveContextPanel";
import { ActiveContextLayersPanel } from "@/features/scopes/components/active-context/ActiveContextLayersPanel";
import { selectHasActiveContext } from "@/features/scopes/redux/selectors/active-context";
import {
  selectAttachmentCapabilities,
  selectInstanceOverrideState,
} from "@/features/agents/redux/execution-system/instance-model-overrides/instance-model-overrides.selectors";
import {
  selectBuilderAdvancedSettings,
  selectIsCreator,
  selectSubmitOnEnter,
} from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import { setSubmitOnEnter } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.slice";
import { selectChatIncognitoActive } from "@/features/agents/components/chat/chat-incognito.slice";
import { useVerifiedSandboxBinding } from "@/hooks/sandbox/use-verified-binding";
import {
  selectShowCreatorPanel,
  toggleShowCreatorPanel,
} from "@/lib/redux/preferences/creatorDebugSlice";
import { selectIsSuperAdmin } from "@/lib/redux/slices/userSlice";
import { selectIsDebugMode } from "@/lib/redux/preferences/adminDebugSlice";
import { useOpenChatDebugWindow } from "@/features/overlays/openers/chatDebugWindow";
import { useOpenAgentMemoryWindow } from "@/features/overlays/openers/agentMemoryWindow";
import type { Resource } from "@/features/agents/resources/types";

export type RunControlsTab =
  | "attach"
  | "context"
  | "document"
  | "model"
  | "tools"
  | "skills"
  | "sandbox"
  | "memory"
  | "settings"
  | "preferences"
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
const CONTEXT_TAB: RunControlsTabDef = {
  id: "context",
  label: "Context",
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
const BASE_TABS: RunControlsTabDef[] = [
  { id: "tools", label: "Tools", icon: Wrench },
  { id: "skills", label: "Skills", icon: Lightbulb },
  { id: "sandbox", label: "Sandbox", icon: Box },
  { id: "memory", label: "Memory", icon: Brain },
  { id: "settings", label: "Settings", icon: Settings2 },
  { id: "preferences", label: "Preferences", icon: SlidersVertical },
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
  const showDebugAction = isAdmin && isDebugMode;

  const submitOnEnter = useAppSelector(selectSubmitOnEnter(conversationId));
  const workingDocEnabled = useAppSelector(
    selectWorkingDocEnabled(conversationId),
  );
  // The scratchpad counts as "document active" when the user's global active
  // scratchpad actually has content (empty is never sent to the agent).
  const activeScratchId = useAppSelector(selectActiveScratchpadId);
  const scratchContent = useAppSelector(
    selectWorkingDocContent(
      activeScratchId ? scratchScopeId(activeScratchId) : "sp:none",
      "scratch",
    ),
  );
  const anyDocActive = workingDocEnabled || scratchContent.trim() !== "";
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
    ...(includeAttach ? [ATTACH_TAB] : []),
    CONTEXT_TAB,
    DOCUMENT_TAB,
    ...(hasOverrideLayer ? [MODEL_TAB] : []),
    ...baseTabsForRun,
    ...(showCreatorTab ? [CREATOR_TAB] : []),
  ];

  const defaultTab: RunControlsTab = includeAttach
    ? "attach"
    : hasOverrideLayer
      ? "model"
      : "tools";

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
    !!settings?.disableToolInjection ||
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
      return <TabStatusDot label="working context set" />;
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
      submitOnEnter,
      onSubmitOnEnterChange: (value: boolean) =>
        dispatch(setSubmitOnEnter({ conversationId, value })),
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
  onClose: () => void;
  isCreator: boolean;
  showCreatorPanel: boolean;
  showDebugAction: boolean;
  submitOnEnter: boolean;
  onSubmitOnEnterChange: (value: boolean) => void;
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
  onClose,
  isCreator,
  showCreatorPanel,
  showDebugAction,
  submitOnEnter,
  onSubmitOnEnterChange,
  onToggleCreatorPanel,
  onOpenDebug,
}: RunControlsTabPanelProps) {
  const panelClass = cn(
    "overflow-hidden",
    fill ? "min-h-0 flex-1" : heightClassName,
  );
  const scrollClass = "h-full overflow-y-auto overscroll-contain";
  const [previewOpen, setPreviewOpen] = useState(false);
  const openMemoryWindow = useOpenAgentMemoryWindow();

  return (
    <div className={panelClass}>
      {activeTab === "attach" && (
        <div className={scrollClass}>
          <ResourcePickerMenu
            onResourceSelected={onResourceSelected}
            onClose={onClose}
            attachmentCapabilities={attachmentCapabilities}
          />
        </div>
      )}
      {activeTab === "context" && (
        <div className={scrollClass}>
          <ActiveContextPanel checkboxVariant="standard" sectionHeight={220} />
          <div className="border-t border-border px-3 py-2">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Selected context
            </div>
            <ActiveContextLayersPanel />
          </div>
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
      {activeTab === "model" && (
        <div className={scrollClass}>
          <RunModelPicker conversationId={conversationId} />
          <RunConfigOverrides conversationId={conversationId} />
        </div>
      )}
      {activeTab === "tools" && (
        <div className="h-full overflow-hidden">
          <RunToolPicker conversationId={conversationId} />
        </div>
      )}
      {activeTab === "skills" && (
        <div className="h-full overflow-hidden">
          <RunSkillPicker conversationId={conversationId} />
        </div>
      )}
      {activeTab === "sandbox" && (
        <div className={scrollClass}>
          <SandboxPanel conversationId={conversationId} />
        </div>
      )}
      {activeTab === "memory" && (
        <div className={cn(scrollClass, "px-3 py-3")}>
          <button
            type="button"
            onClick={() => {
              openMemoryWindow();
              onClose();
            }}
            className="flex w-full items-center gap-3 rounded-lg border border-border px-3 py-2.5 text-left transition-colors hover:bg-muted/60"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
              <Brain className="h-5 w-5" />
            </span>
            <span className="flex flex-col">
              <span className="text-sm font-medium text-foreground">
                What the agent remembers
              </span>
              <span className="text-xs text-muted-foreground">
                Browse, edit, add, or remove memories the agent has saved
                about you
              </span>
            </span>
          </button>
        </div>
      )}
      {activeTab === "settings" && (
        <div className={cn(scrollClass, "px-3 py-2")}>
          <RunSettingsEditor conversationId={conversationId} />
        </div>
      )}
      {activeTab === "preferences" && (
        <div className={cn(scrollClass, "px-3 py-3")}>
          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5 transition-colors hover:bg-muted/40">
            <span className="flex flex-col">
              <span className="text-sm font-medium text-foreground">
                Submit on Enter
              </span>
              <span className="text-xs text-muted-foreground">
                {submitOnEnter
                  ? "Enter sends · Shift+Enter for a new line"
                  : "Enter adds a new line · ⌘/Ctrl+Enter sends"}
              </span>
            </span>
            <Switch
              checked={submitOnEnter}
              onCheckedChange={onSubmitOnEnterChange}
            />
          </label>
        </div>
      )}
      {activeTab === "creator" && (
        <div className="flex h-full flex-col gap-2 overflow-y-auto overscroll-contain px-3 py-3">
          {isCreator && (
            <button
              type="button"
              onClick={onToggleCreatorPanel}
              aria-pressed={showCreatorPanel}
              className={cn(
                "flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
                showCreatorPanel
                  ? "border-amber-500/40 bg-amber-500/10"
                  : "border-border hover:bg-muted/60",
              )}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-500">
                <Crown className="h-5 w-5" />
              </span>
              <span className="flex flex-col">
                <span className="text-sm font-medium text-foreground">
                  Creator panel
                </span>
                <span className="text-xs text-muted-foreground">
                  {showCreatorPanel
                    ? "Visible — click to hide"
                    : "Hidden — click to show"}
                </span>
              </span>
            </button>
          )}

          {showDebugAction && (
            <button
              type="button"
              onClick={onOpenDebug}
              className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5 text-left transition-colors hover:bg-muted/60"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-500/15 text-orange-500">
                <Bug className="h-5 w-5" />
              </span>
              <span className="flex flex-col">
                <span className="text-sm font-medium text-foreground">
                  Debug instance state
                </span>
                <span className="text-xs text-muted-foreground">
                  Open the live state inspector for this run
                </span>
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setPreviewOpen(true)}
            className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5 text-left transition-colors hover:bg-muted/60"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sky-500/15 text-sky-500">
              <ScrollText className="h-5 w-5" />
            </span>
            <span className="flex flex-col">
              <span className="text-sm font-medium text-foreground">
                Preview full prompt
              </span>
              <span className="text-xs text-muted-foreground">
                See exactly what goes to the model — context, system prompt, tools
              </span>
            </span>
          </button>
          <PromptPreviewModal
            conversationId={conversationId}
            open={previewOpen}
            onOpenChange={setPreviewOpen}
          />
        </div>
      )}
    </div>
  );
}
