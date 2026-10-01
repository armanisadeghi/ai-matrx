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
 * common-docs/policies/active-org-is-never-a-list-filter.md). It used to list only the ACTIVE
 * organization's tables — a silent filter. The chosen
 * Table's details are read in the organization the Table lives in (`CustomDataRecordsScope`).
 * Contract: `common-docs/projects/data-kits/PLAN.md` § P1.
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
import type { CustomDataBinding } from "@/features/agents/types/agent-definition.types";
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
import {
  countsByOrganization,
  inLane,
  inOrganization,
  useTablesEverywhere,
} from "@/features/unified-data/hub/useTablesEverywhere";
import { EntityOrgFilter } from "@/lib/entity-list/components/EntityOrgFilter";
import { EntityScopeTabs } from "@/lib/entity-list/components/EntityScopeTabs";
import type { EntityScopeCounts } from "@/lib/entity-list/types";
import { makeScope } from "@/lib/list-scope/types";
import {
  DATA_HOME_SCOPES,
  DATA_HOME_SHELL_LANES,
  isDataHomeScope,
  type DataHomeScope,
} from "@/features/unified-data/hub/dataHomeScope";
import type { DataHomeTableRow } from "@/features/unified-data/hub/doors";
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

/** What a table row says beside its name: its organization, and what kind of table it is. */
function tableHint(row: DataHomeTableRow): string {
  const parts = [row.organization_name];
  if (row.kind && row.kind !== "table") parts.push(row.kind);
  if (row.kept_by_the_app) parts.push("kept by the app");
  return parts.join(" · ");
}

export function CustomDataBindingPicker({
  binding,
  onChange,
  readonly,
  variableName,
}: CustomDataBindingPickerProps) {
  const tables = useTablesEverywhere();
  // THE ORGANIZATION FILTER: All organizations (null) every time the picker opens — a filter on
  // this list only, never remembered, never the active organization.
  const [orgFilter, setOrgFilter] = useState<string | null>(null);
  // THE SHELL'S LANES (All · Mine · My team · My Orgs · Shared · Public · System), All on every open.
  const [lane, setLane] = useState<DataHomeScope>("all");
  const tableId = binding.table_id || null;
  const shape = binding.semantic_type;
  // Tables the app keeps for itself (choice lists, ledgers) are out of sight
  // unless the author asks for them.
  const [showAppTables, setShowAppTables] = useState(false);

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

  // The organization filter narrows every lane; the lane narrows the list; counts are what shows.
  const shown = (t: { kept_by_the_app: boolean; table_id: string }) =>
    showAppTables || !t.kept_by_the_app || t.table_id === tableId;
  const inOrg = inOrganization(tables.rows, orgFilter);
  const allTables = inLane(inOrg, lane);
  const appKeptCount = allTables.filter((t) => t.kept_by_the_app).length;
  const laneCounts: EntityScopeCounts = {
    byKind: Object.fromEntries(
      DATA_HOME_SCOPES.map((k) => [k, inLane(inOrg, k).filter(shown).length]),
    ),
    narrow: {
      all: countsByOrganization(inLane(tables.rows, lane).filter(shown)),
    },
  };
  // ONE FLAT LIST, never grouped by organization: each row names its organization in its hint,
  // and the search reads it too.
  const tableOptions: CreatableOption[] = allTables.filter(shown).map((t) => ({
    value: t.table_id,
    label: t.table_name,
    hint: tableHint(t),
    keywords: `${t.organization_name} ${t.kind}`,
  }));
  // Looked up in the COMPLETE answer: a table outside the filter still knows its organization.
  const chosenRow = tables.rows.find((t) => t.table_id === tableId) ?? null;

  const storedTableMissing =
    Boolean(tableId) && !tables.loading && !tables.error && chosenRow === null;
  const filteredOut =
    chosenRow !== null &&
    !allTables.some((t) => t.table_id === chosenRow.table_id);
  const filteredToOne = orgFilter !== null || lane !== "all";

  return (
    <div className="space-y-2">
      {/* ── Table ─────────────────────────────────────────────────────── */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label className="shrink-0 text-xs font-medium text-foreground">
            Table
          </Label>
          {/* THE SHELL'S TAB BAR, on the row it filters — never a private one. */}
          <div className="min-w-0 flex-1">
            <EntityScopeTabs
              scope={makeScope(lane)}
              scopes={[...DATA_HOME_SHELL_LANES]}
              counts={laneCounts}
              countsLoading={tables.loading}
              onChange={(next) =>
                setLane(isDataHomeScope(next.kind) ? next.kind : "all")
              }
            />
          </div>
          {/* THE SHELL'S ORGANIZATION FILTER, on the row it filters (default All organizations). */}
          <EntityOrgFilter
            orgId={orgFilter}
            onChange={setOrgFilter}
            counts={laneCounts}
            countsLoading={tables.loading}
          />
        </div>
        <CreatablePicker
          value={tableId}
          options={tableOptions}
          onSelect={selectTable}
          placeholder={
            tables.loading
              ? "Loading your tables…"
              : tables.error
                ? "Your tables could not be read"
                : tableOptions.length === 0
                  ? filteredToOne
                    ? "No tables here — choose All and All organizations"
                    : "No tables yet — make one in Data"
                  : "Choose a table…"
          }
          searchPlaceholder="Search your tables…"
          noun="table"
          manageAction={{
            label: "Open Data to add or edit tables",
            href: "/data-v2",
          }}
          footerActions={
            appKeptCount > 0
              ? [
                  {
                    label: showAppTables
                      ? "Hide the tables the app keeps"
                      : `Show ${appKeptCount} ${appKeptCount === 1 ? "table" : "tables"} the app keeps`,
                    note: "Choice lists and other tables the app manages for itself.",
                    onSelect: () => setShowAppTables((v) => !v),
                  },
                ]
              : undefined
          }
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
            <ErrorAlchemyMenu error={tables.error.message} />
          </p>
        )}
        {filteredOut && (
          <p className="text-[11px] text-muted-foreground">
            {chosenRow?.table_name ?? "The bound table"} is hidden by these
            filters{" "}
            <button
              type="button"
              className="underline underline-offset-2"
              onClick={() => {
                setOrgFilter(null);
                setLane("all");
              }}
            >
              Show everything
            </button>
          </p>
        )}
        {storedTableMissing && (
          <p className="text-[11px] text-warning">
            Bound table unavailable — pick one to rebind
          </p>
        )}
      </div>

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
              href: `/data-v2/${tableId}`,
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
    el.focus();
    el.setSelectionRange(caret, caret);
  }, [value, pendingCaretRef, textareaRef]);

  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-foreground">
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
