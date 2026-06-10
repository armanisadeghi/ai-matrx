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
} from "lucide-react";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { useDialogContainer } from "@/components/ui/dialog";
import { useAppSelector } from "@/lib/redux/hooks";
import { cn } from "@/lib/utils";

import { ResourcePickerMenu } from "@/features/resource-manager/resource-picker/ResourcePickerMenu";
import { RunToolPicker } from "./RunToolPicker";
import { SandboxPanel } from "@/features/agents/components/chat/SandboxPanel";
import { RunSettingsEditor } from "@/features/agents/components/run-controls/RunSettingsEditor";
import { RunModelPicker } from "@/features/agents/components/run-controls/RunModelPicker";
import { RunConfigOverrides } from "@/features/agents/components/run-controls/RunConfigOverrides";
import { useAttachResource } from "@/features/agents/components/inputs/resources/attach-resource";

import {
  selectAttachmentCapabilities,
  selectInstanceOverrideState,
} from "@/features/agents/redux/execution-system/instance-model-overrides/instance-model-overrides.selectors";
import { selectBuilderAdvancedSettings } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import { selectConversationSandboxOverride } from "@/features/agents/redux/execution-system/conversations/conversations.selectors";
import type { Resource } from "@/features/prompts/types/resources";

type Tab = "attach" | "model" | "tools" | "sandbox" | "settings";

interface TabDef {
  id: Tab;
  label: string;
  icon: ComponentType<{ className?: string }>;
}

const ATTACH_TAB: TabDef = { id: "attach", label: "Attach", icon: Paperclip };
const MODEL_TAB: TabDef = { id: "model", label: "Model", icon: Cpu };
const BASE_TABS: TabDef[] = [
  { id: "tools", label: "Tools", icon: Wrench },
  { id: "sandbox", label: "Sandbox", icon: Box },
  { id: "settings", label: "Settings", icon: Settings2 },
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

  const settings = useAppSelector(
    selectBuilderAdvancedSettings(conversationId),
  );
  const sandboxOverride = useAppSelector(
    selectConversationSandboxOverride(conversationId),
  );
  // Surface-scoped binding: a box bound for THIS conversation's surface.
  const surfaceSandbox = useAppSelector((s) => {
    const sf = s.conversations.byConversationId[conversationId]?.sourceFeature;
    return sf
      ? (s.userPreferences.coding.activeAgentSandboxBySurface[sf] ?? null)
      : null;
  });
  const overrideState = useAppSelector(
    selectInstanceOverrideState(conversationId),
  );
  const attachmentCapabilities = useAppSelector(
    selectAttachmentCapabilities(conversationId),
  );

  // The Model tab (and per-run model/settings overrides) only applies to
  // instances that own an override layer — manual/builder-test runs read the
  // agent live and have no override state, so we hide it there.
  const hasOverrideLayer = !!overrideState;
  const hasModelOverride = !!(
    overrideState?.overrides && "model" in overrideState.overrides
  );
  const tabs: TabDef[] = [
    ...(includeAttach ? [ATTACH_TAB] : []),
    ...(hasOverrideLayer ? [MODEL_TAB] : []),
    ...BASE_TABS,
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
    (tab === "attach" && !includeAttach)
      ? "tools"
      : tab;

  const addedCount = settings?.addedTools?.length ?? 0;
  const hasSandbox = !!(sandboxOverride ?? surfaceSandbox);
  const isCustomized =
    addedCount > 0 ||
    hasSandbox ||
    hasModelOverride ||
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
          title={
            includeAttach
              ? "Attach, model, tools, sandbox & settings"
              : "Model, tools, sandbox & run settings"
          }
          aria-label={
            includeAttach
              ? "Attach, model, tools, sandbox & settings"
              : "Model, tools, sandbox & run settings"
          }
          className={cn(
            "relative flex items-center justify-center rounded-full transition-colors",
            variant === "plus" ? "h-9 w-9" : "h-8 w-8",
            isCustomized
              ? "text-primary bg-primary/10 hover:bg-primary/15"
              : "text-muted-foreground/70 hover:text-foreground hover:bg-muted/60",
          )}
        >
          <TriggerIcon
            className={variant === "plus" ? "h-5 w-5" : "h-4 w-4"}
          />
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
        className="w-[min(440px,calc(100vw-1rem))] p-0 border-border"
        container={dialogContainer ?? undefined}
      >
        <div
          role="tablist"
          aria-label="Run controls"
          className="flex border-b border-border"
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
                  "-mb-px flex flex-1 items-center justify-center gap-1.5 border-b-2 px-2 py-2 text-xs font-medium transition-colors",
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
        </div>
      </PopoverContent>
    </Popover>
  );
}
