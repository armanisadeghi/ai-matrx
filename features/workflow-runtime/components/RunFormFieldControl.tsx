"use client";

/**
 * RunFormFieldControl — THE control for one `deriveRunForm` field, wherever a
 * workflow's authored inputs are collected.
 *
 * Extracted from `RunStartForm` when the trigger surface needed the SAME
 * fields to author a schedule's default inputs (2026-08-20). A second field
 * renderer would have drifted the moment either side gained a field type, so
 * both consume this one — the run form and the trigger's "what should it work
 * with every time" section render identically because they ARE identical.
 *
 * The "file" type is the canonical cloud-files picker (`openFilePicker` — host
 * mounted globally in app/Providers.tsx) beside a plain text input, so a
 * pasted link or file id still works.
 */

import { FolderOpen } from "lucide-react";

import { openFilePicker } from "@/features/files/components/pickers/cloudFilesPickerOpeners";

import type { RunFormField } from "../surface/run-form";

export function RunFormFieldControl({
  field,
  value,
  onChange,
}: {
  field: RunFormField;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const base =
    "mt-0.5 block w-full rounded-md border border-border bg-background p-2 text-base";
  switch (field.type) {
    case "long_text":
      return (
        <textarea
          value={typeof value === "string" ? value : ""}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          className={base}
        />
      );
    case "number":
      return (
        <input
          type="number"
          value={
            typeof value === "number" || typeof value === "string"
              ? String(value)
              : ""
          }
          placeholder={field.placeholder}
          onChange={(e) =>
            onChange(e.target.value === "" ? "" : Number(e.target.value))
          }
          className={base}
        />
      );
    case "yes_no":
      return (
        <input
          type="checkbox"
          checked={value === true}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-1 block"
        />
      );
    case "choice":
      return (
        <select
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          className={base}
        >
          <option value="">Choose…</option>
          {field.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      );
    case "file":
      return (
        <div className="mt-0.5 flex items-center gap-1.5">
          <input
            type="text"
            value={typeof value === "string" ? value : ""}
            placeholder={field.placeholder || "File link or id"}
            onChange={(e) => onChange(e.target.value)}
            className="block w-full rounded-md border border-border bg-background p-2 text-base"
          />
          <button
            type="button"
            onClick={() => {
              void openFilePicker({ multi: false, title: field.label }).then(
                (ids) => {
                  if (ids && ids.length > 0) onChange(ids[0]);
                },
              );
            }}
            className="flex shrink-0 items-center gap-1 rounded-md border border-border px-2.5 py-2 text-sm text-foreground"
          >
            <FolderOpen className="h-3.5 w-3.5" />
            Browse
          </button>
        </div>
      );
    default:
      return (
        <input
          type="text"
          value={typeof value === "string" ? value : ""}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={base}
        />
      );
  }
}
