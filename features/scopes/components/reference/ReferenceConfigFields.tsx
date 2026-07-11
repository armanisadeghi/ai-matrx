"use client";

import { AlertTriangle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CONTEXT_REFERENCE_TYPE_OPTIONS,
  referenceTypeLabel,
} from "@/features/scopes/utils/referenceCell";

export interface ReferenceConfigOrgScopeType {
  id: string;
  label_singular: string;
}

export interface ReferenceConfigFieldsProps {
  allowedReferenceTypes: string[];
  onToggleReferenceType: (type: string) => void;
  maxItems: string;
  onMaxItemsChange: (value: string) => void;
  allowedScopeTypeIds: string[];
  onToggleAllowedScopeType: (id: string) => void;
  orgScopeTypes: ReferenceConfigOrgScopeType[];
  disabled?: boolean;
  className?: string;
}

/**
 * THE reference-config editor — every field a `value_type="reference"`
 * context item needs (allowed types, cardinality, and, when "scope" is
 * allowed, which scope types). Shown immediately once "Reference" is chosen
 * on `EntryModeToggle` — never gated behind a second toggle. Shared by
 * `ContextItemAddForm` and `ContextItemSettingsForm`; do not re-implement
 * this block a third time.
 */
export function ReferenceConfigFields({
  allowedReferenceTypes,
  onToggleReferenceType,
  maxItems,
  onMaxItemsChange,
  allowedScopeTypeIds,
  onToggleAllowedScopeType,
  orgScopeTypes,
  disabled,
  className,
}: ReferenceConfigFieldsProps) {
  return (
    <div className={className ? className : "space-y-3"}>
      <div className="space-y-1.5">
        <Label className="text-xs">Allowed types</Label>
        <div className="flex flex-wrap gap-1.5">
          {CONTEXT_REFERENCE_TYPE_OPTIONS.map((t) => {
            const active = allowedReferenceTypes.includes(t);
            return (
              <button
                key={t}
                type="button"
                disabled={disabled}
                onClick={() => onToggleReferenceType(t)}
                className={`rounded-md border px-2 py-1 text-xs transition-colors ${
                  active
                    ? "border-primary/50 bg-primary/10 text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground hover:bg-accent"
                }`}
              >
                {referenceTypeLabel(t)}
              </button>
            );
          })}
        </div>
        {allowedReferenceTypes.length === 0 && (
          <p className="text-[10px] text-amber-700 dark:text-amber-300 inline-flex items-start gap-1">
            <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
            Select at least one type.
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Max items</Label>
        <Input
          type="number"
          min={1}
          value={maxItems}
          onChange={(e) => onMaxItemsChange(e.target.value)}
          style={{ fontSize: "16px" }}
          disabled={disabled}
          className="w-28"
        />
        <p className="text-[10px] text-muted-foreground">
          1 = a single value. Higher allows a list (e.g. a report that can
          carry several files).
        </p>
      </div>

      {allowedReferenceTypes.includes("scope") && (
        <div className="space-y-1.5">
          <Label className="text-xs">Allowed scope types</Label>
          {orgScopeTypes.length === 0 ? (
            <p className="text-[10px] text-muted-foreground">
              Loading scope types…
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {orgScopeTypes.map((st) => {
                const active = allowedScopeTypeIds.includes(st.id);
                return (
                  <button
                    key={st.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => onToggleAllowedScopeType(st.id)}
                    className={`rounded-md border px-2 py-1 text-xs transition-colors ${
                      active
                        ? "border-primary/50 bg-primary/10 text-foreground"
                        : "border-border text-muted-foreground hover:text-foreground hover:bg-accent"
                    }`}
                  >
                    {st.label_singular}
                  </button>
                );
              })}
            </div>
          )}
          <p className="text-[10px] text-muted-foreground">
            Leave all unselected to allow any scope type in the org.
          </p>
        </div>
      )}
    </div>
  );
}

export default ReferenceConfigFields;
