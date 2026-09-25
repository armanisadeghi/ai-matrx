"use client";

import React, { useState } from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ContextItemPicker,
  type ContextItemSelection,
  type ContextItemSource,
} from "@/features/scope-system/components/ContextItemPicker";
import type {
  ContextItemBinding,
  VariableBinding,
} from "@/features/agents/types/agent-definition.types";
import {
  contextItemBindingOf,
  isCustomDataBinding,
} from "@/features/agents/utils/variable-binding";
import { CustomDataRecordsScope } from "./custom-data/CustomDataRecordsScope";
import { CustomDataBindingPicker } from "./custom-data/CustomDataBindingPicker";
import { emptyCustomDataBinding } from "./custom-data/customDataBinding";

interface ContextItemBindingEditorProps {
  binding: VariableBinding | undefined;
  onChange: (binding: VariableBinding | undefined) => void;
  readonly?: boolean;
  /** The variable being bound — named in the custom-data preview. */
  variableName?: string;
}

const ON_MISSING_OPTIONS: {
  value: NonNullable<ContextItemBinding["onMissing"]>;
  label: string;
  hint: string;
}[] = [
  { value: "empty", label: "Empty", hint: "Fill with an empty value" },
  {
    value: "skip",
    label: "Skip",
    hint: "Leave the variable's default / caller value",
  },
  {
    value: "error",
    label: "Error",
    hint: "Refuse to run if nothing supplies it",
  },
];

/**
 * Bind a variable to a CONTEXT ITEM — either a SYSTEM item (a platform truth
 * that resolves for every user with no scope selection) or a SCOPE item (the
 * active scope of the chosen type supplies the value). Both are collision-proof
 * by the item's UUID, and the variable inherits the item's input component.
 *
 * Or — the third source, "From my data" — to the author's OWN custom data
 * (`kind: "merge_field"`, `source: "record"`): a table, one record, or one
 * field of a record, resolved by the server every turn and shown locked.
 * There is never a requirement for context — when none is set, the variable
 * just renders as an ordinary input. Resolution is server-authoritative.
 */
export function ContextItemBindingEditor({
  binding,
  onChange,
  readonly,
  variableName,
}: ContextItemBindingEditorProps) {
  // Org and source are picker-only concerns (the binding stores the item's
  // id/type/key). A stored binding with no scopeTypeId IS a System binding.
  //
  // THE ORG IS NOT SEEDED FROM THE ACTIVE ORGANIZATION. Seeding it that way
  // told the picker "the org is X" for every reopened binding, so a binding
  // whose scope type lives in another org showed the wrong organization, a
  // scope type that resolved to nothing, and a frozen item picker (PNI-000
  // re-verify 1). Empty means "not chosen here": the picker derives the org
  // from the stored scope type and falls back to the active org only when the
  // binding has none.
  const [orgId, setOrgId] = useState<string>("");
  const [source, setSource] = useState<ContextItemSource | undefined>(
    undefined,
  );
  // Binding "enabled" is the presence of the object — item ids are empty until the user picks one.
  const bound = binding != null;
  const customData = isCustomDataBinding(binding) ? binding : undefined;
  const contextBinding = contextItemBindingOf(binding);

  const toggleBound = (on: boolean) => {
    onChange(
      on
        ? {
            contextItemId: "",
            scopeTypeId: "",
            itemKey: "",
            onMissing: "empty",
          }
        : undefined,
    );
  };

  const handlePick = (sel: ContextItemSelection) => {
    setOrgId(sel.orgId);
    setSource(sel.source);
    onChange({
      contextItemId: sel.contextItemId,
      // A System item has no scope type — the empty string is what marks the
      // binding as System-sourced on the way back in.
      scopeTypeId: sel.scopeTypeId,
      itemKey: sel.itemKey,
      onMissing: contextBinding?.onMissing ?? "empty",
    });
  };

  return (
    <div className="space-y-2 p-3 bg-muted/50 rounded-lg border border-border">
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-sm font-medium cursor-pointer">
            Fill automatically
          </Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            Auto-fills from your own data, a platform truth, or the active
            scope. Optional — left off, it&rsquo;s just a normal input.
          </p>
        </div>
        <Switch
          checked={bound}
          onCheckedChange={toggleBound}
          disabled={readonly}
        />
      </div>

      {bound && (
        <div className="space-y-2 pt-1.5 border-t border-border">
          <ContextItemPicker
            value={{
              source,
              orgId,
              scopeTypeId: contextBinding?.scopeTypeId,
              contextItemId: contextBinding?.contextItemId,
            }}
            onChange={handlePick}
            readonly={readonly}
            customData={{
              active: customData !== undefined,
              onSelect: () => onChange(emptyCustomDataBinding()),
              children: customData ? (
                <CustomDataRecordsScope>
                  <CustomDataBindingPicker
                    binding={customData}
                    onChange={onChange}
                    readonly={readonly}
                    variableName={variableName}
                  />
                </CustomDataRecordsScope>
              ) : null,
            }}
          />

          {contextBinding && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                When nothing provides it
              </Label>
              <Select
                value={contextBinding.onMissing ?? "empty"}
                onValueChange={(v) => {
                  const choice = ON_MISSING_OPTIONS.find((o) => o.value === v);
                  if (!choice) return;
                  onChange({ ...contextBinding, onMissing: choice.value });
                }}
                disabled={readonly}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ON_MISSING_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      <span>{o.label}</span>
                      <span className="ml-2 text-xs text-muted-foreground hidden sm:inline">
                        — {o.hint}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
