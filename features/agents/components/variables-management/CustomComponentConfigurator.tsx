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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  StructuredListBinding,
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
import { StructuredListBindingEditor } from "./StructuredListBindingEditor";
import { hasRandomOptionSource } from "@/features/agents/utils/auto-assignment";
import {
  normalizeFileResourceId,
  useFileResourceFamily,
} from "@/features/files";

interface CustomComponentConfiguratorProps {
  /** Current custom component config (undefined = bare textarea). */
  value: VariableCustomComponent | undefined;
  /** Emits the rebuilt config (or undefined when it normalizes back to a bare textarea). */
  onChange: (next: VariableCustomComponent | undefined) => void;
  /** Current saved file value, used only to discover its database family inventory. */
  resourceValue?: unknown;
  readonly?: boolean;
  /** Agent-variable-only capability; context-item components do not own assignment policy. */
  allowAutomaticAssignment?: boolean;
}

export function CustomComponentConfigurator({
  value,
  onChange,
  resourceValue,
  readonly,
  allowAutomaticAssignment = false,
}: CustomComponentConfiguratorProps) {
  const componentType: VariableComponentType = value?.type ?? "textarea";
  const meta = getComponentTypeMeta(componentType);
  const effective = extractEffectiveValues(value);
  const isPicklistBound = !!effective.structuredList?.listId;
  const isResourceComponent = ["document", "image", "audio", "video"].includes(
    componentType,
  );
  const promoted = effective.resourceContext?.promote?.[0];
  const resourceId = normalizeFileResourceId(resourceValue);
  const family = useFileResourceFamily(isResourceComponent ? resourceId : null);
  const promotableRepresentations = family.data?.representations.filter(
    (item) => item.promotable,
  );

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
  const handleStructuredListChange = (
    structuredList: StructuredListBinding | undefined,
  ) => update({ structuredList });
  const handleRandomAssignmentChange = (randomAssignment: boolean) =>
    update({ randomAssignment });
  const handlePromotionRepresentationChange = (representation: string) =>
    update({
      resourceContext: {
        ...effective.resourceContext,
        promote:
          representation === "none"
            ? []
            : [
                {
                  representation,
                  max_chars: promoted?.max_chars ?? 5000,
                },
              ],
      },
    });
  const handlePromotionCharsChange = (maxChars: number) =>
    update({
      resourceContext: {
        ...effective.resourceContext,
        promote: promoted
          ? [{ ...promoted, max_chars: Math.max(1, Math.min(10000, maxChars)) }]
          : [],
      },
    });
  const handleExclusionsChange = (raw: string) =>
    update({
      resourceContext: {
        ...effective.resourceContext,
        exclude: Array.from(
          new Set(
            raw
              .split(",")
              .map((item) => item.trim().toLowerCase())
              .filter(Boolean),
          ),
        ),
      },
    });
  const handleRepresentationEnabled = (representation: string, enabled: boolean) => {
    const exclusions = new Set(effective.resourceContext?.exclude ?? []);
    if (enabled) exclusions.delete(representation);
    else exclusions.add(representation);
    update({
      resourceContext: {
        ...effective.resourceContext,
        exclude: Array.from(exclusions),
      },
    });
  };

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
      <StructuredListBindingEditor
        binding={effective.structuredList}
        onChange={handleStructuredListChange}
        allowOther={effective.allowOther}
        onAllowOtherChange={handleAllowOtherChange}
        readonly={readonly}
      />

      {/* ── Toggle / light-switch labels ─────────────────────────────────── */}
      {meta.requiresToggleValues && (
        <div className="space-y-2 border-t border-border/60 pt-3">
          <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Toggle Labels
          </Label>
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
        <div className="space-y-2 border-t border-border/60 pt-3">
          <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Options
          </Label>
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

      {allowAutomaticAssignment && hasRandomOptionSource(value) && (
        <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-3">
          <div className="min-w-0">
            <Label className="text-sm cursor-pointer">
              Allow random assignment
            </Label>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Lets callers ask the server to choose one option securely at run time.
            </p>
          </div>
          <Switch
            checked={effective.randomAssignment}
            onCheckedChange={handleRandomAssignmentChange}
            disabled={readonly}
          />
        </div>
      )}

      {isResourceComponent && (
        <div className="space-y-3 border-t border-border/60 pt-3">
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Agent Context
            </Label>
            <p className="mt-1 text-xs text-muted-foreground">
              By default the file ID exposes every existing enrichment on demand.
              These settings only change presentation; they never generate RAG or
              derivatives.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                Promote inline
              </Label>
              <Select
                value={promoted?.representation ?? "none"}
                onValueChange={handlePromotionRepresentationChange}
                disabled={readonly}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nothing (on demand)</SelectItem>
                  {(promotableRepresentations ?? []).map((item) => (
                    <SelectItem key={item.key} value={item.key}>
                      {item.label} ({item.count})
                    </SelectItem>
                  ))}
                  {promoted &&
                  !promotableRepresentations?.some(
                    (item) => item.key === promoted.representation,
                  ) ? (
                    <SelectItem value={promoted.representation}>
                      {promoted.representation} (configured)
                    </SelectItem>
                  ) : null}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                Maximum characters
              </Label>
              <Input
                type="number"
                min={1}
                max={10000}
                value={promoted?.max_chars ?? 5000}
                onChange={(event) =>
                  handlePromotionCharsChange(Number(event.target.value) || 5000)
                }
                disabled={readonly || !promoted}
              />
            </div>
          </div>
          {family.loading ? (
            <p className="text-xs text-muted-foreground">
              Loading the selected file&apos;s resource family from Supabase…
            </p>
          ) : null}
          {family.error ? (
            <p className="text-xs text-destructive">{family.error}</p>
          ) : null}
          {family.data ? (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">
                Available family resources
              </Label>
              <div className="grid gap-2 rounded-md border border-border/60 p-2 sm:grid-cols-2">
                {family.data.representations.map((item) => {
                  const enabled = !(effective.resourceContext?.exclude ?? []).includes(
                    item.key,
                  );
                  return (
                    <label
                      key={item.key}
                      className="flex items-start gap-2 text-xs"
                    >
                      <Checkbox
                        checked={enabled}
                        onCheckedChange={(checked) =>
                          handleRepresentationEnabled(item.key, checked === true)
                        }
                        disabled={readonly}
                      />
                      <span className="min-w-0">
                        <span className="block font-medium">{item.label}</span>
                        <span className="text-muted-foreground">
                          {item.count} · {item.category} · {item.fetch_tool}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Checked resources remain available on demand. Uncheck only to
                suppress one for this variable.
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                Suppress (comma-separated fallback)
              </Label>
              <Input
                value={(effective.resourceContext?.exclude ?? []).join(", ")}
                onChange={(event) => handleExclusionsChange(event.target.value)}
                placeholder="Select a default file to load its family"
                disabled={readonly}
              />
            </div>
          )}
        </div>
      )}

      {/* ── Number / slider settings ─────────────────────────────────────── */}
      {(meta.requiresMinMax || componentType === "number") && (
        <div className="space-y-2 border-t border-border/60 pt-3">
          <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Number Settings
          </Label>
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
