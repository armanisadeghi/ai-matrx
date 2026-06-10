"use client";

/**
 * SettingControlInput — pure, controlled renderer for a single model setting,
 * driven entirely by the model's ControlDefinition. The shared per-control
 * input primitive for every settings surface (per-run overrides today;
 * AgentSettingsCore's internal renderer is the planned next consumer).
 *
 * Covers every ControlType: enum (Select, with an out-of-enum warning),
 * boolean (Checkbox), number/integer (NumberInput, slider when min+max are
 * declared), string_array (one-per-line textarea), array / object_array /
 * object-shaped values (JSON textarea with draft + parse error — commits only
 * valid JSON), string fallback.
 *
 * response_format is special-cased the same way AgentSettingsCore stores it:
 * displayed flattened (`{ type: "json_object" }` → "json_object"), emitted as
 * the canonical `{ type: <value> }` object so stored shapes stay stable for
 * genuine-delta (JSON.stringify) comparison.
 *
 * Stateless beyond local input drafts — parents own the value and decide what
 * a change means (agent edit, per-run override, …).
 */

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { ControlDefinition } from "@/lib/redux/slices/agent-settings/types";
import { NumberInput } from "./NumberInput";

export interface SettingControlInputProps {
  /** Setting key (snake_case) — used for ids and response_format handling. */
  settingKey: string;
  control: ControlDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
  id?: string;
}

/** Flatten `{ type: "x" }` → "x" for enum display (response_format shape). */
function flattenTypeObject(value: unknown): unknown {
  if (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "type" in (value as Record<string, unknown>) &&
    Object.keys(value as Record<string, unknown>).length === 1
  ) {
    return (value as Record<string, unknown>).type;
  }
  return value;
}

export function SettingControlInput({
  settingKey,
  control,
  value,
  onChange,
  disabled = false,
  id,
}: SettingControlInputProps) {
  const inputId = id ?? `setting-control-${settingKey}`;

  // ── enum ──────────────────────────────────────────────────────────────────
  if (control.type === "enum" && control.enum?.length) {
    const flattened =
      settingKey === "response_format" ? flattenTypeObject(value) : value;
    const stringValue =
      flattened === undefined || flattened === null ? "" : String(flattened);
    const isValueMismatch =
      stringValue !== "" && !control.enum.includes(stringValue);

    const emit = (v: string) =>
      onChange(settingKey === "response_format" ? { type: v } : v);

    return (
      <div className="flex flex-1 items-center gap-1.5">
        <Select
          value={isValueMismatch ? "" : stringValue}
          onValueChange={emit}
          disabled={disabled}
        >
          <SelectTrigger className="h-7 flex-1 text-xs">
            <SelectValue
              placeholder={isValueMismatch ? stringValue : "Select..."}
            />
          </SelectTrigger>
          <SelectContent className="text-xs">
            {control.enum.map((option) => (
              <SelectItem key={option} value={option} className="py-1 text-xs">
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {isValueMismatch && (
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="shrink-0 cursor-help text-amber-500">
                  <AlertTriangle className="h-3.5 w-3.5" />
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[220px] text-xs">
                &quot;{stringValue}&quot; is not a recognized option for this
                model
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
    );
  }

  // ── boolean ───────────────────────────────────────────────────────────────
  if (control.type === "boolean") {
    return (
      <div className="flex items-center gap-2">
        <Checkbox
          id={inputId}
          checked={value === true}
          onCheckedChange={(c) => onChange(c === true)}
          disabled={disabled}
          className="cursor-pointer"
        />
        <Label
          htmlFor={inputId}
          className="cursor-pointer text-xs text-muted-foreground"
        >
          {value === true ? "On" : "Off"}
        </Label>
      </div>
    );
  }

  // ── number / integer ──────────────────────────────────────────────────────
  if (control.type === "number" || control.type === "integer") {
    const numeric =
      typeof value === "number" ? value : (control.min ?? 0);
    const hasRange = control.min !== undefined && control.max !== undefined;
    return (
      <NumberInput
        value={numeric}
        onChange={onChange}
        onSliderChange={hasRange ? onChange : undefined}
        min={control.min}
        max={control.max}
        step={control.type === "integer" ? 1 : 0.01}
        isInteger={control.type === "integer"}
        disabled={disabled}
        withSlider={hasRange}
      />
    );
  }

  // ── string_array ──────────────────────────────────────────────────────────
  if (control.type === "string_array") {
    const arrayValue = Array.isArray(value)
      ? (value as string[]).join("\n")
      : "";
    return (
      <Textarea
        id={inputId}
        value={arrayValue}
        onChange={(e) =>
          onChange(e.target.value.split("\n").filter((s) => s.trim()))
        }
        disabled={disabled}
        className="min-h-[60px] font-mono text-xs disabled:opacity-50"
        placeholder="One value per line..."
        style={{ fontSize: "16px" }}
      />
    );
  }

  // ── array / object_array / object-shaped values → JSON editor ────────────
  if (
    control.type === "array" ||
    control.type === "object_array" ||
    (typeof value === "object" && value !== null)
  ) {
    return (
      <JsonValueInput
        id={inputId}
        value={value}
        onChange={onChange}
        disabled={disabled}
      />
    );
  }

  // ── string / fallback ─────────────────────────────────────────────────────
  return (
    <Input
      id={inputId}
      type="text"
      value={value === undefined || value === null ? "" : String(value)}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="h-7 w-full px-2 text-xs"
      style={{ fontSize: "16px" }}
    />
  );
}

/** Draft-buffered JSON textarea: commits only valid JSON, shows parse errors. */
function JsonValueInput({
  id,
  value,
  onChange,
  disabled,
}: {
  id: string;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
}) {
  const toText = (v: unknown) =>
    v === undefined || v === null ? "" : JSON.stringify(v, null, 2);
  const [draft, setDraft] = useState<string>(() => toText(value));
  const [jsonError, setJsonError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(toText(value));
    setJsonError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(value)]);

  return (
    <div className="flex flex-col gap-1">
      <Textarea
        id={id}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          try {
            JSON.parse(e.target.value);
            setJsonError(null);
          } catch (err) {
            setJsonError(err instanceof Error ? err.message : "Invalid JSON");
          }
        }}
        onBlur={(e) => {
          if (e.target.value.trim() === "") return;
          try {
            onChange(JSON.parse(e.target.value));
            setJsonError(null);
          } catch {
            // Keep draft; user can fix or revert.
          }
        }}
        disabled={disabled}
        className="min-h-[48px] font-mono text-xs"
        spellCheck={false}
        style={{ fontSize: "16px" }}
      />
      {jsonError && (
        <p className="text-[10px] text-amber-600 dark:text-amber-400">
          {jsonError}
        </p>
      )}
    </div>
  );
}
