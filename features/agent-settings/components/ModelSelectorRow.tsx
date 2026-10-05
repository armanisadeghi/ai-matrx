"use client";

import { useEffect, useRef } from "react";

import { Settings2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { ModelListDropdown } from "@/features/ai-models/components/lab/ModelListDropdown";
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

  // The picker reports the class BEFORE the model. The class is written at
  // once; if the model switch it came with is then cancelled, the old model
  // gets its own class back (never the new model's).
  const pinBeforeSwitch = useRef<{ prev: string | undefined } | null>(null);
  const switchFromModel = useRef<string | null>(null);
  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !hasPendingSwitch) {
      const cancelled = switchFromModel.current === effectiveModelId;
      if (cancelled && pinBeforeSwitch.current) {
        dispatch(
          applySettingsFromDialog({
            agentId,
            newSettings: withOfferingPin(
              effectiveSettings,
              pinBeforeSwitch.current.prev,
            ),
          }),
        );
      }
      pinBeforeSwitch.current = null;
      switchFromModel.current = null;
    }
    wasPending.current = hasPendingSwitch;
  }, [hasPendingSwitch, effectiveModelId, effectiveSettings, agentId, dispatch]);

  // The switch committed (model moved) → nothing left to restore.
  useEffect(() => {
    if (switchFromModel.current && switchFromModel.current !== effectiveModelId) {
      pinBeforeSwitch.current = null;
      switchFromModel.current = null;
    }
  }, [effectiveModelId]);

  const handleModelChange = (newModelId: string) => {
    if (newModelId === effectiveModelId) return;
    switchFromModel.current = effectiveModelId ?? null;
    dispatch(requestModelSwitch({ agentId, newModelId }));
  };

  // The class (offering) pin rides with the model in the same settings entry;
  // `undefined` removes the key so the server routes to the preferred class.
  const handleOfferingPinChange = (offeringId: string | undefined) => {
    const prev = effectiveSettings.offering_id;
    pinBeforeSwitch.current = { prev: typeof prev === "string" ? prev : undefined };
    queueMicrotask(() => {
      // No model switch followed in this gesture → a class-only change.
      if (switchFromModel.current === null) pinBeforeSwitch.current = null;
    });
    dispatch(
      applySettingsFromDialog({
        agentId,
        newSettings: withOfferingPin(effectiveSettings, offeringId),
      }),
    );
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
