"use client";

// features/marketing/seo/topical-map/views/pages/runs/runFields.tsx
//
// The three parameter shapes all three run popovers share, and the one rule
// that binds them:
//
// 🚨 THE KNOB IS THE PLACEHOLDER, NEVER THE VALUE. A number box starts EMPTY
// with the knob's live figure behind it, so an untouched box sends nothing and
// the server's own decision stands. Pre-filling the knob into the field would
// turn "the organization decided this" into a value this screen sends — and the
// day an admin changes the knob, every open popover would quietly keep sending
// the old one. `numberFieldValue` is the matching read: an empty box is
// `undefined` (omit the field), never 0.
//
// A switch whose default matches the server's says so out loud, because a person
// looking at an "on" toggle cannot otherwise tell whether we turned it on or the
// server did.

import { Switch } from "@/components/ui/switch";
import { Input } from "@ai-matrx/design-system";

/**
 * What an optional whole-number box currently means to the wire.
 *
 * Empty → `undefined`: the field is omitted and the knob decides. A value that
 * is not a whole number ≥ 1 is REFUSED here rather than sent, because the body
 * builders throw on it (`mapPagesBody` et al.) and a throw out of a click
 * handler is not a sentence anybody reads.
 */
export function numberFieldValue(raw: string): number | undefined | "invalid" {
  const trimmed = raw.trim();
  if (trimmed === "") return undefined;
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < 1) return "invalid";
  return parsed;
}

export function NumberField({
  id,
  label,
  placeholder,
  placeholderNote,
  value,
  onChange,
}: {
  id: string;
  label: string;
  /** The knob's live value — shown behind an empty box, never inside it. */
  placeholder: number;
  /** Which knob that placeholder is, in the person's words. */
  placeholderNote: string;
  value: string;
  onChange: (next: string) => void;
}) {
  const parsed = numberFieldValue(value);
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block font-medium">
        {label}
      </label>
      <Input
        id={id}
        type="number"
        min={1}
        step={1}
        inputMode="numeric"
        value={value}
        placeholder={String(placeholder)}
        onChange={(event) => onChange(event.target.value)}
        className="h-7 text-xs"
      />
      <p className="text-muted-foreground">
        Empty uses the {placeholderNote}: {placeholder}.
      </p>
      {parsed === "invalid" ? (
        <p role="alert" className="text-destructive">
          That has to be a whole number of pages, at least 1. Clear the box to
          let the {placeholderNote} decide.
        </p>
      ) : null}
    </div>
  );
}

export function SwitchField({
  id,
  label,
  note,
  checked,
  onChange,
  tone,
}: {
  id: string;
  label: string;
  /** One sentence saying what turning it on actually costs or changes. */
  note: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  /** `destructive` marks a switch that changes a live map. */
  tone?: "default" | "destructive";
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 space-y-0.5">
        <label
          htmlFor={id}
          className={
            tone === "destructive"
              ? "block font-medium text-destructive"
              : "block font-medium"
          }
        >
          {label}
        </label>
        <p className="text-muted-foreground">{note}</p>
      </div>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onChange}
        className="mt-0.5 shrink-0"
      />
    </div>
  );
}
