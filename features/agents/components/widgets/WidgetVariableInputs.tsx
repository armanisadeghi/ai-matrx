"use client";

/**
 * WidgetVariableInputs
 *
 * Plain, unstyled-looking inputs for filling in an agent's variable values
 * during widget testing. NO fancy rendering, NO customComponent logic —
 * just a label + a text/number input per definition. The goal is to make it
 * obvious what gets wired where when launching.
 *
 * Input kind is loosely inferred from `customComponent.type` when present
 * (number / slider → number input; everything else → textarea).
 */

import { Label } from "@/components/ui/label";
import type { VariableDefinition } from "@/features/agents/types/agent-definition.types";
import { ProTextarea } from "@/components/official/ProTextarea";

interface WidgetVariableInputsProps {
  definitions: VariableDefinition[];
  values: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}

function kindFromDefinition(def: VariableDefinition): "number" | "text" {
  const type = def.customComponent?.type;
  if (type === "number" || type === "slider") return "number";
  return "text";
}

export function WidgetVariableInputs({
  definitions,
  values,
  onChange,
}: WidgetVariableInputsProps) {
  if (!definitions || definitions.length === 0) {
    return (
      <p className="text-xs text-muted-foreground italic">
        This agent has no variable definitions.
      </p>
    );
  }

  const setValue = (name: string, value: unknown) => {
    const next = { ...values, [name]: value };
    // Clean up keys whose values are empty so the payload stays tidy.
    if (value === "" || value === null || value === undefined) {
      delete next[name];
    }
    onChange(next);
  };

  return (
    <div className="space-y-3">
      {definitions.map((def) => {
        const id = `widgets-var-${def.name}`;
        const kind = kindFromDefinition(def);
        const current = values[def.name];

        return (
          <div key={def.name} className="space-y-1">
            <div className="flex items-baseline justify-between gap-2">
              <Label
                htmlFor={id}
                className="text-xs font-medium text-foreground cursor-pointer"
              >
                {def.name}
                {def.required && (
                  <span className="text-destructive ml-0.5">*</span>
                )}
              </Label>
              {def.customComponent?.type && (
                <span className="text-[10px] text-muted-foreground font-mono">
                  {def.customComponent.type}
                </span>
              )}
            </div>

            {def.helpText && (
              <p className="text-[10.5px] text-muted-foreground leading-tight">
                {def.helpText}
              </p>
            )}

            {kind === "number" ? (
              <input
                id={id}
                type="number"
                value={
                  typeof current === "number" ||
                  typeof current === "string"
                    ? String(current)
                    : ""
                }
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === "") {
                    setValue(def.name, "");
                    return;
                  }
                  const num = Number(raw);
                  setValue(def.name, Number.isFinite(num) ? num : raw);
                }}
                placeholder={
                  def.defaultValue != null ? String(def.defaultValue) : "0"
                }
                className="w-full h-8 rounded-md border border-border bg-background px-2 text-sm leading-tight placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            ) : (
              <ProTextarea
                id={id}
                value={
                  typeof current === "string"
                    ? current
                    : current == null
                      ? ""
                      : String(current)
                }
                onChange={(e) => setValue(def.name, e.target.value)}
                rows={2}
                placeholder={
                  def.defaultValue != null ? String(def.defaultValue) : ""
                }
                className="w-full resize-y rounded-md border border-border bg-background px-2 py-1 text-sm leading-relaxed placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
