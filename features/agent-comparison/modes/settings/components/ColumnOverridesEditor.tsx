"use client";

/**
 * ColumnOverridesEditor
 *
 * Per-column LLM-overrides editor. Lives in a Popover triggered by the
 * settings chip in SettingsColumnHeader. Edits write through to the
 * shared `instanceModelOverrides` slice — the executor reads those
 * overrides on submit (already wired).
 *
 * Phase 1 surface (the most common params for cross-model comparison):
 *   - model (dropdown from ai_models registry)
 *   - temperature (0.0 - 2.0 slider)
 *   - reasoning_effort (enum)
 *   - thinking_level (enum)
 *   - max_output_tokens (number)
 *   - top_p (0.0 - 1.0 slider)
 *
 * Anything outside this list still passes through if the user wants to
 * use the column's own Creator Panel — those edits land on the same
 * overrides map and are read identically.
 */

import { useEffect, useMemo } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { setOverrides } from "@/features/agents/redux/execution-system/instance-model-overrides/instance-model-overrides.slice";
import { selectInstanceOverrideState } from "@/features/agents/redux/execution-system/instance-model-overrides/instance-model-overrides.selectors";
import {
  selectActiveModels,
  fetchModelOptions,
} from "@/features/ai-models/redux/modelRegistrySlice";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface Props {
  conversationId: string;
}

const REASONING_EFFORT_OPTIONS = [
  "auto",
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
] as const;
const THINKING_LEVEL_OPTIONS = ["minimal", "low", "medium", "high"] as const;

export function ColumnOverridesEditor({ conversationId }: Props) {
  const dispatch = useAppDispatch();
  const overrideState = useAppSelector(
    selectInstanceOverrideState(conversationId),
  );
  const overrides = (overrideState?.overrides ?? {}) as Record<string, unknown>;
  const baseSettings = (overrideState?.baseSettings ?? {}) as Record<string, unknown>;
  const models = useAppSelector(selectActiveModels);

  // Lazy-load the model registry once. Cheap if already loaded.
  useEffect(() => {
    if (models.length === 0) {
      void dispatch(fetchModelOptions());
    }
  }, [dispatch, models.length]);

  const effective = useMemo(
    () => ({ ...baseSettings, ...overrides }),
    [baseSettings, overrides],
  );

  const update = (changes: Record<string, unknown>) => {
    dispatch(setOverrides({ conversationId, changes }));
  };

  const isOverridden = (key: string) => key in overrides;
  const clearKey = (key: string) => {
    // Remove from overrides by re-setting the whole map without that key.
    const next: Record<string, unknown> = { ...overrides };
    delete next[key];
    dispatch(
      setOverrides({
        conversationId,
        changes: next,
      }),
    );
  };

  const modelOptions = models
    .filter((m) => !m.is_deprecated)
    .map((m) => ({
      value: m.id,
      label: m.common_name ?? m.name ?? m.id,
      provider: m.provider ?? "",
    }));

  return (
    <div className="w-[360px] max-h-[70vh] overflow-y-auto p-3 space-y-3 text-xs">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-[11px] font-semibold">Model</Label>
          {isOverridden("model") && (
            <ClearChip onClear={() => clearKey("model")} />
          )}
        </div>
        <select
          value={(effective.model as string | null) ?? ""}
          onChange={(e) =>
            update({ model: e.target.value || null })
          }
          className="w-full bg-background border border-border rounded px-2 py-1 text-xs text-foreground focus:outline-none focus:border-primary"
        >
          <option value="">— Agent default —</option>
          {modelOptions.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
              {m.provider ? ` (${m.provider})` : ""}
            </option>
          ))}
        </select>
      </div>

      <RangeRow
        label="Temperature"
        value={effective.temperature as number | null}
        defaultValue={0.7}
        min={0}
        max={2}
        step={0.01}
        overridden={isOverridden("temperature")}
        onChange={(v) => update({ temperature: v })}
        onClear={() => clearKey("temperature")}
      />

      <RangeRow
        label="Top-p"
        value={effective.top_p as number | null}
        defaultValue={1}
        min={0}
        max={1}
        step={0.01}
        overridden={isOverridden("top_p")}
        onChange={(v) => update({ top_p: v })}
        onClear={() => clearKey("top_p")}
      />

      <NumberRow
        label="Max output tokens"
        value={effective.max_output_tokens as number | null}
        placeholder="Agent default"
        overridden={isOverridden("max_output_tokens")}
        onChange={(v) => update({ max_output_tokens: v })}
        onClear={() => clearKey("max_output_tokens")}
      />

      <EnumRow
        label="Reasoning effort"
        value={effective.reasoning_effort as string | null}
        options={REASONING_EFFORT_OPTIONS as unknown as string[]}
        overridden={isOverridden("reasoning_effort")}
        onChange={(v) => update({ reasoning_effort: v })}
        onClear={() => clearKey("reasoning_effort")}
      />

      <EnumRow
        label="Thinking level"
        value={effective.thinking_level as string | null}
        options={THINKING_LEVEL_OPTIONS as unknown as string[]}
        overridden={isOverridden("thinking_level")}
        onChange={(v) => update({ thinking_level: v })}
        onClear={() => clearKey("thinking_level")}
      />

      <div className="pt-2 border-t border-border text-[10px] text-muted-foreground/80">
        Override values land on the shared model-overrides slice. The
        executor reads them on submit. Use the column's own Creator Panel
        for advanced fields not shown here.
      </div>
    </div>
  );
}

function ClearChip({ onClear }: { onClear: () => void }) {
  return (
    <button
      type="button"
      onClick={onClear}
      title="Clear override (use agent default)"
      className="text-[9px] uppercase tracking-wider text-amber-500 hover:text-amber-400 font-semibold"
    >
      override · clear
    </button>
  );
}

function RangeRow({
  label,
  value,
  defaultValue,
  min,
  max,
  step,
  overridden,
  onChange,
  onClear,
}: {
  label: string;
  value: number | null;
  defaultValue: number;
  min: number;
  max: number;
  step: number;
  overridden: boolean;
  onChange: (v: number) => void;
  onClear: () => void;
}) {
  const effective = value ?? defaultValue;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <Label className="text-[11px] font-semibold">{label}</Label>
        {overridden ? (
          <ClearChip onClear={onClear} />
        ) : (
          <span className="text-[9px] uppercase tracking-wider text-muted-foreground/60">
            agent default
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Slider
          value={[effective]}
          min={min}
          max={max}
          step={step}
          onValueChange={(v) => onChange(v[0])}
          className="flex-1"
        />
        <span
          className={cn(
            "text-[11px] font-mono w-12 text-right tabular-nums",
            overridden ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {effective.toFixed(2)}
        </span>
      </div>
    </div>
  );
}

function NumberRow({
  label,
  value,
  placeholder,
  overridden,
  onChange,
  onClear,
}: {
  label: string;
  value: number | null;
  placeholder: string;
  overridden: boolean;
  onChange: (v: number | null) => void;
  onClear: () => void;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <Label className="text-[11px] font-semibold">{label}</Label>
        {overridden ? (
          <ClearChip onClear={onClear} />
        ) : (
          <span className="text-[9px] uppercase tracking-wider text-muted-foreground/60">
            agent default
          </span>
        )}
      </div>
      <Input
        type="number"
        value={value == null ? "" : String(value)}
        placeholder={placeholder}
        onChange={(e) => {
          const raw = e.target.value;
          if (!raw) {
            onChange(null);
            return;
          }
          const n = Number(raw);
          if (Number.isFinite(n)) onChange(n);
        }}
        className="h-7 text-xs"
      />
    </div>
  );
}

function EnumRow({
  label,
  value,
  options,
  overridden,
  onChange,
  onClear,
}: {
  label: string;
  value: string | null;
  options: string[];
  overridden: boolean;
  onChange: (v: string | null) => void;
  onClear: () => void;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <Label className="text-[11px] font-semibold">{label}</Label>
        {overridden ? (
          <ClearChip onClear={onClear} />
        ) : (
          <span className="text-[9px] uppercase tracking-wider text-muted-foreground/60">
            agent default
          </span>
        )}
      </div>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="w-full bg-background border border-border rounded px-2 py-1 text-xs text-foreground focus:outline-none focus:border-primary"
      >
        <option value="">— Agent default —</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}
