"use client";

/**
 * CustomComponentConfigurator
 *
 * The canonical, Redux-free editor for a `VariableCustomComponent` — the same
 * component-type + options + picklist-binding + number/toggle config used by
 * agent variables in the Agent Builder. It operates purely on a
 * `value`/`onChange` pair so it can be embedded anywhere a custom component is
 * authored (Agent Builder variables, scope Context Items, …).
 *
 * It owns ONLY the component configuration. The surrounding concerns — variable
 * name, help text, required flag, and the agent's per-variable default value —
 * stay with the consumer, because they differ per surface (a Context Item has
 * no single default value; its value is per-scope).
 */

import React from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  PicklistBinding,
  VariableComponentType,
  VariableCustomComponent,
} from "@/features/agents/types/agent-definition.types";
import {
  getComponentTypeOptions,
  getComponentTypeMeta,
} from "@/features/agents/components/inputs/variable-input-variations/variable-input-options";
import {
  buildCustomComponent,
  extractEffectiveValues,
  type BuildCustomComponentInput,
} from "@/features/agents/utils/variable-customcomponent";
import { OptionsEditor } from "./OptionsEditor";
import { PicklistBindingEditor } from "./PicklistBindingEditor";

interface CustomComponentConfiguratorProps {
  /** Current custom component config (undefined = bare textarea). */
  value: VariableCustomComponent | undefined;
  /** Emits the rebuilt config (or undefined when it normalizes back to a bare textarea). */
  onChange: (next: VariableCustomComponent | undefined) => void;
  readonly?: boolean;
}

export function CustomComponentConfigurator({
  value,
  onChange,
  readonly,
}: CustomComponentConfiguratorProps) {
  const componentType: VariableComponentType = value?.type ?? "textarea";
  const meta = getComponentTypeMeta(componentType);
  const effective = extractEffectiveValues(value);
  const isPicklistBound = !!effective.picklist?.listId;

  const update = (fields: Partial<BuildCustomComponentInput>) => {
    const current = extractEffectiveValues(value);
    onChange(buildCustomComponent({ ...current, ...fields }));
  };

  const handleTypeChange = (nextType: VariableComponentType) =>
    update({ type: nextType });
  const handleOptionsChange = (options: string[]) => update({ options });
  const handleAllowOtherChange = (allowOther: boolean) => update({ allowOther });
  const handleToggleOffChange = (off: string) =>
    update({ toggleValues: [off, effective.toggleValues[1]] });
  const handleToggleOnChange = (on: string) =>
    update({ toggleValues: [effective.toggleValues[0], on] });
  const handleMinChange = (min: number | undefined) => update({ min });
  const handleMaxChange = (max: number | undefined) => update({ max });
  const handleStepChange = (step: number) => update({ step });
  const handlePicklistChange = (picklist: PicklistBinding | undefined) =>
    update({ picklist });

  return (
    <div className="space-y-3">
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
            {getComponentTypeOptions().map(({ value: v, label, description }) => (
              <SelectItem key={v} value={v}>
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
        allowOther={effective.allowOther}
        onAllowOtherChange={handleAllowOtherChange}
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

      {/* ── Options — static list editor, replaced by the picklist binding when bound ── */}
      {!isPicklistBound && (
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
                onChange={(e) => handleStepChange(parseFloat(e.target.value) || 1)}
                placeholder="1"
                disabled={readonly}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
