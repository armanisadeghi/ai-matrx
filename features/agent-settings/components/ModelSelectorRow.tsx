"use client";

import { useRef } from "react";

import { Settings2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { ModelListDropdown } from "@ai-matrx/agents/models/react";
import { withOfferingPin } from "@/features/ai-models/utils/offering-pin";
import {
  selectEffectiveModelId,
  selectEffectiveSettings,
  selectHasPendingSwitch,
} from "@ai-matrx/chat/agents/redux/agent-settings/selectors";
import {
  applySettingsFromDialog,
  requestModelSwitch,
} from "@ai-matrx/chat/agents/redux/agent-settings/agentSettingsSlice";
import type { AgentSettings } from "@ai-matrx/chat/agents/redux/agent-settings/types";

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

  // The picker reports the class (offering pin) and the model in the SAME
  // click, in either order. Both are parked for that click and applied once
  // its handlers have run: a model change carries the class into the switch
  // (applied on confirm), a class-only change is written directly. The class
  // is never written ahead of its model, so the entry never pairs the old
  // model with the new model's class while the switch dialog is open.
  const clickRef = useRef<{
    modelId?: string;
    pin?: { offeringId: string | undefined };
  } | null>(null);

  const parkForClick = (update: {
    modelId?: string;
    pin?: { offeringId: string | undefined };
  }) => {
    if (!clickRef.current) {
      clickRef.current = {};
      queueMicrotask(() => {
        const click = clickRef.current;
        clickRef.current = null;
        if (!click) return;
        if (click.modelId) {
          dispatch(
            requestModelSwitch({
              agentId,
              newModelId: click.modelId,
              offeringId: click.pin?.offeringId,
            }),
          );
        } else if (click.pin) {
          dispatch(
            applySettingsFromDialog({
              agentId,
              newSettings: withOfferingPin(effectiveSettings, click.pin.offeringId),
            }),
          );
        }
      });
    }
    Object.assign(clickRef.current, update);
  };

  const handleModelChange = (newModelId: string) => {
    if (newModelId === effectiveModelId) return;
    parkForClick({ modelId: newModelId });
  };

  // `undefined` removes the key so the server routes to the preferred class.
  const handleOfferingPinChange = (offeringId: string | undefined) => {
    parkForClick({ pin: { offeringId } });
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
          pinnedOfferingId={effectiveSettings.offering_id}
          onOfferingPinChange={handleOfferingPinChange}
          className="h-7 text-xs flex-1 min-w-0"
        />

        <Button
          icon={hasPendingSwitch ? (
            <AlertTriangle className="text-amber-500" />
          ) : (
            <Settings2 />
          )} aria-label="Model settings"
          variant="outline"
          className="shrink-0"
          onClick={onSettingsClick}
          title="Model settings"
        />
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
