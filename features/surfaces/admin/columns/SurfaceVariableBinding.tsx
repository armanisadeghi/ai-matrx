"use client";

import { useMemo } from "react";
import { Bot, Sparkles, Type, MessageCircleQuestion } from "lucide-react";
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
import { cn } from "@/styles/themes/utils";
import type {
  SurfaceValue,
  ValueMapping,
  ValueMappingMap,
} from "@/features/surfaces/types";
import { formatVariableDisplayName } from "@/features/agents/utils/variable-utils";

/**
 * One row in the binding form. Drives a single agent variable / context
 * slot through the four user-facing source choices:
 *
 *   Agent Default | Surface Value | Direct Value | Prompt User
 *
 * Internally these map to the existing DSL:
 *   Agent Default → { mapType: "unmapped" }
 *   Surface Value → { mapType: "surface_value", target }
 *   Direct Value  → { mapType: "direct_value", target }
 *   Prompt User   → { mapType: "prompt_user", prompt }
 *
 * The detail panel below the buttons reserves a fixed height so flipping
 * between modes never shifts the row above or below it.
 */

export interface BindingTarget {
  /** Variable / context-slot name as stored on the agent. */
  name: string;
  /** Optional pre-formatted label. Falls back to the prettified name. */
  label?: string;
  /** Optional natural-language description (shown on hover via tooltip). */
  description?: string;
  /** Whether the agent has the target marked as required. */
  required?: boolean;
}

type FourWayMode =
  | "agent_default"
  | "surface_value"
  | "direct_value"
  | "prompt_user";

function modeFromMapping(
  mapping: ValueMapping | undefined,
  autoBindCandidate: SurfaceValue | null,
): FourWayMode {
  if (!mapping) {
    // No explicit mapping → if the surface has a matching name, the
    // resolver auto-binds. Show that as Surface Value so the user can
    // see what's about to happen. Otherwise fall back to Agent Default.
    return autoBindCandidate ? "surface_value" : "agent_default";
  }
  if (mapping.mapType === "surface_value") return "surface_value";
  if (mapping.mapType === "direct_value") return "direct_value";
  if (mapping.mapType === "prompt_user") return "prompt_user";
  return "agent_default"; // covers "unmapped"
}

export function SurfaceVariableBinding({
  target,
  mapping,
  availableSurfaceValues,
  disabled = false,
  onChange,
}: {
  target: BindingTarget;
  mapping: ValueMapping | undefined;
  availableSurfaceValues: readonly SurfaceValue[];
  disabled?: boolean;
  onChange: (next: ValueMapping | null) => void;
}) {
  const surfaceValueIndex = useMemo(() => {
    const map = new Map<string, SurfaceValue>();
    for (const sv of availableSurfaceValues) map.set(sv.name, sv);
    return map;
  }, [availableSurfaceValues]);

  const autoBindCandidate = surfaceValueIndex.get(target.name) ?? null;
  const mode = modeFromMapping(mapping, autoBindCandidate);

  const setMode = (next: FourWayMode) => {
    if (next === "agent_default") {
      // Explicit "use the agent default" — write `unmapped` so we always
      // suppress auto-binding. (No mapping at all would auto-bind on
      // name match, which isn't what the user just asked for.)
      onChange({ mapType: "unmapped" });
      return;
    }
    if (next === "surface_value") {
      onChange({
        mapType: "surface_value",
        target:
          mapping?.mapType === "surface_value"
            ? mapping.target
            : (autoBindCandidate?.name ?? ""),
        required:
          mapping?.mapType === "surface_value" ? mapping.required : false,
      });
      return;
    }
    if (next === "direct_value") {
      onChange({
        mapType: "direct_value",
        target: mapping?.mapType === "direct_value" ? mapping.target : "",
      });
      return;
    }
    onChange({
      mapType: "prompt_user",
      prompt: mapping?.mapType === "prompt_user" ? mapping.prompt : "",
      defaultValue:
        mapping?.mapType === "prompt_user" ? mapping.defaultValue : undefined,
      required: mapping?.mapType === "prompt_user" ? mapping.required : false,
    });
  };

  const displayName = target.label ?? formatVariableDisplayName(target.name);

  return (
    <TooltipProvider delayDuration={200}>
      <article
        className={cn(
          "rounded-xl border border-border bg-card shadow-sm overflow-hidden",
          disabled && "opacity-60",
        )}
      >
        {/* Name + required pill */}
        <header className="px-4 pt-3 pb-2 flex items-center gap-2 min-w-0">
          <div className="min-w-0 flex-1">
            {target.description ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <h4 className="text-sm font-semibold text-foreground truncate cursor-help">
                    {displayName}
                  </h4>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  {target.description}
                </TooltipContent>
              </Tooltip>
            ) : (
              <h4 className="text-sm font-semibold text-foreground truncate">
                {displayName}
              </h4>
            )}
          </div>
          {target.required && (
            <span className="shrink-0 inline-flex items-center px-1.5 h-5 rounded text-[10px] font-medium bg-amber-500/10 text-amber-600">
              Required
            </span>
          )}
        </header>

        {/* 4-button source picker */}
        <div className="px-4">
          <ModeButtons mode={mode} onChange={setMode} disabled={disabled} />
        </div>

        {/* Detail panel — fixed height, no UI shift between modes */}
        <div className="px-4 pt-3 pb-4 min-h-[120px]">
          {mode === "agent_default" && (
            <AgentDefaultDetail autoBindCandidate={autoBindCandidate} />
          )}
          {mode === "surface_value" && mapping?.mapType === "surface_value" && (
            <SurfaceValueDetail
              mapping={mapping}
              availableSurfaceValues={availableSurfaceValues}
              disabled={disabled}
              onChange={onChange}
            />
          )}
          {mode === "surface_value" && mapping?.mapType !== "surface_value" && (
            // Auto-bind case — there's no explicit mapping yet, but we've
            // surfaced it as "Surface Value" because of the name match.
            <SurfaceValueDetail
              mapping={{
                mapType: "surface_value",
                target: autoBindCandidate?.name ?? "",
                required: false,
              }}
              availableSurfaceValues={availableSurfaceValues}
              disabled={disabled}
              onChange={onChange}
            />
          )}
          {mode === "direct_value" && mapping?.mapType === "direct_value" && (
            <DirectValueDetail
              mapping={mapping}
              disabled={disabled}
              onChange={onChange}
            />
          )}
          {mode === "prompt_user" && mapping?.mapType === "prompt_user" && (
            <PromptUserDetail
              mapping={mapping}
              disabled={disabled}
              onChange={onChange}
            />
          )}
        </div>
      </article>
    </TooltipProvider>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Mode buttons
// ─────────────────────────────────────────────────────────────────────────────

const MODES: {
  id: FourWayMode;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: "agent_default", label: "Agent Default", icon: Bot },
  { id: "surface_value", label: "Surface Value", icon: Sparkles },
  { id: "direct_value", label: "Direct Value", icon: Type },
  { id: "prompt_user", label: "Prompt User", icon: MessageCircleQuestion },
];

function ModeButtons({
  mode,
  onChange,
  disabled,
}: {
  mode: FourWayMode;
  onChange: (next: FourWayMode) => void;
  disabled: boolean;
}) {
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {MODES.map(({ id, label, icon: Icon }) => {
        const active = mode === id;
        return (
          <button
            key={id}
            type="button"
            disabled={disabled}
            onClick={() => onChange(id)}
            className={cn(
              "flex flex-col items-center justify-center gap-1 rounded-lg px-2 py-2 text-center",
              "border transition-all min-w-0",
              active
                ? "border-primary bg-primary/10 text-foreground shadow-sm"
                : "border-border bg-background text-muted-foreground hover:text-foreground hover:bg-accent/50",
            )}
          >
            <Icon
              className={cn(
                "h-4 w-4 shrink-0",
                active ? "text-primary" : "text-muted-foreground",
              )}
            />
            <span className="text-[11px] font-medium leading-tight truncate w-full">
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Detail panels
// ─────────────────────────────────────────────────────────────────────────────

function AgentDefaultDetail({
  autoBindCandidate,
}: {
  autoBindCandidate: SurfaceValue | null;
}) {
  return (
    <div className="text-xs text-muted-foreground leading-relaxed">
      <p>
        The agent will use its built-in default value for this variable at run
        time.
      </p>
      {autoBindCandidate && (
        <p className="mt-2 text-amber-600 dark:text-amber-400">
          Note: the surface declares a value named{" "}
          <span className="font-medium text-foreground">
            {formatVariableDisplayName(autoBindCandidate.name)}
          </span>
          . Picking <strong>Surface Value</strong> would bind to it
          automatically; <strong>Agent Default</strong> explicitly ignores it.
        </p>
      )}
    </div>
  );
}

function SurfaceValueDetail({
  mapping,
  availableSurfaceValues,
  disabled,
  onChange,
}: {
  mapping: Extract<ValueMapping, { mapType: "surface_value" }>;
  availableSurfaceValues: readonly SurfaceValue[];
  disabled: boolean;
  onChange: (next: ValueMapping) => void;
}) {
  const selected = availableSurfaceValues.find(
    (sv) => sv.name === mapping.target,
  );

  return (
    <div className="space-y-2.5">
      <div className="space-y-1.5">
        <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
          Surface value
        </Label>
        <Select
          value={mapping.target || "__none__"}
          onValueChange={(v) =>
            onChange({ ...mapping, target: v === "__none__" ? "" : v })
          }
          disabled={disabled}
        >
          <SelectTrigger className="h-9 text-sm">
            <SelectValue placeholder="Pick a surface value" />
          </SelectTrigger>
          <SelectContent>
            {availableSurfaceValues.length === 0 && (
              <SelectItem value="__none__" disabled>
                No surface values declared
              </SelectItem>
            )}
            {availableSurfaceValues.map((sv) => (
              <SelectItem key={sv.name} value={sv.name}>
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm font-medium truncate">
                    {sv.label || formatVariableDisplayName(sv.name)}
                  </span>
                  {!sv.alwaysAvailable && (
                    <span className="text-[10px] text-muted-foreground">
                      · sometimes
                    </span>
                  )}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selected?.description && (
          <p className="text-[11px] text-muted-foreground leading-snug">
            {selected.description}
          </p>
        )}
      </div>

      <RequiredToggle
        checked={mapping.required ?? false}
        disabled={disabled}
        onChange={(v) => onChange({ ...mapping, required: v })}
        hint="Abort the run if the surface doesn't supply this value."
      />
    </div>
  );
}

function DirectValueDetail({
  mapping,
  disabled,
  onChange,
}: {
  mapping: Extract<ValueMapping, { mapType: "direct_value" }>;
  disabled: boolean;
  onChange: (next: ValueMapping) => void;
}) {
  const stringValue =
    typeof mapping.target === "string"
      ? mapping.target
      : mapping.target == null
        ? ""
        : String(mapping.target);

  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
        Value
      </Label>
      <Textarea
        value={stringValue}
        onChange={(e) => onChange({ ...mapping, target: e.target.value })}
        rows={3}
        placeholder="Enter the literal value this binding should send."
        disabled={disabled}
        className="text-sm resize-none"
        style={{ fontSize: "14px" }}
      />
    </div>
  );
}

function PromptUserDetail({
  mapping,
  disabled,
  onChange,
}: {
  mapping: Extract<ValueMapping, { mapType: "prompt_user" }>;
  disabled: boolean;
  onChange: (next: ValueMapping) => void;
}) {
  return (
    <div className="space-y-2.5">
      <div className="space-y-1.5">
        <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
          Prompt text
        </Label>
        <Input
          value={mapping.prompt}
          onChange={(e) => onChange({ ...mapping, prompt: e.target.value })}
          placeholder="What should we ask the user?"
          disabled={disabled}
          className="h-9 text-sm"
          style={{ fontSize: "14px" }}
        />
      </div>
      <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
        <div className="space-y-1.5 min-w-0">
          <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Default (optional)
          </Label>
          <Input
            value={String(mapping.defaultValue ?? "")}
            onChange={(e) =>
              onChange({
                ...mapping,
                defaultValue: e.target.value || undefined,
              })
            }
            placeholder="Pre-filled value"
            disabled={disabled}
            className="h-9 text-sm"
            style={{ fontSize: "14px" }}
          />
        </div>
        <RequiredToggle
          checked={mapping.required ?? false}
          disabled={disabled}
          onChange={(v) => onChange({ ...mapping, required: v })}
          hint="User cannot dismiss the prompt without entering a value."
          compact
        />
      </div>
    </div>
  );
}

function RequiredToggle({
  checked,
  disabled,
  onChange,
  hint,
  compact,
}: {
  checked: boolean;
  disabled: boolean;
  onChange: (next: boolean) => void;
  hint: string;
  compact?: boolean;
}) {
  return (
    <label
      className={cn(
        "flex items-center gap-2 text-xs text-muted-foreground cursor-pointer",
        compact && "shrink-0 h-9",
      )}
      title={hint}
    >
      <Switch
        checked={checked}
        onCheckedChange={(v) => onChange(v === true)}
        disabled={disabled}
      />
      <span>Required</span>
    </label>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// List wrapper
// ─────────────────────────────────────────────────────────────────────────────

export function SurfaceVariableBindingList({
  targets,
  value,
  availableSurfaceValues,
  disabled,
  onChange,
}: {
  targets: readonly BindingTarget[];
  value: ValueMappingMap;
  availableSurfaceValues: readonly SurfaceValue[];
  disabled?: boolean;
  onChange: (next: ValueMappingMap) => void;
}) {
  const update = (name: string, mapping: ValueMapping | null) => {
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
      <div className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
        This agent declares no variables or context slots.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {targets.map((target) => (
        <SurfaceVariableBinding
          key={target.name}
          target={target}
          mapping={value[target.name]}
          availableSurfaceValues={availableSurfaceValues}
          disabled={disabled}
          onChange={(next) => update(target.name, next)}
        />
      ))}
    </div>
  );
}
