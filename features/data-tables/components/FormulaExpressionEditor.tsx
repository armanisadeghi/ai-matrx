/**
 * FormulaExpressionEditor — where a formula column's expression is written.
 *
 * The `formula` field format (`lib/field-formats`) stores `{ expression,
 * resultFormat }` in the column's format options; the grid computes the value
 * per row (`features/data-tables/formulas.ts`). This editor is the ONE place
 * that authors the expression: a text box with live parse feedback (the error
 * and the position it points at), the table's other columns as one-click
 * `{Display Name}` chips, the function list, and "shows as" for the result.
 *
 * It lives beside the format picker rather than inside it because the picker
 * is a `lib/` module and the language is a `features/` module — the picker
 * must not import upward. Both Table Settings and the new-column form mount it
 * whenever the chosen format is `formula`, so a formula column can never be
 * created without a way to give it an expression.
 */
"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2, FunctionSquare } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@ai-matrx/design-system";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { FieldFormatConfig, FieldFormatId } from "@/lib/field-formats/types";

import { FORMULA_FUNCTIONS, parseFormula } from "../formulas";

/** Result formats a formula can show as — the ones whose `format()` reads a plain value. */
const RESULT_FORMATS: { id: FieldFormatId; label: string }[] = [
  { id: "text", label: "Text" },
  { id: "number", label: "Number" },
  { id: "decimal", label: "Decimal" },
  { id: "integer", label: "Whole number" },
  { id: "currency", label: "Currency" },
  { id: "percent", label: "Percent" },
  { id: "boolean", label: "Yes / No" },
  { id: "date", label: "Date" },
  { id: "datetime", label: "Date and time" },
];

type Props = {
  /** The column's current format config (id must be `formula`). */
  value: FieldFormatConfig;
  onChange: (next: FieldFormatConfig) => void;
  /** The table's other columns — offered as reference chips. */
  siblingFields: { field_name: string; display_name: string }[];
  disabled?: boolean;
  className?: string;
};

export function FormulaExpressionEditor({
  value,
  onChange,
  siblingFields,
  disabled,
  className,
}: Props) {
  const expression = value.options?.formula?.expression ?? "";
  const resultFormat = value.options?.formula?.resultFormat ?? "text";
  const parsed = parseFormula(expression);
  const [open, setOpen] = useState(false);

  const setFormula = (patch: { expression?: string; resultFormat?: FieldFormatId }) =>
    onChange({
      id: "formula",
      options: {
        ...(value.options ?? {}),
        formula: {
          expression,
          resultFormat,
          ...patch,
        },
      },
    });

  const insertReference = (displayName: string) =>
    setFormula({
      expression: `${expression}${expression && !expression.endsWith(" ") ? " " : ""}{${displayName}}`,
    });

  // A reference is judged against the table's columns HERE, not only at
  // evaluation: "Valid" for `{Prize}` on a table with a `Price` column would
  // be a lie the user only discovers as #ERROR in every row after saving.
  // Same resolution the engine uses (`withComputedColumns`): machine name or
  // display name, case-insensitive.
  const knownReferences = new Set(
    siblingFields.flatMap((f) => [f.field_name.toLowerCase(), f.display_name.toLowerCase()]),
  );
  const unknownReferences = parsed.ok
    ? parsed.references.filter((name) => !knownReferences.has(name.toLowerCase()))
    : [];

  const status = !expression.trim()
    ? { tone: "muted" as const, text: "No expression yet — the column will be empty." }
    : !parsed.ok
      ? { tone: "error" as const, text: `${parsed.error} (at character ${parsed.position + 1})` }
      : unknownReferences.length > 0
        ? {
            tone: "error" as const,
            text: `This table has no column called ${unknownReferences.map((n) => `{${n}}`).join(", ")} — every row would show #ERROR. Pick a column from the chips below.`,
          }
        : { tone: "ok" as const, text: `Valid · uses ${parsed.references.length} column${parsed.references.length === 1 ? "" : "s"}` };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          className={cn(
            "h-8 w-full justify-start gap-2 font-mono text-xs",
            status.tone === "error" && "border-destructive/60 text-destructive",
            className,
          )}
          title={expression || "Write the formula"}
        >
          <FunctionSquare className="size-3.5 shrink-0" />
          <span className="truncate">{expression || "Write the formula…"}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent /* sizing: fixed — fixed-shape panel wider than the content-sizing 28rem ceiling */ align="start" className="w-[min(36rem,calc(100vw-2rem))] space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="formula-expression" className="text-xs">
            Formula
          </Label>
          <Textarea
            id="formula-expression"
            value={expression}
            onChange={(e) => setFormula({ expression: e.target.value })}
            disabled={disabled}
            rows={3}
            spellCheck={false}
            placeholder="{Budget} * 1.2, or IF({Status} = 'Done', 'Closed', 'Open')"
            className="font-mono text-sm"
          />
          <p
            className={cn(
              "flex items-center gap-1.5 text-xs",
              status.tone === "error" && "text-destructive",
              status.tone === "ok" && "text-muted-foreground",
              status.tone === "muted" && "text-muted-foreground",
            )}
          >
            {status.tone === "error" ? (
              <AlertCircle className="size-3.5 shrink-0" />
            ) : status.tone === "ok" ? (
              <CheckCircle2 className="size-3.5 shrink-0" />
            ) : null}
            {status.text}
          </p>
        </div>

        {siblingFields.length > 0 && (
          <div className="space-y-1.5">
            <Label className="text-xs">Columns — click to insert</Label>
            <div className="flex flex-wrap gap-1">
              {siblingFields.map((f) => (
                <button
                  key={f.field_name}
                  type="button"
                  disabled={disabled}
                  onClick={() => insertReference(f.display_name)}
                  className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] hover:bg-accent"
                >
                  {`{${f.display_name}}`}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Result shows as</Label>
            <Select
              value={resultFormat}
              onValueChange={(next) => setFormula({ resultFormat: next as FieldFormatId })}
              disabled={disabled}
            >
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RESULT_FORMATS.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Functions</Label>
            <div className="max-h-28 overflow-y-auto rounded border border-border p-1.5 text-[11px] leading-5 text-muted-foreground">
              {FORMULA_FUNCTIONS.map((fn) => (
                <div key={fn.name} title={fn.description}>
                  <span className="font-mono text-foreground">{fn.signature}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <p className="text-[11px] text-muted-foreground">
          Operators: + − × ÷ % for numbers, &amp; to join text, = ≠ &lt; ≤ &gt; ≥ to compare.
          An empty cell counts as 0 in arithmetic and is skipped by SUM / AVERAGE.
        </p>
      </PopoverContent>
    </Popover>
  );
}
