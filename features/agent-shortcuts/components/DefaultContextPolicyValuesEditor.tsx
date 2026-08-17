"use client";

import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ContextPolicy } from "@/features/agents/types/agent-api-types";

export interface DefaultContextPolicyValuesEditorProps {
  /** Declared context slots on the agent. */
  contextPolicies: ContextPolicy[];
  /** Per-slot overrides persisted on the shortcut. Keyed by slot key. */
  values: Record<string, unknown> | null;
  onChange: (next: Record<string, unknown> | null) => void;
  disabled?: boolean;
  compact?: boolean;
}

/**
 * One row per declared context slot. The user can pre-seed a value that will
 * be set on the instance at launch (before any scope → context-policy mapping
 * or runtime context entries arrive). Blank = no override.
 *
 * Context slots don't carry default values on the agent itself — defaults
 * here come from the shortcut.
 */
export function DefaultContextPolicyValuesEditor({
  contextPolicies,
  values,
  onChange,
  disabled,
  compact,
}: DefaultContextPolicyValuesEditorProps) {
  const current = values ?? {};
  const hasSlots = contextPolicies.length > 0;

  const setValue = (key: string, raw: string) => {
    const next = { ...current };
    if (raw.length === 0) {
      delete next[key];
    } else {
      next[key] = coerceByType(raw, slotType(key));
    }
    onChange(Object.keys(next).length > 0 ? next : null);
  };

  const slotType = (key: string): string | undefined =>
    contextPolicies.find((s) => s.key === key)?.type;

  if (!hasSlots) {
    return (
      <div className="text-xs text-muted-foreground italic px-3 py-2 border border-border rounded-md bg-muted/30">
        This agent has no context slots declared.
      </div>
    );
  }

  return (
    <div
      className={`border border-border rounded-md ${compact ? "text-xs" : "text-sm"}`}
    >
      {contextPolicies.map((slot) => {
        const raw = current[slot.key];
        const stringValue = raw === undefined ? "" : stringify(raw);
        const isLongText =
          (slot.type === "text" || slot.type === "json") &&
          (stringValue.length > 60 || stringValue.includes("\n"));

        return (
          <div
            key={slot.key}
            className={`flex flex-col gap-1 ${compact ? "p-2" : "p-3"} border-b border-border last:border-b-0`}
          >
            <div className="flex items-baseline gap-2 flex-wrap">
              <Label
                htmlFor={`slot-${slot.key}`}
                className={`font-mono font-medium ${compact ? "text-xs" : "text-sm"}`}
              >
                {slot.key}
              </Label>
              <span className="text-[10px] uppercase text-muted-foreground">
                {slot.type}
              </span>
              {slot.label && slot.label !== slot.key && (
                <span className="text-[11px] text-muted-foreground">
                  {slot.label}
                </span>
              )}
              {slot.description && (
                <span className="text-[10px] text-muted-foreground truncate">
                  {slot.description}
                </span>
              )}
            </div>
            {isLongText ? (
              <Textarea
                id={`slot-${slot.key}`}
                value={stringValue}
                onChange={(e) => setValue(slot.key, e.target.value)}
                placeholder={placeholderForSlotType(slot.type)}
                rows={3}
                disabled={disabled}
                className="text-[13px] font-mono resize-none"
              />
            ) : (
              <Input
                id={`slot-${slot.key}`}
                value={stringValue}
                onChange={(e) => setValue(slot.key, e.target.value)}
                placeholder={placeholderForSlotType(slot.type)}
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

function placeholderForSlotType(type: string): string {
  switch (type) {
    case "text":
      return "Plain text value";
    case "file_url":
      return "https://…";
    case "json":
      return '{"key": "value"}';
    case "db_ref":
      return "db reference id";
    case "user":
    case "org":
    case "project":
    case "task":
      return `${type} id`;
    default:
      return "";
  }
}

function coerceByType(raw: string, type: string | undefined): unknown {
  if (type === "json") {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
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
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
