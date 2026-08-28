"use client";

import { cn } from "@/lib/utils";
import { BindingCell } from "./BindingCell";
import { TreatmentValueControl } from "./TreatmentControls";
import {
  CASCADE_MODES,
  KNOWN_VALUES,
  TEMPLATE_TREATMENT,
  TREATMENT_FIELDS,
  formatTreatment,
  valueById,
  type Binding,
  type CascadeMode,
  type ConsumedKey,
  type TreatmentKey,
  type TreatmentValue,
} from "./mock-data";

const ALL_KNOWN_VALUES = Object.values(KNOWN_VALUES);

const TREATMENT_GROUP_ORDER = ["Display", "Behavior", "Identity"] as const;

/**
 * Level 1 and level 2 of the cascade, in one panel — the same
 * | Item | Decision | Value | layout the shortcut batch editor uses.
 *
 *   Inherit    → the template's value flows down untouched (preview on the right)
 *   Set for all → one value applied to every cell (the real control, inline)
 *   Per-cell   → becomes a column in the grid below
 *
 * Nothing is ever locked: every row can be flipped between the three at any
 * time, and flipping back never destroys a per-cell answer.
 */
export function CascadePanel({
  consumedKeys,
  bindingModes,
  bindingAllValues,
  treatmentModes,
  treatmentAllValues,
  onBindingModeChange,
  onBindingAllValueChange,
  onTreatmentModeChange,
  onTreatmentAllValueChange,
}: {
  consumedKeys: readonly ConsumedKey[];
  bindingModes: Readonly<Record<string, CascadeMode>>;
  bindingAllValues: Readonly<Record<string, Binding>>;
  treatmentModes: Readonly<Record<TreatmentKey, CascadeMode>>;
  treatmentAllValues: Readonly<Partial<Record<TreatmentKey, TreatmentValue>>>;
  onBindingModeChange: (key: string, mode: CascadeMode) => void;
  onBindingAllValueChange: (key: string, binding: Binding) => void;
  onTreatmentModeChange: (key: TreatmentKey, mode: CascadeMode) => void;
  onTreatmentAllValueChange: (key: TreatmentKey, value: TreatmentValue) => void;
}) {
  return (
    <div className="divide-y divide-border rounded-lg border border-border bg-card">
      {consumedKeys.length > 0 && (
        <div>
          <GroupHeader label="Inputs & known values" />
          {consumedKeys.map((c) => {
            const mode = bindingModes[c.key] ?? "cell";
            const allValue: Binding =
              bindingAllValues[c.key] ??
              (c.templateValueId
                ? { kind: "known_value", valueId: c.templateValueId }
                : { kind: "prompt_user", prompt: `Enter ${c.label}` });
            return (
              <Row
                key={c.key}
                label={c.label}
                hint={`Consumed as ${c.key}`}
                required={c.required}
                mode={mode}
                onModeChange={(m) => onBindingModeChange(c.key, m)}
                value={
                  mode === "inherit" ? (
                    <Preview text={templateBindingPreview(c)} />
                  ) : mode === "all" ? (
                    <BindingCell
                      consumed={c}
                      binding={allValue}
                      candidates={ALL_KNOWN_VALUES}
                      placeLabel="Applied to every selected place"
                      onChange={(b) => onBindingAllValueChange(c.key, b)}
                    />
                  ) : (
                    <PerCellHint />
                  )
                }
              />
            );
          })}
          <p className="px-3 pb-2 text-[11px] leading-snug text-muted-foreground">
            Direct values and prompts fill cleanly. A known value only lands
            where that <span className="font-medium">identity</span> exists —
            everywhere else it falls to a name re-match you confirm, or to red.
          </p>
        </div>
      )}

      {TREATMENT_GROUP_ORDER.map((group) => {
        const fields = TREATMENT_FIELDS.filter((f) => f.group === group);
        if (fields.length === 0) return null;
        return (
          <div key={group}>
            <GroupHeader label={`Treatment · ${group}`} />
            {fields.map((f) => {
              const mode = treatmentModes[f.key];
              const value = treatmentAllValues[f.key] ?? TEMPLATE_TREATMENT[f.key];
              return (
                <Row
                  key={f.key}
                  label={f.label}
                  hint={f.hint}
                  mode={mode}
                  onModeChange={(m) => onTreatmentModeChange(f.key, m)}
                  value={
                    mode === "inherit" ? (
                      <Preview
                        text={formatTreatment(f.key, TEMPLATE_TREATMENT[f.key])}
                      />
                    ) : mode === "all" ? (
                      <TreatmentValueControl
                        def={f}
                        value={value}
                        onChange={(v) => onTreatmentAllValueChange(f.key, v)}
                        compact
                      />
                    ) : (
                      <PerCellHint />
                    )
                  }
                />
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function templateBindingPreview(c: ConsumedKey): string {
  if (!c.templateValueId) return "Prompt user";
  const v = valueById(c.templateValueId);
  return v ? `${v.owner} · ${v.key}` : "Unknown value";
}

function Row({
  label,
  hint,
  required,
  mode,
  onModeChange,
  value,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  mode: CascadeMode;
  onModeChange: (mode: CascadeMode) => void;
  value: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[minmax(120px,1.1fr)_auto_minmax(180px,1.6fr)] items-center gap-3 px-3 py-1.5">
      <div className="flex min-w-0 items-center gap-1" title={hint}>
        <span className="truncate text-sm text-foreground">{label}</span>
        {required && (
          <span className="text-xs text-rose-500" title="Required">
            *
          </span>
        )}
      </div>
      <ModeToggle value={mode} onChange={onModeChange} />
      <div className="flex min-w-0 justify-end">
        <div className="w-full min-w-0">{value}</div>
      </div>
    </div>
  );
}

function ModeToggle({
  value,
  onChange,
}: {
  value: CascadeMode;
  onChange: (mode: CascadeMode) => void;
}) {
  return (
    <div className="inline-flex shrink-0 overflow-hidden rounded-md border border-border">
      {CASCADE_MODES.map((m) => {
        const active = m.id === value;
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => onChange(m.id)}
            className={cn(
              "px-2.5 py-1 text-[11px] font-medium transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "bg-background text-muted-foreground hover:bg-accent/50 hover:text-foreground",
            )}
          >
            {m.label}
          </button>
        );
      })}
    </div>
  );
}

function GroupHeader({ label }: { label: string }) {
  return (
    <div className="bg-muted/30 px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
      {label}
    </div>
  );
}

function Preview({ text }: { text: string }) {
  return (
    <span className="block truncate text-right text-[11px] text-muted-foreground">
      {text}
    </span>
  );
}

function PerCellHint() {
  return (
    <span className="block text-right text-[11px] italic text-muted-foreground/70">
      edited in the grid
    </span>
  );
}
