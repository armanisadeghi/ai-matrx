"use client";

/**
 * InputControlsMenu — the single consolidated run-controls icon in the Smart
 * Input. One button opens a tabbed popover:
 *
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
import { SlidersHorizontal, Wrench, Box, Settings2 } from "lucide-react";
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
import { selectBuilderAdvancedSettings } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import { selectConversationSandboxOverride } from "@/features/agents/redux/execution-system/conversations/conversations.selectors";

type Tab = "tools" | "sandbox" | "settings";

const TABS: { id: Tab; label: string; icon: ComponentType<{ className?: string }> }[] = [
  { id: "tools", label: "Tools", icon: Wrench },
  { id: "sandbox", label: "Sandbox", icon: Box },
  { id: "settings", label: "Settings", icon: Settings2 },
];

export function InputControlsMenu({
  conversationId,
}: {
  conversationId: string;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("tools");

  const settings = useAppSelector(selectBuilderAdvancedSettings(conversationId));
  const sandboxOverride = useAppSelector(
    selectConversationSandboxOverride(conversationId),
  );
  const userSandbox = useAppSelector(
    (s) => s.userPreferences.coding.activeAgentSandbox,
  );

  const addedCount = settings?.addedTools?.length ?? 0;
  const hasSandbox = !!(sandboxOverride ?? userSandbox);
  const active =
    addedCount > 0 ||
    hasSandbox ||
    !!settings?.disableToolInjection ||
    !!settings?.surfaceOverride;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="Tools, sandbox & run settings"
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
        <div className="flex border-b border-border">
          {TABS.map((t) => {
            const Icon = t.icon;
            const on = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
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
              </button>
            );
          })}
        </div>
        <div className="h-80">
          {tab === "tools" && <RunToolPicker conversationId={conversationId} />}
          {tab === "sandbox" && (
            <div className="h-full overflow-y-auto">
              <SandboxPanel conversationId={conversationId} />
            </div>
          )}
          {tab === "settings" && (
            <div className="h-full overflow-y-auto px-3 py-2">
              <RunSettingsEditor conversationId={conversationId} />
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
