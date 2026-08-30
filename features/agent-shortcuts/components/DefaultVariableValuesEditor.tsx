"use client";

import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { VariableDefinition } from "@/features/agents/types/agent-definition.types";
import { ProTextarea } from "@/components/official/ProTextarea";

export interface DefaultVariableValuesEditorProps {
  /** Declared variables on the agent. */
  variableDefinitions: VariableDefinition[];
  /** Current per-variable overrides persisted on the shortcut. Keyed by variable name. */
  values: Record<string, unknown> | null;
  onChange: (next: Record<string, unknown> | null) => void;
  disabled?: boolean;
  compact?: boolean;
}

/**
 * One row per agent variable. The agent's `defaultValue` is shown as a
 * placeholder; the user can type an override value. Blank input = inherit
 * agent default. Scope-mapped values and runtime user edits still layer on
 * top of whatever is saved here.
 *
 * Values are stored as strings in the UI but cast lightly:
 *   - empty → not persisted (inherits agent default)
 *   - "true" / "false" → boolean
 *   - numeric string → number
 *   - otherwise → string
 * Anything more complex (objects, arrays) should use the escape hatch below
 * (rare; we'll add a JSON escape in a follow-up if users hit it).
 */
export function DefaultVariableValuesEditor({
  variableDefinitions,
  values,
  onChange,
  disabled,
  compact,
}: DefaultVariableValuesEditorProps) {
  const current = values ?? {};
  const hasVars = variableDefinitions.length > 0;

  const setValue = (name: string, raw: string) => {
    const next = { ...current };
    if (raw.length === 0) {
      delete next[name];
    } else {
      next[name] = coerceScalar(raw);
    }
    onChange(Object.keys(next).length > 0 ? next : null);
  };

  if (!hasVars) {
    return (
      <div className="text-xs text-muted-foreground italic px-3 py-2 border border-border rounded-md bg-muted/30">
        This agent has no variables declared.
      </div>
    );
  }

  return (
    <div
      className={`border border-border rounded-md ${compact ? "text-xs" : "text-sm"}`}
    >
      {variableDefinitions.map((v) => {
        const raw = current[v.name];
        const stringValue = raw === undefined ? "" : stringify(raw);
        const defaultPlaceholder =
          v.defaultValue !== undefined && v.defaultValue !== null
            ? `Agent default: ${stringify(v.defaultValue)}`
            : "No default on agent";
        const isMultiline =
          stringValue.includes("\n") ||
          (typeof v.defaultValue === "string" &&
            (v.defaultValue as string).length > 60);

        return (
          <div
            key={v.name}
            className={`flex flex-col gap-1 ${compact ? "p-2" : "p-3"} border-b border-border last:border-b-0`}
          >
            <div className="flex items-baseline gap-2">
              <Label
                htmlFor={`var-${v.name}`}
                className={`font-mono font-medium ${compact ? "text-xs" : "text-sm"}`}
              >
                {v.name}
              </Label>
              {v.required && (
                <span className="text-[10px] uppercase text-destructive">
                  required
                </span>
              )}
              {v.helpText && (
                <span className="text-[10px] text-muted-foreground truncate">
                  {v.helpText}
                </span>
              )}
            </div>
            {isMultiline ? (
              <ProTextarea
                id={`var-${v.name}`}
                value={stringValue}
                onChange={(e) => setValue(v.name, e.target.value)}
                placeholder={defaultPlaceholder}
                rows={Math.min(4, (stringValue.match(/\n/g)?.length ?? 0) + 2)}
                disabled={disabled}
                className="text-[13px] font-mono resize-none"
              />
            ) : (
              <Input
                id={`var-${v.name}`}
                value={stringValue}
                onChange={(e) => setValue(v.name, e.target.value)}
                placeholder={defaultPlaceholder}
                disabled={disabled}
                className={
                  compact ? "h-8 text-[13px] font-mono" : "h-9 text-[16px]"
                }
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function coerceScalar(raw: string): unknown {
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (/^-?\d+$/.test(raw)) {
    const n = Number.parseInt(raw, 10);
    if (Number.isFinite(n)) return n;
  }
  if (/^-?\d*\.\d+$/.test(raw)) {
    const n = Number.parseFloat(raw);
    if (Number.isFinite(n)) return n;
  }
  return raw;
}

function stringify(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
