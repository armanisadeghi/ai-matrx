"use client";

/**
 * The format-specific input for a full-size row form (Add Row / Edit Row).
 *
 * Returns `null` when the column's format has no opinion about its input — the
 * caller then falls through to its existing storage-type switch, so an
 * unformatted column is edited exactly as it always has been. This is THE
 * FALLBACK LAW applied to editing: a format may add a better input, never take
 * a working one away.
 *
 * Shared by both row modals so an email column cannot offer a real email input
 * in one and a plain box in the other.
 */
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import { ChoiceInput } from "./ChoiceInput";

import { parseFieldInput } from "@/lib/field-formats/format";
import { getFieldFormat } from "@/lib/field-formats/registry";
import type { FieldFormatConfig } from "@/lib/field-formats/types";

const OWNED_EDITORS = new Set([
  "email",
  "url",
  "tel",
  "color",
  "textarea",
  "rating",
  "select",
  "multiselect",
]);

/**
 * Does this format supply its own input? Callers branch on this instead of
 * rendering the component and checking for null — a component that returns
 * null is still a rendered element, so it cannot be tested by calling it.
 */
export function formatHasOwnInput(
  format: FieldFormatConfig | null | undefined,
): boolean {
  const def = format ? getFieldFormat(format.id) : null;
  return !!def && OWNED_EDITORS.has(def.editor);
}

export type FormatAwareInputProps = {
  id: string;
  format: FieldFormatConfig | null | undefined;
  dataType: string;
  value: unknown;
  placeholder?: string;
  onChange: (next: unknown) => void;
};

export function FormatAwareInput({
  id,
  format,
  dataType,
  value,
  placeholder,
  onChange,
}: FormatAwareInputProps) {
  const def = format ? getFieldFormat(format.id) : null;
  if (!def) return null;

  const text = value === null || value === undefined ? "" : String(value);
  const commit = (raw: string) =>
    onChange(raw === "" ? null : parseFieldInput(raw, format, dataType));

  switch (def.editor) {
    case "email":
    case "url":
    case "tel":
      return (
        <Input
          id={id}
          type={def.editor}
          value={text}
          placeholder={placeholder}
          onChange={(e) => commit(e.target.value)}
        />
      );

    case "color":
      return (
        <div className="flex items-center gap-2">
          <Input
            id={id}
            type="color"
            className="h-9 w-14 p-1"
            value={/^#[0-9a-fA-F]{6}$/.test(text) ? text : "#000000"}
            onChange={(e) => commit(e.target.value)}
          />
          <Input
            value={text}
            placeholder="#3b82f6"
            onChange={(e) => commit(e.target.value)}
          />
        </div>
      );

    case "textarea":
      return (
        <Textarea
          id={id}
          value={text}
          rows={5}
          placeholder={placeholder}
          onChange={(e) => commit(e.target.value)}
        />
      );

    case "select":
    case "multiselect":
      return (
        <ChoiceInput
          id={id}
          format={format}
          value={value}
          multiple={def.editor === "multiselect"}
          onChange={onChange}
        />
      );

    case "rating":
      return (
        <Input
          id={id}
          type="number"
          min={0}
          max={format?.options?.ratingMax ?? 5}
          step={1}
          value={text}
          onChange={(e) => commit(e.target.value)}
        />
      );

    default:
      // number / checkbox / date / datetime / json / text — the caller's own
      // storage-type input is already the right shape.
      return null;
  }
}

export default FormatAwareInput;
