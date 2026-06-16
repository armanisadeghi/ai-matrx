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
 * Replaces the former InputControlsMenu / LandingPlusMenu near-duplicates.
 * The trigger shows a count badge when tools are added, otherwise a dot when
 * any run config is active (sandbox bound, model overridden, injection
 * disabled, surface simulated) so the user can see at a glance that this run
 * is customized.
 */

import { useState, type ComponentType } from "react";
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
  SlidersVertical,
  FileText,
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

import { ResourcePickerMenu } from "@/features/resource-manager/resource-picker/ResourcePickerMenu";
import { RunToolPicker } from "./RunToolPicker";
import { SandboxPanel } from "@/features/agents/components/chat/SandboxPanel";
import { RunSettingsEditor } from "@/features/agents/components/run-controls/RunSettingsEditor";
import { RunModelPicker } from "@/features/agents/components/run-controls/RunModelPicker";
import { RunConfigOverrides } from "@/features/agents/components/run-controls/RunConfigOverrides";
import { useAttachResource } from "@/features/agents/components/inputs/resources/attach-resource";
import { WorkingDocumentControls } from "@/features/agents/components/working-document/WorkingDocumentControls";
import { useWorkingDocumentContextSync } from "@/features/agents/hooks/useWorkingDocument";
import { selectWorkingDocEnabled } from "@/features/agents/redux/execution-system/instance-working-document/instance-working-document.selectors";
import { ActiveContextPanel } from "@/features/scopes/components/active-context/ActiveContextPanel";
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
// Per-conversation overrides (model + run config) that overwrite the agent's
// own settings for this run only.
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
  /** Trigger chrome. "gear" = production toolbar, "plus" = chat landing. */
  variant?: "gear" | "plus";
  /** Show the Attach tab. Defaults to true for the plus variant. */
  includeAttach?: boolean;
  /** Popover alignment. Defaults: gear → "end", plus → "start". */
  align?: "start" | "end";
  /** Popover side. Defaults: gear → "bottom", plus → "top". */
  side?: "top" | "bottom";
}

export function RunControlsMenu({
  conversationId,
  variant = "gear",
  includeAttach = variant === "plus",
  align = variant === "plus" ? "start" : "end",
  side = variant === "plus" ? "top" : "bottom",
}: RunControlsMenuProps) {
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
  // Liveness-verified binding: a bound box is only treated as "attached" once
  // `/api/compute-targets` confirms it's actually online. A stale/expired box
  // rehydrated from preferences never lights the indicator.
  const sandboxBinding = useVerifiedSandboxBinding(conversationId);
  const overrideState = useAppSelector(
    selectInstanceOverrideState(conversationId),
  );
  const attachmentCapabilities = useAppSelector(
    selectAttachmentCapabilities(conversationId),
  );

  // Creator tab — visible to the agent's creator OR any super-admin. Houses
  // creator/admin-only run affordances (currently the creator panel toggle and
  // the debug-state inspector; more land here in future rounds).
  const isCreator = useAppSelector(selectIsCreator(conversationId));
  const isAdmin = useAppSelector(selectIsSuperAdmin);
  const isDebugMode = useAppSelector(selectIsDebugMode);
  const showCreatorPanel = useAppSelector(selectShowCreatorPanel);
  const showCreatorTab = isCreator || isAdmin;
  const showDebugAction = isAdmin && isDebugMode;

  const submitOnEnter = useAppSelector(selectSubmitOnEnter(conversationId));

  // Working document: keep the `working_document` instanceContext entry current
  // for this conversation regardless of whether the popup/editor is open, so
  // the agent always receives the document the user is collaborating on.
  useWorkingDocumentContextSync(conversationId);
  const workingDocEnabled = useAppSelector(
    selectWorkingDocEnabled(conversationId),
  );
  const hasActiveContext = useAppSelector(selectHasActiveContext);

  // The Model tab (and per-run model/settings overrides) only applies to
  // instances that own an override layer — manual/builder-test runs read the
  // agent live and have no override state, so we hide it there.
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
  // Attach is the primary intent of the `+` button; the gear opens on the
  // override layer when one exists, else tools.
  const [tab, setTab] = useState<Tab>(
    includeAttach ? "attach" : hasOverrideLayer ? "model" : "tools",
  );
  // Guards: if a gated tab vanishes, fall back to tools.
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

  const TriggerIcon = variant === "plus" ? Plus : SlidersHorizontal;

  return (
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <PopoverTrigger asChild>
        <button
          type="button"
          tabIndex={variant === "plus" ? -1 : undefined}
          title="Chat Options"
          aria-label="Chat Options"
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
      </PopoverTrigger>

      <PopoverContent
        align={align}
        side={side}
        sideOffset={8}
        className="w-[min(680px,calc(100vw-1rem))] p-0 border-border"
        container={dialogContainer ?? undefined}
      >
        <div
          role="tablist"
          aria-label="Run controls"
          className="flex overflow-x-auto border-b border-border scrollbar-thin"
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
                  "-mb-px flex flex-1 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap border-b-2 px-2.5 py-2 text-xs font-medium transition-colors",
                  on
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {t.label}
                {t.id === "tools" && addedCount > 0 && (
                  <span className="ml-0.5 rounded-full bg-primary/15 px-1 text-[9px] font-semibold text-primary">
                    {addedCount}
                  </span>
                )}
                {t.id === "model" && hasModelOverride && (
                  <span
                    className="ml-0.5 h-1.5 w-1.5 rounded-full bg-primary"
                    aria-label="overridden"
                  />
                )}
                {t.id === "context" && hasActiveContext && (
                  <span
                    className="ml-0.5 h-1.5 w-1.5 rounded-full bg-primary"
                    aria-label="working context set"
                  />
                )}
                {t.id === "document" && workingDocEnabled && (
                  <span
                    className="ml-0.5 h-1.5 w-1.5 rounded-full bg-primary"
                    aria-label="working document active"
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Fixed height across every tab so the popover doesn't visibly
            resize when switching tabs. Each panel scrolls internally. */}
        <div
          role="tabpanel"
          id={`runctl-panel-${conversationId}`}
          aria-labelledby={`runctl-tab-${activeTab}-${conversationId}`}
          className="h-96 overflow-hidden"
        >
          {activeTab === "attach" && (
            <div className="h-full overflow-y-auto">
              <ResourcePickerMenu
                onResourceSelected={handleResourceSelected}
                onClose={() => setOpen(false)}
                attachmentCapabilities={attachmentCapabilities}
              />
            </div>
          )}
          {activeTab === "context" && (
            <div className="h-full overflow-hidden">
              <ActiveContextPanel
                checkboxVariant="standard"
                sectionHeight={280}
              />
            </div>
          )}
          {activeTab === "document" && (
            <div className="h-full overflow-hidden">
              <WorkingDocumentControls conversationId={conversationId} />
            </div>
          )}
          {activeTab === "model" && (
            <div className="h-full overflow-y-auto">
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
            <div className="h-full overflow-y-auto">
              <SandboxPanel conversationId={conversationId} />
            </div>
          )}
          {activeTab === "settings" && (
            <div className="h-full overflow-y-auto px-3 py-2">
              <RunSettingsEditor conversationId={conversationId} />
            </div>
          )}
          {activeTab === "preferences" && (
            <div className="h-full overflow-y-auto px-3 py-3">
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
                  onCheckedChange={(value) =>
                    dispatch(setSubmitOnEnter({ conversationId, value }))
                  }
                />
              </label>
            </div>
          )}
          {activeTab === "creator" && (
            <div className="flex h-full flex-col gap-2 overflow-y-auto px-3 py-3">
              {isCreator && (
                <button
                  type="button"
                  onClick={() => dispatch(toggleShowCreatorPanel())}
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
                  onClick={() => {
                    dispatch(
                      openOverlay({
                        overlayId: "chatDebugWindow",
                        data: { sessionId: conversationId },
                      }),
                    );
                    setOpen(false);
                  }}
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
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
