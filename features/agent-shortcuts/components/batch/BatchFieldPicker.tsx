"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import type { AgentShortcut } from "@/features/agent-shortcuts/types";
import { BASELINE_VALUES } from "@/features/surfaces/manifests/_baseline.manifest";
import type { BindingTarget } from "@/features/surfaces/admin/columns/SurfaceVariableBinding";
import { formatVariableDisplayName } from "@/features/agents/utils/variable-utils";
import type { SurfaceValue, ValueMapping } from "@/features/surfaces/types";
import { ScalarValueControl } from "./BatchFieldControls";
import { InlineBindingEditor } from "./BatchBindingCell";
import {
  BATCH_FIELDS,
  FIELD_GROUP_ORDER,
  type BatchFieldDef,
  type BatchScalarFieldKey,
  type BindingStateMap,
  type FieldMode,
  type FieldStateMap,
  STANDARD_DEFAULTS,
} from "./batchModel";

const BASELINE_ONLY: SurfaceValue[] = Object.values(BASELINE_VALUES).sort(
  (a, b) => (a.sortOrder ?? 1000) - (b.sortOrder ?? 1000),
);

const MODES: { id: FieldMode; label: string }[] = [
  { id: "inherit", label: "Inherit" },
  { id: "all", label: "Set all" },
  { id: "row", label: "Per-row" },
];

interface Props {
  fieldStates: FieldStateMap;
  bindingStates: BindingStateMap;
  targets: readonly BindingTarget[];
  template: AgentShortcut | null;
  categoryOptions: ReadonlyArray<{ value: string; label: string }>;
  onFieldModeChange: (key: BatchScalarFieldKey, mode: FieldMode) => void;
  onFieldAllValueChange: (key: BatchScalarFieldKey, value: unknown) => void;
  onBindingModeChange: (targetName: string, mode: FieldMode) => void;
  onBindingAllValueChange: (
    targetName: string,
    mapping: ValueMapping | null,
  ) => void;
}

/**
 * Every row follows | Item | Decision | Value |:
 *   - Item     = the field / binding name (left).
 *   - Decision = Inherit / Set all / Per-row toggle (center).
 *   - Value    = the inherited preview (inherit), the control (set all), or a
 *                "edited in grid" hint (per-row) — always on the right.
 *
 * Binding targets are listed first, defaulting to Per-row, and look exactly
 * like every other row.
 */
export function BatchFieldPicker({
  fieldStates,
  bindingStates,
  targets,
  template,
  categoryOptions,
  onFieldModeChange,
  onFieldAllValueChange,
  onBindingModeChange,
  onBindingAllValueChange,
}: Props) {
  const categoryLabel = useMemo(() => {
    const map = new Map(categoryOptions.map((o) => [o.value, o.label]));
    return (id: unknown) => (id ? (map.get(String(id)) ?? String(id)) : "—");
  }, [categoryOptions]);

  const scalarPreview = (def: BatchFieldDef): string => {
    const raw = template
      ? (template as unknown as Record<string, unknown>)[def.key]
      : STANDARD_DEFAULTS[def.key];
    if (def.control.kind === "dynamic-select") return categoryLabel(raw);
    if (def.control.kind === "select") {
      const opt = def.control.options.find(
        (o) => o.value === String(raw ?? ""),
      );
      return opt?.label ?? formatPreview(raw);
    }
    return formatPreview(raw);
  };

  return (
    <div className="rounded-lg border border-border bg-card divide-y divide-border">
      {/* Variables & context — same look as everything else, defaulting per-row */}
      {targets.length > 0 && (
        <div>
          <GroupHeader label="Variables & context" />
          {targets.map((t) => {
            const st = bindingStates[t.name];
            const mode: FieldMode = st?.mode ?? "row";
            return (
              <Row
                key={t.name}
                label={t.label ?? formatVariableDisplayName(t.name)}
                required={t.required}
                mode={mode}
                onModeChange={(m) => onBindingModeChange(t.name, m)}
                value={
                  mode === "inherit" ? (
                    <Preview
                      text={bindingPreview(template?.valueMappings?.[t.name])}
                    />
                  ) : mode === "all" ? (
                    <InlineBindingEditor
                      target={t}
                      mapping={st?.allValue}
                      availableSurfaceValues={BASELINE_ONLY}
                      onChange={(m) => onBindingAllValueChange(t.name, m)}
                    />
                  ) : (
                    <PerRowHint />
                  )
                }
              />
            );
          })}
        </div>
      )}

      {/* Scalar fields, grouped */}
      {FIELD_GROUP_ORDER.map((group) => {
        const fields = BATCH_FIELDS.filter((f) => f.group === group);
        if (fields.length === 0) return null;
        return (
          <div key={group}>
            <GroupHeader label={group} />
            {fields.map((f) => {
              const state = fieldStates[f.key];
              const mode: FieldMode = state?.mode ?? "inherit";
              return (
                <Row
                  key={f.key}
                  label={f.label}
                  hint={f.hint}
                  mode={mode}
                  onModeChange={(m) => onFieldModeChange(f.key, m)}
                  value={
                    mode === "inherit" ? (
                      <Preview text={scalarPreview(f)} />
                    ) : mode === "all" ? (
                      <ScalarValueControl
                        def={f}
                        value={state?.allValue}
                        onChange={(v) => onFieldAllValueChange(f.key, v)}
                        dynamicOptions={
                          f.control.kind === "dynamic-select"
                            ? categoryOptions
                            : undefined
                        }
                        compact
                      />
                    ) : (
                      <PerRowHint />
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

// ─────────────────────────────────────────────────────────────────────────────
// Row — the | Item | Decision | Value | layout
// ─────────────────────────────────────────────────────────────────────────────

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
  mode: FieldMode;
  onModeChange: (mode: FieldMode) => void;
  value: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[minmax(120px,1.1fr)_auto_minmax(160px,1.5fr)] items-center gap-3 px-3 py-1.5">
      <div className="min-w-0 flex items-center gap-1" title={hint}>
        <span className="text-sm text-foreground truncate">{label}</span>
        {required && (
          <span className="text-rose-500 text-xs" title="Required">
            *
          </span>
        )}
      </div>
      <ModeToggle value={mode} onChange={onModeChange} />
      <div className="min-w-0 flex justify-end">
        <div className="w-full min-w-0">{value}</div>
      </div>
    </div>
  );
}

function ModeToggle({
  value,
  onChange,
}: {
  value: FieldMode;
  onChange: (mode: FieldMode) => void;
}) {
  return (
    <div className="inline-flex rounded-md border border-border overflow-hidden shrink-0">
      {MODES.map((m) => {
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
                : "bg-background text-muted-foreground hover:text-foreground hover:bg-accent/50",
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
    <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/30">
      {label}
    </div>
  );
}

function Preview({ text }: { text: string }) {
  return (
    <span className="text-[11px] text-muted-foreground truncate block text-right">
      {text}
    </span>
  );
}

function PerRowHint() {
  return (
    <span className="text-[11px] text-muted-foreground/70 italic block text-right">
      edited in grid
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function formatPreview(raw: unknown): string {
  if (raw == null || raw === "") return "—";
  if (typeof raw === "boolean") return raw ? "On" : "Off";
  if (typeof raw === "object") return "…";
  return String(raw);
}

function bindingPreview(m: ValueMapping | undefined): string {
  if (!m || m.mapType === "unmapped") return "Agent default";
  if (m.mapType === "surface_value")
    return m.target ? `Surface: ${m.target}` : "Surface value · pick per row";
  if (m.mapType === "direct_value") {
    const v =
      typeof m.target === "string" ? m.target : JSON.stringify(m.target);
    return v ? `“${truncate(v, 22)}”` : "Empty literal";
  }
  return "Prompt user";
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
