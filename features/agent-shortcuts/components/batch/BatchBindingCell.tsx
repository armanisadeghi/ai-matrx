"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Loader2,
  MessageCircleQuestion,
  Rocket,
  SlidersHorizontal,
  Type,
  Zap,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@ai-matrx/design-system";
import { Input } from "@ai-matrx/design-system";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { loadSurfaceValues } from "@/features/surfaces/redux/thunks";
import {
  makeSelectSurfaceValues,
  makeSelectSurfaceValuesStatus,
} from "@/features/surfaces/redux/selectors";
import { BASELINE_VALUES } from "@/features/surfaces/manifests/_baseline.manifest";
import {
  SurfaceVariableBinding,
  type BindingTarget,
  type SourceLabels,
} from "@/features/surfaces/admin/columns/SurfaceVariableBinding";
import { formatVariableDisplayName } from "@/features/agents/utils/variable-utils";
import type { SurfaceValue, ValueMapping } from "@/features/surfaces/types";

// ─────────────────────────────────────────────────────────────────────────────
// Four-way mode plumbing (mirrors SurfaceVariableBinding so inline + advanced
// stay in lock-step).
// ─────────────────────────────────────────────────────────────────────────────

type FourWayMode =
  "agent_default" | "surface_value" | "direct_value" | "prompt_user";

const MODE_META: Record<
  FourWayMode,
  {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    tone: string;
  }
> = {
  agent_default: {
    label: "Agent default",
    icon: Rocket,
    tone: "text-muted-foreground",
  },
  surface_value: {
    label: "Surface value",
    icon: Zap,
    tone: "text-emerald-600 dark:text-emerald-400",
  },
  direct_value: {
    label: "Direct value",
    icon: Type,
    tone: "text-sky-600 dark:text-sky-400",
  },
  prompt_user: {
    label: "Prompt user",
    icon: MessageCircleQuestion,
    tone: "text-violet-600 dark:text-violet-400",
  },
};

const MODE_ORDER: FourWayMode[] = [
  "agent_default",
  "surface_value",
  "direct_value",
  "prompt_user",
];

function modeOf(mapping: ValueMapping | undefined): FourWayMode {
  if (!mapping) return "agent_default";
  if (mapping.mapType === "surface_value") return "surface_value";
  if (mapping.mapType === "direct_value") return "direct_value";
  if (mapping.mapType === "prompt_user") return "prompt_user";
  return "agent_default";
}

/** Build the mapping when switching to a new mode, preserving compatible bits. */
function mappingForMode(
  next: FourWayMode,
  current: ValueMapping | undefined,
  autoCandidate: SurfaceValue | null,
): ValueMapping {
  switch (next) {
    case "agent_default":
      return { mapType: "unmapped" };
    case "surface_value":
      return {
        mapType: "surface_value",
        target:
          current?.mapType === "surface_value"
            ? current.target
            : (autoCandidate?.name ?? ""),
        required:
          current?.mapType === "surface_value" ? current.required : false,
      };
    case "direct_value":
      return {
        mapType: "direct_value",
        target: current?.mapType === "direct_value" ? current.target : "",
      };
    case "prompt_user":
      return {
        mapType: "prompt_user",
        prompt: current?.mapType === "prompt_user" ? current.prompt : "",
        defaultValue:
          current?.mapType === "prompt_user" ? current.defaultValue : undefined,
        required: current?.mapType === "prompt_user" ? current.required : false,
      };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// InlineBindingEditor — compact, single-row editor used in the grid cell and in
// the field picker's "set all" slot. Pure: it loads nothing; the caller hands
// it the available surface values.
// ─────────────────────────────────────────────────────────────────────────────

export function InlineBindingEditor({
  target,
  mapping,
  availableSurfaceValues,
  surfaceName,
  onChange,
  disabled,
  sourceLabels,
  valueFieldLabel,
  showSourceLabel = false,
  valuePlaceholder,
  advancedContent,
}: {
  target: BindingTarget;
  mapping: ValueMapping | undefined;
  availableSurfaceValues: readonly SurfaceValue[];
  /** Shown as the heading inside the advanced popover (the place, in words). */
  surfaceName?: string;
  onChange: (next: ValueMapping | null) => void;
  disabled?: boolean;
  /**
   * THIS CALL SITE'S WORDS for the four sources. The mechanic is closed and
   * fixed; the nouns belong to the domain — a job binding consumes an OFFERED
   * value, never a "surface value". Travels into the advanced popover too, so
   * the inline control and the full card can never call one thing two names.
   */
  sourceLabels?: SourceLabels;
  /** Label over the picker inside the advanced card. */
  valueFieldLabel?: string;
  /**
   * P3 — name the source IN WORDS on the trigger instead of an icon alone.
   * The shortcut grid packs fifteen columns into a viewport and keeps the icon;
   * a mandate screen never asks a reader to decode a glyph.
   */
  showSourceLabel?: boolean;
  /** Placeholder for the value picker ("Pick value…" by default). */
  valuePlaceholder?: string;
  /**
   * What Advanced opens. Omit for the shared binding card, which is the whole
   * of a shortcut's mapping. A call site whose domain has MORE on the card —
   * the one binding UI's many-to-one strip, absence answer and per-row
   * problems — passes its own full card so Advanced is never a reduced copy of
   * the screen it belongs to.
   */
  advancedContent?: React.ReactNode;
}) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [typeOpen, setTypeOpen] = useState(false);

  const autoCandidate =
    availableSurfaceValues.find((sv) => sv.name === target.name) ?? null;
  const mode = modeOf(mapping);
  const Meta = MODE_META[mode];
  const labelFor = (m: FourWayMode): string =>
    sourceLabels?.[m] ?? MODE_META[m].label;

  const setMode = (next: FourWayMode) => {
    onChange(mappingForMode(next, mapping, autoCandidate));
    setTypeOpen(false);
  };

  return (
    <div className="flex items-center gap-1 min-w-0">
      {/* Type switcher (icon) */}
      <Popover open={typeOpen} onOpenChange={setTypeOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            title={labelFor(mode)}
            aria-label={`Source: ${labelFor(mode)}`}
            className={cn(
              "shrink-0 flex h-7 items-center justify-center rounded border border-border bg-background hover:bg-accent/60 transition-colors",
              showSourceLabel ? "gap-1 px-1.5" : "w-7",
              disabled && "opacity-50",
            )}
          >
            <Meta.icon className={cn("h-3.5 w-3.5", Meta.tone)} />
            {showSourceLabel ? (
              <span className="text-[11px] text-foreground">
                {labelFor(mode)}
              </span>
            ) : null}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-48 p-1">
          {MODE_ORDER.map((m) => {
            const M = MODE_META[m];
            const active = m === mode;
            return (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={cn(
                  "w-full flex items-center gap-2 rounded px-2 py-1.5 text-xs text-left transition-colors",
                  active
                    ? "bg-primary/10 text-foreground"
                    : "hover:bg-accent/60 text-muted-foreground",
                )}
              >
                <M.icon className={cn("h-3.5 w-3.5 shrink-0", M.tone)} />
                <span className="truncate">{labelFor(m)}</span>
              </button>
            );
          })}
        </PopoverContent>
      </Popover>

      {/* Inline control for the most common case */}
      <div className="flex-1 min-w-0">
        {mode === "agent_default" && (
          <span className="text-[11px] text-muted-foreground italic px-1">
            {labelFor("agent_default")}
          </span>
        )}

        {mode === "surface_value" && (
          <SurfaceValueInline
            mapping={
              mapping?.mapType === "surface_value"
                ? mapping
                : { mapType: "surface_value", target: "", required: false }
            }
            availableSurfaceValues={availableSurfaceValues}
            disabled={disabled}
            placeholder={valuePlaceholder}
            onChange={onChange}
          />
        )}

        {mode === "direct_value" && (
          <Input
            value={
              mapping?.mapType === "direct_value"
                ? typeof mapping.target === "string"
                  ? mapping.target
                  : JSON.stringify(mapping.target)
                : ""
            }
            onChange={(e) =>
              onChange({ mapType: "direct_value", target: e.target.value })
            }
            placeholder="Literal value"
            disabled={disabled}
            className="h-7 text-xs"
            style={{ fontSize: "13px" }}
          />
        )}

        {mode === "prompt_user" && (
          <Input
            value={mapping?.mapType === "prompt_user" ? mapping.prompt : ""}
            onChange={(e) =>
              onChange({
                mapType: "prompt_user",
                prompt: e.target.value,
                defaultValue:
                  mapping?.mapType === "prompt_user"
                    ? mapping.defaultValue
                    : undefined,
                required:
                  mapping?.mapType === "prompt_user" ? mapping.required : false,
              })
            }
            placeholder="Prompt text"
            disabled={disabled}
            className="h-7 text-xs"
            style={{ fontSize: "13px" }}
          />
        )}
      </div>

      {/* Inline required toggle for surface_value (most common knob) */}
      {mode === "surface_value" && (
        <Switch
          checked={
            mapping?.mapType === "surface_value"
              ? mapping.required === true
              : false
          }
          onCheckedChange={(v) => {
            const base =
              mapping?.mapType === "surface_value"
                ? mapping
                : ({ mapType: "surface_value", target: "" } as Extract<
                    ValueMapping,
                    { mapType: "surface_value" }
                  >);
            onChange({ ...base, required: v === true });
          }}
          disabled={disabled}
          title="Required"
          className="shrink-0 scale-90"
        />
      )}

      {/* Advanced popover (full editor) */}
      <Popover open={advancedOpen} onOpenChange={setAdvancedOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            title="Advanced"
            className={cn(
              "shrink-0 flex h-7 w-7 items-center justify-center rounded border border-border bg-background text-muted-foreground hover:bg-accent/60 hover:text-foreground transition-colors",
              disabled && "opacity-50",
            )}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          className={cn("p-0", advancedContent ? "w-[26rem]" : "w-80")}
        >
          {surfaceName && (
            <div className="px-3 py-2 border-b border-border">
              <p className="text-[11px] text-muted-foreground truncate">
                {surfaceName}
              </p>
            </div>
          )}
          <div className="max-h-[70vh] overflow-y-auto p-3">
            {advancedContent ?? (
              <SurfaceVariableBinding
                target={target}
                mapping={mapping}
                availableSurfaceValues={availableSurfaceValues}
                disabled={disabled}
                sourceLabels={sourceLabels}
                valueFieldLabel={valueFieldLabel}
                onChange={onChange}
              />
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function SurfaceValueInline({
  mapping,
  availableSurfaceValues,
  disabled,
  placeholder,
  onChange,
}: {
  mapping: Extract<ValueMapping, { mapType: "surface_value" }>;
  availableSurfaceValues: readonly SurfaceValue[];
  disabled?: boolean;
  placeholder?: string;
  onChange: (next: ValueMapping) => void;
}) {
  return (
    <Select
      value={mapping.target || "__none__"}
      onValueChange={(v) =>
        onChange({ ...mapping, target: v === "__none__" ? "" : v })
      }
      disabled={disabled}
    >
      <SelectTrigger
        className={cn(
          "h-7 text-xs w-full",
          !mapping.target &&
            "border-rose-300 dark:border-rose-800 text-rose-600 dark:text-rose-400",
        )}
      >
        <SelectValue placeholder={placeholder ?? "Pick value…"} />
      </SelectTrigger>
      <SelectContent>
        {availableSurfaceValues.length === 0 && (
          <SelectItem value="__none__" disabled>
            Nothing on offer here
          </SelectItem>
        )}
        {availableSurfaceValues.map((sv) => (
          <SelectItem key={sv.name} value={sv.name}>
            <span className="text-xs">
              {sv.label || formatVariableDisplayName(sv.name)}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// THE COPIED-MAPPING RULE (UI-STANDARD P17.2), pure and shared.
//
// A batch grid's whole point is that one decision lands on many rows — and the
// rows are NOT the same place. So a value name inherited from a fill-down, a
// template or the row above is reconciled against the values THIS row's place
// actually has, and the outcome is one of exactly three:
//
//   1. keep      — the inherited name exists here.
//   2. rebind    — it does not, but this place offers a value named exactly
//                  like the input being fed; bind that, because a name match is
//                  the same rule the resolver itself uses.
//   3. clear     — neither exists. The cell goes EMPTY and therefore RED, and
//                  the person picks. Silently leaving a name this place cannot
//                  supply is the lie this rule exists to prevent.
//
// Pure on purpose: jest holds it, and both grids call it rather than each
// keeping its own copy of a three-branch rule.
// ─────────────────────────────────────────────────────────────────────────────

export type CopiedTargetVerdict =
  | { action: "keep" }
  | { action: "rebind"; target: string }
  | { action: "clear"; target: "" };

export function reconcileCopiedTarget({
  inheritedTarget,
  targetName,
  availableNames,
}: {
  /** The value name copied in — "" when nothing was chosen. */
  inheritedTarget: string;
  /** The holder input this cell feeds; its own name is the re-bind candidate. */
  targetName: string;
  /** Every value name this row's place actually offers. */
  availableNames: readonly string[];
}): CopiedTargetVerdict {
  const names = new Set(availableNames);
  if (inheritedTarget && names.has(inheritedTarget)) return { action: "keep" };
  if (names.has(targetName)) {
    return targetName === inheritedTarget
      ? { action: "keep" }
      : { action: "rebind", target: targetName };
  }
  if (inheritedTarget) return { action: "clear", target: "" };
  return { action: "keep" };
}

// ─────────────────────────────────────────────────────────────────────────────
// BatchBindingCell — grid cell. Lazily loads the row's surface values, attempts
// a name-match autofill for blank surface_value targets, then delegates to the
// inline editor.
// ─────────────────────────────────────────────────────────────────────────────

interface CellProps {
  surfaceName: string;
  target: BindingTarget;
  mapping: ValueMapping | undefined;
  onChange: (next: ValueMapping | null) => void;
  disabled?: boolean;
}

export function BatchBindingCell({
  surfaceName,
  target,
  mapping,
  onChange,
  disabled,
}: CellProps) {
  const dispatch = useAppDispatch();

  const selectValues = useMemo(
    () => makeSelectSurfaceValues(surfaceName),
    [surfaceName],
  );
  const selectStatus = useMemo(
    () => makeSelectSurfaceValuesStatus(surfaceName),
    [surfaceName],
  );
  const surfaceValues = useAppSelector(selectValues);
  const status = useAppSelector(selectStatus);

  // Inline cells are always rendered, so load this surface's values on mount.
  useEffect(() => {
    void dispatch(loadSurfaceValues({ surfaceName }));
  }, [dispatch, surfaceName]);

  const availableSurfaceValues = useMemo<SurfaceValue[]>(() => {
    const byName = new Map<string, SurfaceValue>();
    for (const v of Object.values(BASELINE_VALUES)) byName.set(v.name, v);
    for (const v of surfaceValues) byName.set(v.name, v);
    return Array.from(byName.values()).sort(
      (a, b) => (a.sortOrder ?? 1000) - (b.sortOrder ?? 1000),
    );
  }, [surfaceValues]);

  // P17.2 — a mapping copied to this row is reconciled against THIS place's
  // values. The rule is `reconcileCopiedTarget`, shared with the one binding
  // UI's batch mode so both grids self-heal identically.
  const resolvedRef = useRef(false);
  useEffect(() => {
    if (resolvedRef.current) return;
    if (status === "loading" || status === "idle") return; // wait for values
    if (mapping?.mapType !== "surface_value") return;
    resolvedRef.current = true;

    const verdict = reconcileCopiedTarget({
      inheritedTarget: mapping.target,
      targetName: target.name,
      availableNames: availableSurfaceValues.map((v) => v.name),
    });
    if (verdict.action === "keep") return;
    onChange({ ...mapping, target: verdict.target });
  }, [availableSurfaceValues, status, mapping, target.name, onChange]);

  const loading = status === "loading" && surfaceValues.length === 0;

  if (loading) {
    return (
      <div className="flex items-center gap-1.5 px-1 text-[11px] text-muted-foreground h-7">
        <Loader2 className="h-3 w-3 animate-spin" />
        Loading…
      </div>
    );
  }

  return (
    <InlineBindingEditor
      target={target}
      mapping={mapping}
      availableSurfaceValues={availableSurfaceValues}
      surfaceName={surfaceName}
      onChange={onChange}
      disabled={disabled}
    />
  );
}
