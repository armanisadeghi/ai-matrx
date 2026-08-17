"use client";

/**
 * RunStartForm — the GENERATED start dialog (Phase 4): one section per
 * io.user_input node, fields rendered from the author's declarations
 * (deriveRunForm), values submitted as the start request's `node_inputs`.
 * Required gating happens here (plain-language, no jargon); the engine
 * validates again server-side.
 *
 * The "file" field type is the canonical cloud-files picker (openFilePicker —
 * host is mounted globally in app/Providers.tsx) with a plain text input
 * beside it, so a pasted link or file id still works.
 */

import { useState } from "react";
import { FolderOpen, Play } from "lucide-react";

import { openFilePicker } from "@/features/files/components/pickers/cloudFilesPickerOpeners";

import {
  deriveRunForm,
  missingRequiredFields,
  seedRunFormValues,
  type RunFormField,
  type RunFormSection,
} from "../surface/run-form";
import type { WorkflowDefinitionLike } from "../trigger-points";

function FieldControl({
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

export function RunStartForm({
  definition,
  starting,
  startLabel,
  onStart,
  onCancel,
}: {
  definition: WorkflowDefinitionLike;
  starting: boolean;
  /** e.g. "Run" / "Run step-by-step" — names the verb being confirmed. */
  startLabel: string;
  onStart: (nodeInputs: Record<string, Record<string, unknown>>) => void;
  onCancel: () => void;
}) {
  // Sections derive purely from the definition; the definition is loaded
  // once per selection, so deriving on render is cheap and always fresh.
  const sections: RunFormSection[] = deriveRunForm(definition);
  const [values, setValues] = useState<
    Record<string, Record<string, unknown>>
  >(() => seedRunFormValues(sections));

  const setField = (nodeId: string, key: string, v: unknown) =>
    setValues((prev) => ({
      ...prev,
      [nodeId]: { ...prev[nodeId], [key]: v },
    }));

  const missing = missingRequiredFields(sections, values);

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-3">
      {sections.map((section) => (
        <div key={section.nodeId} className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">
            {section.title}
          </h3>
          {section.fields.map((field) => (
            <label key={field.key} className="block">
              <span className="text-xs text-muted-foreground">
                {field.label}
                {field.required ? " *" : ""}
              </span>
              <FieldControl
                field={field}
                value={values[section.nodeId]?.[field.key]}
                onChange={(v) => setField(section.nodeId, field.key, v)}
              />
              {field.help ? (
                <span className="mt-0.5 block text-[11px] text-muted-foreground">
                  {field.help}
                </span>
              ) : null}
            </label>
          ))}
        </div>
      ))}

      <div className="flex items-center gap-2 border-t border-border pt-2">
        <button
          type="button"
          disabled={starting || missing.length > 0}
          onClick={() => onStart(values)}
          className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
        >
          <Play className="h-3.5 w-3.5" />
          {starting ? "Starting…" : startLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-border px-3 py-1.5 text-sm text-foreground"
        >
          Cancel
        </button>
        {missing.length > 0 ? (
          <span className="text-[11px] text-muted-foreground">
            Still needed: {missing.join(", ")}
          </span>
        ) : null}
      </div>
    </div>
  );
}
