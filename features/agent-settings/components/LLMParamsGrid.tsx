"use client";

/**
 * LLMParamsGrid
 *
 * Renders all configurable LLM parameters for a given agentId.
 * Matches the quality and pattern of the existing ModelSettings component:
 *   - Checkbox to enable/disable each setting (unchecked = omit from payload)
 *   - Slider + text input for numeric fields
 *   - Select for enum fields
 *   - Switch for boolean fields
 *   - Grouped sections: Core, Image/Video, TTS, Feature Flags
 */

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectEffectiveSettings,
  selectNormalizedControls,
} from "@/lib/redux/slices/agent-settings/selectors";
import { applySettingsFromDialog } from "@/lib/redux/slices/agent-settings/agentSettingsSlice";
import type {
  AgentSettings,
  ControlDefinition,
} from "@/lib/redux/slices/agent-settings/types";
import { buildSettingsRows } from "@/lib/redux/slices/agent-settings/settings-catalogue";

// ── NumberInput ───────────────────────────────────────────────────────────────
// Mirrors the existing ModelSettings NumberInput exactly:
// - Text-based, no browser spinner
// - Commits only on blur; selects all text on focus for quick replacement

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

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const commit = (raw: string) => {
    if (raw === "" || raw === "-") return;
    const parsed = isInteger ? parseInt(raw, 10) : parseFloat(raw);
    if (!isNaN(parsed)) onChange(parsed);
    else setDraft(String(value));
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
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          disabled={disabled}
          className="w-20 h-7 px-2 text-xs"
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
        if (e.key === "Enter") e.currentTarget.blur();
      }}
      disabled={disabled}
      className="h-7 px-2 text-xs w-full"
    />
  );
}

// ── ControlRow ────────────────────────────────────────────────────────────────

interface ControlRowProps {
  fieldKey: keyof AgentSettings;
  label: string;
  /** null when the selected model declares no control for this key. */
  control: ControlDefinition | null;
  value: unknown;
  enabled: boolean;
  onToggle: (key: keyof AgentSettings, enabled: boolean) => void;
  onChange: (key: keyof AgentSettings, value: unknown) => void;
}

function ControlRow({
  fieldKey,
  label,
  control,
  value,
  enabled,
  onToggle,
  onChange,
}: ControlRowProps) {
  const checkboxId = `ags-${String(fieldKey)}`;

  // Unsupported by the selected model: still shown (never hidden), value
  // displayed read-only with a caution so it is never silently changed.
  if (!control) {
    const display =
      value === undefined || value === null
        ? ""
        : typeof value === "object"
          ? JSON.stringify(value)
          : String(value);
    return (
      <div className="flex items-center gap-3 mb-2">
        <div
          className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity shrink-0"
          onClick={() => onToggle(fieldKey, !enabled)}
        >
          <Checkbox
            id={checkboxId}
            checked={enabled}
            onCheckedChange={(checked) => onToggle(fieldKey, checked as boolean)}
            className="cursor-pointer"
          />
          <Label
            htmlFor={checkboxId}
            className={`text-xs w-36 shrink-0 cursor-pointer ${
              enabled
                ? "text-gray-700 dark:text-gray-300"
                : "text-gray-400 dark:text-gray-600"
            }`}
          >
            {label}
          </Label>
        </div>
        <div className="flex-1 min-w-0">
          <Input
            type="text"
            readOnly
            value={display}
            placeholder="Not supported by this model"
            className="h-7 px-2 text-xs w-full opacity-70"
          />
        </div>
        <span
          className="text-amber-500 shrink-0"
          title="Not valid for this model"
        >
          <AlertTriangle className="h-3.5 w-3.5" />
        </span>
      </div>
    );
  }

  const resolvedValue =
    value ??
    control.default ??
    (control.type === "number" || control.type === "integer"
      ? (control.min ?? 0)
      : "");

  const renderInput = () => {
    // Enum / Select
    if (control.type === "enum" && control.enum) {
      return (
        <Select
          value={String(resolvedValue)}
          onValueChange={(v) => onChange(fieldKey, v)}
          disabled={!enabled}
        >
          <SelectTrigger className="h-7 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="text-xs">
            {control.enum.map((opt) => (
              <SelectItem key={opt} value={opt} className="text-xs py-1">
                {opt}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }

    // Boolean / Switch
    if (control.type === "boolean") {
      return (
        <Switch
          checked={Boolean(resolvedValue)}
          onCheckedChange={(checked) => onChange(fieldKey, checked)}
          disabled={!enabled}
        />
      );
    }

    // Number/integer with slider
    if (
      (control.type === "number" || control.type === "integer") &&
      control.min !== undefined &&
      control.max !== undefined
    ) {
      const step = control.type === "integer" ? 1 : 0.01;
      return (
        <NumberInput
          value={
            typeof resolvedValue === "number"
              ? resolvedValue
              : Number(resolvedValue)
          }
          onChange={(v) => onChange(fieldKey, v)}
          onSliderChange={(v) => onChange(fieldKey, v)}
          min={control.min}
          max={control.max}
          step={step}
          isInteger={control.type === "integer"}
          disabled={!enabled}
          withSlider
        />
      );
    }

    // Number/integer without slider (no min/max defined)
    if (control.type === "number" || control.type === "integer") {
      return (
        <NumberInput
          value={
            typeof resolvedValue === "number"
              ? resolvedValue
              : Number(resolvedValue)
          }
          onChange={(v) => onChange(fieldKey, v)}
          min={control.min}
          max={control.max}
          step={control.type === "integer" ? 1 : 0.01}
          isInteger={control.type === "integer"}
          disabled={!enabled}
        />
      );
    }

    // Fallback string input
    return (
      <Input
        type="text"
        value={String(resolvedValue ?? "")}
        onChange={(e) => onChange(fieldKey, e.target.value || undefined)}
        disabled={!enabled}
        className="h-7 px-2 text-xs w-full"
      />
    );
  };

  return (
    <div className="flex items-center gap-3 mb-2">
      {/* Checkbox + label */}
      <div
        className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity shrink-0"
        onClick={() => onToggle(fieldKey, !enabled)}
      >
        <Checkbox
          id={checkboxId}
          checked={enabled}
          onCheckedChange={(checked) => onToggle(fieldKey, checked as boolean)}
          className="cursor-pointer"
        />
        <Label
          htmlFor={checkboxId}
          className={`text-xs w-36 shrink-0 cursor-pointer ${
            enabled
              ? "text-gray-700 dark:text-gray-300"
              : "text-gray-400 dark:text-gray-600"
          }`}
        >
          {label}
        </Label>
      </div>

      {/* Input control */}
      <div
        className={`flex-1 min-w-0 ${!enabled ? "opacity-50 pointer-events-none" : ""}`}
      >
        {renderInput()}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

interface LLMParamsGridProps {
  agentId: string;
}

export function LLMParamsGrid({ agentId }: LLMParamsGridProps) {
  const dispatch = useAppDispatch();
  const effectiveSettings = useAppSelector((state) =>
    selectEffectiveSettings(state, agentId),
  );
  const normalizedControls = useAppSelector((state) =>
    selectNormalizedControls(state, agentId),
  );

  // Track which fields are explicitly enabled (have a value set)
  const [enabled, setEnabled] = useState<Set<string>>(() => {
    const s = new Set<string>();
    Object.entries(effectiveSettings ?? {}).forEach(([k, v]) => {
      if (v !== null && v !== undefined) s.add(k);
    });
    return s;
  });

  // Keep enabled set in sync when effective settings change from outside
  useEffect(() => {
    if (!effectiveSettings) return;
    const s = new Set<string>();
    Object.entries(effectiveSettings).forEach(([k, v]) => {
      if (v !== null && v !== undefined) s.add(k);
    });
    setEnabled(s);
  }, [effectiveSettings]);

  if (!normalizedControls) {
    return (
      <p className="text-xs text-muted-foreground px-2 py-3">
        Select a model to configure its settings.
      </p>
    );
  }

  const controls = normalizedControls as unknown as Record<
    string,
    ControlDefinition | undefined
  >;

  const handleToggle = (key: keyof AgentSettings, on: boolean) => {
    const newEnabled = new Set(enabled);
    if (on) {
      newEnabled.add(key as string);
      // Set to default when enabling
      const control = controls[key as string];
      if (control) {
        let defaultValue: unknown = control.default;
        if (defaultValue === null || defaultValue === undefined) {
          if (control.type === "number" || control.type === "integer")
            defaultValue = control.min ?? 0;
          else if (control.type === "boolean") defaultValue = false;
          else if (control.type === "enum" && control.enum?.length)
            defaultValue = control.enum[0];
          else defaultValue = "";
        }
        const updated = { ...effectiveSettings, [key]: defaultValue };
        dispatch(
          applySettingsFromDialog({
            agentId,
            newSettings: updated as AgentSettings,
          }),
        );
      }
    } else {
      newEnabled.delete(key as string);
      // Remove the key from settings
      const updated = { ...effectiveSettings };
      delete (updated as Record<string, unknown>)[key as string];
      dispatch(
        applySettingsFromDialog({
          agentId,
          newSettings: updated as AgentSettings,
        }),
      );
    }
    setEnabled(newEnabled);
  };

  const handleChange = (key: keyof AgentSettings, value: unknown) => {
    const updated = { ...effectiveSettings, [key]: value };
    dispatch(
      applySettingsFromDialog({
        agentId,
        newSettings: updated as AgentSettings,
      }),
    );
  };

  // Every catalogue setting renders for every model — the model's controls only
  // decorate each row (supported vs. caution), never decide whether it shows.
  // `tools` is excluded because it is a tool LIST managed elsewhere, not a
  // simple toggle.
  const settingGroups = buildSettingsRows(
    normalizedControls as unknown as Record<string, unknown> | null,
    effectiveSettings as Record<string, unknown>,
  );

  return (
    <div className="space-y-0.5">
      {settingGroups.map((group) => {
        const rows = group.rows.filter((r) => r.key !== "tools");
        if (rows.length === 0) return null;
        return (
          <div
            key={group.id}
            className={group.label ? "border-t pt-2.5 mt-2.5" : undefined}
          >
            {group.label && (
              <div className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">
                {group.label}
              </div>
            )}
            {rows.map((r) => (
              <ControlRow
                key={r.key}
                fieldKey={r.key as keyof AgentSettings}
                label={r.label}
                control={(r.control as ControlDefinition | null) ?? null}
                value={(effectiveSettings as Record<string, unknown>)[r.key]}
                enabled={enabled.has(r.key)}
                onToggle={handleToggle}
                onChange={handleChange}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}
