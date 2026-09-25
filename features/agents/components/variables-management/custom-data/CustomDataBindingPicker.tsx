"use client";

/**
 * Bind an agent variable to the author's OWN custom data — "From my data".
 *
 * Choose a table, then the whole table / one record / one field of a record.
 * Table and record reads get a row template (prefilled from the table's own
 * fields, with clickable placeholders), a whole-table read gets a row limit,
 * and every binding says what happens when the data is missing. The panel at
 * the bottom shows EXACTLY what the agent will see, resolved by the server the
 * way a run resolves it (aidream `POST /agents/variable-bindings/preview`).
 *
 * Must render inside `CustomDataRecordsScope` (the records provider).
 * Contract: `common-docs/projects/data-kits/PLAN.md` § P1.
 */

import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { Loader2 } from "lucide-react";
import {
  useFields,
  useRecords,
  useTable,
  useTables,
  type Field,
} from "@ai-matrx/records/react";
import { fieldName, rowNameIn, tableName } from "@ai-matrx/records-ui";
import { Input, Textarea } from "@ai-matrx/design-system";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CreatablePicker,
  type CreatableOption,
} from "@/components/ui/creatable-picker";
import type { CustomDataBinding } from "@/features/agents/types/agent-definition.types";
import {
  DEFAULT_ROW_LIMIT,
  MISSING_CHOICES,
  SHAPE_CHOICES,
  defaultTemplate,
  placeholdersFor,
  type CustomDataShape,
} from "./customDataBinding";
import { CustomDataBindingPreview } from "./CustomDataBindingPreview";

/** How many records the record picker lists. Search narrows within them. */
const RECORD_PICKER_PAGE = 200;

interface CustomDataBindingPickerProps {
  binding: CustomDataBinding;
  onChange: (binding: CustomDataBinding) => void;
  readonly?: boolean;
  /** The bound variable's name — used in the preview's sentences and trace. */
  variableName?: string;
}

export function CustomDataBindingPicker({
  binding,
  onChange,
  readonly,
  variableName,
}: CustomDataBindingPickerProps) {
  const tables = useTables();
  const tableId = binding.table_id || null;
  const table = useTable(tableId);
  const fields = useFields(tableId);
  const shape = binding.semantic_type;
  const needsRecord = shape !== "collection";
  const records = useRecords(needsRecord ? tableId : null, {
    pageSize: RECORD_PICKER_PAGE,
  });
  const templateRef = useRef<HTMLTextAreaElement | null>(null);
  const pendingCaretRef = useRef<number | null>(null);

  const fieldList = fields.data ?? [];
  const tableRow = table.data;

  // PREFILL: once a table's fields arrive and a table/record read has no row
  // template yet, start from the table's own title column + its next field.
  useEffect(() => {
    if (readonly || !tableId || shape === "value") return;
    if (binding.transform || fields.loading || !fields.data) return;
    if (fields.data.length === 0) return;
    onChange({
      ...binding,
      transform: {
        name: "list",
        template: defaultTemplate(tableRow ?? null, fields.data),
        join: "\n",
        ...(shape === "collection"
          ? { max: binding.limit ?? DEFAULT_ROW_LIMIT }
          : {}),
      },
      ...(shape === "collection" && binding.limit === undefined
        ? { limit: DEFAULT_ROW_LIMIT }
        : {}),
    });
  }, [
    readonly,
    tableId,
    shape,
    binding,
    fields.loading,
    fields.data,
    tableRow,
    onChange,
  ]);

  const selectTable = (id: string) => {
    if (id === binding.table_id) return;
    // A new table invalidates everything chosen inside the old one.
    onChange({
      kind: "merge_field",
      source: "record",
      semantic_type: shape,
      table_id: id,
      missing: binding.missing,
      override_policy: binding.override_policy,
      ...(shape === "collection"
        ? { limit: binding.limit ?? DEFAULT_ROW_LIMIT }
        : {}),
    });
  };

  const selectShape = (next: CustomDataShape) => {
    if (next === shape) return;
    const base: CustomDataBinding = {
      kind: "merge_field",
      source: "record",
      semantic_type: next,
      table_id: binding.table_id,
      missing: binding.missing,
      override_policy: binding.override_policy,
    };
    if (next !== "collection" && binding.record_id) {
      base.record_id = binding.record_id;
    }
    if (next === "value" && binding.field_key)
      base.field_key = binding.field_key;
    if (next === "collection") base.limit = binding.limit ?? DEFAULT_ROW_LIMIT;
    // Keep the author's template when moving between table and record reads;
    // a single value needs none.
    if (next !== "value" && binding.transform) {
      const { template, join } = binding.transform;
      base.transform = {
        name: "list",
        template,
        ...(join !== undefined ? { join } : {}),
        ...(next === "collection"
          ? { max: base.limit ?? DEFAULT_ROW_LIMIT }
          : {}),
      };
    }
    onChange(base);
  };

  const setTemplate = (template: string) =>
    onChange({
      ...binding,
      transform: {
        join: "\n",
        ...binding.transform,
        name: "list",
        template,
      },
    });

  const insertPlaceholder = (token: string) => {
    const current = binding.transform?.template ?? "";
    const el = templateRef.current;
    const start = el?.selectionStart ?? current.length;
    const end = el?.selectionEnd ?? current.length;
    const next = current.slice(0, start) + token + current.slice(end);
    // The caret is placed once the NEW value has committed to the textarea
    // (TemplateEditor's layout effect). Placing it before the store round trip
    // lands was undone by the value write, which left the caret at the start.
    pendingCaretRef.current = start + token.length;
    setTemplate(next);
  };

  const setLimit = (raw: string) => {
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 1) return;
    onChange({
      ...binding,
      limit: n,
      ...(binding.transform
        ? { transform: { ...binding.transform, max: n } }
        : {}),
    });
  };

  const tableOptions: CreatableOption[] = (tables.data ?? []).map((t) => ({
    value: t.id,
    label: tableName(t),
    hint: t.label_plural ?? undefined,
  }));

  const recordOptions: CreatableOption[] = (records.data?.rows ?? []).map(
    (row) => ({
      value: row.id,
      label: rowNameIn(tableRow ?? null, row),
    }),
  );

  const storedTableMissing =
    Boolean(tableId) &&
    !tables.loading &&
    Boolean(tables.data) &&
    !(tables.data ?? []).some((t) => t.id === tableId);

  const recordTotal = records.data?.total ?? null;
  const recordsCapped =
    recordTotal !== null && recordTotal > recordOptions.length;

  return (
    <div className="space-y-2">
      {/* ── Table ─────────────────────────────────────────────────────── */}
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Table</Label>
        <CreatablePicker
          value={tableId}
          options={tableOptions}
          onSelect={selectTable}
          placeholder={
            tables.loading
              ? "Loading your tables…"
              : tableOptions.length === 0
                ? "No tables yet — make one in Data"
                : "Choose a table…"
          }
          searchPlaceholder="Search your tables…"
          noun="table"
          manageAction={{
            label: "Open Data to add or edit tables",
            href: "/data-v2",
          }}
          disabled={readonly}
          loading={tables.loading}
          ariaLabel="Table"
        />
        {tables.error && (
          <p className="text-[11px] text-destructive">
            Your tables could not be read: {tables.error.message}{" "}
            <button
              type="button"
              className="underline underline-offset-2"
              onClick={tables.reload}
            >
              Try again
            </button>
          </p>
        )}
        {storedTableMissing && (
          <p className="text-[11px] text-amber-700 dark:text-amber-300">
            The table this variable is bound to is not in the organization you
            have selected — it may live in another organization, or it was
            removed. Switch organization to edit it, or pick a table here to
            rebind it. The binding is unchanged until you do.
          </p>
        )}
      </div>

      {tableId && (
        <>
          {/* ── Shape ─────────────────────────────────────────────────── */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              What the agent gets
            </Label>
            <Select
              value={shape}
              onValueChange={(v) => {
                const choice = SHAPE_CHOICES.find((c) => c.value === v);
                if (choice) selectShape(choice.value);
              }}
              disabled={readonly}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SHAPE_CHOICES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    <span>{c.label}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {c.hint}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* ── Record ────────────────────────────────────────────────── */}
          {needsRecord && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Record</Label>
              <CreatablePicker
                value={binding.record_id ?? null}
                options={recordOptions}
                onSelect={(id) => onChange({ ...binding, record_id: id })}
                placeholder={
                  records.loading
                    ? "Loading records…"
                    : recordOptions.length === 0
                      ? "This table has no records yet"
                      : "Choose a record…"
                }
                searchPlaceholder="Search records…"
                noun="record"
                manageAction={{
                  label: "Open this table to add records",
                  href: `/data-v2/${tableId}`,
                }}
                disabled={readonly}
                loading={records.loading}
                ariaLabel="Record"
              />
              {recordsCapped && (
                <p className="text-[11px] text-muted-foreground">
                  Showing the first {recordOptions.length} of {recordTotal}{" "}
                  records.
                </p>
              )}
              {records.error && (
                <p className="text-[11px] text-destructive">
                  Records could not be read: {records.error.message}
                </p>
              )}
            </div>
          )}

          {/* ── Field (one value) ─────────────────────────────────────── */}
          {shape === "value" && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Field</Label>
              <Select
                value={binding.field_key ?? ""}
                onValueChange={(key) =>
                  onChange({ ...binding, field_key: key })
                }
                disabled={readonly || fields.loading}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      fields.loading ? "Loading fields…" : "Choose a field…"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {fieldList.map((f) => (
                    <SelectItem key={f.id} value={f.key}>
                      {fieldName(f)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* ── Row template ──────────────────────────────────────────── */}
          {shape !== "value" && (
            <TemplateEditor
              value={binding.transform?.template ?? ""}
              onChange={setTemplate}
              onInsert={insertPlaceholder}
              fields={fieldList}
              fieldsLoading={fields.loading}
              textareaRef={templateRef}
              pendingCaretRef={pendingCaretRef}
              readonly={readonly}
              perRow={shape === "collection"}
            />
          )}

          {/* ── Limit ─────────────────────────────────────────────────── */}
          {shape === "collection" && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                At most this many rows
              </Label>
              <Input
                type="number"
                min={1}
                inputMode="numeric"
                value={String(binding.limit ?? DEFAULT_ROW_LIMIT)}
                onChange={(e) => setLimit(e.target.value)}
                disabled={readonly}
                className="text-base"
              />
              <p className="text-[11px] text-muted-foreground">
                When the table has more, the agent is told the list was cut
                short.
              </p>
            </div>
          )}
        </>
      )}

      {/* ── Missing ───────────────────────────────────────────────────── */}
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">
          When there is no data
        </Label>
        <Select
          value={binding.missing}
          onValueChange={(v) => {
            const choice = MISSING_CHOICES.find((c) => c.value === v);
            if (choice) onChange({ ...binding, missing: choice.value });
          }}
          disabled={readonly}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MISSING_CHOICES.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                <span>{c.label}</span>
                <span className="ml-2 text-xs text-muted-foreground hidden sm:inline">
                  — {c.hint}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <CustomDataBindingPreview binding={binding} variableName={variableName} />
    </div>
  );
}

function TemplateEditor({
  value,
  onChange,
  onInsert,
  fields,
  fieldsLoading,
  textareaRef,
  pendingCaretRef,
  readonly,
  perRow,
}: {
  value: string;
  onChange: (v: string) => void;
  onInsert: (token: string) => void;
  fields: readonly Field[];
  fieldsLoading: boolean;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  pendingCaretRef: RefObject<number | null>;
  readonly?: boolean;
  perRow: boolean;
}) {
  // Put the caret right after an inserted placeholder once its value is on screen.
  useLayoutEffect(() => {
    const caret = pendingCaretRef.current;
    const el = textareaRef.current;
    if (caret === null || !el || el.value !== value) return;
    pendingCaretRef.current = null;
    el.focus();
    el.setSelectionRange(caret, caret);
  }, [value, pendingCaretRef, textareaRef]);

  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">
        {perRow ? "How each row reads" : "How the record reads"}
      </Label>
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="- {name}: {description}"
        disabled={readonly}
        rows={2}
        className="font-mono text-base sm:text-sm"
      />
      <div className="flex flex-wrap gap-1">
        {fieldsLoading && (
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Loading fields
          </span>
        )}
        {fields.flatMap((f) =>
          placeholdersFor(f).map((p) => (
            <button
              key={p.token}
              type="button"
              // Keep the textarea's caret/selection: the chip must not take focus.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onInsert(p.token)}
              disabled={readonly}
              title={`Insert ${p.token}`}
              className="rounded-md border border-border bg-background px-1.5 py-0.5 text-[11px] text-foreground transition-colors hover:border-primary/50 hover:bg-primary/10 disabled:opacity-50"
            >
              {p.label}
            </button>
          )),
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">
        Click a field to insert it where your cursor is.
      </p>
    </div>
  );
}
