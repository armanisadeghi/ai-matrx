"use client";

/**
 * ShellPicker — gallery of available shells from SHELL_CATALOG. Click
 * to pick. The active shell gets a primary border + check.
 *
 * "fully_custom" is shown as a separate tile at the bottom (since it
 * isn't in the registry but is a valid shell_kind).
 */

import { Check, Code } from "lucide-react";
import { cn } from "@/lib/utils";
import { SHELL_CATALOG } from "@/features/agent-apps/components/shells";
import type { AgentAppShellKind } from "@/features/agent-apps/types";

interface ShellPickerProps {
  value: AgentAppShellKind;
  onChange: (next: AgentAppShellKind) => void;
  disabled?: boolean;
}

export function ShellPicker({ value, onChange, disabled }: ShellPickerProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {SHELL_CATALOG.map((meta) => {
        const isActive = value === meta.kind;
        return (
          <button
            key={meta.kind}
            type="button"
            onClick={() => onChange(meta.kind)}
            disabled={disabled}
            className={cn(
              "text-left px-3 py-2.5 rounded-md border transition-colors",
              isActive
                ? "border-primary bg-primary/5"
                : "border-border bg-card hover:border-primary/40 hover:bg-muted/30",
              disabled && "opacity-60 cursor-not-allowed",
            )}
          >
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-sm font-medium text-foreground">
                {meta.label}
              </span>
              {isActive && <Check className="w-3.5 h-3.5 text-primary" />}
            </div>
            <p className="text-xs text-muted-foreground leading-snug">
              {meta.description}
            </p>
          </button>
        );
      })}

      <button
        type="button"
        onClick={() => onChange("fully_custom")}
        disabled={disabled}
        className={cn(
          "text-left px-3 py-2.5 rounded-md border transition-colors",
          value === "fully_custom"
            ? "border-primary bg-primary/5"
            : "border-border bg-card hover:border-primary/40 hover:bg-muted/30",
          disabled && "opacity-60 cursor-not-allowed",
        )}
      >
        <div className="flex items-center justify-between gap-2 mb-1">
          <span className="text-sm font-medium text-foreground inline-flex items-center gap-1.5">
            <Code className="w-3.5 h-3.5" />
            Fully custom
          </span>
          {value === "fully_custom" && (
            <Check className="w-3.5 h-3.5 text-primary" />
          )}
        </div>
        <p className="text-xs text-muted-foreground leading-snug">
          Whole UI lives in component_code. Edit on the Code tab.
        </p>
      </button>
    </div>
  );
}
