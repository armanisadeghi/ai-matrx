"use client";

/**
 * AgentVariableEditor
 *
 * Redux-only editor for a single variable definition. The variable MUST
 * already exist in the store — the caller (Panel/Modal/Manager) is
 * responsible for creating it before mounting this editor.
 *
 * Every field change dispatches directly to Redux. No controlled-mode,
 * no local mirror of the variable's state, no drafting.
 */

import React, { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  sanitizeVariableName,
  shouldShowSanitizationPreview,
  variableValueToDisplay,
} from "@/features/agents/utils/variable-utils";
import type {
  VariableCustomComponent,
  VariableComponentType,
  VariableDefinition,
} from "@/features/agents/types/agent-definition.types";
import {
  getComponentTypeOptions,
  getComponentTypeMeta,
} from "@/features/agents/components/inputs/variable-input-variations/variable-input-options";
import { VariableInputComponent } from "@/features/agents/components/inputs/input-components/VariableInputComponent";
import { useAppSelector, useAppDispatch } from "@/lib/redux/hooks";
import { selectAgentVariableDefinitions } from "@/features/agents/redux/agent-definition/selectors";
import { setAgentVariableDefinitions } from "@/features/agents/redux/agent-definition/slice";
import {
  buildCustomComponent,
  extractEffectiveValues,
  type BuildCustomComponentInput,
} from "@/features/agents/utils/variable-customcomponent";
import { OptionsEditor } from "./OptionsEditor";
import { PicklistBindingEditor } from "./PicklistBindingEditor";
import type { PicklistBinding } from "@/features/agents/types/agent-definition.types";

// ─── Props ───────────────────────────────────────────────────────────────────

interface AgentVariableEditorProps {
  agentId: string;
  /** Current saved name of the variable. Changes when user renames. */
  variableName: string;
  /**
   * Names of OTHER variables (not this one). Used for duplicate detection.
   * Caller excludes the current variable's name.
   */
  existingNames?: string[];
  /**
   * Called after a successful rename. Parent should update whatever state
   * it uses to track the current selection (e.g. `variableName` it passes in).
   */
  onRenamed?: (newName: string) => void;
  readonly?: boolean;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function AgentVariableEditor({
  agentId,
  variableName,
  existingNames = [],
  onRenamed,
  readonly,
}: AgentVariableEditorProps) {
  const dispatch = useAppDispatch();
  const rawVariables = useAppSelector((state) =>
    selectAgentVariableDefinitions(state, agentId),
  );
  const variables: VariableDefinition[] = rawVariables ?? [];
  const variable = variables.find((v) => v.name === variableName);

  // Name buffer — local draft for editing; resets when the variable changes.
  const [nameDraft, setNameDraft] = useState(variableName);
  useEffect(() => {
    setNameDraft(variableName);
  }, [variableName]);

  if (!variable) {
    return (
      <p className="text-sm text-muted-foreground italic">
        Variable not found.
      </p>
    );
  }

  const cc = variable.customComponent;
  const componentType: VariableComponentType = cc?.type ?? "textarea";
  const meta = getComponentTypeMeta(componentType);
  const effective = extractEffectiveValues(cc);

  const sanitizedDraft = nameDraft.trim()
    ? sanitizeVariableName(nameDraft)
    : "";
  const showSanitizationPreview = shouldShowSanitizationPreview(nameDraft);
  const isDuplicate =
    !!sanitizedDraft &&
    sanitizedDraft !== variableName &&
    existingNames.includes(sanitizedDraft);

  // ── Dispatch helpers ──────────────────────────────────────────────────────

  const dispatchVariables = (next: VariableDefinition[]) => {
    dispatch(
      setAgentVariableDefinitions({
        id: agentId,
        variableDefinitions: next,
      }),
    );
  };

  const updateVariable = (patch: Partial<VariableDefinition>) => {
    dispatchVariables(
      variables.map((v) => (v.name === variableName ? { ...v, ...patch } : v)),
    );
  };

  const updateCustomComponent = (
    fields: Partial<BuildCustomComponentInput>,
  ) => {
    const current = extractEffectiveValues(variable.customComponent);
    const next = buildCustomComponent({ ...current, ...fields });
    updateVariable({ customComponent: next });
  };

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleNameBlur = () => {
    const sanitized = nameDraft.trim() ? sanitizeVariableName(nameDraft) : "";
    if (!sanitized) {
      setNameDraft(variableName);
      return;
    }
    if (sanitized === variableName) {
      setNameDraft(variableName);
      return;
    }
    if (existingNames.includes(sanitized)) return; // keep draft; dup border shows
    dispatchVariables(
      variables.map((v) =>
        v.name === variableName ? { ...v, name: sanitized } : v,
      ),
    );
    onRenamed?.(sanitized);
  };

  const handleDefaultValueChange = (v: unknown) =>
    updateVariable({ defaultValue: v });

  const handleRequiredChange = (v: boolean) =>
    updateVariable({ required: v || undefined });

  const handleHelpTextChange = (v: string) =>
    updateVariable({ helpText: v || undefined });

  const handleTypeChange = (nextType: VariableComponentType) =>
    updateCustomComponent({ type: nextType });

  const handleOptionsChange = (options: string[]) =>
    updateCustomComponent({ options });

  const handleAllowOtherChange = (allowOther: boolean) =>
    updateCustomComponent({ allowOther });

  const handleToggleOffChange = (off: string) => {
    const [, on] = effective.toggleValues;
    updateCustomComponent({ toggleValues: [off, on] });
  };

  const handleToggleOnChange = (on: string) => {
    const [off] = effective.toggleValues;
    updateCustomComponent({ toggleValues: [off, on] });
  };

  const handleMinChange = (min: number | undefined) =>
    updateCustomComponent({ min });

  const handleMaxChange = (max: number | undefined) =>
    updateCustomComponent({ max });

  const handleStepChange = (step: number) => updateCustomComponent({ step });

  const handlePicklistChange = (picklist: PicklistBinding | undefined) =>
    updateCustomComponent({ picklist });

  const isPicklistBound = !!effective.picklist?.listId;

  // ── Preview custom-component (for the default-value input at the bottom) ──
  const previewCc: VariableCustomComponent | undefined = buildCustomComponent({
    type: componentType,
    options: effective.options,
    allowOther: effective.allowOther,
    toggleValues: effective.toggleValues,
    min: effective.min,
    max: effective.max,
    step: effective.step,
    picklist: effective.picklist,
  });

  const defaultValueStr = String(variable.defaultValue ?? "");

  return (
    <div className="space-y-3">
      {/* ── Name ─────────────────────────────────────────────────────────── */}
      <div className="space-y-1.5">
        <Label className="text-sm font-medium">Name</Label>
        <Input
          placeholder="e.g. city_name"
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          onBlur={handleNameBlur}
          disabled={readonly}
          className={isDuplicate ? "border-destructive" : ""}
          style={{ fontSize: "16px" }}
        />
        {showSanitizationPreview && !readonly && (
          <div className="px-3 py-2 text-xs bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <span className="text-blue-600 dark:text-blue-400">
              Will be saved as:{" "}
            </span>
            <span className="font-mono text-blue-800 dark:text-blue-300">
              {sanitizedDraft}
            </span>
          </div>
        )}
        {isDuplicate && (
          <p className="text-xs text-destructive">
            A variable with this name already exists.
          </p>
        )}
        {!isDuplicate &&
          sanitizedDraft &&
          sanitizedDraft !== variableName &&
          !readonly && (
            <p className="text-xs text-muted-foreground">
              Rename will apply when you click away.
            </p>
          )}
      </div>

      {/* ── Help Text ────────────────────────────────────────────────────── */}
      <div className="space-y-1.5">
        <Label className="text-sm font-medium">Help Text</Label>
        <Textarea
          autoGrow
          placeholder="Optional — shown to users as a hint"
          value={variable.helpText ?? ""}
          onChange={(e) => handleHelpTextChange(e.target.value)}
          disabled={readonly}
          minHeight={48}
          maxHeight={160}
        />
      </div>

      {/* ── Required ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-3 py-2.5 bg-muted/50 rounded-lg border border-border">
        <Label className="text-sm font-medium cursor-pointer">Required</Label>
        <Switch
          checked={!!variable.required}
          onCheckedChange={handleRequiredChange}
          disabled={readonly}
        />
      </div>

      {/* ── Input Type ───────────────────────────────────────────────────── */}
      <div className="space-y-1.5">
        <Label className="text-sm font-medium">Input Type</Label>
        <Select
          value={componentType}
          onValueChange={(v) => handleTypeChange(v as VariableComponentType)}
          disabled={readonly}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {getComponentTypeOptions().map(({ value, label, description }) => (
              <SelectItem key={value} value={value}>
                <span>{label}</span>
                <span className="ml-2 text-xs text-muted-foreground hidden sm:inline">
                  — {description}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* ── Picklist binding ─────────────────────────────────────────────── */}
      <PicklistBindingEditor
        binding={effective.picklist}
        onChange={handlePicklistChange}
        readonly={readonly}
      />

      {/* ── Toggle / light-switch labels ─────────────────────────────────── */}
      {meta.requiresToggleValues && (
        <div className="space-y-2 p-3 bg-muted/50 rounded-lg border border-border">
          <Label className="text-sm font-medium">Toggle Labels</Label>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">
                Off
              </Label>
              <Input
                value={effective.toggleValues[0]}
                onChange={(e) => handleToggleOffChange(e.target.value)}
                placeholder="No"
                disabled={readonly}
                style={{ fontSize: "16px" }}
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">
                On
              </Label>
              <Input
                value={effective.toggleValues[1]}
                onChange={(e) => handleToggleOnChange(e.target.value)}
                placeholder="Yes"
                disabled={readonly}
                style={{ fontSize: "16px" }}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Options — static list, hidden when bound to a picklist ───────── */}
      {isPicklistBound ? (
        <div className="space-y-1 p-3 bg-muted/30 rounded-lg border border-border">
          <Label className="text-sm font-medium">Options</Label>
          <p className="text-xs text-muted-foreground">
            Options come from the bound picklist.
          </p>
          {meta.requiresOptions && (
            <div className="flex items-center justify-between pt-1.5 border-t border-border">
              <Label className="text-sm cursor-pointer">
                Allow &ldquo;Other&rdquo; option
              </Label>
              <Switch
                checked={effective.allowOther}
                onCheckedChange={handleAllowOtherChange}
                disabled={readonly}
              />
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2 p-3 bg-muted/50 rounded-lg border border-border">
          <Label className="text-sm font-medium">Options</Label>
          <OptionsEditor
            options={effective.options}
            onChange={handleOptionsChange}
            readonly={readonly}
            unusedNote={
              meta.requiresOptions
                ? undefined
                : `Not used by ${meta.label} — saved in case you switch to a list/dropdown input.`
            }
          />
          {meta.requiresOptions && (
            <div className="flex items-center justify-between pt-1.5 border-t border-border">
              <Label className="text-sm cursor-pointer">
                Allow &ldquo;Other&rdquo; option
              </Label>
              <Switch
                checked={effective.allowOther}
                onCheckedChange={handleAllowOtherChange}
                disabled={readonly}
              />
            </div>
          )}
        </div>
      )}

      {/* ── Number / slider settings ─────────────────────────────────────── */}
      {(meta.requiresMinMax || componentType === "number") && (
        <div className="space-y-2 p-3 bg-muted/50 rounded-lg border border-border">
          <Label className="text-sm font-medium">Number Settings</Label>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">
                Min
              </Label>
              <Input
                type="number"
                value={effective.min ?? ""}
                onChange={(e) =>
                  handleMinChange(
                    e.target.value ? parseFloat(e.target.value) : undefined,
                  )
                }
                placeholder="None"
                disabled={readonly}
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">
                Max
              </Label>
              <Input
                type="number"
                value={effective.max ?? ""}
                onChange={(e) =>
                  handleMaxChange(
                    e.target.value ? parseFloat(e.target.value) : undefined,
                  )
                }
                placeholder="None"
                disabled={readonly}
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">
                Step
              </Label>
              <Input
                type="number"
                value={effective.step}
                onChange={(e) =>
                  handleStepChange(parseFloat(e.target.value) || 1)
                }
                placeholder="1"
                disabled={readonly}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Default Value ─────────────────────────────────────────────── */}
      <div className="space-y-1.5 p-3 bg-muted/30 rounded-lg border border-border">
        <Label className="text-sm font-medium">Default Value</Label>
        <p className="text-xs text-muted-foreground">
          Pre-fills this variable at run time. Leave blank for no default.
        </p>
        {readonly ? (
          <p className="text-sm text-foreground">
            {variableValueToDisplay(variable.defaultValue) || (
              <span className="text-muted-foreground italic">None</span>
            )}
          </p>
        ) : componentType === "textarea" && !isPicklistBound ? (
          <Textarea
            autoGrow
            value={defaultValueStr}
            onChange={(e) => handleDefaultValueChange(e.target.value)}
            placeholder="Leave empty or type a default…"
            minHeight={48}
            maxHeight={160}
          />
        ) : (
          <VariableInputComponent
            value={isPicklistBound ? variable.defaultValue : defaultValueStr}
            onChange={handleDefaultValueChange}
            variableName={variableName || "variable"}
            customComponent={previewCc}
            hideLabel
            compact
          />
        )}
      </div>
    </div>
  );
}
