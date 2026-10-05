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
 * THE TABLE LIST IS THE DATA HOME'S (lane ORG-FILTER-CLASS, Arman 2026-09-30): every table the
 * person can see across ALL her organizations (`useTablesEverywhere` → custom.data_home_tables),
 * with the shell's organization filter (`EntityOrgFilter`) on the Table row — All organizations
 * on every open, never remembered, never the active organization (law:
 * common-docs/policies/access-ladder.md). It used to list only the ACTIVE
 * organization's tables — a silent filter. The chosen
 * Table's details are read in the organization the Table lives in (`CustomDataRecordsScope`).
 * Contract: `features/kits/FEATURE.md` § Data model.
 */

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { Loader2 } from "lucide-react";
import {
  useFields,
  useRecords,
  useTable,
  isEntityReferenceConfig,
  type Field,
} from "@ai-matrx/records/react";
import { fieldName, rowNameIn } from "@ai-matrx/records-ui";
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
import type { CustomDataBinding } from "@ai-matrx/chat/agents/types/agent-definition.types";
import {
  MISSING_CHOICES,
  SHAPE_CHOICES,
  defaultTemplate,
  placeholdersFor,
  titleFieldOf,
  type CustomDataShape,
} from "./customDataBinding";
import { CustomDataBindingPreview } from "./CustomDataBindingPreview";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { useTablesEverywhere } from "@/features/unified-data/hub/useTablesEverywhere";
import { TableChooser } from "@/features/unified-data/hub/TableChooser";
import {
  CustomDataRecordsScope,
  useCustomDataOrganizationId,
} from "./CustomDataRecordsScope";
import { useBindingKnobs } from "./useBindingKnobs";

/** How many records the record picker lists. Search narrows within them. */

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
  const tables = useTablesEverywhere();
  const tableId = binding.table_id || null;
  const shape = binding.semantic_type;

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
      // The row limit is filled in by the details panel once its knob answers.
      ...(shape === "collection" && binding.limit !== undefined
        ? { limit: binding.limit }
        : {}),
    });
  };

  // Looked up in the COMPLETE answer: a table outside the filter still knows its organization.
  const chosenRow = tables.rows.find((t) => t.table_id === tableId) ?? null;

  return (
    <div className="space-y-2">
      {/* ── Table ─ THE ONE TABLE PICKER (TableChooser), shared with the run form's Table input. */}
      <TableChooser
        tables={tables}
        value={tableId}
        onSelect={selectTable}
        readonly={readonly}
        missingNote="Bound table unavailable — pick one to rebind"
      />

      {tableId ? (
        <CustomDataRecordsScope
          tableId={tableId}
          organizationId={chosenRow?.organization_id}
          fallback={(held) => (
            <>
              <p className="text-[11px] text-muted-foreground">
                {held.state === "resolving" ? (
                  <span className="inline-flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Reading the table…
                  </span>
                ) : held.state === "not-given" ? (
                  "You can't open this table's records"
                ) : (
                  <>
                    Where this table lives could not be read: {held.why}{" "}
                    <button
                      type="button"
                      className="underline underline-offset-2"
                      onClick={held.retry}
                    >
                      Try again
                    </button>
                  </>
                )}
              </p>
              <MissingChoice
                binding={binding}
                onChange={onChange}
                readonly={readonly}
              />
            </>
          )}
        >
          <BoundTableDetails
            binding={binding}
            onChange={onChange}
            readonly={readonly}
            variableName={variableName}
          />
        </CustomDataRecordsScope>
      ) : (
        <>
          <MissingChoice
            binding={binding}
            onChange={onChange}
            readonly={readonly}
          />
          <CustomDataBindingPreview
            binding={binding}
            variableName={variableName}
          />
        </>
      )}
    </div>
  );
}

/** The chosen Table's shape, record, field, template and limit — read in the Table's own organization. */
function BoundTableDetails({
  binding,
  onChange,
  readonly,
  variableName,
}: CustomDataBindingPickerProps) {
  const tableId = binding.table_id || null;
  const table = useTable(tableId);
  const fields = useFields(tableId);
  const shape = binding.semantic_type;
  const needsRecord = shape !== "collection";
  // Grows by a page at a time ("Load more") so EVERY record is reachable; the
  // picker's type-ahead then narrows what has been read.
  const knobs = useBindingKnobs(useCustomDataOrganizationId());
  const recordPage = knobs.recordPickerPage;
  const defaultRowLimit = knobs.defaultRowLimit;
  const [loadedPages, setLoadedPages] = useState(1);
  const records = useRecords(needsRecord && recordPage ? tableId : null, {
    pageSize: (recordPage ?? 0) * loadedPages,
  });
  const templateRef = useRef<HTMLTextAreaElement | null>(null);
  const pendingCaretRef = useRef<number | null>(null);

  const fieldList = fields.data ?? [];
  const tableRow = table.data;

  // PREFILL: once a table's fields arrive and a table/record read has no row
  // template yet, start from the table's own title column + its next field.
  useEffect(() => {
    if (readonly || !tableId || shape === "value") return;
    if (shape === "collection" && defaultRowLimit === null) return;
    if (binding.transform || fields.loading || !fields.data) return;
    if (fields.data.length === 0) return;
    onChange({
      ...binding,
      transform: {
        name: "list",
        template: defaultTemplate(tableRow ?? null, fields.data),
        join: "\n",
        ...(shape === "collection"
          ? { max: binding.limit ?? defaultRowLimit ?? undefined }
          : {}),
      },
      ...(shape === "collection" && binding.limit === undefined
        ? { limit: defaultRowLimit ?? undefined }
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
    defaultRowLimit,
  ]);

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
    if (next === "collection") {
      const limit = binding.limit ?? defaultRowLimit;
      if (limit !== null) base.limit = limit;
    }
    // Keep the author's template when moving between table and record reads;
    // a single value needs none.
    if (next !== "value" && binding.transform) {
      const { template, join } = binding.transform;
      base.transform = {
        name: "list",
        template,
        ...(join !== undefined ? { join } : {}),
        ...(next === "collection"
          ? base.limit !== undefined
            ? { max: base.limit }
            : {}
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
    // With the text editor closed the chip appends; open, it goes at the caret.
    const el = templateRef.current;
    const editing = Boolean(el?.closest("details")?.open);
    const start = editing
      ? (el?.selectionStart ?? current.length)
      : current.length;
    const end = editing ? (el?.selectionEnd ?? current.length) : current.length;
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

  // A record's name alone can repeat ("Dana Whitfield" three times), so each
  // option also shows the row's next one or two filled columns.
  const titleField = titleFieldOf(tableRow ?? null, fieldList);
  const hintFields = fieldList
    .filter(
      (f) => f.id !== titleField?.id && !isEntityReferenceConfig(f.config),
    )
    .slice(0, 6);
  const recordOptions: CreatableOption[] = (records.data?.rows ?? []).map(
    (row) => {
      const hint = hintFields
        .map((f) => row.document[f.key])
        .filter(
          (v): v is string | number =>
            (typeof v === "string" && v.trim() !== "") || typeof v === "number",
        )
        .slice(0, 2)
        .map((v) => String(v))
        .join(" · ");
      return {
        value: row.id,
        label: rowNameIn(tableRow ?? null, row),
        hint: hint || undefined,
        keywords: hint || undefined,
      };
    },
  );

  const recordTotal = records.data?.total ?? null;
  const recordsCapped =
    recordTotal !== null && recordTotal > recordOptions.length;

  return (
    <>
      {/* ── Shape ─────────────────────────────────────────────────── */}
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-foreground">
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
          <Label className="text-xs font-medium text-foreground">Record</Label>
          <CreatablePicker
            value={binding.record_id ?? null}
            options={recordOptions}
            onSelect={(id) => onChange({ ...binding, record_id: id })}
            placeholder={
              records.loading
                ? "Loading records…"
                : records.error
                  ? "Records could not be read"
                  : recordOptions.length === 0
                    ? "This table has no records yet"
                    : "Choose a record…"
            }
            searchPlaceholder="Search records…"
            noun="record"
            manageAction={{
              label: "Open this table to add records",
              href: `/data/${tableId}`,
            }}
            footerActions={
              recordsCapped
                ? [
                    {
                      label: `Load ${Math.min(recordPage ?? 0, (recordTotal ?? 0) - recordOptions.length)} more records`,
                      note: `Showing ${recordOptions.length} of ${recordTotal}.`,
                      onSelect: () => setLoadedPages((n) => n + 1),
                    },
                  ]
                : undefined
            }
            disabled={readonly}
            loading={records.loading}
            ariaLabel="Record"
          />
          {recordsCapped && !records.error && (
            <p className="text-[11px] text-muted-foreground">
              Showing {recordOptions.length} of {recordTotal} records
            </p>
          )}
          {records.error && (
            <p className="text-[11px] text-destructive">
              Records could not be read: {records.error.message}
              <ErrorAlchemyMenu error={records.error.message} />
            </p>
          )}
        </div>
      )}

      {/* ── Field (one value) ─────────────────────────────────────── */}
      {shape === "value" && (
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-foreground">Field</Label>
          <Select
            value={binding.field_key ?? ""}
            onValueChange={(key) => onChange({ ...binding, field_key: key })}
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

      {knobs.error && (
        <p className="text-[11px] text-destructive">
          {knobs.error} <ErrorAlchemyMenu error={knobs.error} />
        </p>
      )}

      {/* ── Limit ─────────────────────────────────────────────────── */}
      {shape === "collection" && (
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-foreground">
            At most this many rows
          </Label>
          <Input
            type="number"
            min={1}
            inputMode="numeric"
            value={String(binding.limit ?? defaultRowLimit ?? "")}
            onChange={(e) => setLimit(e.target.value)}
            disabled={readonly}
            className="text-base"
          />
          <p className="text-[11px] text-muted-foreground">
            Extra rows are cut; the agent is told
          </p>
        </div>
      )}

      <MissingChoice
        binding={binding}
        onChange={onChange}
        readonly={readonly}
      />

      <CustomDataBindingPreview binding={binding} variableName={variableName} />
    </>
  );
}

function MissingChoice({
  binding,
  onChange,
  readonly,
}: Pick<CustomDataBindingPickerProps, "binding" | "onChange" | "readonly">) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-foreground">
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
    if (!el.closest("details")?.open) return;
    el.focus();
    el.setSelectionRange(caret, caret);
  }, [value, pendingCaretRef, textareaRef]);

  // A person reads the template as words and field chips — never `{field_key}`
  // braces. The raw text stays editable behind "Edit text".
  const labelFor = new Map<string, string>();
  for (const f of fields) {
    for (const p of placeholdersFor(f)) labelFor.set(p.token, p.label);
  }
  const pieces = value.split(/(\{[^{}]+\})/).filter((piece) => piece !== "");

  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-foreground">
        {perRow ? "How each row reads" : "How the record reads"}
      </Label>
      <div className="min-h-9 rounded-md border border-border bg-background px-2 py-1.5 text-sm leading-7 text-foreground">
        {pieces.length === 0 ? (
          <span className="text-muted-foreground">Add fields below</span>
        ) : (
          pieces.map((piece, i) => {
            const isToken = /^\{[^{}]+\}$/.test(piece);
            if (!isToken) {
              return (
                <span key={i} className="whitespace-pre-wrap">
                  {piece}
                </span>
              );
            }
            const label = labelFor.get(piece);
            return (
              <span
                key={i}
                className={
                  label
                    ? "mx-0.5 rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary"
                    : "mx-0.5 rounded bg-warning/10 px-1.5 py-0.5 text-xs font-medium text-warning"
                }
              >
                {label ?? "Unknown field"}
              </span>
            );
          })
        )}
      </div>
      <details className="group">
        <summary className="cursor-pointer select-none text-[11px] text-muted-foreground hover:text-foreground">
          Edit text
        </summary>
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="- {name}: {description}"
          disabled={readonly}
          rows={2}
          className="mt-1 font-mono text-base sm:text-sm"
        />
      </details>
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
              aria-label={`Add ${p.label}`}
              className="rounded-md border border-border bg-background px-1.5 py-0.5 text-[11px] text-foreground transition-colors hover:border-primary/50 hover:bg-primary/10 disabled:opacity-50"
            >
              {p.label}
            </button>
          )),
        )}
      </div>
    </div>
  );
}
