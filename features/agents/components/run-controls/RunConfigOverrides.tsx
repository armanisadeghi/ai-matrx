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
 * Scoped to the HOST that mounts it — never edits the stored agent. What the
 * override actually covers is the host's fact and is said in the host's words
 * (`RunConfigOverridesWords`): per-conversation under the Smart Input, per
 * stored binding on a binding screen.
 */

import {
  ConfigurationTable,
  ConfigurationTableRow,
  FieldHelp,
} from "@/components/official/ConfigurationFields";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import {
  selectAllModels,
  selectModelFullyLoaded,
  fetchModelById,
  retryModelDetail,
  selectModelDetailError,
} from "@/features/ai-models/redux/modelRegistrySlice";
import { useModelControls } from "@/features/agents/hooks/useModelControls";
import {
  selectInstanceOverrideState,
  selectSettingsOverridesForApi,
} from "@/features/agents/redux/execution-system/instance-model-overrides/instance-model-overrides.selectors";
import {
  setOverrides,
  replaceOverrides,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ModelListDropdown } from "@/features/ai-models/components/lab/ModelListDropdown";
import { parseRequestOverrides } from "@/features/agents/redux/execution-system/utils/request-overrides";
import type { LLMParams } from "@/features/agents/types/agent-api-types";

const OVERRIDE_COLUMNS = [
  { key: "setting", label: "Setting" },
  {
    key: "value",
    label: "Value",
    help: "The effective value. Editing it creates an override; Reset restores inheritance.",
  },
  { key: "source", label: "Source" },
  { key: "state", label: "State" },
];

const deepEqual = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);

/**
 * 🚨 THIS PANEL'S OWN WORDS — a wording PROP at a second call site, never a
 * fork (the same discipline as `AdvancedSectionWords` / `SettingsSectionWords`
 * / `SurfaceVariableBinding.sourceLabels`).
 *
 * The mechanic is fixed; what an override MEANS is the host's fact. Mounted
 * under the Smart Input this really is per-conversation. Mounted on a BINDING
 * screen it configures a stored row that runs every time the job runs — and it
 * was printing *"Overrides apply to this conversation only"* there, on a screen
 * with no conversation on it (Arman, 2026-08-31; VISION-RECONCILIATION B14). A
 * screen that says something untrue is the fourth law's exact target.
 */
export interface RunConfigOverridesWords {
  /** The small caps header above the rows. */
  heading: string;
  /** WHAT THESE OVERRIDES COVER — the sentence under the rows. */
  scopeNote: string;
  /** Said when no model has been resolved for this host yet. */
  noModelNote: string;
  /**
   * THE MODEL PICKER'S "no override" CHOICE, in this host's noun (V1 round 4,
   * O3). `StoredModelOverridesField` hardcoded *"Use the holder's own model"*
   * on every door — including the shortcut editor, whose two neighbouring
   * sentences both say *"the agent's own model"*. Two nouns for one thing on
   * one screen is a screen a non-technical person cannot read.
   *
   * Omitted = the agent noun, which is right on every door whose subject IS an
   * agent. A mandate/job door passes the job vocabulary's own word.
   */
  modelEmptyChoiceLabel?: string;
  /**
   * THE BASELINE'S NOUN, in this host's vocabulary — the same O3 defect one
   * level down. The rows called the thing a setting is inherited FROM
   * *"Holder"*, and a cleared setting *"Holder default"*, hardcoded on every
   * door including the shortcut editor, whose whole subject is an AGENT. The
   * mandate-screen vocabulary sweep reads it as the job system's noun standing
   * on an agent door, which is exactly what it is.
   *
   * Omitted = the agent noun, right on every door whose subject IS an agent. A
   * mandate/job door passes the job vocabulary's own word (its runner is a
   * HOLDER, agent or workflow).
   */
  baselineSourceLabel?: string;
  /** What a cleared setting falls back to, in this host's noun. */
  baselineDefaultLabel?: string;
}

/** The default for the picker's "no override" choice — see the field above. */
export const DEFAULT_MODEL_EMPTY_CHOICE_LABEL = "Use the agent's own model";

export const CONVERSATION_OVERRIDE_WORDS: RunConfigOverridesWords = {
  heading: "Advanced settings",
  scopeNote:
    "Overrides apply to this conversation only. Resetting a value returns it to the agent default.",
  noModelNote: "No model resolved for this conversation yet.",
  baselineSourceLabel: "Agent",
  baselineDefaultLabel: "Agent default",
};

export function RunConfigOverrides({
  conversationId,
  words,
  structured = false,
  disabled = false,
  onValidationChange,
  inheritedSources,
  nullOverrideDefaults,
  overrideSource = "Binding",
}: {
  conversationId: string;
  disabled?: boolean;
  onValidationChange?: (error: string | null) => void;
  structured?: boolean;
  /** Omit any key to keep the per-conversation wording. */
  words?: Partial<RunConfigOverridesWords>;
  /** Provenance of the host's effective baseline, before local changes. */
  inheritedSources?: Readonly<Record<string, string>>;
  /** Mandate nulls cancel ancestor overrides and restore authored settings. */
  nullOverrideDefaults?: Partial<LLMParams>;
  overrideSource?: string;
}) {
  const w = { ...CONVERSATION_OVERRIDE_WORDS, ...words };
  // The host's nouns for the baseline, defaulted to the agent vocabulary.
  const baselineSourceLabel = w.baselineSourceLabel ?? "Agent";
  const baselineDefaultLabel = w.baselineDefaultLabel ?? "Agent default";
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const [editorTab, setEditorTab] = useState("controls");
  const [jsonDraft, setJsonDraft] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const lastJsonValue = useRef<string | null>(null);
  const overrideState = useAppSelector(
    selectInstanceOverrideState(conversationId),
  );
  const models = useAppSelector(selectAllModels);

  // Subscribe to the serialized wire document. Reading store.getState() in
  // render is opaque to React Compiler and can cache the first document.
  const overrideJson = useAppSelector((state) =>
    JSON.stringify(
      selectSettingsOverridesForApi(conversationId)(state) ?? {},
      null,
      2,
    ),
  );
  useEffect(() => {
    if (overrideJson === lastJsonValue.current) return;
    lastJsonValue.current = overrideJson;
    setJsonDraft(overrideJson);
    setJsonError(null);
    onValidationChange?.(null);
  }, [overrideJson, onValidationChange]);

  function changeJson(text: string) {
    setJsonDraft(text);
    const parsed = parseRequestOverrides(text);
    const error = parsed.error ? "Enter a valid JSON object." : null;
    setJsonError(error);
    onValidationChange?.(error);
    if (error) return;
    dispatch(
      replaceOverrides({ conversationId, changes: parsed.overrides ?? {} }),
    );
    lastJsonValue.current = JSON.stringify(
      selectSettingsOverridesForApi(conversationId)(store.getState()) ?? {},
      null,
      2,
    );
  }

  // baseSettings/overrides are Partial<LLMParams> (fixed named fields, no
  // index signature); the settings catalogue below is genuinely
  // catalogue-key-driven (dynamic string keys), so a loose map view is the
  // documented, deliberate contract for this whole file.
  // MATRX-EXCEPTION: settings-catalogue keys are dynamic; LLMParams has no index signature.
  const base = (overrideState?.baseSettings ?? {}) as Record<string, unknown>;
  // The wire selector is the canonical local delta. A stored draft value may
  // equal a refreshed inherited baseline: display it as inherited without
  // deleting its draft intent (it may differ again after a baseline change).
  const wireOverrides = parseRequestOverrides(overrideJson).overrides ?? {};
  const overrides = Object.fromEntries(
    Object.entries(overrideState?.overrides ?? {}).filter(
      ([key]) => key in wireOverrides,
    ),
  );
  const removals = overrideState?.removals ?? [];
  const nullDefaults =
    nullOverrideDefaults === undefined
      ? undefined
      : Object.fromEntries(Object.entries(nullOverrideDefaults));
  const effectiveModel = removals.includes("model")
    ? nullDefaults?.model
    : (overrides.model ?? base.model);
  const effectiveModelId =
    typeof effectiveModel === "string" ? effectiveModel : "";

  // The rows need the model's FULL controls. The registry may hold only the
  // lightweight "options" record (no controls), and a picker-triggered
  // one-shot fetch can be skipped by the registry's global isLoading guard.
  // Ensure the full record is loaded here and retry once any in-flight fetch
  // settles — the fetch thunk is cached/no-ops when already full.
  const isFull = useAppSelector((s) =>
    selectModelFullyLoaded(s, effectiveModelId),
  );
  const modelDetailError = useAppSelector((s) =>
    selectModelDetailError(s, effectiveModelId),
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
  for (const key of removals) {
    if (nullDefaults?.[key] != null) merged[key] = nullDefaults[key];
    else delete merged[key];
  }

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
    (key) => isFull && key !== "model" && !controlsMap?.[key],
  );

  const overriddenCount = Object.keys(wireOverrides).length;

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
  const rowsLoading =
    groups.length === 0 && !!effectiveModelId && !isFull && !modelDetailError;

  return (
    <div className={structured ? "min-w-0" : "border-t border-border"}>
      {modelDetailError ? (
        <div role="alert" className="flex items-center gap-2 px-3 py-2 text-sm">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          <span>Model controls unavailable</span>
          <FieldHelp label="Model controls unavailable">
            {modelDetailError}
          </FieldHelp>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              dispatch(retryModelDetail(effectiveModelId));
              void dispatch(fetchModelById(effectiveModelId));
            }}
          >
            Retry
          </Button>
        </div>
      ) : null}
      <div className="flex w-full items-center justify-between px-3 pb-1 pt-2">
        <span
          className={
            structured
              ? "text-sm font-semibold text-foreground"
              : "text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
          }
        >
          {structured ? "Model parameter overrides" : w.heading}
        </span>
        <span className="text-xs text-foreground">
          Overrides: {overriddenCount}
        </span>
      </div>

      <Tabs value={editorTab} onValueChange={setEditorTab}>
        {structured && (
          <TabsList className="mx-3 mb-2" aria-label="Model override editor">
            <TabsTrigger value="controls">Controls</TabsTrigger>
            <TabsTrigger value="advanced">Advanced</TabsTrigger>
          </TabsList>
        )}
        <TabsContent value="controls" className="mt-0">
          <div className="flex flex-col gap-2.5 px-3 pb-3">
            {structured && (
              <OverrideRows structured label="Model">
                <ConfigurationTableRow
                  columns={OVERRIDE_COLUMNS}
                  cells={{
                    setting: <span className="font-semibold">Model</span>,
                    source:
                      removals.includes("model") || "model" in overrides
                        ? overrideSource
                        : (inheritedSources?.model ??
                          (base.model != null
                            ? baselineSourceLabel
                            : "Model default")),
                    state: removals.includes("model")
                      ? nullDefaults
                        ? baselineDefaultLabel
                        : "Removed"
                      : "model" in overrides
                        ? "Overridden"
                        : "Inherited",
                    value: (
                      <ModelListDropdown
                        value={effectiveModelId || null}
                        onValueChange={(model) =>
                          handleChange("model", null, model)
                        }
                        onClear={() =>
                          dispatch(
                            resetOverride({ conversationId, key: "model" }),
                          )
                        }
                        emptyOptionLabel={
                          w.modelEmptyChoiceLabel ??
                          DEFAULT_MODEL_EMPTY_CHOICE_LABEL
                        }
                        placeholder={
                          w.modelEmptyChoiceLabel ??
                          DEFAULT_MODEL_EMPTY_CHOICE_LABEL
                        }
                        inputModalities={[]}
                        outputModalities={["text"]}
                        disabled={disabled}
                      />
                    ),
                  }}
                />
              </OverrideRows>
            )}
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
                      disabled={disabled}
                      onClick={() =>
                        dispatch(resetOverride({ conversationId, key }))
                      }
                      title="Reset override"
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
                {structured
                  ? effectiveModelId
                    ? "Adjustable parameters: None"
                    : "Model: Unresolved"
                  : effectiveModelId
                    ? "This model doesn't declare adjustable settings."
                    : w.noModelNote}
              </p>
            ) : (
              groups.map((group) => (
                <div key={group.id} className="flex flex-col gap-2">
                  {group.label && (
                    <p className="pt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                      {group.label}
                    </p>
                  )}
                  <OverrideRows
                    structured={structured}
                    label={group.label || "Model parameters"}
                  >
                    {group.rows.map((row) => (
                      <OverrideRow
                        key={row.key}
                        row={row}
                        structured={structured}
                        disabled={disabled}
                        overrideSource={overrideSource}
                        removedLabel={
                          nullDefaults ? baselineDefaultLabel : "Removed"
                        }
                        inheritedSource={
                          inheritedSources?.[row.key] ??
                          (base[row.key] != null
                            ? baselineSourceLabel
                            : "Model default")
                        }
                        value={
                          row.key in overrides
                            ? overrides[row.key]
                            : removals.includes(row.key)
                              ? nullDefaults
                                ? (nullDefaults[row.key] ??
                                  row.control?.default)
                                : undefined
                              : effectiveDefault(row.key, row.control)
                        }
                        isOverridden={row.key in overrides}
                        isRemoved={removals.includes(row.key)}
                        onChange={(v) => handleChange(row.key, row.control, v)}
                        onReset={() =>
                          dispatch(
                            resetOverride({ conversationId, key: row.key }),
                          )
                        }
                      />
                    ))}
                  </OverrideRows>
                </div>
              ))
            )}

            {structured ? (
              <FieldHelp label="Override scope">{w.scopeNote}</FieldHelp>
            ) : (
              <p className="text-[10px] leading-snug text-muted-foreground">
                {w.scopeNote}
              </p>
            )}
          </div>
        </TabsContent>
        {structured && (
          <TabsContent value="advanced" className="mt-0 space-y-2 px-3 pb-3">
            <div className="flex items-center gap-2">
              <Label
                htmlFor={`${conversationId}-override-json`}
                className="font-semibold"
              >
                Overrides JSON
              </Label>
              <FieldHelp label="Overrides JSON">
                Edits the same model overrides as Controls. Omit a key to
                inherit; use null to remove a setting.
              </FieldHelp>
            </div>
            <Textarea
              id={`${conversationId}-override-json`}
              aria-label="Model overrides JSON"
              aria-invalid={Boolean(jsonError)}
              aria-describedby={
                jsonError ? `${conversationId}-override-error` : undefined
              }
              value={jsonDraft}
              onChange={(event) => changeJson(event.target.value)}
              disabled={disabled}
              spellCheck={false}
              className="min-h-64 font-mono text-sm"
            />
          </TabsContent>
        )}
      </Tabs>
      {jsonError && (
        <p
          id={`${conversationId}-override-error`}
          role="alert"
          className="px-3 pb-3 text-sm text-destructive"
        >
          {jsonError}
        </p>
      )}
    </div>
  );
}
function OverrideRows({
  structured,
  label,
  children,
}: {
  structured: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return structured ? (
    <ConfigurationTable label={label} columns={OVERRIDE_COLUMNS}>
      {children}
    </ConfigurationTable>
  ) : (
    <>{children}</>
  );
}

function OverrideRow({
  structured = false,
  disabled = false,
  inheritedSource,
  overrideSource = "Binding",
  removedLabel = "Removed",
  row,
  value,
  isOverridden,
  isRemoved,
  onChange,
  onReset,
}: {
  structured?: boolean;
  disabled?: boolean;
  inheritedSource?: string;
  overrideSource?: string;
  removedLabel?: string;
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
  if (structured)
    return (
      <ConfigurationTableRow
        columns={OVERRIDE_COLUMNS}
        cells={{
          setting: (
            <label
              htmlFor={`run-override-${row.key}`}
              className="font-semibold"
            >
              {row.label}
            </label>
          ),
          source:
            isRemoved || isOverridden
              ? overrideSource
              : (inheritedSource ?? "Unknown"),
          state: isRemoved
            ? removedLabel
            : isOverridden
              ? "Overridden"
              : "Inherited",
          value: (
            <div className="flex min-w-0 items-center gap-2">
              <div className="min-w-0 flex-1">
                <SettingControlInput
                  explicitState
                  settingKey={row.key}
                  control={row.control}
                  value={value}
                  onChange={onChange}
                  disabled={disabled || isRemoved}
                  id={`run-override-${row.key}`}
                />
              </div>
              <button
                type="button"
                onClick={onReset}
                disabled={disabled || !touched}
                aria-label={`Reset ${row.label}`}
                className="shrink-0 rounded p-2 text-muted-foreground disabled:opacity-40"
              >
                <RotateCcw className="size-3.5" />
              </button>
            </div>
          ),
        }}
      />
    );
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
            {removedLabel}
          </span>
        )}
      </Label>
      <div className="min-w-0 flex-1">
        <SettingControlInput
          settingKey={row.key}
          control={row.control}
          value={value}
          onChange={onChange}
          disabled={disabled || isRemoved}
          id={`run-override-${row.key}`}
        />
      </div>
      <button
        type="button"
        onClick={onReset}
        disabled={disabled}
        title="Reset override"
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
