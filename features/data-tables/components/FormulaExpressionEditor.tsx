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
import { IntelligenceIndicator } from "@/features/mandates/feature-intelligence/IntelligenceIndicator";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MANDATE_KEYS } from "@ai-matrx/agents/mandates";
import { ProTextarea } from "@/components/official/ProTextarea";
import { cn } from "@/lib/utils";
import { resolveFieldFormat } from "@/lib/field-formats/format";
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

/**
 * What the formula is FOR — the editor speaks for that use (register ARE-031).
 *  - `column`: a formula column; the result format is chosen here.
 *  - `row-action`: a row action's "Calculate" step; the target column's own
 *    type decides the result, so no result format is offered.
 *  - `row-label`: the merged row label; always text.
 */
export type FormulaPurpose = "column" | "row-action" | "row-label";

type Props = {
  /** The column's current format config (id must be `formula`). */
  value: FieldFormatConfig;
  onChange: (next: FieldFormatConfig) => void;
  /**
   * The table's other columns — offered as reference chips. `data_type` and
   * `metadata` (when the host holds them) let "Help with this…" tell its job
   * each column's type and format.
   */
  siblingFields: {
    field_name: string;
    display_name: string;
    data_type?: string;
    metadata?: unknown;
  }[];
  disabled?: boolean;
  className?: string;
  /** Default `column`. */
  purpose?: FormulaPurpose;
  /** For `row-action`: the column the result is written into. */
  targetColumnName?: string;
  /** For `row-action`: that column's type — the type the result must be. */
  targetColumnType?: string;
  /** One real row of the table, keyed by field_name, when the host holds one. */
  sampleRow?: Record<string, unknown> | null;
};

const EMPTY_TEXT: Record<FormulaPurpose, string> = {
  column: "No expression yet — the column will be empty.",
  "row-action": "No formula yet — write one, or ask for help from the … menu in the box.",
  "row-label": "No formula yet — rows will be named by the first column.",
};

/** An example built from the person's REAL columns, never invented ones (ARE-030). */
function exampleFrom(fields: { display_name: string }[]): string {
  const [a, b] = fields.map((f) => f.display_name);
  if (a && b) return `{${a}} & " " & {${b}}, or IF({${a}} = "", "Missing", {${a}})`;
  if (a) return `UPPER({${a}}), or IF({${a}} = "", "Missing", {${a}})`;
  return `TODAY(), or "Fixed text"`;
}

export function FormulaExpressionEditor({
  value,
  onChange,
  siblingFields,
  disabled,
  className,
  purpose = "column",
  targetColumnName,
  targetColumnType,
  sampleRow,
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
  // Functions insert on click, like columns (ARE-034).
  const insertFunction = (name: string) =>
    setFormula({
      expression: `${expression}${expression && !/[\s(,]$/.test(expression) ? " " : ""}${name}(`,
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
    ? { tone: "muted" as const, text: EMPTY_TEXT[purpose] }
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
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="formula-expression" className="text-xs">
              Formula
            </Label>
            <IntelligenceIndicator
              feature="data"
              mandateKeys={[MANDATE_KEYS.data__formula_writing]}
              label="Help writing this formula"
            />
          </div>
          {/* The PLATFORM text box (ARE-020): microphone, and the … menu with
              "Help with this…" running THIS box's job, `data.formula_writing`
              (declared in aidream client_mandates.py, Provision
              `data.formula_box`). Each item below travels by its key as an
              offered value of that job — never inside the person's message.
              Prose clean-up is off: it would mangle syntax. */}
          <ProTextarea
            id="formula-expression"
            value={expression}
            onChange={(e) => setFormula({ expression: e.target.value })}
            disabled={disabled}
            rows={3}
            spellCheck={false}
            placeholder={exampleFrom(siblingFields)}
            className="font-mono text-sm"
            enableCleanup={false}
            enableHelpWithThis
            helpMandateKey={MANDATE_KEYS.data__formula_writing}
            surfaceName="matrx-user/data-tables"
            helpContextItems={[
              {
                id: "formula-purpose",
                key: "formula_purpose",
                label: "What this formula is for",
                value:
                  purpose === "row-action"
                    ? `A row action step that writes the result into the column ${targetColumnName ? `"${targetColumnName}"` : "chosen beside it"}, evaluated against the row as it is before the action.`
                    : purpose === "row-label"
                      ? "The name of each row (text), usually merged columns."
                      : "A calculated column; every row shows the result.",
              },
              {
                id: "formula-columns",
                key: "formula_columns",
                label: "Columns you can reference as {Name}",
                value: siblingFields.map((f) => `{${f.display_name}}`).join(", ") || "(none)",
              },
              {
                id: "formula-language",
                key: "formula_language",
                label: "Formula language",
                value: FORMULA_FUNCTIONS.map((fn) => `${fn.signature} — ${fn.description}`).join("\n") +
                  "\nOperators: + - * / % for numbers, & joins text, = != < <= > >= compare. Text in double quotes.",
              },
              {
                id: "formula-current",
                key: "formula_current",
                label: "The formula as it stands",
                // Blank is missing, never "(empty)" — an empty box offers nothing.
                value: expression,
              },
              {
                id: "formula-target-type",
                key: "target_column_type",
                label: "The type the result must be",
                value:
                  purpose === "row-action"
                    ? (targetColumnType ?? "")
                    : purpose === "row-label"
                      ? "text"
                      : resultFormat,
              },
              {
                id: "formula-columns-detail",
                key: "formula_columns_detail",
                label: "The columns in full",
                value: JSON.stringify(
                  siblingFields.map((f) => ({
                    display_name: f.display_name,
                    field_name: f.field_name,
                    ...(f.data_type ? { data_type: f.data_type } : {}),
                    ...(f.data_type
                      ? { format: resolveFieldFormat(f.data_type, f.metadata).id }
                      : {}),
                  })),
                ),
              },
              {
                id: "formula-parse-error",
                key: "formula_parse_error",
                label: "What is wrong with the formula",
                value: status.tone === "error" ? status.text : "",
              },
              {
                id: "formula-sample-row",
                key: "sample_row",
                label: "A real row of this table",
                value: sampleRow
                  ? JSON.stringify(
                      Object.fromEntries(
                        siblingFields
                          .filter((f) => f.field_name in sampleRow)
                          .map((f) => [f.display_name, sampleRow[f.field_name]]),
                      ),
                    )
                  : "",
              },
              {
                id: "formula-target-name",
                key: "target_column_name",
                label: "The column the result is written into",
                value: purpose === "row-action" ? (targetColumnName ?? "") : "",
              },
            ]}
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
          {purpose === "column" && (
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
          )}
          <div className="space-y-1.5">
            <Label className="text-xs">Functions</Label>
            <div className="max-h-28 overflow-y-auto rounded border border-border p-1.5 text-[11px] leading-5 text-muted-foreground">
              {FORMULA_FUNCTIONS.map((fn) => (
                <button
                  key={fn.name}
                  type="button"
                  disabled={disabled}
                  onClick={() => insertFunction(fn.name)}
                  title={`${fn.description} — click to insert`}
                  className="block w-full rounded px-1 text-left hover:bg-accent"
                >
                  <span className="font-mono text-foreground">{fn.signature}</span>
                </button>
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
