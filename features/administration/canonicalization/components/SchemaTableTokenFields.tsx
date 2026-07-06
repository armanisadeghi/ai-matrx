"use client";

import { useMemo, useState } from "react";
import { Loader2, Wand2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DEFAULT_DATABASE_SCHEMA } from "@/app/(admin)/administration/database/config";
import { useRegisteredTables } from "../hooks/useRegisteredTables";
import { OverrideCombobox } from "./OverrideCombobox";

export interface SchemaTableTokenValues {
  schema: string;
  table: string;
  token: string;
}

export function SchemaTableTokenFields({
  values,
  onChange,
  onAutofillToken,
  autofilling = false,
  disabled = false,
}: {
  values: SchemaTableTokenValues;
  onChange: (patch: Partial<SchemaTableTokenValues>) => void;
  onAutofillToken?: () => void;
  autofilling?: boolean;
  disabled?: boolean;
}) {
  const {
    schemas,
    tablesForSchema,
    tokensFor,
    quickPickOptions,
    applyQuickPick,
    loading,
  } = useRegisteredTables();
  const [quickPick, setQuickPick] = useState("");

  const tableOptions = useMemo(
    () => tablesForSchema(values.schema),
    [tablesForSchema, values.schema],
  );

  const tokenOptions = useMemo(
    () => tokensFor(values.schema, values.table),
    [tokensFor, values.schema, values.table],
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      {quickPickOptions.length > 0 ? (
        <div className="flex min-w-[220px] flex-1 items-center gap-1.5 sm:max-w-xs sm:flex-none">
          <span className="shrink-0 text-[11px] text-muted-foreground">
            Registered
          </span>
          <OverrideCombobox
            value={quickPick}
            onChange={setQuickPick}
            onSelect={(label) => {
              const picked = applyQuickPick(label);
              if (picked) onChange(picked);
              setQuickPick("");
            }}
            options={quickPickOptions}
            placeholder="Pick schema.table · token…"
            className="min-w-0 flex-1"
            inputClassName="placeholder:text-muted-foreground/80"
            disabled={disabled || loading}
            maxVisible={50}
            emptyHint="No registered tables loaded."
          />
        </div>
      ) : null}

      <div className="flex items-center gap-1.5">
        <span className="text-[11px] text-muted-foreground">Schema</span>
        <OverrideCombobox
          value={values.schema}
          onChange={(schema) => onChange({ schema })}
          options={schemas}
          placeholder={DEFAULT_DATABASE_SCHEMA}
          className="w-28"
          disabled={disabled || loading}
        />
      </div>

      <div className="flex items-center gap-1.5">
        <span className="text-[11px] text-muted-foreground">Table</span>
        <OverrideCombobox
          value={values.table}
          onChange={(table) => onChange({ table })}
          onSelect={(table) => {
            const token = tokensFor(values.schema, table)[0];
            if (token) onChange({ table, token });
          }}
          options={tableOptions}
          placeholder="notes"
          className="w-36"
          disabled={disabled || loading}
        />
      </div>

      <div className="flex items-center gap-1.5">
        <span className="text-[11px] text-muted-foreground">Token</span>
        <OverrideCombobox
          value={values.token}
          onChange={(token) => onChange({ token })}
          options={tokenOptions}
          placeholder="note"
          className="w-32"
          monospace
          disabled={disabled || loading}
        />
        {onAutofillToken ? (
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8 shrink-0"
            title="Autofill token from platform.entity_types"
            onClick={onAutofillToken}
            disabled={disabled || autofilling || loading}
          >
            {autofilling ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Wand2 className="h-3.5 w-3.5" />
            )}
          </Button>
        ) : null}
      </div>

      {loading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
      ) : null}
    </div>
  );
}
