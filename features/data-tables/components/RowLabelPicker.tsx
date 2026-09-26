"use client";

/**
 * RowLabelPicker — choose what NAMES a row of this table everywhere it is
 * referred to: one column, or a formula that merges columns
 * (`{First name} & " " & {Last name}`). Writes through `udt_set_table_row_label`
 * immediately (it is a table property, like colors — not part of the settings
 * dialog's save/cancel draft), and says what happened.
 */

import { useState } from "react";
import { KeyRound, Loader2 } from "lucide-react";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/use-toast";

import { setTableRowLabel } from "../service";
import { isServiceFailure } from "../types";
import {
  defaultRowLabelField,
  readRowLabel,
  rowLabelText,
  type RowLabelConfig,
  type RowLabelField,
} from "../row-label";
import { FormulaExpressionEditor } from "./FormulaExpressionEditor";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

const MERGE = "__merge__";
const DEFAULT = "__default__";

type Props = {
  tableId: string;
  /** The table's `metadata` blob (holds `row_label`). */
  metadata: unknown;
  fields: readonly RowLabelField[];
  /** A sample row, so the picker can show what the label will read as. */
  sampleRow?: { data: Record<string, unknown> } | null;
  disabled?: boolean;
  /** Called with the saved config after a successful write. */
  onSaved: (next: RowLabelConfig | null) => void;
};

export function RowLabelPicker({ tableId, metadata, fields, sampleRow, disabled, onSaved }: Props) {
  const stored = readRowLabel(metadata);
  const fallback = defaultRowLabelField(fields);
  const [saving, setSaving] = useState(false);
  // A merge expression is edited locally and saved on blur/change of the editor.
  const [draftExpression, setDraftExpression] = useState<string | null>(
    stored?.kind === "formula" ? stored.expression : null,
  );

  const save = async (next: RowLabelConfig | null) => {
    setSaving(true);
    const result = await setTableRowLabel({ tableId, rowLabel: next });
    setSaving(false);
    if (isServiceFailure(result)) {
      toast({ title: "Could not save the row label", description: result.error, variant: "destructive" });
      return;
    }
    onSaved(next);
  };

  const selectValue =
    draftExpression !== null ? MERGE : stored?.kind === "field" ? stored.field : DEFAULT;

  const effective: RowLabelConfig | null =
    draftExpression !== null
      ? { kind: "formula", expression: draftExpression }
      : stored?.kind === "field"
        ? stored
        : fallback
          ? { kind: "field", field: fallback.field_name }
          : null;
  const preview = sampleRow && effective ? rowLabelText(sampleRow, fields, effective) : null;

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex items-start gap-3">
        <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <div className="min-w-0 flex-1">
          <Label className="text-sm font-medium">Row label</Label>
          <p className="text-xs text-muted-foreground">
            The value that names a row wherever it is referred to — in a reference, a copy, a
            link from another table, or an agent's sentence.
          </p>
        </div>
        {saving && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      <Select
        value={selectValue}
        disabled={disabled || saving}
        onValueChange={(value) => {
          if (value === MERGE) {
            setDraftExpression(
              stored?.kind === "formula"
                ? stored.expression
                : fields.length >= 2
                  ? `{${fields[0].display_name}} & " " & {${fields[1].display_name}}`
                  : fields[0]
                    ? `{${fields[0].display_name}}`
                    : "",
            );
            return;
          }
          setDraftExpression(null);
          void save(value === DEFAULT ? null : { kind: "field", field: value });
        }}
      >
        <SelectTrigger className="h-9">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={DEFAULT}>
            First column{fallback ? ` (${fallback.display_name})` : ""} — the default
          </SelectItem>
          {fields.map((f) => (
            <SelectItem key={f.field_name} value={f.field_name}>
              {f.display_name}
            </SelectItem>
          ))}
          <SelectItem value={MERGE}>Combine columns…</SelectItem>
        </SelectContent>
      </Select>

      {draftExpression !== null && (
        <div className="space-y-1.5">
          <FormulaExpressionEditor
            value={{ id: "formula", options: { formula: { expression: draftExpression, resultFormat: "text" } } }}
            onChange={(next) => setDraftExpression(next.options?.formula?.expression ?? "")}
            siblingFields={fields.map((f) => ({
              field_name: f.field_name,
              display_name: f.display_name,
              data_type: f.data_type,
              metadata: f.metadata,
            }))}
            sampleRow={sampleRow?.data ?? null}
            disabled={disabled || saving}
            purpose="row-label"
          />
          <div className="flex items-center justify-between gap-2">
            <p className="min-w-0 truncate text-xs text-muted-foreground">
              {stored?.kind === "formula" && stored.expression === draftExpression
                ? "Saved."
                : "Not saved yet."}
              <ErrorAlchemyMenu />
            </p>
            <button
              type="button"
              disabled={disabled || saving || !draftExpression.trim() || (stored?.kind === "formula" && stored.expression === draftExpression)}
              onClick={() => void save({ kind: "formula", expression: draftExpression })}
              className="rounded-md border px-2 py-1 text-xs font-medium hover:bg-muted disabled:opacity-50"
            >
              Save merged label
            </button>
          </div>
        </div>
      )}

      {preview && (
        <p className="text-xs text-muted-foreground">
          Example: a row would be called{" "}
          <span className="font-medium text-foreground">
            {preview.text || "(nothing — that cell is empty in the sample row)"}
          </span>
          {preview.problem ? ` — ${preview.problem}` : ""}
        </p>
      )}
    </div>
  );
}

export default RowLabelPicker;
