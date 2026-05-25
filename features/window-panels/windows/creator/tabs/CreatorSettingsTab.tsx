"use client";

import { RotateCcw } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectIsCreatorMode,
  selectShowCreatorTools,
  selectShowCreatorPanel,
  selectCreatorSettings,
  toggleCreatorMode,
  toggleCreatorTools,
  toggleShowCreatorPanel,
  setCreatorSetting,
  resetCreatorState,
} from "@/lib/redux/preferences/creatorDebugSlice";

function SettingRow({
  label,
  description,
  checked,
  onCheckedChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-3 rounded-md px-2 py-2 hover:bg-accent/40">
      <span className="flex flex-col">
        <span className="text-xs font-medium text-foreground">{label}</span>
        <span className="text-[11px] text-muted-foreground">{description}</span>
      </span>
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        className="mt-0.5 shrink-0"
      />
    </label>
  );
}

/**
 * First page of the Creator Hub — the creator-debug master toggle plus the
 * small set of real creator preferences. Reads/writes creatorDebugSlice only.
 */
export default function CreatorSettingsTab() {
  const dispatch = useAppDispatch();
  const isCreatorMode = useAppSelector(selectIsCreatorMode);
  const showCreatorTools = useAppSelector(selectShowCreatorTools);
  const showCreatorPanel = useAppSelector(selectShowCreatorPanel);
  const settings = useAppSelector(selectCreatorSettings);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <span className="text-xs font-semibold text-foreground">
          Creator Settings
        </span>
        <button
          type="button"
          onClick={() => dispatch(resetCreatorState())}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          title="Reset creator settings to defaults"
        >
          <RotateCcw className="h-3 w-3" />
          Reset
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        <p className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
          Creator Mode
        </p>
        <SettingRow
          label="Creator debug mode"
          description="Master toggle for every creator-only surface"
          checked={isCreatorMode}
          onCheckedChange={() => dispatch(toggleCreatorMode())}
        />
        <SettingRow
          label="Show creator panel"
          description="The run-control panel above the agent input (Actions, Payload, …)"
          checked={showCreatorPanel}
          onCheckedChange={() => dispatch(toggleShowCreatorPanel())}
        />
        <SettingRow
          label="Show creator tools"
          description="In-page build buttons, draft pickers, raw-state insets"
          checked={showCreatorTools}
          onCheckedChange={() => dispatch(toggleCreatorTools())}
        />

        <p className="px-2 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
          Display
        </p>
        <SettingRow
          label="Show raw IDs"
          description="Show agent / shortcut / conversation IDs inline"
          checked={settings.showRawIds}
          onCheckedChange={(value) =>
            dispatch(setCreatorSetting({ key: "showRawIds", value }))
          }
        />
        <SettingRow
          label="Show build affordances"
          description="Show build / edit-definition controls on agent surfaces"
          checked={settings.showBuildAffordances}
          onCheckedChange={(value) =>
            dispatch(setCreatorSetting({ key: "showBuildAffordances", value }))
          }
        />
        <SettingRow
          label="Show drafts"
          description="Mix draft/unpublished entities into listing surfaces"
          checked={settings.showDrafts}
          onCheckedChange={(value) =>
            dispatch(setCreatorSetting({ key: "showDrafts", value }))
          }
        />

        <p className="px-2 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
          Tool injection
        </p>
        <SettingRow
          label="Disable tool injection"
          description="Stop surfaces from auto-attaching their default tools. Agents run with only their own saved tools. Affects every agent and run."
          checked={settings.disableToolInjection}
          onCheckedChange={(value) =>
            dispatch(setCreatorSetting({ key: "disableToolInjection", value }))
          }
        />
      </div>
    </div>
  );
}
