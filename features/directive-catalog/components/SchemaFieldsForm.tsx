"use client";

/**
 * SchemaFieldsForm — the form generated from a directive's item schema.
 *
 * Renders the fields `deriveSchemaFields` produced: essential ones up front,
 * the rest behind "More fields". Controlled: the parent owns the answers
 * (`SchemaFieldValues`) and turns them into a payload with
 * `buildSchemaPayload`, whose warnings it passes back here to show beside each
 * field. Nothing in this form can stop the person's action — a warning is a
 * sentence next to a field, never a disabled button.
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
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@ai-matrx/design-system";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { getEntityInfo } from "@/features/scopes/registry/entityRegistry";
import { RecordReferencePicker } from "@/features/matrx-envelope/components/ReferenceTypeAdder";
import type {
  SchemaField,
  SchemaFieldValue,
  SchemaFieldValues,
  SchemaFieldWarning,
  SchemaFormMode,
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
const CLEAR = "__clear__";

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
  const setInMore = more.filter((f) => values[f.key]?.touched).length;

  const warningFor = (key: string) =>
    warnings.filter((w) => w.key === key).map((w) => w.message);

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
          <button
            type="button"
            onClick={() => setMoreOpen((v) => !v)}
            aria-expanded={moreOpen}
            className="flex min-h-9 items-center gap-1 self-start rounded-md px-1 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            {moreOpen ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
            More fields ({more.length})
            {setInMore > 0 && (
              <span className="text-primary"> · {setInMore} set</span>
            )}
          </button>
          {moreOpen && more.map(renderField)}
        </div>
      )}

      {warnings
        .filter((w) => w.key === null)
        .map((w) => (
          <p
            key={w.message}
            className="text-xs text-amber-700 dark:text-amber-300"
          >
            {w.message}
          </p>
        ))}
    </div>
  );
}

// ── One field ───────────────────────────────────────────────────────────────

function hintFor(field: SchemaField, mode: SchemaFormMode): string {
  if (mode === "update") return "Unchanged";
  if (field.defaultValue !== undefined && field.defaultValue !== null) {
    const d =
      typeof field.defaultValue === "string"
        ? field.defaultValue
        : JSON.stringify(field.defaultValue);
    if (d !== "{}" && d !== "[]") return `Default: ${d}`;
  }
  return "";
}

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
  const clearing =
    mode === "update" &&
    touched &&
    field.nullable &&
    typeof value?.raw === "string" &&
    value.raw.trim() === "";
  const id = `schema-field-${field.key}`;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex min-h-5 items-center gap-1.5">
        <label htmlFor={id} className="text-xs font-medium text-foreground">
          {field.label}
        </label>
        {field.required && (
          <span className="text-[11px] text-muted-foreground">Required</span>
        )}
        {clearing && (
          <span className="text-[11px] text-amber-700 dark:text-amber-300">
            Will be cleared
          </span>
        )}
        {touched && (
          <button
            type="button"
            onClick={() => onChange(null)}
            aria-label={`Reset ${field.label}`}
            title={mode === "update" ? "Leave unchanged" : "Reset"}
            className="ml-auto flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <RotateCcw className="h-3 w-3" />
          </button>
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
  const placeholder = hintFor(field, mode);

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
      return (
        <RecordControl field={field} value={value} mode={mode} onChange={onChange} />
      );
    case "date":
    case "time":
    case "datetime":
      return (
        <Input
          id={id}
          type={
            field.kind === "date"
              ? "date"
              : field.kind === "time"
                ? "time"
                : "datetime-local"
          }
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="h-9 text-base lg:text-sm"
        />
      );
    case "number":
    case "integer":
      return (
        <Input
          id={id}
          type="text"
          inputMode={field.kind === "integer" ? "numeric" : "decimal"}
          value={text}
          placeholder={placeholder}
          onChange={(e) => setText(e.target.value)}
          className="h-9 text-base lg:text-sm"
        />
      );
    case "json":
      return (
        <Textarea
          id={id}
          value={text}
          placeholder={placeholder || "JSON"}
          spellCheck={false}
          onChange={(e) => setText(e.target.value)}
          className="min-h-[72px] font-mono text-base lg:text-xs"
        />
      );
    default:
      return (
        <Textarea
          id={id}
          rows={1}
          value={text}
          placeholder={placeholder}
          onChange={(e) => setText(e.target.value)}
          className="field-sizing-content min-h-9 resize-none py-1.5 text-base lg:text-sm"
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
      : value.raw === ""
        ? CLEAR
        : String(value.raw);

  const unsetLabel =
    mode === "update"
      ? "Unchanged"
      : field.defaultValue !== undefined && field.defaultValue !== null
        ? `Default (${isBool ? (field.defaultValue ? "Yes" : "No") : String(field.defaultValue)})`
        : "Not set";

  const options: Array<{ value: string; label: string }> = isBool
    ? [
        { value: "true", label: "Yes" },
        { value: "false", label: "No" },
      ]
    : field.enumValues.map((v) => ({ value: v, label: v.replace(/_/g, " ") }));

  return (
    <Select
      value={current}
      onValueChange={(next) => {
        if (next === UNSET) onChange(null);
        else if (next === CLEAR) onChange({ raw: "", touched: true });
        else if (isBool) onChange({ raw: next === "true", touched: true });
        else onChange({ raw: next, touched: true });
      }}
    >
      <SelectTrigger id={id} className="h-9 text-base lg:text-sm">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={UNSET}>{unsetLabel}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
        {mode === "update" && field.nullable && !isBool && (
          <SelectItem value={CLEAR}>Clear it</SelectItem>
        )}
      </SelectContent>
    </Select>
  );
}

/** An id that points at a real record: search it, show its name, never the id. */
function RecordControl({
  field,
  value,
  mode,
  onChange,
}: {
  field: SchemaField;
  value: SchemaFieldValue | undefined;
  mode: SchemaFormMode;
  onChange: (value: SchemaFieldValue | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const info = field.recordToken ? getEntityInfo(field.recordToken) : null;
  const picked =
    value?.touched && typeof value.raw === "string" && value.raw.length > 0
      ? value
      : null;
  const clearing = value?.touched && value.raw === "";
  const noun = (info?.label ?? field.label).toLowerCase();
  const Icon = info?.Icon;

  if (!field.recordToken) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "flex min-h-9 max-w-full items-center gap-2 rounded-md border border-border bg-card px-2.5 text-left text-sm hover:bg-accent",
              !picked && "text-muted-foreground",
            )}
          >
            {Icon ? (
              <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            ) : (
              <Search className="h-3.5 w-3.5 shrink-0" />
            )}
            <span className="truncate">
              {picked
                ? (picked.recordTitle ?? `Chosen ${noun}`)
                : clearing
                  ? "Cleared"
                  : mode === "update"
                    ? `Unchanged — choose a ${noun}`
                    : `Choose a ${noun}`}
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-2" align="start">
          <RecordReferencePicker
            token={field.recordToken}
            onPickMany={(items) => {
              const item = items[0] as { id?: unknown; label?: unknown } | undefined;
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
        <button
          type="button"
          onClick={() => onChange(null)}
          aria-label={`Remove ${field.label}`}
          className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
      {mode === "update" && field.nullable && !value?.touched && (
        <button
          type="button"
          onClick={() => onChange({ raw: "", touched: true })}
          className="min-h-7 text-xs text-muted-foreground hover:text-foreground"
        >
          or clear it
        </button>
      )}
    </div>
  );
}
