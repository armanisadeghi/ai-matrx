"use client";

import { useId } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/official/Field";
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
  /**
   * Override the allowed-type choices. Defaults to every option
   * (`CONTEXT_REFERENCE_TYPE_OPTIONS`). A host that can't support a subtype in
   * its context (e.g. the System Context admin can't resolve a user `scope`
   * from the member-less system org) passes a filtered list.
   */
  typeOptions?: string[];
}

/**
 * THE reference-config editor — every field a `value_type="reference"`
 * context item needs (allowed types, cardinality, and, when "scope" is
 * allowed, which scope types). Shown immediately once "Reference" is chosen
 * on `EntryModeToggle` — never gated behind a second toggle. Shared by
 * `ContextItemAddForm` and `ContextItemSettingsForm`; do not re-implement
 * this block a third time.
 *
 * Chips use canonical `Button size="sm"` so they match `EntryModeToggle`
 * (`h-7 text-xs`). Labels use canonical `Field`.
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
  typeOptions,
}: ReferenceConfigFieldsProps) {
  const uid = useId();
  const options = typeOptions ?? CONTEXT_REFERENCE_TYPE_OPTIONS;
  const typesId = `${uid}-types`;
  const maxId = `${uid}-max`;
  const scopesId = `${uid}-scopes`;

  return (
    <div className={className ? className : "space-y-3"}>
      <Field label="Allowed types" htmlFor={typesId}>
        <div id={typesId} className="flex flex-wrap gap-1.5" role="group">
          {options.map((t) => {
            const active = allowedReferenceTypes.includes(t);
            return (
              <Button
                key={t}
                type="button"
                size="sm"
                variant="outline"
                disabled={disabled}
                onClick={() => onToggleReferenceType(t)}
                aria-pressed={active}
                className={
                  active
                    ? "border-primary/50 bg-primary/10 text-foreground hover:bg-primary/15 hover:text-foreground"
                    : "text-muted-foreground"
                }
              >
                {referenceTypeLabel(t)}
              </Button>
            );
          })}
        </div>
        {allowedReferenceTypes.length === 0 && (
          <p className="text-xs text-amber-700 dark:text-amber-300 inline-flex items-start gap-1">
            <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
            Select at least one type.
          </p>
        )}
      </Field>

      <Field
        label="Max items"
        htmlFor={maxId}
        description="1 = a single value. Higher allows a list (e.g. several files)."
      >
        <Input
          id={maxId}
          type="number"
          min={1}
          value={maxItems}
          onChange={(e) => onMaxItemsChange(e.target.value)}
          style={{ fontSize: "16px" }}
          disabled={disabled}
          className="h-7 w-28 px-2 text-xs"
        />
      </Field>

      {allowedReferenceTypes.includes("scope") && (
        <Field
          label="Allowed scope types"
          htmlFor={scopesId}
          description="Leave all unselected to allow any scope type in the org."
        >
          {orgScopeTypes.length === 0 ? (
            <p id={scopesId} className="text-xs text-muted-foreground">
              Loading scope types…
            </p>
          ) : (
            <div id={scopesId} className="flex flex-wrap gap-1.5" role="group">
              {orgScopeTypes.map((st) => {
                const active = allowedScopeTypeIds.includes(st.id);
                return (
                  <Button
                    key={st.id}
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={disabled}
                    onClick={() => onToggleAllowedScopeType(st.id)}
                    aria-pressed={active}
                    className={
                      active
                        ? "border-primary/50 bg-primary/10 text-foreground hover:bg-primary/15 hover:text-foreground"
                        : "text-muted-foreground"
                    }
                  >
                    {st.label_singular}
                  </Button>
                );
              })}
            </div>
          )}
        </Field>
      )}
    </div>
  );
}

export default ReferenceConfigFields;
