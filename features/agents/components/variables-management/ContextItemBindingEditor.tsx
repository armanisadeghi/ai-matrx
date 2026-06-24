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
import { useAppSelector } from "@/lib/redux/hooks";
import { selectActiveOrganizationId } from "@/features/scopes/redux/selectors/active-context";
import {
  ContextItemPicker,
  type ContextItemSelection,
} from "@/features/scope-system/components/ContextItemPicker";
import type { ContextItemBinding } from "@/features/agents/types/agent-definition.types";

interface ContextItemBindingEditorProps {
  binding: ContextItemBinding | undefined;
  onChange: (binding: ContextItemBinding | undefined) => void;
  readonly?: boolean;
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
    hint: "Refuse to run if no scope supplies it",
  },
];

/**
 * Bind a variable to a scope CONTEXT ITEM. At run time the active scope of the chosen type
 * supplies the value (collision-proof by the item's UUID) and the variable inherits the
 * item's input component. There is never a requirement for context — when none is set, the
 * variable just renders as an ordinary input. Resolution is server-authoritative.
 */
export function ContextItemBindingEditor({
  binding,
  onChange,
  readonly,
}: ContextItemBindingEditorProps) {
  const activeOrgId = useAppSelector(selectActiveOrganizationId);
  // Org is a picker-only concern (the binding stores the item's id/type/key, not the org).
  const [orgId, setOrgId] = useState<string>(activeOrgId ?? "");
  // Binding "enabled" is the presence of the object — item ids are empty until the user picks one.
  const bound = binding != null;

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
    onChange({
      contextItemId: sel.contextItemId,
      scopeTypeId: sel.scopeTypeId,
      itemKey: sel.itemKey,
      onMissing: binding?.onMissing ?? "empty",
    });
  };

  return (
    <div className="space-y-2 p-3 bg-muted/50 rounded-lg border border-border">
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-sm font-medium cursor-pointer">
            Bind to a context item
          </Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            Auto-fills from the active scope and inherits the item&rsquo;s
            input. Optional — with no context set it&rsquo;s just a normal
            input.
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
              orgId,
              scopeTypeId: binding?.scopeTypeId,
              contextItemId: binding?.contextItemId,
            }}
            onChange={handlePick}
            readonly={readonly}
          />

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              When no scope provides it
            </Label>
            <Select
              value={binding?.onMissing ?? "empty"}
              onValueChange={(v) =>
                onChange({
                  contextItemId: binding?.contextItemId ?? "",
                  scopeTypeId: binding?.scopeTypeId ?? "",
                  itemKey: binding?.itemKey ?? "",
                  onMissing: v as ContextItemBinding["onMissing"],
                })
              }
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
        </div>
      )}
    </div>
  );
}
