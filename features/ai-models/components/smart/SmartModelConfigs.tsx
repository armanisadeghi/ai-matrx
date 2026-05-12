"use client";

/**
 * SmartModelConfigs
 *
 * Self-wired model selector + settings badge strip.
 *
 * The model dropdown (SmartModelSelect) fetches its own options from Redux —
 * no models array needed. Pass value / onModelChange to control selection.
 *
 * Props:
 *   model                     — currently selected model ID
 *   onModelChange             — called with new model ID on selection
 *   modelConfig               — LLMParams for badge rendering
 *   onSettingsClick           — opens the settings panel / modal
 *   showSettingsDetails       — show/hide the badge strip (default: true)
 *   hasPendingConflict        — show the amber conflict button
 *   onOpenSettingsConflictModal — opens the conflict resolution modal
 */

import { AlertTriangle, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SmartModelSelect } from "./SmartModelSelect";
import { FeLlmParams } from "@/features/agents/types/agent-api-types";

/** Stable display order mirroring agent-api-types `LLMParams` sections. */
const LLM_PARAM_ORDER = [
  "model",
  "max_output_tokens",
  "temperature",
  "top_p",
  "top_k",
  "tool_choice",
  "parallel_tool_calls",
  "reasoning_effort",
  "reasoning_summary",
  "thinking_level",
  "include_thoughts",
  "thinking_budget",
  "clear_thinking",
  "disable_reasoning",
  "response_format",
  "stop_sequences",
  "stream",
  "store",
  "verbosity",
  "internal_web_search",
  "internal_url_context",
  "size",
  "quality",
  "count",
  "tts_voice",
  "audio_format",
  "seconds",
  "fps",
  "steps",
  "seed",
  "guidance_scale",
  "output_quality",
  "negative_prompt",
  "output_format",
  "width",
  "height",
  "frame_images",
  "reference_images",
  "image_loras",
  "disable_safety_checker",
] as const satisfies readonly (keyof FeLlmParams)[];

const MEDIA_STYLE_KEYS = new Set<keyof FeLlmParams>([
  "size",
  "quality",
  "count",
  "seconds",
  "fps",
  "steps",
  "seed",
  "guidance_scale",
  "output_quality",
  "negative_prompt",
  "output_format",
  "width",
  "height",
  "frame_images",
  "reference_images",
  "image_loras",
  "disable_safety_checker",
  "tts_voice",
  "audio_format",
]);

function isEmptyForDisplay(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === "string" && value.trim() === "") return true;
  if (Array.isArray(value) && value.length === 0) return true;
  if (
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value as Record<string, unknown>).length === 0
  ) {
    return true;
  }
  return false;
}

function formatLlmParamValue(
  key: keyof FeLlmParams,
  value: unknown,
): string | null {
  if (isEmptyForDisplay(value)) return null;

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  if (typeof value === "number") {
    if (key === "temperature" || key === "top_p" || key === "guidance_scale") {
      return Number.isInteger(value) ? String(value) : value.toFixed(2);
    }
    return String(value);
  }

  if (typeof value === "string") {
    return value;
  }

  if (key === "response_format" && value && typeof value === "object") {
    const rf = value as Record<string, unknown>;
    if (typeof rf.type === "string") {
      return rf.type;
    }
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  if (key === "stop_sequences" && Array.isArray(value)) {
    return (value as string[]).join(", ");
  }

  if (key === "tts_voice") {
    if (Array.isArray(value)) {
      try {
        return JSON.stringify(value);
      } catch {
        return `${value.length} voice(s)`;
      }
    }
  }

  if (
    (key === "frame_images" ||
      key === "reference_images" ||
      key === "image_loras") &&
    Array.isArray(value)
  ) {
    return `${value.length}`;
  }

  if (Array.isArray(value)) {
    try {
      return JSON.stringify(value);
    } catch {
      return `${value.length} item(s)`;
    }
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

interface SmartModelConfigsProps {
  model: string;
  onModelChange: (value: string) => void;
  llmParams: FeLlmParams;
  onSettingsClick: () => void;
  showSettingsDetails?: boolean;
  hasPendingConflict?: boolean;
  onOpenSettingsConflictModal?: () => void;
}

export function SmartModelConfigs({
  model,
  onModelChange,
  llmParams,
  onSettingsClick,
  showSettingsDetails = true,
  hasPendingConflict,
  onOpenSettingsConflictModal,
}: SmartModelConfigsProps) {
  const badges: { key: keyof FeLlmParams; label: string; value: string }[] = [];

  for (const key of LLM_PARAM_ORDER) {
    if (!(key in llmParams)) continue;
    const raw = llmParams[key];
    if (raw === undefined) continue;

    if (key === "model" && (raw === model || raw === "")) {
      continue;
    }

    const formatted = formatLlmParamValue(key, raw);
    if (formatted === null) continue;

    let label = key;
    let displayValue = formatted;

    if (key === "width" && typeof llmParams.height === "number") {
      displayValue = `${llmParams.width}x${llmParams.height}`;
    } else if (key === "height" && typeof llmParams.width === "number") {
      continue;
    }

    badges.push({ key, label, value: displayValue });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between pt-2">
        <div className="flex items-center gap-3">
          <Label className="text-xs text-gray-600 dark:text-gray-400">
            Model
          </Label>
          <SmartModelSelect value={model} onValueChange={onModelChange} />
        </div>

        <div className="flex items-center gap-1">
          {hasPendingConflict && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 gap-1"
              onClick={onOpenSettingsConflictModal}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              Review Conflicts
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            onClick={onSettingsClick}
          >
            <Settings2 className="w-3.5 h-3.5 mr-1" />
          </Button>
        </div>
      </div>

      {showSettingsDetails && badges.length > 0 && (
        <div className="flex flex-wrap gap-1.5 text-xs">
          {badges.map(({ key, label, value }) => {
            const isMedia = MEDIA_STYLE_KEYS.has(key);
            return (
              <span
                key={key}
                className={
                  isMedia
                    ? "px-2 py-0.5 bg-purple-100 dark:bg-purple-900 text-purple-600 dark:text-purple-400 rounded font-mono"
                    : "px-2 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded font-mono"
                }
              >
                {label}:{" "}
                <span
                  className={
                    isMedia
                      ? "text-purple-700 dark:text-purple-300"
                      : "text-green-600 dark:text-green-400"
                  }
                >
                  {value}
                </span>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
