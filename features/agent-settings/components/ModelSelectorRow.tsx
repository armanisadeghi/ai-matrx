"use client";

import { Settings2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { ModelListDropdown } from "@/features/ai-models/components/lab/ModelListDropdown";
import {
  selectEffectiveModelId,
  selectEffectiveSettings,
  selectHasPendingSwitch,
} from "@/lib/redux/slices/agent-settings/selectors";
import { requestModelSwitch } from "@/lib/redux/slices/agent-settings/agentSettingsSlice";
import type { AgentSettings } from "@/lib/redux/slices/agent-settings/types";

// Fields shown as active-setting badges in the compact summary row
const BADGE_FIELDS: Array<{ key: keyof AgentSettings; label: string }> = [
  { key: "temperature", label: "temp" },
  { key: "max_output_tokens", label: "max_tokens" },
  { key: "top_p", label: "top_p" },
  { key: "top_k", label: "top_k" },
  { key: "reasoning_effort", label: "reasoning" },
  { key: "tool_choice", label: "tool_choice" },
  { key: "response_format", label: "format" },
  { key: "thinking_budget", label: "thinking" },
  { key: "stream", label: "stream" },
];

function formatBadgeValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "on" : "off";
  if (typeof value === "object") {
    const typed = value as Record<string, unknown>;
    if ("type" in typed) return String(typed.type);
    return JSON.stringify(value);
  }
  return String(value);
}

interface ModelSelectorRowProps {
  agentId: string;
  onSettingsClick: () => void;
  showSettingsBadges?: boolean;
}

export function ModelSelectorRow({
  agentId,
  onSettingsClick,
  showSettingsBadges = true,
}: ModelSelectorRowProps) {
  const dispatch = useAppDispatch();
  const effectiveModelId = useAppSelector((state) =>
    selectEffectiveModelId(state, agentId),
  );
  const effectiveSettings = useAppSelector((state) =>
    selectEffectiveSettings(state, agentId),
  );
  const hasPendingSwitch = useAppSelector((state) =>
    selectHasPendingSwitch(state, agentId),
  );

  const handleModelChange = (newModelId: string) => {
    if (newModelId === effectiveModelId) return;
    dispatch(requestModelSwitch({ agentId, newModelId }));
  };

  const activeBadges = showSettingsBadges
    ? BADGE_FIELDS.filter(
        ({ key }) =>
          effectiveSettings[key] !== undefined &&
          effectiveSettings[key] !== null,
      )
    : [];

  return (
    <div className="space-y-1.5">
      {/* Model selector + settings button */}
      <div className="flex items-center gap-1.5">
        <ModelListDropdown
          value={effectiveModelId}
          onValueChange={handleModelChange}
          inputModalities={[]}
          className="h-7 text-xs flex-1 min-w-0"
        />

        <Button
          variant="outline"
          size="sm"
          className="h-7 w-7 p-0 shrink-0"
          onClick={onSettingsClick}
          title="Model settings"
        >
          {hasPendingSwitch ? (
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
          ) : (
            <Settings2 className="w-3.5 h-3.5" />
          )}
        </Button>
      </div>

      {/* Active settings badges */}
      {activeBadges.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {activeBadges.map(({ key, label }) => (
            <Badge
              key={key}
              variant="secondary"
              className="text-[10px] h-4 px-1.5 py-0 font-mono leading-none"
            >
              {label}:{" "}
              <span className="font-normal ml-0.5">
                {formatBadgeValue(effectiveSettings[key])}
              </span>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
