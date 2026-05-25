"use client";

/**
 * InputControlsMenu — the single consolidated run-controls icon in the Smart
 * Input. One button opens a tabbed popover:
 *
 *   - Model    — per-conversation model override (RunModelPicker). Only shown
 *                for instances that own an override layer (not manual runs).
 *   - Tools    — add registry tools to THIS run (RunToolPicker)
 *   - Sandbox  — bind an agent sandbox (SandboxPanel)
 *   - Settings — run settings: disable tool injection, Surface Simulator,
 *                debug, save-to-DB, … (RunSettingsEditor)
 *
 * Replaces the former standalone sandbox icon. Resources (Database) and
 * Variables ({}) stay as their own icons — different concern.
 *
 * The trigger shows a count badge when tools are added, otherwise a dot when
 * any run config is active (sandbox bound, injection disabled, surface
 * simulated) so the user can see at a glance that this run is customized.
 */

import { useState, type ComponentType } from "react";
import { SlidersHorizontal, Wrench, Box, Settings2, Cpu } from "lucide-react";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { RunToolPicker } from "./RunToolPicker";
import { SandboxPanel } from "@/features/agents/components/chat/SandboxPanel";
import { RunSettingsEditor } from "@/features/agents/components/run-controls/RunSettingsEditor";
import { RunModelPicker } from "@/features/agents/components/run-controls/RunModelPicker";
import { RunAdvancedSettings } from "@/features/agents/components/run-controls/RunAdvancedSettings";
import { selectBuilderAdvancedSettings } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import { selectConversationSandboxOverride } from "@/features/agents/redux/execution-system/conversations/conversations.selectors";
import { selectInstanceOverrideState } from "@/features/agents/redux/execution-system/instance-model-overrides/instance-model-overrides.selectors";

type Tab = "model" | "tools" | "sandbox" | "settings";

const MODEL_TAB: { id: Tab; label: string; icon: ComponentType<{ className?: string }> } = {
  id: "model",
  label: "Model",
  icon: Cpu,
};

const BASE_TABS: { id: Tab; label: string; icon: ComponentType<{ className?: string }> }[] = [
  { id: "tools", label: "Tools", icon: Wrench },
  { id: "sandbox", label: "Sandbox", icon: Box },
  { id: "settings", label: "Settings", icon: Settings2 },
];

export function InputControlsMenu({
  conversationId,
}: {
  conversationId: string;
}) {
  const settings = useAppSelector(selectBuilderAdvancedSettings(conversationId));
  const sandboxOverride = useAppSelector(
    selectConversationSandboxOverride(conversationId),
  );
  const userSandbox = useAppSelector(
    (s) => s.userPreferences.coding.activeAgentSandbox,
  );
  const overrideState = useAppSelector(
    selectInstanceOverrideState(conversationId),
  );

  // The Model tab (and per-run model/settings overrides) only applies to
  // instances that own an override layer — manual/builder-test runs read the
  // agent live and have no override state, so we hide it there.
  const hasOverrideLayer = !!overrideState;
  const hasModelOverride = !!(
    overrideState?.overrides && "model" in overrideState.overrides
  );
  const tabs = hasOverrideLayer ? [MODEL_TAB, ...BASE_TABS] : BASE_TABS;

  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>(hasOverrideLayer ? "model" : "tools");
  // Guard: if the model tab vanishes (manual instance) fall back to tools.
  const activeTab: Tab = tab === "model" && !hasOverrideLayer ? "tools" : tab;

  const addedCount = settings?.addedTools?.length ?? 0;
  const hasSandbox = !!(sandboxOverride ?? userSandbox);
  const active =
    addedCount > 0 ||
    hasSandbox ||
    hasModelOverride ||
    !!settings?.disableToolInjection ||
    !!settings?.surfaceOverride;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="Model, tools, sandbox & run settings"
          className={cn(
            "relative h-8 w-8 flex items-center justify-center rounded-full transition-colors",
            active
              ? "text-primary bg-primary/10"
              : "text-muted-foreground/70 hover:text-foreground hover:bg-muted/60",
          )}
        >
          <SlidersHorizontal className="h-4 w-4" />
          {addedCount > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary px-0.5 text-[9px] font-semibold leading-none text-primary-foreground ring-2 ring-background">
              {addedCount}
            </span>
          ) : active ? (
            <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-primary ring-2 ring-background" />
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div role="tablist" aria-label="Run controls" className="flex border-b border-border">
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
        <div
          role="tabpanel"
          id={`runctl-panel-${conversationId}`}
          aria-labelledby={`runctl-tab-${activeTab}-${conversationId}`}
          className="h-80"
        >
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
