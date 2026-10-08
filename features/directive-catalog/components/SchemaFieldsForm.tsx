"use client";

/**
 * SchemaFieldsForm — the form generated from a directive's item schema.
 *
 * Renders the fields `deriveSchemaFields` produced: essential ones up front,
 * the rest behind "More fields". Controlled: the parent owns the answers
 * (`SchemaFieldValues`) and turns them into a payload with
 * `buildSchemaPayload`, whose warnings it passes back here. This form shows the
 * ones a touched field owns; the caller shows `splitWarnings(...).action` beside
 * its own button. Nothing here can stop the person's action — a warning is a
 * sentence, never a disabled button.
 *
 * Id fields that point at a real record become a search (the same
 * `RecordReferencePicker` the reference picker uses), so nobody types an id.
 *
 * Consumers: the "Add a reference" picker (Create / Update) and the admin
 * directive builder. Pure mapping lives in `../schemaFields.ts`.
 */

import { useState } from "react";
import { ChevronDown, ChevronRight, RotateCcw, Search, X } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select as SelectRoot,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@ai-matrx/design-system";
import {
  Button,
  DateField,
  Field,
  SelectTrigger,
  Textarea,
} from "@ai-matrx/design-system/controls";
import { cn } from "@/lib/utils";
import { getEntityInfo } from "@/features/scopes/registry/entityRegistry";
import { RecordReferencePicker } from "@/features/matrx-envelope/components/ReferenceTypeAdder";
import { PERSON_TOKEN } from "@/features/directive-catalog/identityPicker";
import TaskAssigneePicker from "@/features/tasks/components/TaskAssigneePicker";
import { TaskRecurrencePicker } from "@/features/tasks/components/TaskRecurrencePicker";
import {
  emptyFieldLabel,
  splitWarnings,
  type SchemaField,
  type SchemaFieldValue,
  type SchemaFieldValues,
  type SchemaFieldWarning,
  type SchemaFormMode,
} from "@/features/directive-catalog/schemaFields";

export interface SchemaFieldsFormProps {
  fields: readonly SchemaField[];
  values: SchemaFieldValues;
  /** `null` returns the field to "not set" (create) / "unchanged" (update). */
  onChange: (key: string, value: SchemaFieldValue | null) => void;
  mode: SchemaFormMode;
  warnings?: readonly SchemaFieldWarning[];
  /** Start with "More fields" open (an update whose essential tier is empty). */
  moreOpenByDefault?: boolean;
  className?: string;
}

/** Radix Select forbids "" as an item value; this stands for "not set". */
const UNSET = "__unset__";

/**
 * ONE GEOMETRY (G17, 2026-10-07). Every control in this form is a
 * `@ai-matrx/design-system/controls` control — 28px, capsule, 13px — so text,
 * numbers, dates and pick-lists line up. The two app pickers (people, repeat)
 * are not package controls; this class puts their trigger on the same tokens
 * (height, half-gap, radius, inset, label size), on a phone too
 * (`max-lg:` beats the repeat picker's own 44px). Guard:
 * `__tests__/the-write-form-is-one-control-family.test.tsx`.
 */
export const SCHEMA_PICKER_GEOMETRY =
  "h-[var(--matrx-control-size)] max-lg:h-[var(--matrx-control-size)] mx-[var(--matrx-control-half-gap)] w-[calc(100%-var(--matrx-control-gap))] rounded-full px-[var(--matrx-control-inset-text)] text-[length:var(--matrx-control-label)] lg:text-[length:var(--matrx-control-label)] justify-start border-border";

export function SchemaFieldsForm({
  fields,
  values,
  onChange,
  mode,
  warnings = [],
  moreOpenByDefault = false,
  className,
}: SchemaFieldsFormProps) {
  const essential = fields.filter((f) => f.tier === "essential");
  const more = fields.filter((f) => f.tier === "more");
  const [moreOpen, setMoreOpen] = useState(
    moreOpenByDefault || essential.length === 0,
  );
  // "Set" means it will be sent: touched AND not blank.
  const setInMore = more.filter((f) => {
    const v = values[f.key];
    return v?.touched && !(typeof v.raw === "string" && v.raw.trim() === "");
  }).length;

  const fieldWarnings = splitWarnings(warnings, values).field;
  const warningFor = (key: string) =>
    fieldWarnings.filter((w) => w.key === key).map((w) => w.message);

  const renderField = (field: SchemaField) => (
    <FieldRow
      key={field.key}
      field={field}
      value={values[field.key]}
      mode={mode}
      warnings={warningFor(field.key)}
      onChange={(v) => onChange(field.key, v)}
    />
  );

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {essential.map(renderField)}

      {more.length > 0 && (
        <div className="flex flex-col gap-3">
          <Button
            variant="quiet"
            onClick={() => setMoreOpen((v) => !v)}
            aria-expanded={moreOpen}
            icon={moreOpen ? <ChevronDown /> : <ChevronRight />}
            meta={setInMore > 0 ? `${setInMore} set` : undefined}
            className="self-start"
          >
            {`More fields (${more.length})`}
          </Button>
          {moreOpen && more.map(renderField)}
        </div>
      )}
    </div>
  );
}

// ── One field ───────────────────────────────────────────────────────────────

function FieldRow({
  field,
  value,
  mode,
  warnings,
  onChange,
}: {
  field: SchemaField;
  value: SchemaFieldValue | undefined;
  mode: SchemaFormMode;
  warnings: string[];
  onChange: (value: SchemaFieldValue | null) => void;
}) {
  const touched = value?.touched === true;
  const id = `schema-field-${field.key}`;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex min-h-7 items-center gap-1.5">
        <label htmlFor={id} className="text-xs font-medium text-foreground">
          {field.label}
        </label>
        {field.required && (
          <span className="text-[11px] text-muted-foreground">Required</span>
        )}
        {touched && (
          <Button
            variant="quiet"
            onClick={() => onChange(null)}
            aria-label={`Reset ${field.label}`}
            title={mode === "update" ? "Leave unchanged" : "Reset"}
            icon={<RotateCcw />}
            className="ml-auto"
          />
        )}
      </div>
      <FieldControl
        id={id}
        field={field}
        value={value}
        mode={mode}
        onChange={onChange}
      />
      {warnings.map((w) => (
        <p key={w} className="text-xs text-amber-700 dark:text-amber-300">
          {w}
        </p>
      ))}
    </div>
  );
}

function FieldControl({
  id,
  field,
  value,
  mode,
  onChange,
}: {
  id: string;
  field: SchemaField;
  value: SchemaFieldValue | undefined;
  mode: SchemaFormMode;
  onChange: (value: SchemaFieldValue | null) => void;
}) {
  const raw = value?.touched ? value.raw : "";
  const text = typeof raw === "string" ? raw : "";
  const setText = (next: string) => onChange({ raw: next, touched: true });
  // THE empty word, for every kind (`emptyFieldLabel`).
  const placeholder = emptyFieldLabel(
    field,
    mode,
    field.recordToken === PERSON_TOKEN,
  );

  switch (field.kind) {
    case "boolean":
    case "enum":
      return (
        <ChoiceControl
          id={id}
          field={field}
          value={value}
          mode={mode}
          onChange={onChange}
        />
      );
    case "record":
      // A person is chosen from people — the one assignee search — never
      // from a generic record list of "user profiles".
      if (field.recordToken === PERSON_TOKEN) {
        return (
          <TaskAssigneePicker
            assigneeId={text || null}
            onChange={(userId) =>
              onChange(userId ? { raw: userId, touched: true } : null)
            }
            emptyLabel={placeholder}
            className={SCHEMA_PICKER_GEOMETRY}
            labelClassName="text-[length:var(--matrx-control-label)]"
          />
        );
      }
      return (
        <RecordControl
          field={field}
          value={value}
          emptyLabel={placeholder}
          onChange={onChange}
        />
      );
    case "recurrence":
      // The task editor's own repeat presets — the same words, the same rules.
      return (
        <TaskRecurrencePicker
          value={text || null}
          onChange={(rule) => onChange(rule ? { raw: rule, touched: true } : null)}
          emptyLabel={placeholder}
          className={SCHEMA_PICKER_GEOMETRY}
        />
      );
    case "date":
    case "time":
    case "datetime":
      return (
        <DateTimeControl
          id={id}
          kind={field.kind}
          value={text}
          emptyLabel={placeholder}
          onChange={setText}
        />
      );
    case "number":
    case "integer":
      return (
        <Field
          id={id}
          type="text"
          inputMode={field.kind === "integer" ? "numeric" : "decimal"}
          value={text}
          placeholder={placeholder}
          onChange={(e) => setText(e.target.value)}
        />
      );
    case "json":
      return (
        <Textarea mono minHeight={72}
          id={id}
          value={text}
          placeholder={placeholder || "JSON"}
          spellCheck={false}
          onChange={(e) => setText(e.target.value)}
        />
      );
    default:
      // One line, the 28px capsule (G17): a 36px one-row textarea stood
      // taller than every date and pick-list beside it. JSON above stays the
      // multi-line Textarea — a structure is written over lines.
      return (
        <Field
          id={id}
          type="text"
          value={text}
          placeholder={placeholder}
          onChange={(e) => setText(e.target.value)}
        />
      );
  }
}

/** Yes/No and pick-lists: one Select, with an honest "not set" first option. */
function ChoiceControl({
  id,
  field,
  value,
  mode,
  onChange,
}: {
  id: string;
  field: SchemaField;
  value: SchemaFieldValue | undefined;
  mode: SchemaFormMode;
  onChange: (value: SchemaFieldValue | null) => void;
}) {
  const isBool = field.kind === "boolean";
  const current = !value?.touched
    ? UNSET
    : isBool
      ? value.raw === true
        ? "true"
        : "false"
      : String(value.raw) || UNSET;

  const unsetLabel = emptyFieldLabel(field, mode);

  const options: Array<{ value: string; label: string }> = isBool
    ? [
        { value: "true", label: "Yes" },
        { value: "false", label: "No" },
      ]
    : field.enumValues.map((v) => ({ value: v, label: field.enumLabels[v] ?? v }));

  return (
    // A tri-state (not set / Yes / No), so a boolean is a Select, not a
    // Switch: a Switch cannot say "Unchanged".
    // The compound door of THE select (`SelectTrigger` from /controls — the
    // same 28px capsule as `Select`), kept for the `id` its <label> points at.
    <SelectRoot
      value={current}
      onValueChange={(next) => {
        if (next === UNSET) onChange(null);
        else if (isBool) onChange({ raw: next === "true", touched: true });
        else onChange({ raw: next, touched: true });
      }}
    >
      <SelectTrigger id={id}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={UNSET}>{unsetLabel}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </SelectRoot>
  );
}

/** An id that points at a real record: search it, show its name, never the id. */
function RecordControl({
  field,
  value,
  emptyLabel,
  onChange,
}: {
  field: SchemaField;
  value: SchemaFieldValue | undefined;
  /** `emptyFieldLabel` — "" means the control's own "Choose a …" prompt. */
  emptyLabel: string;
  onChange: (value: SchemaFieldValue | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const info = field.recordToken ? getEntityInfo(field.recordToken) : null;
  const picked =
    value?.touched && typeof value.raw === "string" && value.raw.length > 0
      ? value
      : null;
  const noun = (info?.label ?? field.label).toLowerCase();
  const Icon = info?.Icon;

  if (!field.recordToken) return null;

  return (
    // The row's width, like every sibling field (G18 review: a label-width
    // pill beside full-width pickers).
    <div className="flex w-full min-w-0 items-center" data-record-control="">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            icon={Icon ? <Icon /> : <Search />}
            className="min-w-0 flex-1 justify-start"
          >
            {picked
              ? (picked.recordTitle ?? `Chosen ${noun}`)
              : emptyLabel || `Choose a ${noun}`}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-2" align="start">
          <RecordReferencePicker
            token={field.recordToken}
            onPickMany={(items) => {
              const item = items[0] as
                { id?: unknown; label?: unknown } | undefined;
              if (!item || typeof item.id !== "string") return;
              onChange({
                raw: item.id,
                touched: true,
                recordTitle: typeof item.label === "string" ? item.label : null,
              });
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
      {picked && (
        <Button
          variant="quiet"
          removes
          onClick={() => onChange(null)}
          aria-label={`Remove ${field.label}`}
          icon={<X />}
        />
      )}
    </div>
  );
}

/**
 * A date, time or date-and-time field: THE package date control
 * (`DateField`, `@ai-matrx/design-system/controls`, G16 2026-10-07) — typed
 * entry, a calendar (sheet on a phone), Clear, ISO in and out (`yyyy-mm-dd`,
 * `yyyy-mm-ddTHH:mm`, `HH:mm`). Untouched, it says the form's empty word
 * ("Unchanged" on an Update), never a browser mask.
 */
function DateTimeControl({
  id,
  kind,
  value,
  emptyLabel,
  onChange,
}: {
  id: string;
  kind: "date" | "time" | "datetime";
  value: string;
  emptyLabel: string;
  onChange: (next: string) => void;
}) {
  return (
    <DateField
      id={id}
      mode={kind}
      value={value || null}
      emptyLabel={emptyLabel || (kind === "time" ? "Pick a time" : "Pick a date")}
      onValueChange={(next) => onChange(next ?? "")}
    />
  );
}
