"use client";

// features/esign/signer/parts/ControlInput.tsx — one field's input as a CONTROL (esign-parity
// CONTRACT §13.2): the phone's bottom drawer and Form view use it. The on-page inputs are
// PaperField's. Both write through the same `onChange`, so the value lives in one place.

import { Check, Eraser, PenLine } from "lucide-react";

import { Button, Input, Select, Textarea } from "@ai-matrx/design-system/controls";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

import type { FieldValue } from "../../contract/fieldModel";
import { PAPER } from "../../contract/paper";
import { isMarkKind, isNameKind, type SField } from "../model";

export interface ControlInputProps {
  field: SField;
  /** For radio: the group's options (fields sharing `group_id`) and the group's name. */
  options?: SField[];
  groupTitle?: string;
  value: FieldValue;
  /** For radio options: each option's value. */
  optionValues?: Record<string, FieldValue>;
  markUrl: string | null;
  problem: string | null;
  onChange: (fieldId: string, value: FieldValue) => void;
  onBlur?: () => void;
  onMark: (field: SField) => void;
  onClearMark: (field: SField) => void;
  autoFocus?: boolean;
  dateText: string;
}

export function ControlInput({
  field,
  options,
  groupTitle,
  value,
  optionValues,
  markUrl,
  problem,
  onChange,
  onBlur,
  onMark,
  onClearMark,
  autoFocus,
  dateText,
}: ControlInputProps) {
  const id = `esign-control-${field.id}`;
  const describedBy = problem ? `${id}-problem` : undefined;
  const common = {
    id,
    "aria-required": field.required,
    "aria-invalid": problem ? true : undefined,
    "aria-describedby": describedBy,
    autoFocus,
    onBlur,
  };

  let body: React.ReactNode;
  if (isMarkKind(field.kind)) {
    const applied = value === "applied";
    body = (
      <div className="flex items-center gap-2">
        <div
          className="flex h-16 flex-1 items-center justify-center rounded-md border border-border bg-white"
          aria-label={applied ? `${field.label}: applied` : `${field.label}: empty`}
        >
          {applied && markUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- a data: URL of the signer's own mark
            <img src={markUrl} alt="" className="max-h-14 max-w-full object-contain" />
          ) : applied ? (
            <span className="type-secondary italic" style={{ color: PAPER.ink }}>
              {field.kind === "initials" ? "Initialed" : "Signed"}
            </span>
          ) : (
            <span className="type-secondary text-muted-foreground">Not signed yet</span>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <Button variant={applied ? "outline" : "primary"} icon={<PenLine />} onClick={() => onMark(field)} autoFocus={autoFocus}>
            {applied ? "Edit" : field.kind === "initials" ? "Initial" : "Sign"}
          </Button>
          {applied ? (
            <Button variant="quiet" removes icon={<Eraser />} onClick={() => onClearMark(field)}>
              Clear
            </Button>
          ) : null}
        </div>
      </div>
    );
  } else if (field.kind === "date_signed") {
    body = <p className="type-body text-foreground">{dateText}</p>;
  } else if (field.kind === "checkbox") {
    body = (
      <label className="flex min-h-11 items-center gap-3" htmlFor={id}>
        <Checkbox
          id={id}
          size="md"
          checked={value === true}
          aria-required={field.required}
          onCheckedChange={(next) => onChange(field.id, next === true)}
        />
        <span className="type-body text-foreground">{field.label}</span>
      </label>
    );
  } else if (field.kind === "radio" && options) {
    body = (
      <RadioGroup
        size="md"
        aria-required={field.required}
        value={options.find((o) => optionValues?.[o.id] === true)?.id ?? ""}
        onValueChange={(id) => onChange(id, true)}
        className="flex flex-col gap-1"
      >
        {options.map((o) => (
          <label key={o.id} htmlFor={`esign-radio-${o.id}`} className="flex min-h-11 items-center gap-3 type-body text-foreground">
            <RadioGroupItem id={`esign-radio-${o.id}`} value={o.id} />
            {o.option_value ?? o.label}
          </label>
        ))}
      </RadioGroup>
    );
  } else if (field.kind === "dropdown") {
    const opts = (field.options ?? []).map((o) => ({ value: o, label: o }));
    body = (
      <Select
        value={typeof value === "string" ? value : ""}
        options={[{ value: "", label: "Choose…" }, ...opts]}
        onValueChange={(next) => onChange(field.id, next === "" ? null : next)}
        aria-label={field.label}
        className="w-full"
      />
    );
  } else if (field.kind === "text" && field.multiline) {
    body = (
      // ui-exception: a form value stamped onto the signed document, bounded by max_length — not prose for an agent
      <Textarea
        {...common}
        value={typeof value === "string" ? value : ""}
        maxLength={field.max_length ?? 4000}
        placeholder={field.placeholder ?? undefined}
        minHeight={88}
        autoGrow
        maxHeight={220}
        onChange={(e) => onChange(field.id, e.target.value)}
      />
    );
  } else {
    const type =
      field.kind === "date" ? "date" : field.kind === "email" ? "email" : field.kind === "number" ? "text" : "text";
    body = (
      // ui-exception: a form value stamped onto the signed document (name, date, number) — a raw value
      <Input
        {...common}
        type={type}
        inputMode={field.kind === "number" ? "decimal" : undefined}
        autoComplete={autoCompleteFor(field)}
        readOnly={field.read_only === true}
        value={typeof value === "string" ? value : ""}
        maxLength={field.kind === "text" ? (field.max_length ?? 4000) : undefined}
        placeholder={field.placeholder ?? undefined}
        onChange={(e) => onChange(field.id, e.target.value)}
        className="w-full"
      />
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {field.kind !== "checkbox" ? (
        <label htmlFor={id} className="type-secondary font-medium text-foreground">
          {field.kind === "radio" ? (groupTitle ?? "Choose one") : field.label}
          {field.required ? <span className="text-destructive"> *</span> : null}
        </label>
      ) : null}
      {body}
      {problem ? (
        <p id={describedBy} className="type-secondary text-destructive">
          {problem}
        </p>
      ) : field.tooltip ? (
        <p className="type-secondary text-muted-foreground">{field.tooltip}</p>
      ) : null}
      <p className="flex items-center gap-1 type-secondary text-muted-foreground">
        {field.read_only ? (
          "Filled in by the sender"
        ) : field.required ? (
          "Required field"
        ) : (
          <>
            <Check className="h-3 w-3" /> Optional field
          </>
        )}
      </p>
    </div>
  );
}

function autoCompleteFor(field: SField): string | undefined {
  if (!isNameKind(field.kind)) return undefined;
  switch (field.kind) {
    case "full_name":
      return "name";
    case "first_name":
      return "given-name";
    case "last_name":
      return "family-name";
    case "email":
      return "email";
    case "company":
      return "organization";
    case "title":
      return "organization-title";
    default:
      return undefined;
  }
}
