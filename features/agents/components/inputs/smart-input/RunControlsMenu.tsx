"use client";

/**
 * RunControlsMenu — THE consolidated run-controls popover for the Smart
 * Input, in two trigger variants:
 *
 *   - "gear" (SlidersHorizontal) — production toolbar (chat rooms, agent run)
 *   - "plus" (Plus)              — the `/chat/new` hero input
 *
 * One tabbed popover:
 *   - Attach   — the canonical ResourcePickerMenu (plus variant by default;
 *                opt-in anywhere via `includeAttach`)
 *   - Context  — working context (same field as chat header; live-apply)
 *   - Document — working document collaboration controls
 *   - Model    — per-conversation model override (RunModelPicker) + settings
 *                overrides (RunConfigOverrides). Only shown for instances
 *                that own an override layer — manual/builder-test runs read
 *                the agent live and have no override state.
 *   - Tools    — add registry tools to THIS run (RunToolPicker)
 *   - Sandbox  — bind an agent sandbox (SandboxPanel)
 *   - Settings — run settings: disable tool injection, Surface Simulator,
 *                debug, save-to-DB, … (RunSettingsEditor)
 *
 * Desktop: tabbed Popover. Mobile: TabbedBottomSheet (tabs → first-level list).
 */

import { useState, type ComponentType, type ReactNode } from "react";
import { PromptPreviewModal } from "@/features/agents/prompt-preview/PromptPreviewModal";
import {
  SlidersHorizontal,
  Plus,
  Paperclip,
  Wrench,
  Box,
  Settings2,
  Cpu,
  Layers,
  Crown,
  Bug,
  ScrollText,
  SlidersVertical,
  FileText,
  Maximize2,
  Minimize2,
} from "lucide-react";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { useDialogContainer } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { useAppSelector, useAppDispatch } from "@/lib/redux/hooks";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { TabbedBottomSheet } from "@/components/official/bottom-sheet/TabbedBottomSheet";

import { ResourcePickerMenu } from "@/features/resource-manager/resource-picker/ResourcePickerMenu";
import { RunToolPicker } from "./RunToolPicker";
import { SandboxPanel } from "@/features/agents/components/chat/SandboxPanel";
import { RunSettingsEditor } from "@/features/agents/components/run-controls/RunSettingsEditor";
import { RunModelPicker } from "@/features/agents/components/run-controls/RunModelPicker";
import { RunConfigOverrides } from "@/features/agents/components/run-controls/RunConfigOverrides";
import { useAttachResource } from "@/features/agents/components/inputs/resources/attach-resource";
import { WorkingDocumentControls } from "@/features/agents/components/working-document/WorkingDocumentControls";
import { useConversationDocumentsBridge } from "@/features/agents/hooks/useWorkingDocument";
import { selectWorkingDocEnabled } from "@/features/agents/redux/execution-system/instance-working-document/instance-working-document.selectors";
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
import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import type { Resource } from "@/features/prompts/types/resources";

type Tab =
  | "attach"
  | "context"
  | "document"
  | "model"
  | "tools"
  | "sandbox"
  | "settings"
  | "preferences"
  | "creator";

interface TabDef {
  id: Tab;
  label: string;
  icon: ComponentType<{ className?: string }>;
}

const ATTACH_TAB: TabDef = { id: "attach", label: "Attach", icon: Paperclip };
const CONTEXT_TAB: TabDef = { id: "context", label: "Context", icon: Layers };
const DOCUMENT_TAB: TabDef = {
  id: "document",
  label: "Document",
  icon: FileText,
};
const MODEL_TAB: TabDef = { id: "model", label: "Overrides", icon: Cpu };
const CREATOR_TAB: TabDef = { id: "creator", label: "Creator", icon: Crown };
const BASE_TABS: TabDef[] = [
  { id: "tools", label: "Tools", icon: Wrench },
  { id: "sandbox", label: "Sandbox", icon: Box },
  { id: "settings", label: "Settings", icon: Settings2 },
  { id: "preferences", label: "Preferences", icon: SlidersVertical },
];

export interface RunControlsMenuProps {
  conversationId: string;
  variant?: "gear" | "plus";
  includeAttach?: boolean;
  align?: "start" | "end";
  side?: "top" | "bottom";
}

interface RunControlsTabPanelProps {
  activeTab: Tab;
  conversationId: string;
  fullscreen: boolean;
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

function RunControlsTabPanel({
  activeTab,
  conversationId,
  fullscreen,
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
    fullscreen ? "min-h-0 flex-1" : "h-96",
  );
  const scrollClass = "h-full overflow-y-auto overscroll-contain";
  const [previewOpen, setPreviewOpen] = useState(false);

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
          <WorkingDocumentControls conversationId={conversationId} />
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
      {activeTab === "sandbox" && (
        <div className={scrollClass}>
          <SandboxPanel conversationId={conversationId} />
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

function TabStatusDot({ label }: { label?: string }) {
  return (
    <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-label={label} />
  );
}

export function RunControlsMenu({
  conversationId,
  variant = "gear",
  includeAttach = variant === "plus",
  align = variant === "plus" ? "start" : "end",
  side = variant === "plus" ? "top" : "bottom",
}: RunControlsMenuProps) {
  const isMobile = useIsMobile();
  const dialogContainer = useDialogContainer();
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

  useConversationDocumentsBridge(conversationId);
  const workingDocEnabled = useAppSelector(
    selectWorkingDocEnabled(conversationId),
  );
  const hasActiveContext = useAppSelector(selectHasActiveContext);

  const hasOverrideLayer = !!overrideState;
  const hasModelOverride = !!(
    overrideState?.overrides && "model" in overrideState.overrides
  );
  const BASE_TABS_FOR_RUN: TabDef[] = sandboxBlocked
    ? BASE_TABS.filter((tab) => tab.id !== "sandbox")
    : BASE_TABS;
  const tabs: TabDef[] = [
    ...(includeAttach ? [ATTACH_TAB] : []),
    CONTEXT_TAB,
    DOCUMENT_TAB,
    ...(hasOverrideLayer ? [MODEL_TAB] : []),
    ...BASE_TABS_FOR_RUN,
    ...(showCreatorTab ? [CREATOR_TAB] : []),
  ];

  const [open, setOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [tab, setTab] = useState<Tab>(
    includeAttach ? "attach" : hasOverrideLayer ? "model" : "tools",
  );
  const activeTab: Tab =
    (tab === "model" && !hasOverrideLayer) ||
    (tab === "attach" && !includeAttach) ||
    (tab === "creator" && !showCreatorTab) ||
    (tab === "sandbox" && sandboxBlocked)
      ? "tools"
      : tab;

  const addedCount = settings?.addedTools?.length ?? 0;
  const hasSandbox = !sandboxBlocked && sandboxBinding.status === "verified";
  const isCustomized =
    addedCount > 0 ||
    hasSandbox ||
    hasModelOverride ||
    workingDocEnabled ||
    hasActiveContext ||
    !!settings?.disableToolInjection ||
    !!settings?.surfaceOverride;

  const attachResource = useAttachResource(conversationId);
  const handleResourceSelected = (resource: Resource) => {
    attachResource(resource);
    setOpen(false);
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) setFullscreen(false);
  };

  const handleToggleCreatorPanel = () => {
    dispatch(toggleShowCreatorPanel());
  };

  const handleOpenDebug = () => {
    dispatch(
      openOverlay({
        overlayId: "chatDebugWindow",
        data: { sessionId: conversationId },
      }),
    );
    setOpen(false);
  };

  const panelProps = {
    conversationId,
    fullscreen: isMobile ? true : fullscreen,
    attachmentCapabilities,
    onResourceSelected: handleResourceSelected,
    onClose: () => setOpen(false),
    isCreator,
    showCreatorPanel,
    showDebugAction,
    submitOnEnter,
    onSubmitOnEnterChange: (value: boolean) =>
      dispatch(setSubmitOnEnter({ conversationId, value })),
    onToggleCreatorPanel: handleToggleCreatorPanel,
    onOpenDebug: handleOpenDebug,
  };

  const tabTrailing = (tabId: Tab): ReactNode => {
    if (tabId === "tools" && addedCount > 0) {
      return (
        <span className="rounded-full bg-primary/15 px-1.5 text-xs font-semibold text-primary">
          {addedCount}
        </span>
      );
    }
    if (
      (tabId === "model" && hasModelOverride) ||
      (tabId === "context" && hasActiveContext) ||
      (tabId === "document" && workingDocEnabled)
    ) {
      return <TabStatusDot />;
    }
    return null;
  };

  const TriggerIcon = variant === "plus" ? Plus : SlidersHorizontal;

  const triggerButton = (
    <button
      type="button"
      tabIndex={variant === "plus" ? -1 : undefined}
      title="Chat Options"
      aria-label="Chat Options"
      onClick={isMobile ? () => handleOpenChange(true) : undefined}
      className={cn(
        "relative flex items-center justify-center rounded-full transition-colors",
        variant === "plus" ? "h-9 w-9" : "h-8 w-8",
        "text-muted-foreground/70 hover:text-foreground hover:bg-muted/60",
      )}
    >
      <TriggerIcon className={variant === "plus" ? "h-5 w-5" : "h-4 w-4"} />
      {addedCount > 0 ? (
        <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary px-0.5 text-[9px] font-semibold leading-none text-primary-foreground ring-2 ring-background">
          {addedCount}
        </span>
      ) : isCustomized ? (
        <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-primary ring-2 ring-background" />
      ) : null}
    </button>
  );

  if (isMobile) {
    return (
      <>
        {triggerButton}
        <TabbedBottomSheet
          open={open}
          onOpenChange={handleOpenChange}
          title="Chat options"
          tabs={tabs.map((t) => ({
            id: t.id,
            label: t.label,
            icon: t.icon,
            trailing: tabTrailing(t.id),
            content: <RunControlsTabPanel {...panelProps} activeTab={t.id} />,
          }))}
        />
      </>
    );
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange} modal={false}>
      <PopoverTrigger asChild>{triggerButton}</PopoverTrigger>

      <PopoverContent
        align={align}
        side={side}
        sideOffset={8}
        className={cn(
          "p-0 border-border",
          fullscreen
            ? "flex h-[calc(100vh-2rem)] w-[calc(100vw-1rem)] flex-col"
            : "w-[min(680px,calc(100vw-1rem))]",
        )}
        container={dialogContainer ?? undefined}
      >
        <div
          role="tablist"
          aria-label="Run controls"
          className="flex shrink-0 overflow-x-auto border-b border-border [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        >
          {tabs.map((t) => {
            const Icon = t.icon;
            const on = activeTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                id={`runctl-tab-${t.id}-${conversationId}`}
                aria-selected={on}
                aria-controls={`runctl-panel-${conversationId}`}
                onClick={() => setTab(t.id)}
                className={cn(
                  "-mb-px flex shrink-0 items-center justify-center gap-1 whitespace-nowrap border-b px-2 py-1.5 text-[11px] font-medium transition-colors sm:gap-1.5 sm:px-2.5 sm:py-2 sm:text-xs",
                  on
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{t.label}</span>
                {t.id === "tools" && addedCount > 0 && (
                  <span className="rounded-full bg-primary/15 px-1 text-[9px] font-semibold text-primary">
                    {addedCount}
                  </span>
                )}
                {t.id === "model" && hasModelOverride && (
                  <TabStatusDot label="overridden" />
                )}
                {t.id === "context" && hasActiveContext && (
                  <TabStatusDot label="working context set" />
                )}
                {t.id === "document" && workingDocEnabled && (
                  <TabStatusDot label="working document active" />
                )}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setFullscreen((v) => !v)}
            aria-label={
              fullscreen ? "Exit full screen" : "Expand to full screen"
            }
            title={fullscreen ? "Exit full screen" : "Expand to full screen"}
            className="sticky right-0 ml-auto flex shrink-0 items-center justify-center border-l border-border bg-background px-2.5 text-muted-foreground transition-colors hover:text-foreground"
          >
            {fullscreen ? (
              <Minimize2 className="h-3.5 w-3.5" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" />
            )}
          </button>
        </div>

        <div
          role="tabpanel"
          id={`runctl-panel-${conversationId}`}
          aria-labelledby={`runctl-tab-${activeTab}-${conversationId}`}
        >
          <RunControlsTabPanel {...panelProps} activeTab={activeTab} />
        </div>
      </PopoverContent>
    </Popover>
  );
}
