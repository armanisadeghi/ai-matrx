"use client";

/**
 * RunAdvancedSettings — per-conversation settings overrides, progressively
 * disclosed under the Smart Input's Model tab.
 *
 * Layer 2 of the override UX. The model picker (Layer 1) is always visible;
 * these deeper settings hide behind an "Advanced" disclosure (collapsed by
 * default) so normal users aren't forced into complexity.
 *
 * Ordering is deliberate: modern, commonly-tuned controls first (thinking
 * level, reasoning effort, …); the legacy sampling knobs (temperature, max
 * output tokens) live at the very end.
 *
 * Model-aware: only controls the EFFECTIVE model (override ?? base) declares
 * are shown. Delta-based + genuine: setting a value back to the agent default
 * clears the override (resetOverride) rather than storing a base-equal value.
 * Scoped to THIS conversation — never edits the stored agent.
 */

import { useEffect, useState } from "react";
import { ChevronRight, RotateCcw } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectAllModels,
  selectModelFullyLoaded,
  fetchModelById,
} from "@/features/ai-models/redux/modelRegistrySlice";
import {
  useModelControls,
  type ControlDefinition,
} from "@/features/agents/hooks/useModelControls";
import { selectInstanceOverrideState } from "@/features/agents/redux/execution-system/instance-model-overrides/instance-model-overrides.selectors";
import {
  setOverrides,
  resetOverride,
} from "@/features/agents/redux/execution-system/instance-model-overrides/instance-model-overrides.slice";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

// Curated, ordered — modern/common controls first; the legacy sampling knobs
// (temperature, max output tokens) are deliberately last.
const CURATED: { key: string; label: string }[] = [
  { key: "thinking_level", label: "Thinking Level" },
  { key: "reasoning_effort", label: "Reasoning Effort" },
  { key: "reasoning_summary", label: "Reasoning Summary" },
  { key: "verbosity", label: "Verbosity" },
  { key: "internal_web_search", label: "Web Search" },
  { key: "internal_url_context", label: "URL Context" },
  { key: "top_p", label: "Top P" },
  { key: "temperature", label: "Temperature" },
  { key: "max_output_tokens", label: "Max Output Tokens" },
];

const deepEqual = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);

export function RunAdvancedSettings({
  conversationId,
}: {
  conversationId: string;
}) {
  const dispatch = useAppDispatch();
  const [open, setOpen] = useState(false);
  const overrideState = useAppSelector(
    selectInstanceOverrideState(conversationId),
  );
  const models = useAppSelector(selectAllModels);

  const base = (overrideState?.baseSettings ?? {}) as Record<string, unknown>;
  const overrides = (overrideState?.overrides ?? {}) as Record<string, unknown>;
  const effectiveModelId =
    (overrides.model as string | undefined) ??
    (base.model as string | undefined) ??
    "";

  // The advanced rows need the model's FULL controls. The registry may hold
  // only the lightweight "options" record (no controls), and SmartModelSelect's
  // one-shot fetch can be skipped by the registry's global isLoading guard.
  // Ensure the full record is loaded here and retry once any in-flight fetch
  // settles — the fetch thunk is cached/no-ops when already full.
  const isFull = useAppSelector((s) => selectModelFullyLoaded(s, effectiveModelId));
  const registryLoading = useAppSelector((s) => s.modelRegistry.isLoading);
  useEffect(() => {
    if (effectiveModelId && !isFull && !registryLoading) {
      dispatch(fetchModelById(effectiveModelId));
    }
  }, [dispatch, effectiveModelId, isFull, registryLoading]);

  // useModelControls is a pure parser despite the name — safe to call in render
  // with the effective (possibly overridden) model so the rows match what will
  // actually run.
  const { normalizedControls } = useModelControls(models, effectiveModelId);
  // NormalizedControls has typed optional keys + two required `Record<string, any>`
  // escape-hatch fields (rawControls/unmappedControls), so it has no structural
  // overlap with `Record<string, ControlDefinition>`. We index by known key here
  // (CURATED), never by the escape-hatch keys, so the runtime cast is safe —
  // the `as unknown as` is the canonical TS escape hatch the compiler asks for.
  const controls = normalizedControls as unknown as Record<
    string,
    ControlDefinition
  > | null;

  const rows = CURATED.filter(({ key }) => controls?.[key]);
  if (rows.length === 0) return null;

  const overriddenCount = rows.filter(({ key }) => key in overrides).length;

  // The value a row should show / clear to when there's no override: the
  // agent's own value if it set one, otherwise the MODEL's declared default
  // (so a flag whose default is `{allowed:true}` reads "On", not "Off").
  // baseSettings is sanitized (no null), so `??` cleanly falls through to the
  // control default only when the agent left the key unset.
  const effectiveDefault = (key: string, control: ControlDefinition) =>
    base[key] ?? control.default;

  const handleChange = (
    key: string,
    control: ControlDefinition,
    value: unknown,
  ) => {
    // Clearing to the effective default removes the override entirely — never
    // store a value equal to what the run would already use (matches the
    // backend's no-defaults-as-override rule; the API selector re-diffs too).
    if (deepEqual(value, effectiveDefault(key, control))) {
      dispatch(resetOverride({ conversationId, key }));
      return;
    }
    dispatch(setOverrides({ conversationId, changes: { [key]: value } }));
  };

  return (
    <div className="border-t border-border">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <span className="flex items-center gap-1.5">
          <ChevronRight
            className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-90" : ""}`}
          />
          Advanced settings
        </span>
        {overriddenCount > 0 && (
          <span className="rounded-full bg-primary/15 px-1.5 text-[9px] font-semibold text-primary">
            {overriddenCount}
          </span>
        )}
      </button>

      {open && (
        <div className="flex flex-col gap-2.5 px-3 pb-3">
          {rows.map(({ key, label }) => (
            <RunSettingControl
              key={key}
              label={label}
              control={controls![key]}
              value={
                key in overrides
                  ? overrides[key]
                  : effectiveDefault(key, controls![key])
              }
              isOverridden={key in overrides}
              onChange={(v) => handleChange(key, controls![key], v)}
              onReset={() => dispatch(resetOverride({ conversationId, key }))}
            />
          ))}
          <p className="text-[10px] leading-snug text-muted-foreground">
            Overrides apply to this conversation only. Resetting a value returns
            it to the agent default.
          </p>
        </div>
      )}
    </div>
  );
}

function RunSettingControl({
  label,
  control,
  value,
  isOverridden,
  onChange,
  onReset,
}: {
  label: string;
  control: ControlDefinition;
  value: unknown;
  isOverridden: boolean;
  onChange: (value: unknown) => void;
  onReset: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Label className="w-28 shrink-0 text-[11px] text-muted-foreground">
        {label}
      </Label>
      <div className="min-w-0 flex-1">
        <ControlInput control={control} value={value} onChange={onChange} />
      </div>
      <button
        type="button"
        onClick={onReset}
        title="Reset to agent default"
        className={`shrink-0 text-muted-foreground transition-colors hover:text-foreground ${
          isOverridden ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        aria-hidden={!isOverridden}
        tabIndex={isOverridden ? 0 : -1}
      >
        <RotateCcw className="h-3 w-3" />
      </button>
    </div>
  );
}

function ControlInput({
  control,
  value,
  onChange,
}: {
  control: ControlDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  if (control.type === "enum" && control.enum?.length) {
    return (
      <Select
        value={value != null ? String(value) : ""}
        onValueChange={(v) => onChange(v)}
      >
        <SelectTrigger className="h-7 text-xs">
          <SelectValue placeholder="default" />
        </SelectTrigger>
        <SelectContent className="text-xs">
          {control.enum.map((opt) => (
            <SelectItem key={opt} value={opt} className="text-xs">
              {opt}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  if (control.type === "boolean") {
    return (
      <div className="flex items-center gap-2">
        <Checkbox
          checked={value === true}
          onCheckedChange={(c) => onChange(c === true)}
          className="cursor-pointer"
        />
        <span className="text-[11px] text-muted-foreground">
          {value === true ? "On" : "Off"}
        </span>
      </div>
    );
  }

  if (control.type === "number" || control.type === "integer") {
    return (
      <input
        type="number"
        value={typeof value === "number" ? value : ""}
        min={control.min}
        max={control.max}
        step={control.type === "integer" ? 1 : 0.01}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === "") return;
          const n = Number(raw);
          if (Number.isFinite(n)) onChange(n);
        }}
        // 16px avoids iOS zoom-on-focus per the mobile-first rule.
        style={{ fontSize: "16px" }}
        className="h-7 w-full rounded border border-border bg-textured px-2 text-xs text-foreground"
      />
    );
  }

  // string / fallback
  return (
    <input
      type="text"
      value={value != null ? String(value) : ""}
      onChange={(e) => onChange(e.target.value)}
      style={{ fontSize: "16px" }}
      className="h-7 w-full rounded border border-border bg-textured px-2 text-xs text-foreground"
    />
  );
}
