"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import {
  X,
  FileJson,
  AlertCircle,
  Plus,
  Volume2,
  Users,
  AlertTriangle,
  ChevronLeft,
  Save,
} from "lucide-react";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  useModelControls,
  ControlDefinition,
} from "@/features/prompts/hooks/useModelControls";
import { PromptSettings } from "@/features/prompts/types/core";
import { SettingsJsonEditor } from "./SettingsJsonEditor";
import { getUnrecognizedSettings } from "@/features/prompts/utils/settings-filter";
import { buildSettingsRows } from "@/lib/redux/slices/agent-settings/settings-catalogue";

// ── NumberInput ──────────────────────────────────────────────────────────────
// Text-based number input: no browser spinner, no mid-edit validation.
// Commits only on blur; selects all text on focus for quick replacement.
interface NumberInputProps {
  value: number;
  onChange: (val: number) => void;
  onSliderChange?: (val: number) => void;
  min?: number;
  max?: number;
  step?: number;
  isInteger?: boolean;
  disabled?: boolean;
  withSlider?: boolean;
}

function NumberInput({
  value,
  onChange,
  onSliderChange,
  min,
  max,
  step = 1,
  isInteger = false,
  disabled = false,
  withSlider = false,
}: NumberInputProps) {
  const [draft, setDraft] = useState<string>(() => String(value));

  // Keep draft in sync when value changes from outside (e.g. slider)
  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const commit = (raw: string) => {
    if (raw === "" || raw === "-") return;
    const parsed = isInteger ? parseInt(raw, 10) : parseFloat(raw);
    if (!isNaN(parsed)) onChange(parsed);
    else setDraft(String(value)); // revert on garbage input
  };

  if (withSlider) {
    return (
      <div className="flex items-center gap-2">
        <Slider
          min={min}
          max={max}
          step={step}
          value={[value]}
          onValueChange={(val) => {
            onSliderChange?.(val[0]);
            setDraft(String(val[0]));
          }}
          disabled={disabled}
          className="flex-1"
        />
        <Input
          type="text"
          inputMode="decimal"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          onFocus={(e) => e.target.select()}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.currentTarget.blur();
            }
          }}
          disabled={disabled}
          className="w-24 h-7 px-2 text-xs"
        />
      </div>
    );
  }

  return (
    <Input
      type="text"
      inputMode="decimal"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={(e) => commit(e.target.value)}
      onFocus={(e) => e.target.select()}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.currentTarget.blur();
        }
      }}
      disabled={disabled}
      className="h-7 px-2 text-xs w-full"
    />
  );
}

interface ModelSettingsProps {
  modelId: string;
  models: any[];
  settings: PromptSettings;
  onSettingsChange: (settings: PromptSettings) => void;
  availableTools?: any[];
  showModelSelector?: boolean;
  onModelChange?: (modelId: string) => void;
}

export function ModelSettings({
  modelId,
  models,
  settings,
  onSettingsChange,
  availableTools = [],
  showModelSelector = false,
  onModelChange,
}: ModelSettingsProps) {
  // Get normalized controls for the selected model
  const { normalizedControls, error } = useModelControls(models, modelId);

  // Track which settings are enabled
  const [enabledSettings, setEnabledSettings] = useState<Set<string>>(() => {
    const enabled = new Set<string>();
    Object.entries(settings).forEach(([key, value]) => {
      if (value !== null && value !== undefined) {
        enabled.add(key);
      }
    });
    return enabled;
  });

  // CRITICAL: Sync enabledSettings when settings change from outside
  useEffect(() => {
    const enabled = new Set<string>();
    Object.entries(settings).forEach(([key, value]) => {
      if (value !== null && value !== undefined) {
        enabled.add(key);
      }
    });
    setEnabledSettings(enabled);
  }, [settings]);

  // Multi-speaker TTS state (Google only)
  const initialSpeakers = useMemo(() => {
    if (Array.isArray(settings.tts_voice) && settings.tts_voice.length > 0) {
      return settings.tts_voice as { name: string; voice: string }[];
    }
    const defaultVoice = normalizedControls?.tts_voice?.default ?? "";
    return [{ name: "", voice: String(defaultVoice) }];
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [multiSpeakers, setMultiSpeakers] =
    useState<{ name: string; voice: string }[]>(initialSpeakers);
  const [isMultiSpeakerActive, setIsMultiSpeakerActive] = useState(
    Array.isArray(settings.tts_voice),
  );

  const handleToggleMultiSpeaker = (enabled: boolean) => {
    setIsMultiSpeakerActive(enabled);
    if (enabled) {
      const current =
        multiSpeakers.length > 0
          ? multiSpeakers
          : [
              {
                name: "",
                voice: String(normalizedControls?.tts_voice?.default ?? ""),
              },
            ];
      setMultiSpeakers(current);
      onSettingsChange({ ...settings, tts_voice: current as any });
    } else {
      // Revert to single-speaker: use first speaker's voice or default
      const singleVoice =
        multiSpeakers[0]?.voice ||
        String(normalizedControls?.tts_voice?.default ?? "");
      onSettingsChange({ ...settings, tts_voice: singleVoice });
    }
  };

  const handleSpeakerChange = (
    index: number,
    field: "name" | "voice",
    value: string,
  ) => {
    const updated = multiSpeakers.map((sp, i) =>
      i === index ? { ...sp, [field]: value } : sp,
    );
    setMultiSpeakers(updated);
    onSettingsChange({ ...settings, tts_voice: updated as any });
  };

  const handleAddSpeaker = () => {
    if (multiSpeakers.length >= 2) return;
    const updated = [
      ...multiSpeakers,
      { name: "", voice: String(normalizedControls?.tts_voice?.default ?? "") },
    ];
    setMultiSpeakers(updated);
    onSettingsChange({ ...settings, tts_voice: updated as any });
  };

  const handleRemoveSpeaker = (index: number) => {
    const updated = multiSpeakers.filter((_, i) => i !== index);
    setMultiSpeakers(updated);
    onSettingsChange({ ...settings, tts_voice: updated as any });
  };

  // JSON flip state
  const [showJsonEditor, setShowJsonEditor] = useState(false);
  const [jsonText, setJsonText] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const jsonTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Get all recognized keys from normalizedControls.
  // Also include keys that are universally valid settings regardless of model —
  // these may be missing from normalizedControls when the DB stores them as
  // primitives (e.g. temperature: 1.0) rather than control definition objects,
  // or when the model simply doesn't declare them but they're still accepted.
  const recognizedKeys = useMemo(() => {
    const keys = new Set<string>([
      // Always-valid submission keys (full LLM_PARAMS_KEYS set)
      "model_id",
      "temperature",
      "max_output_tokens",
      "max_tokens",
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
      // Frontend-only UI flags
      "tools",
      "image_urls",
      "file_urls",
      "youtube_videos",
      "n",
    ]);
    if (!normalizedControls) return keys;
    Object.keys(normalizedControls).forEach((key) => {
      if (key !== "rawControls" && key !== "unmappedControls") {
        keys.add(key);
      }
    });
    return keys;
  }, [normalizedControls]);

  // Get unrecognized settings
  const unrecognizedSettings = useMemo(() => {
    return getUnrecognizedSettings(settings, recognizedKeys);
  }, [settings, recognizedKeys]);

  const handleSettingChange = (key: keyof PromptSettings, value: any) => {
    if (!enabledSettings.has(key)) {
      setEnabledSettings(new Set(enabledSettings).add(key));
    }

    // response_format: convert string enum values to dict format
    // "text" -> undefined (default, omit), "json_object" -> { type: "json_object" }
    if (key === "response_format" && typeof value === "string") {
      if (value === "text" || value === "") {
        const {
          response_format: _removed,
          output_format: _legacy,
          ...rest
        } = settings;
        onSettingsChange(rest as PromptSettings);
        return;
      }
      onSettingsChange({
        ...settings,
        response_format: { type: value } as any,
      });
      return;
    }

    // Special handling for include_thoughts
    if (key === "include_thoughts") {
      if (value === false) {
        onSettingsChange({
          ...settings,
          [key]: value,
          thinking_budget: -1,
        });
      } else if (value === true && settings.thinking_budget === -1) {
        onSettingsChange({
          ...settings,
          [key]: value,
          thinking_budget: normalizedControls?.thinking_budget?.default ?? 1024,
        });
      } else {
        onSettingsChange({
          ...settings,
          [key]: value,
        });
      }
    } else {
      onSettingsChange({
        ...settings,
        [key]: value,
      });
    }
  };

  const handleToggleSetting = (key: keyof PromptSettings, enabled: boolean) => {
    const newEnabled = new Set(enabledSettings);
    if (enabled) {
      newEnabled.add(key);
      const control = (normalizedControls as any)[key];
      if (control) {
        let defaultValue: any = control.default;
        if (defaultValue === null || defaultValue === undefined) {
          if (control.type === "number" || control.type === "integer") {
            defaultValue = control.min ?? 0;
          } else if (
            control.type === "string" ||
            control.type === "string_array"
          ) {
            defaultValue = "";
          } else if (control.type === "boolean") {
            defaultValue = false;
          } else if (
            control.type === "enum" &&
            control.enum &&
            control.enum.length > 0
          ) {
            defaultValue = control.enum[0];
          } else if (
            control.type === "array" ||
            control.type === "object_array"
          ) {
            defaultValue = [];
          }
        }
        // response_format: convert string enum default to dict
        if (key === "response_format" && typeof defaultValue === "string") {
          if (defaultValue === "text" || defaultValue === "") {
            defaultValue = undefined;
          } else {
            defaultValue = { type: defaultValue };
          }
        }
        if (defaultValue !== undefined) {
          onSettingsChange({ ...settings, [key]: defaultValue });
        }
      }
    } else {
      newEnabled.delete(key);
      const { [key]: removed, ...rest } = settings;
      onSettingsChange(rest as PromptSettings);
    }
    setEnabledSettings(newEnabled);
  };

  const handleJsonSave = (newSettings: PromptSettings) => {
    onSettingsChange(newSettings);
    const newEnabled = new Set<string>();
    Object.entries(newSettings).forEach(([key, value]) => {
      if (value !== null && value !== undefined) {
        newEnabled.add(key);
      }
    });
    setEnabledSettings(newEnabled);
  };

  const handleFlipToJson = () => {
    setJsonText(JSON.stringify(settings, null, 2));
    setJsonError(null);
    setShowJsonEditor(true);
    // Focus textarea after flip animation completes
    setTimeout(() => jsonTextareaRef.current?.focus(), 420);
  };

  const handleFlipBack = () => {
    setShowJsonEditor(false);
    setJsonError(null);
  };

  const handleJsonApply = () => {
    try {
      const parsed = JSON.parse(jsonText);
      setJsonError(null);
      handleJsonSave(parsed);
      setShowJsonEditor(false);
    } catch (e) {
      setJsonError(e instanceof Error ? e.message : "Invalid JSON");
    }
  };

  if (error) {
    return (
      <div className="text-xs text-red-600 dark:text-red-400">
        Error loading model controls: {error}
      </div>
    );
  }

  // When no model is selected or controls aren't available yet,
  // show just the model selector so users can pick one first
  if (!normalizedControls) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground w-36">Model</Label>
          <Select
            value={modelId || ""}
            onValueChange={(value) =>
              onSettingsChange({ ...settings, model_id: value })
            }
          >
            <SelectTrigger className="h-7 text-xs flex-1">
              <SelectValue placeholder="Select a model..." />
            </SelectTrigger>
            <SelectContent>
              {models.map((m: any) => (
                <SelectItem key={m.id} value={m.id} className="text-xs">
                  {m.common_name || m.name || m.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <p className="text-xs text-muted-foreground">
          Select a model to see available settings.
        </p>
      </div>
    );
  }

  // Format a raw voice/enum value for display — capitalises each word, replaces _ and - with spaces
  const formatVoiceLabel = (value: string) =>
    value.replace(/[_-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  // Helper to render a setting control consistently. `control` may be null when
  // the selected model declares no schema for the key — the row is still shown
  // (never hidden), flagged with a caution icon, and its value is displayed
  // read-only (edit unsupported values via the JSON editor) so it is never
  // silently changed.
  const renderControl = (
    key: keyof PromptSettings,
    label: string,
    control: ControlDefinition | null,
  ) => {
    const isEnabled = enabledSettings.has(key);
    const value = (settings as any)[key];
    const checkboxId = `setting-${key}`;

    return (
      <div key={key} className="flex items-center gap-3 mb-2">
        <div
          className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
          onClick={() => handleToggleSetting(key, !isEnabled)}
        >
          <Checkbox
            id={checkboxId}
            checked={isEnabled}
            onCheckedChange={(checked) =>
              handleToggleSetting(key, checked as boolean)
            }
            className="cursor-pointer"
          />
          <Label
            htmlFor={checkboxId}
            className={`text-xs flex-shrink-0 w-36 cursor-pointer ${isEnabled ? "text-gray-700 dark:text-gray-300" : "text-gray-400 dark:text-gray-600"}`}
          >
            {label}
          </Label>
        </div>
        <div
          className={`flex-1 ${!isEnabled ? "opacity-50 pointer-events-none" : ""}`}
        >
          {control ? (
            renderControlInput(key, control, value, isEnabled)
          ) : (
            <input
              type="text"
              readOnly
              value={
                value === undefined || value === null
                  ? ""
                  : typeof value === "object"
                    ? JSON.stringify(value)
                    : String(value)
              }
              placeholder="Not supported by this model"
              className="h-7 px-2 text-xs text-gray-900 dark:text-gray-100 bg-textured border border-border rounded w-full opacity-70"
            />
          )}
        </div>
        {!control && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-amber-500 flex-shrink-0 cursor-help">
                <AlertTriangle className="h-3.5 w-3.5" />
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs max-w-[220px]">
              Not valid for this model — edit via the JSON editor if needed
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    );
  };

  const renderControlInput = (
    key: keyof PromptSettings,
    control: ControlDefinition,
    value: any,
    isEnabled: boolean,
  ) => {
    // For response_format, extract string type from dict for display
    let actualValue =
      value ??
      control.default ??
      (control.type === "number" || control.type === "integer"
        ? (control.min ?? 0)
        : "");
    if (
      key === "response_format" &&
      typeof actualValue === "object" &&
      actualValue?.type
    ) {
      actualValue = actualValue.type;
    }

    // Enum / Select
    if (control.type === "enum" && control.enum) {
      return (
        <Select
          value={actualValue}
          onValueChange={(val) => handleSettingChange(key, val)}
          disabled={!isEnabled}
        >
          <SelectTrigger className="h-7 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="text-xs">
            {control.enum.map((option) => (
              <SelectItem key={option} value={option} className="text-xs py-1">
                {key === "tts_voice" ? formatVoiceLabel(option) : option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }

    // Boolean / Checkbox
    if (control.type === "boolean") {
      const boolCheckboxId = `bool-${key}`;
      return (
        <div className="flex items-center gap-2">
          <Checkbox
            id={boolCheckboxId}
            checked={actualValue}
            onCheckedChange={(checked) => handleSettingChange(key, checked)}
            disabled={!isEnabled}
            className="cursor-pointer"
          />
          <Label
            htmlFor={boolCheckboxId}
            className="text-xs text-gray-600 dark:text-gray-400 cursor-pointer"
          >
            {actualValue ? "Enabled" : "Disabled"}
          </Label>
        </div>
      );
    }

    // Number with slider
    if (
      (control.type === "number" || control.type === "integer") &&
      control.min !== undefined &&
      control.max !== undefined
    ) {
      const step = control.type === "integer" ? 1 : 0.01;
      return (
        <NumberInput
          value={actualValue}
          onChange={(val) => handleSettingChange(key, val)}
          onSliderChange={(val) => handleSettingChange(key, val)}
          min={control.min}
          max={control.max}
          step={step}
          isInteger={control.type === "integer"}
          disabled={!isEnabled}
          withSlider
        />
      );
    }

    // Number without slider
    if (control.type === "number" || control.type === "integer") {
      return (
        <NumberInput
          value={actualValue}
          onChange={(val) => handleSettingChange(key, val)}
          min={control.min}
          max={control.max}
          step={control.type === "integer" ? 1 : 0.01}
          isInteger={control.type === "integer"}
          disabled={!isEnabled}
        />
      );
    }

    // String array - textarea
    if (control.type === "string_array") {
      const arrayValue = Array.isArray(value) ? value.join("\n") : "";
      return (
        <Textarea
          value={arrayValue}
          onChange={(e) =>
            handleSettingChange(
              key,
              e.target.value.split("\n").filter((s) => s.trim()),
            )
          }
          disabled={!isEnabled}
          className="min-h-[60px] text-xs font-mono disabled:opacity-50"
          placeholder="One value per line..."
        />
      );
    }

    // String / Default
    return (
      <input
        type="text"
        value={actualValue}
        onChange={(e) => handleSettingChange(key, e.target.value)}
        disabled={!isEnabled}
        className="h-7 px-2 text-xs text-gray-900 dark:text-gray-100 bg-textured border border-border rounded disabled:opacity-50 w-full"
      />
    );
  };

  // Every catalogue setting renders for every model (see settings-catalogue.ts) —
  // the model's controls only decorate each row, never decide whether it shows.
  // The `audio` group (tts_voice/audio_format) is rendered by the bespoke TTS
  // section below, and `tools` by the dedicated tool picker, so both are
  // excluded from this generic loop to avoid double-rendering.
  const settingGroups = buildSettingsRows(
    normalizedControls as Record<string, unknown> | null,
    settings as Record<string, unknown>,
  );

  return (
    <div className="relative" style={{ perspective: "1200px" }}>
      {/* Flip container */}
      <div
        className="relative w-full transition-transform duration-500 ease-in-out"
        style={{
          transformStyle: "preserve-3d",
          transform: showJsonEditor ? "rotateY(180deg)" : "rotateY(0deg)",
          minHeight: showJsonEditor ? "420px" : undefined,
        }}
      >
        {/* ── FRONT: settings panel ─────────────────────────── */}
        <div
          style={{
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
          }}
        >
          <div className="space-y-2.5">
            {/* Model Selector */}
            {showModelSelector && (
              <div className="flex items-center gap-2 pb-2 border-b border-border">
                <Label className="text-xs text-muted-foreground flex-shrink-0 w-36">
                  Model
                </Label>
                <Select
                  value={modelId || ""}
                  onValueChange={(value) => {
                    onModelChange?.(value);
                    onSettingsChange({ ...settings, model_id: value });
                  }}
                >
                  <SelectTrigger className="h-7 text-xs flex-1">
                    <SelectValue placeholder="Select a model..." />
                  </SelectTrigger>
                  <SelectContent>
                    {models.map((m: any) => (
                      <SelectItem key={m.id} value={m.id} className="text-xs">
                        {m.common_name || m.name || m.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Unrecognized Settings Warning */}
            {unrecognizedSettings.length > 0 && (
              <div className="flex items-start gap-2 p-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded text-xs">
                <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-500 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="font-semibold text-yellow-800 dark:text-yellow-200 mb-1">
                    Unrecognized Settings Detected
                  </div>
                  <div className="text-yellow-700 dark:text-yellow-300 mb-1">
                    The following settings are not shown in the UI:{" "}
                    {unrecognizedSettings.join(", ")}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleFlipToJson}
                    className="h-6 text-[10px] px-2"
                  >
                    <FileJson className="h-3 w-3 mr-1" />
                    View in JSON Editor
                  </Button>
                </div>
              </div>
            )}

            {/* Supported settings (buildSettingsRows returns only the keys this
                model declares). Audio and `tools` are handled by the dedicated
                sections below, so they're excluded here. Set-but-unsupported
                keys surface via the Unrecognized Settings warning + JSON editor. */}
            {settingGroups
              .filter((group) => group.id !== "audio")
              .map((group) => {
                const rows = group.rows.filter((r) => r.key !== "tools");
                if (rows.length === 0) return null;
                return (
                  <div
                    key={group.id}
                    className={
                      group.label ? "border-t pt-2.5 mt-2.5" : undefined
                    }
                  >
                    {group.label && (
                      <div className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">
                        {group.label}
                      </div>
                    )}
                    {rows.map((r) =>
                      renderControl(
                        r.key as keyof PromptSettings,
                        r.label,
                        (r.control as ControlDefinition | null) ?? null,
                      ),
                    )}
                  </div>
                );
              })}

            {/* TTS Settings — shown only when the model supports them. */}
            {(normalizedControls.tts_voice ||
              normalizedControls.audio_format) && (
              <div className="border-t pt-2.5 mt-2.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  <Volume2 className="w-3.5 h-3.5 text-primary" />
                  Text-to-Speech Settings
                </div>

                {/* tts_voice — single speaker */}
                {normalizedControls.tts_voice &&
                  !isMultiSpeakerActive &&
                  renderControl(
                    "tts_voice" as keyof PromptSettings,
                    "Voice",
                    normalizedControls.tts_voice,
                  )}

                {/* audio_format */}
                {normalizedControls.audio_format &&
                  renderControl(
                    "audio_format" as keyof PromptSettings,
                    "Audio Format",
                    normalizedControls.audio_format,
                  )}

                {/* Multi-speaker (Google only) */}
                {normalizedControls.multi_speaker && (
                  <div className="mt-2 space-y-2">
                    <div
                      className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
                      onClick={() =>
                        handleToggleMultiSpeaker(!isMultiSpeakerActive)
                      }
                    >
                      <Checkbox
                        id="multi-speaker"
                        checked={isMultiSpeakerActive}
                        onCheckedChange={(c) =>
                          handleToggleMultiSpeaker(c as boolean)
                        }
                        className="cursor-pointer"
                      />
                      <Label
                        htmlFor="multi-speaker"
                        className={`flex items-center gap-1.5 text-xs cursor-pointer ${isMultiSpeakerActive ? "text-gray-700 dark:text-gray-300" : "text-gray-400 dark:text-gray-600"}`}
                      >
                        <Users className="w-3 h-3" />
                        Multi-speaker (up to 2)
                      </Label>
                    </div>

                    {isMultiSpeakerActive && (
                      <div className="ml-6 space-y-2">
                        {multiSpeakers.map((sp, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <input
                              type="text"
                              value={sp.name}
                              onChange={(e) =>
                                handleSpeakerChange(i, "name", e.target.value)
                              }
                              placeholder={`Speaker name (e.g. ${i === 0 ? "Alex" : "Sarah"})`}
                              className="h-7 px-2 text-xs bg-textured border border-border rounded flex-1 text-gray-900 dark:text-gray-100"
                            />
                            <Select
                              value={sp.voice}
                              onValueChange={(v) =>
                                handleSpeakerChange(i, "voice", v)
                              }
                            >
                              <SelectTrigger className="h-7 text-xs w-32 flex-shrink-0">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent className="text-xs max-h-52">
                                {(normalizedControls.tts_voice?.enum ?? []).map(
                                  (v) => (
                                    <SelectItem
                                      key={v}
                                      value={v}
                                      className="text-xs py-1"
                                    >
                                      {formatVoiceLabel(v)}
                                    </SelectItem>
                                  ),
                                )}
                              </SelectContent>
                            </Select>
                            {multiSpeakers.length > 1 && (
                              <button
                                onClick={() => handleRemoveSpeaker(i)}
                                className="text-muted-foreground hover:text-destructive transition-colors"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        ))}
                        {multiSpeakers.length < 2 && (
                          <button
                            onClick={handleAddSpeaker}
                            className="flex items-center gap-1 text-xs text-primary hover:underline"
                          >
                            <Plus className="w-3 h-3" /> Add speaker
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Tools Section — shown only when the model supports tools. */}
            {normalizedControls.tools && availableTools.length > 0 && (
              <div className="border-t pt-2.5 mt-2.5">
                <div className="flex items-center gap-3 mb-2">
                  <div
                    className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
                    onClick={() => {
                      const checked = !enabledSettings.has("tools");
                      if (checked) {
                        setEnabledSettings(
                          new Set(enabledSettings).add("tools"),
                        );
                        if (!settings.tools) {
                          onSettingsChange({ ...settings, tools: [] });
                        }
                      } else {
                        const newEnabled = new Set(enabledSettings);
                        newEnabled.delete("tools");
                        setEnabledSettings(newEnabled);
                        const { tools, ...rest } = settings;
                        onSettingsChange(rest as PromptSettings);
                      }
                    }}
                  >
                    <Checkbox
                      id="setting-tools"
                      checked={enabledSettings.has("tools")}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setEnabledSettings(
                            new Set(enabledSettings).add("tools"),
                          );
                          if (!settings.tools) {
                            onSettingsChange({ ...settings, tools: [] });
                          }
                        } else {
                          const newEnabled = new Set(enabledSettings);
                          newEnabled.delete("tools");
                          setEnabledSettings(newEnabled);
                          const { tools, ...rest } = settings;
                          onSettingsChange(rest as PromptSettings);
                        }
                      }}
                      className="cursor-pointer"
                    />
                    <Label
                      htmlFor="setting-tools"
                      className={`text-xs font-semibold flex-shrink-0 w-36 cursor-pointer ${enabledSettings.has("tools") ? "text-gray-700 dark:text-gray-300" : "text-gray-400 dark:text-gray-600"}`}
                    >
                      Tools
                    </Label>
                  </div>
                </div>

                {enabledSettings.has("tools") && (
                  <>
                    {availableTools.filter(
                      (tool) =>
                        !settings.tools?.includes(
                          typeof tool === "string" ? tool : tool.name,
                        ),
                    ).length > 0 && (
                      <div className="flex items-center gap-2 mb-2 ml-10">
                        <Select
                          value=""
                          onValueChange={(toolName) => {
                            const currentTools = settings.tools || [];
                            if (!currentTools.includes(toolName)) {
                              handleSettingChange("tools", [
                                ...currentTools,
                                toolName,
                              ]);
                            }
                          }}
                        >
                          <SelectTrigger className="h-7 text-xs flex-1">
                            <SelectValue placeholder="Add tool..." />
                          </SelectTrigger>
                          <SelectContent className="text-xs">
                            {availableTools
                              .filter(
                                (tool) =>
                                  !settings.tools?.includes(
                                    typeof tool === "string" ? tool : tool.name,
                                  ),
                              )
                              .map((tool) => {
                                const toolName =
                                  typeof tool === "string" ? tool : tool.name;
                                return (
                                  <SelectItem
                                    key={toolName}
                                    value={toolName}
                                    className="text-xs py-1"
                                  >
                                    {toolName}
                                  </SelectItem>
                                );
                              })}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {settings.tools && settings.tools.length > 0 ? (
                      <div className="space-y-1 ml-10">
                        {settings.tools.map((toolName, index) => {
                          const availableToolNames = new Set(
                            availableTools.map((t) =>
                              typeof t === "string" ? t : t.name,
                            ),
                          );
                          const isInvalid =
                            availableTools.length > 0 &&
                            !availableToolNames.has(toolName);
                          return (
                            <Tooltip key={index}>
                              <TooltipTrigger asChild>
                                <div
                                  className={`flex items-center justify-between px-2 py-1 border rounded text-xs ${
                                    isInvalid
                                      ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"
                                      : "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800"
                                  }`}
                                >
                                  <span
                                    className={`font-mono flex items-center gap-1.5 ${isInvalid ? "text-red-700 dark:text-red-300" : "text-green-700 dark:text-green-300"}`}
                                  >
                                    {isInvalid && (
                                      <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                                    )}
                                    {toolName}
                                  </span>
                                  <button
                                    onClick={() => {
                                      const newTools =
                                        settings.tools?.filter(
                                          (_, i) => i !== index,
                                        ) || [];
                                      handleSettingChange("tools", newTools);
                                    }}
                                    className={`transition-colors hover:text-red-500 dark:hover:text-red-400 ${isInvalid ? "text-red-500 dark:text-red-400" : "text-green-600 dark:text-green-400"}`}
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </TooltipTrigger>
                              {isInvalid && (
                                <TooltipContent
                                  side="top"
                                  className="max-w-xs text-xs"
                                >
                                  <p>
                                    Tool{" "}
                                    <span className="font-mono font-semibold">
                                      {toolName}
                                    </span>{" "}
                                    no longer exists or has been removed. Remove
                                    it to avoid errors.
                                  </p>
                                </TooltipContent>
                              )}
                            </Tooltip>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-xs text-gray-500 dark:text-gray-400 italic text-center py-2 ml-10">
                        No tools selected
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* JSON Editor Button */}
            <div className="border-t pt-2.5 mt-2.5">
              <Button
                variant="outline"
                size="sm"
                onClick={handleFlipToJson}
                className="w-full"
              >
                <FileJson className="h-4 w-4 mr-2" />
                Edit as JSON
              </Button>
            </div>
          </div>
        </div>
        {/* ── BACK: inline JSON editor ──────────────────────── */}
        <div
          className="absolute inset-0 flex flex-col gap-2"
          style={{
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
          }}
        >
          {/* Back header */}
          <div className="flex items-center justify-between pb-2 border-b border-border">
            <button
              onClick={handleFlipBack}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              Back to settings
            </button>
            <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
              <FileJson className="w-3.5 h-3.5 text-primary" />
              Raw JSON
            </span>
          </div>

          {/* Textarea */}
          <Textarea
            ref={jsonTextareaRef}
            value={jsonText}
            onChange={(e) => {
              setJsonText(e.target.value);
              setJsonError(null);
            }}
            className="flex-1 font-mono text-xs resize-none min-h-[320px]"
            placeholder='{"temperature": 0.7, "max_output_tokens": 1024}'
            spellCheck={false}
          />

          {/* Parse error */}
          {jsonError && (
            <div className="px-3 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-xs text-red-800 dark:text-red-200">
              <strong>Parse error:</strong> {jsonError}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between gap-2 pt-1 border-t border-border">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleFlipBack}
              className="h-7 text-xs"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleJsonApply}
              className="h-7 text-xs gap-1.5"
            >
              <Save className="w-3 h-3" />
              Apply changes
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
