"use client";

/**
 * RunStartForm — the GENERATED start dialog (Phase 4): one section per
 * io.user_input node, fields rendered from the author's declarations
 * (deriveRunForm), values submitted as the start request's `node_inputs`.
 * Required gating happens here (plain-language, no jargon); the engine
 * validates again server-side.
 *
 * The per-field control is `RunFormFieldControl` — shared with the trigger
 * surface, which authors the same fields as a schedule's default inputs.
 */

import { useState } from "react";
import { Play } from "lucide-react";

import { RunFormFieldControl } from "./RunFormFieldControl";

import {
  deriveRunForm,
  missingRequiredFields,
  seedRunFormValues,
  type RunFormSection,
} from "../surface/run-form";
import type { WorkflowDefinitionLike } from "../trigger-points";

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
              <RunFormFieldControl
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
