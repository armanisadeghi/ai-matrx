"use client";

/**
 * LandingPlusMenu — unified `+` popover for the `/chat/new` hero input.
 *
 * Folds two production primitives behind a single trigger:
 *
 *   - Attach   — the canonical ResourcePickerMenu (notes/tasks/files/upload/…)
 *                wired the same way SmartAgentResourcePickerButton wires it.
 *   - Model    — RunModelPicker + RunAdvancedSettings (only when the instance
 *                actually owns an override layer; same gate InputControlsMenu
 *                uses).
 *   - Tools    — RunToolPicker (run-scoped tools)
 *   - Sandbox  — SandboxPanel
 *   - Settings — RunSettingsEditor
 *
 * Pre-first-message UX: the user wants one calm entry point, not two
 * adjacent buttons with different popover shapes. Inner panels are the exact
 * components the production SmartAgentInputStacked toolbar mounts, so any
 * state set here (model override, tool selection, sandbox binding, run
 * settings, attached resources) flows through `smartExecute` unchanged once
 * the conversation URL promotes — and we can later swap `InputControlsMenu` +
 * `SmartAgentResourcePickerButton` for this same component on the production
 * toolbar with a one-line edit.
 */

import { useCallback, useState, type ComponentType } from "react";
import { Plus, Paperclip, Wrench, Box, Settings2, Cpu } from "lucide-react";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { useDialogContainer } from "@/components/ui/dialog";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { cn } from "@/lib/utils";

import { ResourcePickerMenu } from "@/features/resource-manager/resource-picker/ResourcePickerMenu";
import { RunToolPicker } from "@/features/agents/components/inputs/smart-input/RunToolPicker";
import { SandboxPanel } from "@/features/agents/components/chat/SandboxPanel";
import { RunSettingsEditor } from "@/features/agents/components/run-controls/RunSettingsEditor";
import { RunModelPicker } from "@/features/agents/components/run-controls/RunModelPicker";
import { RunAdvancedSettings } from "@/features/agents/components/run-controls/RunAdvancedSettings";

import {
  addResource,
  setResourcePreview,
} from "@/features/agents/redux/execution-system/instance-resources/instance-resources.slice";
import {
  selectAttachmentCapabilities,
  selectInstanceOverrideState,
} from "@/features/agents/redux/execution-system/instance-model-overrides/instance-model-overrides.selectors";
import { selectBuilderAdvancedSettings } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import { selectConversationSandboxOverride } from "@/features/agents/redux/execution-system/conversations/conversations.selectors";
import {
  refineBlockType,
  resourceDataToSource,
} from "@/features/agents/redux/execution-system/instance-resources/resource-source";
import type { Resource } from "@/features/prompts/types/resources";
import type { ResourceBlockType } from "@/features/agents/types/instance.types";

// ── Helpers (mirrors SmartAgentResourcePickerButton — kept inline so this
//    component stays a single self-contained primitive we can promote to the
//    production toolbar later without a separate util module to factor.) ────

function resourceTypeToBlockType(type: Resource["type"]): ResourceBlockType {
  const map: Record<string, ResourceBlockType> = {
    note: "input_notes",
    task: "input_task",
    project: "input_notes",
    file: "document",
    table: "input_table",
    webpage: "input_webpage",
    youtube: "youtube_video",
    image_url: "image",
    file_url: "document",
    audio: "audio",
  };
  return map[type] ?? "text";
}

function resourceLabel(resource: Resource): string {
  switch (resource.type) {
    case "note":
      return resource.data.label ?? "Note";
    case "task":
      return resource.data.title ?? "Task";
    case "project":
      return resource.data.name ?? "Project";
    case "file":
      return resource.data.details?.filename ?? "File";
    case "table":
      return resource.data.table_name ?? "Table";
    case "webpage":
      return resource.data.title ?? resource.data.url ?? "Webpage";
    case "youtube":
      return resource.data.title ?? "YouTube";
    case "image_url":
      return resource.data.url ?? "Image";
    case "file_url":
      return resource.data.filename ?? "File";
    case "audio":
      return resource.data.filename ?? "Audio";
    default:
      return "Resource";
  }
}

// ── Tabs ────────────────────────────────────────────────────────────────────

type Tab = "attach" | "model" | "tools" | "sandbox" | "settings";

const ATTACH_TAB: {
  id: Tab;
  label: string;
  icon: ComponentType<{ className?: string }>;
} = {
  id: "attach",
  label: "Attach",
  icon: Paperclip,
};
const MODEL_TAB: {
  id: Tab;
  label: string;
  icon: ComponentType<{ className?: string }>;
} = {
  id: "model",
  label: "Model",
  icon: Cpu,
};
const BASE_TABS: {
  id: Tab;
  label: string;
  icon: ComponentType<{ className?: string }>;
}[] = [
  { id: "tools", label: "Tools", icon: Wrench },
  { id: "sandbox", label: "Sandbox", icon: Box },
  { id: "settings", label: "Settings", icon: Settings2 },
];

interface LandingPlusMenuProps {
  conversationId: string;
}

export function LandingPlusMenu({ conversationId }: LandingPlusMenuProps) {
  const dispatch = useAppDispatch();
  const dialogContainer = useDialogContainer();

  // Same selectors InputControlsMenu uses — keeps the activity dot and the
  // Model-tab gate in lockstep across surfaces.
  const settings = useAppSelector(
    selectBuilderAdvancedSettings(conversationId),
  );
  const sandboxOverride = useAppSelector(
    selectConversationSandboxOverride(conversationId),
  );
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

  const hasOverrideLayer = !!overrideState;
  const hasModelOverride = !!(
    overrideState?.overrides && "model" in overrideState.overrides
  );
  const tabs: typeof BASE_TABS = [
    ATTACH_TAB,
    ...(hasOverrideLayer ? [MODEL_TAB] : []),
    ...BASE_TABS,
  ];

  const [open, setOpen] = useState(false);
  // Attach is the primary intent of the `+` button — always default here.
  const [tab, setTab] = useState<Tab>("attach");
  const activeTab: Tab = tab === "model" && !hasOverrideLayer ? "tools" : tab;

  const addedCount = settings?.addedTools?.length ?? 0;
  const hasSandbox = !!(sandboxOverride ?? surfaceSandbox);
  const isCustomized =
    addedCount > 0 ||
    hasSandbox ||
    hasModelOverride ||
    !!settings?.disableToolInjection ||
    !!settings?.surfaceOverride;

  const handleResourceSelected = useCallback(
    (resource: Resource) => {
      const baseBlockType = resourceTypeToBlockType(resource.type);
      const blockType = refineBlockType(baseBlockType, resource.data);
      const label = resourceLabel(resource);
      const resourceId = `res_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 8)}`;

      dispatch(
        addResource({
          conversationId,
          blockType,
          source: resourceDataToSource(blockType, resource.data),
          resourceId,
        }),
      );
      dispatch(
        setResourcePreview({ conversationId, resourceId, preview: label }),
      );
      setOpen(false);
    },
    [conversationId, dispatch],
  );

  return (
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <PopoverTrigger asChild>
        <button
          type="button"
          tabIndex={-1}
          title="Attach, model, tools, sandbox & settings"
          aria-label="Attach, model, tools, sandbox & settings"
          className={cn(
            "relative h-9 w-9 flex items-center justify-center rounded-full transition-colors",
            isCustomized
              ? "text-primary bg-primary/10 hover:bg-primary/15"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/60",
          )}
        >
          <Plus className="w-5 h-5" />
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
        align="start"
        side="top"
        sideOffset={8}
        className="w-80 p-0 border-border"
        container={dialogContainer ?? undefined}
      >
        <div
          role="tablist"
          aria-label="Input controls"
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
                id={`plusmenu-tab-${t.id}-${conversationId}`}
                aria-selected={on}
                aria-controls={`plusmenu-panel-${conversationId}`}
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

        <div
          role="tabpanel"
          id={`plusmenu-panel-${conversationId}`}
          aria-labelledby={`plusmenu-tab-${activeTab}-${conversationId}`}
          className={activeTab === "attach" ? "" : "h-80"}
        >
          {activeTab === "attach" && (
            <ResourcePickerMenu
              onResourceSelected={handleResourceSelected}
              onClose={() => setOpen(false)}
              attachmentCapabilities={attachmentCapabilities}
            />
          )}
          {activeTab === "model" && (
            <div className="h-full overflow-y-auto">
              <RunModelPicker conversationId={conversationId} />
              <RunAdvancedSettings conversationId={conversationId} />
            </div>
          )}
          {activeTab === "tools" && (
            <RunToolPicker conversationId={conversationId} />
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
