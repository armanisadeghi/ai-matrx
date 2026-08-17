"use client";

/**
 * AgentEditAccessControl — the canonical "can the agent change this?" controls.
 *
 * ONE set of controls, shared by every surface that shows or sets a context
 * slot's access (the slot editor, the scope batch importer, the read-only detail
 * sheet). Same shape as `InlinePolicyControl`: pure and presentational, owning no
 * persistence — just the value.
 *
 * The user-facing vocabulary ("Read-only" / "Agent can edit", never "mutable")
 * and the encode/decode against the `mutable` + `persist` wire shape live in the
 * React-free core: `@/features/agents/utils/agent-edit-access`. Read its header
 * before touching this — in particular why `persist:"auto"` is not offered for
 * every slot (aidream silently drops writeback for an unhandled `source.kind`).
 */

import { Lock, PencilLine } from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  AGENT_EDIT_ACCESS_LABEL,
  AGENT_EDIT_SAVE_MODES,
  type AgentEditAccess,
  type AgentEditAccessValue,
} from "@/features/agents/utils/agent-edit-access";

const ACCESS_ICON = { read_only: Lock, editable: PencilLine } as const;

// ─────────────────────────────────────────────────────────────────────────────
// Full control — the slot editor
// ─────────────────────────────────────────────────────────────────────────────

export function AgentEditAccessControl({
  value,
  onChange,
  /** When set, "Save to the source" is unavailable and this explains why. */
  saveToSourceDisabledReason,
  className,
}: {
  value: AgentEditAccessValue;
  onChange: (next: AgentEditAccessValue) => void;
  saveToSourceDisabledReason?: string;
  className?: string;
}) {
  return (
    <div className={cn("space-y-3", className)}>
      <RadioGroup
        value={value.access}
        onValueChange={(next) =>
          onChange({ ...value, access: next as AgentEditAccess })
        }
        className="space-y-2"
      >
        <AccessRow
          value="read_only"
          currentValue={value.access}
          description="The agent can read this value, but can never change it."
        />
        <AccessRow
          value="editable"
          currentValue={value.access}
          description="The agent can rewrite this value while it works."
        />
      </RadioGroup>

      {value.access === "editable" && (
        <div className="space-y-1.5 rounded-md border border-border bg-card/40 p-2.5">
          <p className="text-xs font-medium text-foreground">
            Where the agent's edits go
          </p>
          <div role="radiogroup" className="flex flex-wrap gap-1.5">
            {AGENT_EDIT_SAVE_MODES.map((mode) => {
              const disabledReason =
                mode.id === "auto" ? saveToSourceDisabledReason : undefined;
              const selected = mode.id === value.saveMode;
              return (
                <Button
                  key={mode.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  variant="ghost"
                  size="sm"
                  disabled={Boolean(disabledReason)}
                  title={disabledReason}
                  onClick={() => onChange({ ...value, saveMode: mode.id })}
                  className={cn(
                    "h-7 px-2.5 text-xs font-normal",
                    selected
                      ? "bg-primary/15 text-primary hover:bg-primary/20 hover:text-primary"
                      : "text-muted-foreground",
                  )}
                >
                  {mode.label}
                </Button>
              );
            })}
          </div>
          <p className="text-[11px] text-muted-foreground/80">
            {AGENT_EDIT_SAVE_MODES.find((m) => m.id === value.saveMode)?.hint}
          </p>
          {saveToSourceDisabledReason && (
            <p className="text-[11px] text-muted-foreground">
              {saveToSourceDisabledReason}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function AccessRow({
  value,
  currentValue,
  description,
}: {
  value: AgentEditAccess;
  currentValue: AgentEditAccess;
  description: string;
}) {
  const selected = value === currentValue;
  const Icon = ACCESS_ICON[value];
  return (
    <label
      htmlFor={`agent-access-${value}`}
      className={cn(
        "flex items-start gap-3 rounded-md border border-border p-2.5 cursor-pointer transition-colors",
        selected ? "border-primary/60 bg-accent/40" : "hover:bg-accent/20",
      )}
    >
      <RadioGroupItem
        value={value}
        id={`agent-access-${value}`}
        className="mt-0.5"
      />
      <div className="flex-1 min-w-0">
        <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          <Icon className="h-3.5 w-3.5 shrink-0" />
          {AGENT_EDIT_ACCESS_LABEL[value]}
        </span>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </label>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Compact toggle — dense surfaces (the batch-import table)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Two-state segmented toggle: Read-only ⇄ Agent can edit. Always shows BOTH
 * states with the current one lit, so a row's access is readable at a glance
 * without hovering — the bare checkbox it replaced left users unable to tell
 * what "unchecked" even meant.
 */
export function AgentEditAccessToggle({
  value,
  onChange,
  disabled,
  disabledReason,
  className,
}: {
  value: AgentEditAccess;
  onChange: (next: AgentEditAccess) => void;
  disabled?: boolean;
  disabledReason?: string;
  className?: string;
}) {
  const options: AgentEditAccess[] = ["read_only", "editable"];
  return (
    <div
      role="radiogroup"
      title={disabled ? disabledReason : undefined}
      className={cn(
        "inline-flex rounded-md border border-border bg-card/40 p-0.5",
        disabled && "opacity-50",
        className,
      )}
    >
      {options.map((option) => {
        const Icon = ACCESS_ICON[option];
        const selected = option === value;
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={AGENT_EDIT_ACCESS_LABEL[option]}
            disabled={disabled}
            title={
              disabled
                ? disabledReason
                : option === "editable"
                  ? "The agent can rewrite this value while it works"
                  : "The agent can read this value, but never change it"
            }
            onClick={() => onChange(option)}
            className={cn(
              "flex items-center gap-1 rounded px-1.5 py-1 text-[11px] transition-colors",
              selected
                ? option === "editable"
                  ? "bg-primary/15 text-primary"
                  : "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground",
              disabled && "cursor-not-allowed",
            )}
          >
            <Icon className="h-3 w-3 shrink-0" />
            {selected && (
              <span className="whitespace-nowrap">
                {option === "editable" ? "Can edit" : "Read-only"}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Badge — read-only display surfaces (chips, tiles, the detail sheet)
// ─────────────────────────────────────────────────────────────────────────────

export function AgentEditAccessBadge({
  access,
  className,
}: {
  access: AgentEditAccess;
  className?: string;
}) {
  const Icon = ACCESS_ICON[access];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium",
        access === "editable"
          ? "border-primary/40 bg-primary/10 text-primary"
          : "border-border bg-muted text-muted-foreground",
        className,
      )}
    >
      <Icon className="h-3 w-3 shrink-0" />
      {AGENT_EDIT_ACCESS_LABEL[access]}
    </span>
  );
}
