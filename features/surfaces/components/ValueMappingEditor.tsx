"use client";

import React, { useMemo, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Info,
  Sparkles,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type {
  SurfaceValue,
  ValueMapping,
  ValueMappingMap,
} from "@/features/surfaces/types";

/**
 * A target the editor can bind. Used for both agent variables/context slots
 * and tool args. The editor doesn't care which — it just renders rows.
 */
export interface MappingTarget {
  /** Unique identifier for this target row (variable name, slot name, arg name). */
  name: string;
  /** Optional human-readable label. */
  label?: string;
  /** Logical type of the target. Used to type-check `direct_value` literals. */
  type: SurfaceValue["valueType"];
  /** Optional natural-language description for the editor row. */
  description?: string;
  /** Whether the target itself is required by the agent/tool definition. */
  required?: boolean;
}

interface Props {
  /** The targets that need mapping. */
  targets: readonly MappingTarget[];
  /** The current mapping map. */
  value: ValueMappingMap;
  /** Callback when the mapping map changes. */
  onChange: (next: ValueMappingMap) => void;
  /** Surface values available for `surface_value` selection. */
  availableSurfaceValues: readonly SurfaceValue[];
  /** If true, hide the `prompt_user` map type (tool flows don't support it). */
  hidePromptUser?: boolean;
  /** Compact mode (denser rows). */
  compact?: boolean;
  /** Disable all inputs. */
  disabled?: boolean;
}

const MAP_TYPE_LABELS: Record<ValueMapping["mapType"], string> = {
  surface_value: "Surface value",
  direct_value: "Direct value",
  prompt_user: "Prompt user",
  unmapped: "Unmapped",
};

const MAP_TYPE_DESCRIPTIONS: Record<ValueMapping["mapType"], string> = {
  surface_value: "Bind to a runtime value declared by the surface.",
  direct_value: "Set a fixed literal value for this binding.",
  prompt_user: "Show a dialog asking the user for the value at launch time.",
  unmapped:
    "Suppress auto-binding. Use when the surface declares a matching name you intentionally want to ignore.",
};

function defaultMappingFor(type: ValueMapping["mapType"]): ValueMapping {
  switch (type) {
    case "surface_value":
      return { mapType: "surface_value", target: "", required: false };
    case "direct_value":
      return { mapType: "direct_value", target: "" };
    case "prompt_user":
      return { mapType: "prompt_user", prompt: "", required: false };
    case "unmapped":
      return { mapType: "unmapped" };
  }
}

function parseLiteral(
  raw: string,
  type: SurfaceValue["valueType"],
): { ok: true; value: unknown } | { ok: false; error: string } {
  if (type === "string") return { ok: true, value: raw };
  if (type === "number") {
    if (raw.trim() === "") return { ok: true, value: 0 };
    const n = Number(raw);
    if (Number.isNaN(n)) return { ok: false, error: "Not a number." };
    return { ok: true, value: n };
  }
  if (type === "boolean") {
    const v = raw.trim().toLowerCase();
    if (v === "true") return { ok: true, value: true };
    if (v === "false") return { ok: true, value: false };
    return { ok: false, error: "Use 'true' or 'false'." };
  }
  // object / array
  if (raw.trim() === "") return { ok: true, value: type === "array" ? [] : {} };
  try {
    const parsed = JSON.parse(raw);
    if (type === "array" && !Array.isArray(parsed)) {
      return { ok: false, error: "Expected a JSON array." };
    }
    if (
      type === "object" &&
      (Array.isArray(parsed) || typeof parsed !== "object")
    ) {
      return { ok: false, error: "Expected a JSON object." };
    }
    return { ok: true, value: parsed };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Invalid JSON.",
    };
  }
}

function stringifyLiteral(
  value: unknown,
  type: SurfaceValue["valueType"],
): string {
  if (value === null || value === undefined) return "";
  if (type === "string") return String(value);
  if (type === "number" || type === "boolean") return String(value);
  return JSON.stringify(value, null, 2);
}

export function ValueMappingEditor({
  targets,
  value,
  onChange,
  availableSurfaceValues,
  hidePromptUser = false,
  compact = false,
  disabled = false,
}: Props) {
  const surfaceValueIndex = useMemo(() => {
    const map = new Map<string, SurfaceValue>();
    for (const sv of availableSurfaceValues) map.set(sv.name, sv);
    return map;
  }, [availableSurfaceValues]);

  const updateMapping = (name: string, mapping: ValueMapping | null) => {
    if (mapping === null) {
      if (!(name in value)) return;
      const next = { ...value };
      delete next[name];
      onChange(next);
    } else {
      onChange({ ...value, [name]: mapping });
    }
  };

  if (targets.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
        No variables, context slots, or args to map.
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className={`space-y-1.5 ${compact ? "text-[11px]" : "text-xs"}`}>
        {targets.map((target) => {
          const mapping = value[target.name];
          return (
            <MappingRow
              key={target.name}
              target={target}
              mapping={mapping}
              availableSurfaceValues={availableSurfaceValues}
              surfaceValueIndex={surfaceValueIndex}
              hidePromptUser={hidePromptUser}
              compact={compact}
              disabled={disabled}
              onChange={(next) => updateMapping(target.name, next)}
            />
          );
        })}
      </div>
    </TooltipProvider>
  );
}

interface RowProps {
  target: MappingTarget;
  mapping: ValueMapping | undefined;
  availableSurfaceValues: readonly SurfaceValue[];
  surfaceValueIndex: Map<string, SurfaceValue>;
  hidePromptUser: boolean;
  compact: boolean;
  disabled: boolean;
  onChange: (next: ValueMapping | null) => void;
}

function MappingRow({
  target,
  mapping,
  availableSurfaceValues,
  surfaceValueIndex,
  hidePromptUser,
  compact,
  disabled,
  onChange,
}: RowProps) {
  const [expanded, setExpanded] = useState(false);

  const mapType: ValueMapping["mapType"] | "auto" = mapping?.mapType ?? "auto";

  // Auto-bind heuristic: if a SurfaceValue with this exact name exists, the
  // resolver will bind it automatically when no explicit mapping is set.
  const autoBindCandidate =
    !mapping && surfaceValueIndex.has(target.name)
      ? surfaceValueIndex.get(target.name)!
      : null;

  const onMapTypeChange = (next: string) => {
    if (next === "auto") {
      onChange(null);
      setExpanded(false);
      return;
    }
    if (next === "unmapped") {
      onChange({ mapType: "unmapped" });
      setExpanded(false);
      return;
    }
    onChange(defaultMappingFor(next as ValueMapping["mapType"]));
    setExpanded(true);
  };

  const showDetail =
    expanded ||
    mapping?.mapType === "surface_value" ||
    mapping?.mapType === "direct_value" ||
    mapping?.mapType === "prompt_user";

  return (
    <div className="rounded-md border border-border bg-card">
      <div
        className={`flex items-center gap-2 ${compact ? "px-2 py-1" : "px-2 py-1.5"}`}
      >
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-muted-foreground hover:text-foreground shrink-0"
          aria-label={expanded ? "Collapse" : "Expand"}
        >
          {showDetail ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-foreground truncate">
              {target.name}
            </span>
            <Badge variant="outline" className="text-[10px] font-mono">
              {target.type}
            </Badge>
            {target.required && (
              <Badge
                variant="outline"
                className="text-[10px] bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800"
              >
                required
              </Badge>
            )}
            {target.description && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3 w-3 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  {target.description}
                </TooltipContent>
              </Tooltip>
            )}
          </div>
          {autoBindCandidate && (
            <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
              <Sparkles className="h-2.5 w-2.5" />
              Auto-binds to surface value{" "}
              <code className="font-mono">{autoBindCandidate.name}</code>
            </p>
          )}
        </div>

        <Select
          value={mapType}
          onValueChange={onMapTypeChange}
          disabled={disabled}
        >
          <SelectTrigger className="h-6 w-[140px] text-[11px] shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">
              <span className="text-muted-foreground">Auto (default)</span>
            </SelectItem>
            <SelectItem value="surface_value">
              {MAP_TYPE_LABELS.surface_value}
            </SelectItem>
            <SelectItem value="direct_value">
              {MAP_TYPE_LABELS.direct_value}
            </SelectItem>
            {!hidePromptUser && (
              <SelectItem value="prompt_user">
                {MAP_TYPE_LABELS.prompt_user}
              </SelectItem>
            )}
            <SelectItem value="unmapped">{MAP_TYPE_LABELS.unmapped}</SelectItem>
          </SelectContent>
        </Select>

        {mapping && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive shrink-0"
                onClick={() => onChange(null)}
                disabled={disabled}
                aria-label="Clear mapping"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Reset to auto</TooltipContent>
          </Tooltip>
        )}
      </div>

      {showDetail && mapping && (
        <div className="border-t border-border px-2 py-1.5 space-y-1.5 bg-muted/30">
          <p className="text-[10px] text-muted-foreground">
            {MAP_TYPE_DESCRIPTIONS[mapping.mapType]}
          </p>
          {mapping.mapType === "surface_value" && (
            <SurfaceValueInput
              mapping={mapping}
              availableSurfaceValues={availableSurfaceValues}
              targetType={target.type}
              disabled={disabled}
              onChange={onChange}
            />
          )}
          {mapping.mapType === "direct_value" && (
            <DirectValueInput
              mapping={mapping}
              targetType={target.type}
              disabled={disabled}
              onChange={onChange}
            />
          )}
          {mapping.mapType === "prompt_user" && !hidePromptUser && (
            <PromptUserInput
              mapping={mapping}
              disabled={disabled}
              onChange={onChange}
            />
          )}
          {mapping.mapType === "unmapped" && (
            <p className="text-[10px] text-muted-foreground">
              This binding will not receive a value at runtime.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function SurfaceValueInput({
  mapping,
  availableSurfaceValues,
  targetType,
  disabled,
  onChange,
}: {
  mapping: Extract<ValueMapping, { mapType: "surface_value" }>;
  availableSurfaceValues: readonly SurfaceValue[];
  targetType: SurfaceValue["valueType"];
  disabled: boolean;
  onChange: (next: ValueMapping) => void;
}) {
  const typeMatches = (sv: SurfaceValue) =>
    sv.valueType === targetType ||
    targetType === "string" || // strings accept anything
    sv.valueType === "string"; // SurfaceValues default to string-coercible

  const compatible = availableSurfaceValues.filter(typeMatches);
  const incompatible = availableSurfaceValues.filter((sv) => !typeMatches(sv));

  const selected = availableSurfaceValues.find(
    (sv) => sv.name === mapping.target,
  );
  const typeMismatch = selected && !typeMatches(selected);

  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-[1fr_auto] gap-1.5 items-center">
        <Select
          value={mapping.target}
          onValueChange={(v) => onChange({ ...mapping, target: v })}
          disabled={disabled}
        >
          <SelectTrigger className="h-7 text-[11px]">
            <SelectValue placeholder="Pick a surface value…" />
          </SelectTrigger>
          <SelectContent>
            {compatible.length === 0 && incompatible.length === 0 && (
              <SelectItem value="__none__" disabled>
                No surface values declared
              </SelectItem>
            )}
            {compatible.map((sv) => (
              <SelectItem key={sv.name} value={sv.name}>
                <SurfaceValueItem sv={sv} />
              </SelectItem>
            ))}
            {incompatible.length > 0 && (
              <>
                <div className="text-[10px] text-muted-foreground px-2 py-1 border-t border-border mt-1">
                  Type mismatch (use with caution)
                </div>
                {incompatible.map((sv) => (
                  <SelectItem key={sv.name} value={sv.name}>
                    <SurfaceValueItem sv={sv} dim />
                  </SelectItem>
                ))}
              </>
            )}
          </SelectContent>
        </Select>
        <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground shrink-0">
          <Switch
            checked={mapping.required ?? false}
            onCheckedChange={(v) =>
              onChange({ ...mapping, required: v === true })
            }
            disabled={disabled}
          />
          required
        </label>
      </div>
      {selected && (
        <p className="text-[10px] text-muted-foreground">
          {selected.label && (
            <span>
              <strong>{selected.label}</strong>
              {" — "}
            </span>
          )}
          {selected.description}
          {selected.alwaysAvailable === false && (
            <span className="ml-1 text-amber-700 dark:text-amber-300">
              (not always available)
            </span>
          )}
        </p>
      )}
      {typeMismatch && selected && (
        <p className="text-[10px] text-amber-700 dark:text-amber-300 flex items-center gap-1">
          <AlertTriangle className="h-2.5 w-2.5" />
          Type mismatch: {selected.valueType} → {targetType}
        </p>
      )}
    </div>
  );
}

function SurfaceValueItem({
  sv,
  dim = false,
}: {
  sv: SurfaceValue;
  dim?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-1.5 min-w-0 ${dim ? "opacity-60" : ""}`}
    >
      <span className="font-mono text-[11px]">{sv.name}</span>
      <Badge variant="outline" className="text-[10px] font-mono">
        {sv.valueType}
      </Badge>
      {!sv.alwaysAvailable && (
        <Badge variant="outline" className="text-[10px]">
          optional
        </Badge>
      )}
    </div>
  );
}

function DirectValueInput({
  mapping,
  targetType,
  disabled,
  onChange,
}: {
  mapping: Extract<ValueMapping, { mapType: "direct_value" }>;
  targetType: SurfaceValue["valueType"];
  disabled: boolean;
  onChange: (next: ValueMapping) => void;
}) {
  const [raw, setRaw] = useState(() =>
    stringifyLiteral(mapping.target, targetType),
  );
  const [parseError, setParseError] = useState<string | null>(null);

  const onRawChange = (next: string) => {
    setRaw(next);
    const parsed = parseLiteral(next, targetType);
    if (parsed.ok === false) {
      setParseError(parsed.error);
    } else {
      setParseError(null);
      onChange({ ...mapping, target: parsed.value });
    }
  };

  const isJson = targetType === "object" || targetType === "array";

  return (
    <div className="space-y-1">
      {targetType === "boolean" ? (
        <Select
          value={String(mapping.target ?? "false")}
          onValueChange={(v) => onChange({ ...mapping, target: v === "true" })}
          disabled={disabled}
        >
          <SelectTrigger className="h-7 text-[11px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="true">true</SelectItem>
            <SelectItem value="false">false</SelectItem>
          </SelectContent>
        </Select>
      ) : isJson ? (
        <Textarea
          value={raw}
          onChange={(e) => onRawChange(e.target.value)}
          rows={3}
          placeholder={targetType === "array" ? "[]" : "{}"}
          className="font-mono text-[11px]"
          style={{ fontSize: "13px" }}
          disabled={disabled}
        />
      ) : (
        <Input
          value={raw}
          onChange={(e) => onRawChange(e.target.value)}
          placeholder={targetType === "number" ? "0" : "Direct value…"}
          className="h-7 text-[11px]"
          style={{ fontSize: "13px" }}
          disabled={disabled}
        />
      )}
      {parseError && (
        <p className="text-[10px] text-destructive flex items-center gap-1">
          <AlertTriangle className="h-2.5 w-2.5" />
          {parseError}
        </p>
      )}
      <p className="text-[10px] text-muted-foreground">
        Preview:{" "}
        <code className="font-mono">{JSON.stringify(mapping.target)}</code>
      </p>
    </div>
  );
}

function PromptUserInput({
  mapping,
  disabled,
  onChange,
}: {
  mapping: Extract<ValueMapping, { mapType: "prompt_user" }>;
  disabled: boolean;
  onChange: (next: ValueMapping) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="space-y-1">
        <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Prompt text
        </Label>
        <Input
          value={mapping.prompt}
          onChange={(e) => onChange({ ...mapping, prompt: e.target.value })}
          placeholder="What do you want to ask the user?"
          className="h-7 text-[11px]"
          style={{ fontSize: "13px" }}
          disabled={disabled}
        />
      </div>
      <div className="grid grid-cols-[1fr_auto] gap-1.5 items-end">
        <div className="space-y-1 min-w-0">
          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Default value (optional)
          </Label>
          <Input
            value={String(mapping.defaultValue ?? "")}
            onChange={(e) =>
              onChange({
                ...mapping,
                defaultValue: e.target.value || undefined,
              })
            }
            placeholder="Pre-filled input value"
            className="h-7 text-[11px]"
            style={{ fontSize: "13px" }}
            disabled={disabled}
          />
        </div>
        <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground shrink-0">
          <Switch
            checked={mapping.required ?? false}
            onCheckedChange={(v) =>
              onChange({ ...mapping, required: v === true })
            }
            disabled={disabled}
          />
          required
        </label>
      </div>
    </div>
  );
}
