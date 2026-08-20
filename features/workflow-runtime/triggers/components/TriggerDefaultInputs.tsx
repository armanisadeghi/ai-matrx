"use client";

/**
 * TriggerDefaultInputs — "what should it work with, every time?"
 *
 * A workflow that asks a person questions before it runs still has to answer
 * them when NOBODY IS THERE. That is what a trigger's `default_inputs` is, so
 * this renders the workflow's OWN authored run form (`deriveRunForm`) through
 * the same `RunFormFieldControl` the Run button uses — never a second input
 * authoring path.
 */

import { useMemo } from "react";
import { AlertTriangle } from "lucide-react";

import { RunFormFieldControl } from "../../components/RunFormFieldControl";
import { deriveRunForm, type RunFormSection } from "../../surface/run-form";
import type { WorkflowDefinitionLike } from "../../trigger-points";
import {
  collidingInputKeys,
  flattenRunFormValues,
  missingTriggerInputs,
} from "../default-inputs";

export function TriggerDefaultInputs({
  definition,
  values,
  onChange,
}: {
  definition: WorkflowDefinitionLike;
  values: Record<string, Record<string, unknown>>;
  onChange: (nodeId: string, key: string, value: unknown) => void;
}) {
  const sections: RunFormSection[] = useMemo(
    () => deriveRunForm(definition),
    [definition],
  );
  const collisions = useMemo(() => collidingInputKeys(sections), [sections]);
  const missing = useMemo(
    () => missingTriggerInputs(sections, flattenRunFormValues(sections, values)),
    [sections, values],
  );

  if (sections.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        This workflow doesn&apos;t ask for anything before it runs, so there is
        nothing to fill in here.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {sections.map((section) => (
        <div key={section.nodeId} className="space-y-2">
          <h4 className="text-sm font-semibold text-foreground">
            {section.title}
          </h4>
          {section.fields.map((field) => (
            <label key={field.key} className="block">
              <span className="text-xs text-muted-foreground">
                {field.label}
                {field.required ? " *" : ""}
              </span>
              <RunFormFieldControl
                field={field}
                value={values[section.nodeId]?.[field.key]}
                onChange={(v) => onChange(section.nodeId, field.key, v)}
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

      {missing.length > 0 ? (
        <p className="flex items-start gap-1.5 text-[11px] text-amber-600 dark:text-amber-500">
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>
            Nobody will be here to answer when this runs on its own, so fill in{" "}
            {missing.join(", ")} or the run will stop on its first step.
          </span>
        </p>
      ) : null}

      {collisions.length > 0 ? (
        <p className="flex items-start gap-1.5 text-[11px] text-amber-600 dark:text-amber-500">
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>
            This workflow asks for {collisions.join(", ")} in more than one
            place. An automatic run sends one value to all of them.
          </span>
        </p>
      ) : null}
    </div>
  );
}
