/**
 * ColumnSettingsDialog — everything about ONE column, in one place.
 *
 * Arman (2026-09-21): "right-clicking on a column header doesn't offer a
 * column settings one … without a really great ui for a column, I feel like
 * we're not maximizing what we can do." Airtable's "Edit field", Notion's
 * property panel. Table settings → Fields & Order still edits every column at
 * once; this is the door for the column you are looking at.
 *
 * Saves through the SAME services every other path uses — a rename runs the
 * formula rewrite (`renameColumn`), a type change walks the rows
 * (`changeFieldType`), the format is additive (`setFieldFormat`), required and
 * validation ride `update_user_table_config`, the row label goes through its
 * door, the summary is view state. Nothing here is a second write path.
 */
"use client";

import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@ai-matrx/design-system";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/use-toast";
import { confirm as confirmDialog } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { supabase } from "@/utils/supabase/client";
import { unwrapUserTableMutation } from "@/utils/user-tables-rpc";
import type { TableField } from "@/utils/user-table-utls/table-utils";

import { FieldFormatPicker } from "@/lib/field-formats/FieldFormatPicker";
import {
  offerFormatWhereRelationIs,
  useRelationColumnsEnabled,
} from "@/features/data-tables/relation-knob";
import { resolveFieldFormat } from "@/lib/field-formats/format";
import type { FieldFormatConfig } from "@/lib/field-formats/types";
import { ColumnValidationEditor } from "@/features/data-tables/components/ColumnValidationEditor";
import { FormulaExpressionEditor } from "@/features/data-tables/components/FormulaExpressionEditor";
import {
  COLUMN_SUMMARY_LABELS,
  summaryKindsFor,
  type ColumnSummaryKind,
} from "@/features/data-tables/column-summaries";
import { isComputedColumn } from "@/features/data-tables/formulas";
import { effectiveRowLabel, isRowLabelField } from "@/features/data-tables/row-label";
import {
  changeFieldType,
  renameColumn,
  setFieldFormat,
  setTableRowLabel,
} from "@/features/data-tables/service";
import { isServiceFailure, type FieldDataType } from "@/features/data-tables/types";
import {
  parseValidationRules,
  serializeValidationRules,
  type ValidationRules,
} from "@/features/data-tables/validation";

const DATA_TYPES: { value: FieldDataType; label: string }[] = [
  { value: "string", label: "Text" },
  { value: "number", label: "Number" },
  { value: "integer", label: "Whole number" },
  { value: "boolean", label: "Yes / No" },
  { value: "date", label: "Date" },
  { value: "datetime", label: "Date & time" },
  { value: "json", label: "Structured data" },
  { value: "array", label: "List" },
];

const NO_SUMMARY = "__none__";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tableId: string;
  /** The organization this table belongs to — it decides which column types are offered. */
  organizationId?: string | null;
  /** The column being edited; `null` renders nothing. */
  field: TableField | null;
  fields: readonly TableField[];
  tableMetadata: unknown;
  readOnly?: boolean;
  /** The view's summary for this column (column-summaries.ts). */
  summary: ColumnSummaryKind | null;
  onSummaryChange: (kind: ColumnSummaryKind | null) => void;
  /** Reload the table after a save landed. */
  onSaved: () => void;
  /** The other doors, so the dialog is a hub for the column. */
  onHide?: (fieldName: string) => void;
  onDelete?: (field: TableField) => void;
};

export function ColumnSettingsDialog(props: Props) {
  const { open, onOpenChange, field } = props;
  if (!field) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Keyed on the column so a different column always starts a fresh draft. */}
      <ColumnSettingsForm key={field.id} {...props} field={field} />
    </Dialog>
  );
}

function ColumnSettingsForm({
  onOpenChange,
  tableId,
  organizationId,
  field,
  fields,
  tableMetadata,
  readOnly,
  summary,
  onSummaryChange,
  onSaved,
  onHide,
  onDelete,
}: Omit<Props, "field" | "open"> & { field: TableField }) {
  const relationEnabled = useRelationColumnsEnabled(organizationId);
  const isLabel = useMemo(
    () => isRowLabelField(field.field_name, tableMetadata, fields),
    [field, tableMetadata, fields],
  );
  const [name, setName] = useState(field.display_name);
  const [dataType, setDataType] = useState<FieldDataType>(field.data_type as FieldDataType);
  const [format, setFormat] = useState<FieldFormatConfig | null>(
    resolveFieldFormat(field.data_type, field.metadata),
  );
  const [required, setRequired] = useState(Boolean(field.is_required));
  const [rules, setRules] = useState<ValidationRules>(parseValidationRules(field.validation_rules));
  const [asRowLabel, setAsRowLabel] = useState(isLabel);
  const [saving, setSaving] = useState(false);
  const original = field;


  const computed = isComputedColumn({
    field_name: field.field_name,
    display_name: field.display_name,
    data_type: dataType,
    metadata: format ? { format } : field.metadata,
  });
  const siblings = fields
    .filter((f) => f.field_name !== field.field_name)
    .map((f) => ({ field_name: f.field_name, display_name: f.display_name }));
  const summaryKinds = summaryKindsFor(dataType);
  const typeChanged = dataType !== field.data_type;

  const save = async () => {
    if (!original) return;
    const trimmed = name.trim();
    if (!trimmed) {
      toast({ title: "The column needs a name", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      if (typeChanged) {
        const ok = await confirmDialog({
          title: `Change "${original.display_name}" to ${DATA_TYPES.find((t) => t.value === dataType)?.label ?? dataType}?`,
          description:
            "Every stored value is converted. A value that cannot be converted becomes empty; row history keeps the old one.",
          confirmLabel: "Change type",
          variant: "destructive",
        });
        if (!ok) return;
        const typed = await changeFieldType({ tableId, fieldId: original.id, newType: dataType });
        if (isServiceFailure(typed)) throw new Error(typed.error);
      }
      if (trimmed !== original.display_name) {
        const renamed = await renameColumn({
          tableId,
          field: original,
          newName: trimmed,
          fields,
        });
        if (isServiceFailure(renamed)) throw new Error(renamed.error);
      }
      const priorFormat = resolveFieldFormat(original.data_type, original.metadata);
      if (JSON.stringify(format) !== JSON.stringify(priorFormat)) {
        const formatted = await setFieldFormat({ tableId, fieldId: original.id, format });
        if (isServiceFailure(formatted)) throw new Error(formatted.error);
      }
      const nextRules = serializeValidationRules(rules);
      const priorRules = serializeValidationRules(parseValidationRules(original.validation_rules));
      const update: Record<string, unknown> = { id: original.id };
      if (required !== Boolean(original.is_required)) update.is_required = required;
      if (JSON.stringify(nextRules) !== JSON.stringify(priorRules)) update.validation_rules = nextRules;
      if (Object.keys(update).length > 1) {
        const { data, error } = await supabase.rpc("update_user_table_config", {
          p_table_id: tableId,
          p_field_updates: [update],
        } as never);
        if (error) throw error;
        unwrapUserTableMutation(data ?? null);
      }
      if (asRowLabel !== isLabel) {
        const label = await setTableRowLabel({
          tableId,
          rowLabel: asRowLabel ? { kind: "field", field: original.field_name } : null,
        });
        if (isServiceFailure(label)) throw new Error(label.error);
      }
      toast({ title: `Saved "${trimmed}"` });
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast({
        title: "Could not save the column",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Column · {field.display_name}</DialogTitle>
          <DialogDescription>
            What it is called, what it stores, how it shows, what it accepts.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="col-name" className="text-xs">Name</Label>
              <Input
                id="col-name"
                value={name}
                disabled={readOnly || saving}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Stores</Label>
              <Select
                value={dataType}
                disabled={readOnly || saving || computed}
                onValueChange={(v) => {
                  setDataType(v as FieldDataType);
                  // A format only fits certain storage types — reset to plain.
                  setFormat(null);
                  setRules({});
                }}
              >
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DATA_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {typeChanged && (
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  Changing the type converts every stored value.
                </p>
              )}
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Shows as</Label>
            <FieldFormatPicker
              dataType={dataType}
              value={format ?? resolveFieldFormat(dataType, null)}
              onChange={setFormat}
              offerFormat={offerFormatWhereRelationIs(relationEnabled)}
              onDataTypeChange={(base, next) => {
                setDataType(base as FieldDataType);
                setRules({});
                setFormat(next);
              }}
              siblingFields={siblings}
              triggerClassName="h-9 w-full text-sm"
            />
            {format?.id === "formula" && (
              <FormulaExpressionEditor
                value={format}
                onChange={setFormat}
                siblingFields={siblings}
                disabled={readOnly || saving}
              />
            )}
          </div>

          {!computed && (
            <div className="space-y-1">
              <Label className="text-xs">Accepts</Label>
              <ColumnValidationEditor
                dataType={dataType}
                format={format}
                value={rules}
                onChange={setRules}
                disabled={readOnly || saving}
              />
            </div>
          )}

          <div className="grid gap-2 sm:grid-cols-2">
            {!computed && (
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={required} disabled={readOnly || saving} onCheckedChange={(v) => setRequired(v === true)} />
                Required on every row
              </label>
            )}
            {!computed && (
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={asRowLabel} disabled={readOnly || saving} onCheckedChange={(v) => setAsRowLabel(v === true)} />
                Names the rows (row label)
              </label>
            )}
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Summary under the column</Label>
            <Select
              value={summary ?? NO_SUMMARY}
              onValueChange={(v) => onSummaryChange(v === NO_SUMMARY ? null : (v as ColumnSummaryKind))}
            >
              <SelectTrigger className="h-9 w-full sm:w-64"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_SUMMARY}>None</SelectItem>
                {summaryKinds.map((k) => (
                  <SelectItem key={k} value={k}>{COLUMN_SUMMARY_LABELS[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Saved with this view, like sort and filters.</p>
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          <div className="flex gap-1">
            {onHide && (
              <Button type="button" variant="ghost" size="sm" onClick={() => { onHide(field.field_name); onOpenChange(false); }}>
                Hide column
              </Button>
            )}
            {onDelete && !readOnly && (
              <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => { onOpenChange(false); onDelete(field); }}>
                Delete column…
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
            <Button type="button" onClick={() => void save()} disabled={saving || readOnly}>
              {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
  );
}
