"use client";

/**
 * RunConfigOverrides — per-conversation settings overrides, progressively
 * disclosed under the Smart Input's Model tab (below RunModelPicker).
 *
 * Catalogue-driven: rows come from `buildSettingsRows()` (the settings
 * catalogue chokepoint), so this surface shows EXACTLY the keys the effective
 * model (override ?? base) declares — grouped and ordered the same way the
 * agent builder shows them — instead of a hand-curated subset. Controls render
 * through the shared `SettingControlInput` primitive.
 *
 * Override semantics (instance-model-overrides slice):
 *   - untouched   — row shows the effective value (agent's base ?? model default)
 *   - overridden  — highlighted, per-row reset (RotateCcw)
 *   - removed     — amber "Removed" badge; reset restores the agent default
 * Genuine-delta by construction: setting a value back to the effective default
 * clears the override (resetOverride) rather than storing a base-equal value —
 * matches the backend's no-defaults-as-override rule; the API selector
 * re-diffs as backstop.
 *
 * Overrides set before a per-run model switch that the NEW effective model
 * does not declare surface in an amber caution strip (never silently hidden),
 * each with its own reset.
 *
 * Scoped to THIS conversation — never edits the stored agent.
 */

import { useEffect, useState } from "react";
import { AlertTriangle, ChevronRight, RotateCcw } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectAllModels,
  selectModelFullyLoaded,
  fetchModelById,
} from "@/features/ai-models/redux/modelRegistrySlice";
import { useModelControls } from "@/features/agents/hooks/useModelControls";
import { selectInstanceOverrideState } from "@/features/agents/redux/execution-system/instance-model-overrides/instance-model-overrides.selectors";
import {
  setOverrides,
  resetOverride,
} from "@/features/agents/redux/execution-system/instance-model-overrides/instance-model-overrides.slice";
import {
  buildSettingsRows,
  humanizeSettingKey,
  type SettingsRow,
} from "@/lib/redux/slices/agent-settings/settings-catalogue";
import type { ControlDefinition } from "@/lib/redux/slices/agent-settings/types";
import { SettingControlInput } from "@/features/agents/components/settings-management/controls/SettingControlInput";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const deepEqual = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);

export function RunConfigOverrides({
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

  // baseSettings/overrides are Partial<LLMParams> (fixed named fields, no
  // index signature); the settings catalogue below is genuinely
  // catalogue-key-driven (dynamic string keys), so a loose map view is the
  // documented, deliberate contract for this whole file.
  // MATRX-EXCEPTION: settings-catalogue keys are dynamic; LLMParams has no index signature.
  const base = (overrideState?.baseSettings ?? {}) as Record<string, unknown>;
  // MATRX-EXCEPTION: settings-catalogue keys are dynamic; LLMParams has no index signature.
  const overrides = (overrideState?.overrides ?? {}) as Record<string, unknown>;
  const removals = overrideState?.removals ?? [];
  const effectiveModelId =
    (overrides.model as string | undefined) ??
    (base.model as string | undefined) ??
    "";

  // The rows need the model's FULL controls. The registry may hold only the
  // lightweight "options" record (no controls), and SmartModelSelect's
  // one-shot fetch can be skipped by the registry's global isLoading guard.
  // Ensure the full record is loaded here and retry once any in-flight fetch
  // settles — the fetch thunk is cached/no-ops when already full.
  const isFull = useAppSelector((s) =>
    selectModelFullyLoaded(s, effectiveModelId),
  );
  const registryLoading = useAppSelector((s) => s.modelRegistry.isLoading);
  useEffect(() => {
    if (effectiveModelId && !isFull && !registryLoading) {
      dispatch(fetchModelById(effectiveModelId));
    }
  }, [dispatch, effectiveModelId, isFull, registryLoading]);

  // useModelControls is a pure parser despite the name — safe to call in
  // render with the effective (possibly overridden) model so the rows match
  // what will actually run.
  const { normalizedControls } = useModelControls(models, effectiveModelId);
  // NormalizedControls has no string index signature (typed optional keys +
  // two Record<string, unknown> escape-hatch fields) — buildSettingsRows
  // takes the documented loose bag-of-controls contract (ControlsLike) and
  // validates each candidate internally before trusting it as a control.
  // MATRX-EXCEPTION: buildSettingsRows validates each field at read time; see lookupControl.
  const controlsMap = normalizedControls as unknown as Record<
    string,
    ControlDefinition
  > | null;

  // The Model tab is already gated on the override layer; belt-and-braces.
  if (!overrideState) return null;

  // Merged "what this run will use" view: base + overrides − removals.
  // Derived in render from the stable override-state ref (React Compiler
  // memoizes); selectCurrentSettings is deliberately NOT subscribed here.
  const merged: Record<string, unknown> = { ...base, ...overrides };
  for (const key of removals) delete merged[key];

  const groups = buildSettingsRows(controlsMap, merged).filter(
    (g) => g.rows.length > 0,
  );

  // The value a row should show / clear to when there's no override: the
  // agent's own value if it set one, otherwise the MODEL's declared default
  // (so a flag whose default is `{allowed:true}` reads "On", not "Off").
  const effectiveDefault = (key: string, control: ControlDefinition | null) =>
    base[key] ?? control?.default;

  // Overridden keys the effective model does NOT declare — typically left
  // behind by a per-run model switch. Surfaced loudly, never silently kept.
  const orphanedKeys = Object.keys(overrides).filter(
    (key) => key !== "model" && !controlsMap?.[key],
  );

  const overriddenCount =
    Object.keys(overrides).filter((k) => k !== "model").length +
    removals.length;

  const handleChange = (
    key: string,
    control: ControlDefinition | null,
    value: unknown,
  ) => {
    // Clearing to the effective default removes the override entirely — never
    // store a value equal to what the run would already use.
    if (deepEqual(value, effectiveDefault(key, control))) {
      dispatch(resetOverride({ conversationId, key }));
      return;
    }
    dispatch(setOverrides({ conversationId, changes: { [key]: value } }));
  };

  // Loading only applies while a known model's full record is in flight; an
  // instance with no base model yet (e.g. the landing's default agent before
  // its snapshot resolves) gets the empty-state message, not a forever-spinner.
  const rowsLoading = groups.length === 0 && !!effectiveModelId && !isFull;

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
          {orphanedKeys.length > 0 && (
            <div className="flex flex-col gap-1 rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1.5">
              <span className="flex items-center gap-1 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-3 w-3" />
                Not supported by the selected model
              </span>
              {orphanedKeys.map((key) => (
                <div key={key} className="flex items-center gap-2">
                  <span className="flex-1 truncate text-[11px] text-muted-foreground">
                    {humanizeSettingKey(key)}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      dispatch(resetOverride({ conversationId, key }))
                    }
                    title="Reset to agent default"
                    className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <RotateCcw className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {rowsLoading ? (
            <p className="text-[11px] text-muted-foreground">
              Loading model settings…
            </p>
          ) : groups.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">
              {effectiveModelId
                ? "This model doesn't declare adjustable settings."
                : "No model resolved for this conversation yet."}
            </p>
          ) : (
            groups.map((group) => (
              <div key={group.id} className="flex flex-col gap-2">
                {group.label && (
                  <p className="pt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                    {group.label}
                  </p>
                )}
                {group.rows.map((row) => (
                  <OverrideRow
                    key={row.key}
                    row={row}
                    value={
                      row.key in overrides
                        ? overrides[row.key]
                        : removals.includes(row.key)
                          ? undefined
                          : effectiveDefault(row.key, row.control)
                    }
                    isOverridden={row.key in overrides}
                    isRemoved={removals.includes(row.key)}
                    onChange={(v) => handleChange(row.key, row.control, v)}
                    onReset={() =>
                      dispatch(resetOverride({ conversationId, key: row.key }))
                    }
                  />
                ))}
              </div>
            ))
          )}

          <p className="text-[10px] leading-snug text-muted-foreground">
            Overrides apply to this conversation only. Resetting a value
            returns it to the agent default.
          </p>
        </div>
      )}
    </div>
  );
}

function OverrideRow({
  row,
  value,
  isOverridden,
  isRemoved,
  onChange,
  onReset,
}: {
  row: SettingsRow;
  value: unknown;
  isOverridden: boolean;
  isRemoved: boolean;
  onChange: (value: unknown) => void;
  onReset: () => void;
}) {
  const touched = isOverridden || isRemoved;
  // buildSettingsRows only returns rows for keys the model declares a
  // control for (see settings-catalogue.ts) — control is never null here,
  // but the shared SettingsRow type allows it for other producers.
  if (!row.control) return null;
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-sm",
        isOverridden && "-mx-1 border-l-2 border-primary/60 bg-primary/5 px-1",
      )}
    >
      <Label
        className={cn(
          "w-28 shrink-0 text-[11px]",
          isOverridden ? "text-foreground" : "text-muted-foreground",
        )}
        title={row.key}
      >
        {row.label}
        {isRemoved && (
          <span className="ml-1 rounded bg-amber-500/15 px-1 text-[9px] font-semibold text-amber-600 dark:text-amber-400">
            Removed
          </span>
        )}
      </Label>
      <div className="min-w-0 flex-1">
        <SettingControlInput
          settingKey={row.key}
          control={row.control}
          value={value}
          onChange={onChange}
          disabled={isRemoved}
          id={`run-override-${row.key}`}
        />
      </div>
      <button
        type="button"
        onClick={onReset}
        title="Reset to agent default"
        className={cn(
          "shrink-0 text-muted-foreground transition-colors hover:text-foreground",
          touched ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        aria-hidden={!touched}
        tabIndex={touched ? 0 : -1}
      >
        <RotateCcw className="h-3 w-3" />
      </button>
    </div>
  );
}
