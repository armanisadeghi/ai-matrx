"use client";

// features/scopes/components/active-context/binding-target/BindingTargetPicker.tsx
//
// THE binding-target picker: where a shortcut, a surface binding or a mandate
// holder applies — everyone, just me, or exactly ONE organization / project /
// task (/ scope). The canonical scope selection family's single-node host
// (lane HIERARCHY-CASCADE, 2026-09-25; it replaced the bespoke
// agent-shortcuts ShortcutScopePicker). The record choice is DrillDeck over
// `useSingleNodeEngine`; the two id-less rungs sit above it as plain rows.
//
// Contract kept from the replaced picker: `scope` names the rung, `scopeId`
// the record for the rungs that need one; `onScopeChange(rung, id?)` fires on
// every choice; `allowGlobal` / `allowedScopes` restrict the rungs offered.

import React, { useState } from "react";
import {
  Building2,
  ChevronsUpDown,
  FolderKanban,
  Globe,
  ListTodo,
  Tag,
  User,
  type LucideIcon,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@ai-matrx/design-system";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  useSingleNodeEngine,
  useUniverse,
  type NodeKind,
  type PickNode,
} from "../quick-pick/engine";
import { CheckGlyph, NodeLabel } from "../quick-pick/parts";
import { DrillDeckCore } from "../drill-deck/DrillDeck";

export type BindingRung =
  | "global"
  | "user"
  | "organization"
  | "project"
  | "task"
  | "scope";

const RUNG_KIND: Partial<Record<BindingRung, NodeKind>> = {
  organization: "org",
  project: "project",
  task: "task",
  scope: "scope",
};

const KIND_RUNG: Partial<Record<NodeKind, BindingRung>> = {
  org: "organization",
  project: "project",
  task: "task",
  scope: "scope",
};

const RUNG_COPY: Record<
  BindingRung,
  { label: string; description: string; icon: LucideIcon }
> = {
  global: {
    label: "Global",
    description: "Available to every user on the platform (admin only)",
    icon: Globe,
  },
  user: {
    label: "User",
    description: "Personal — only the current user can see or run this",
    icon: User,
  },
  organization: {
    label: "Organization",
    description: "Available to every member of a specific organization",
    icon: Building2,
  },
  project: {
    label: "Project",
    description: "Scoped to a specific project",
    icon: FolderKanban,
  },
  task: {
    label: "Task",
    description: "Scoped to a specific task",
    icon: ListTodo,
  },
  scope: {
    label: "Scope",
    description: "Scoped to a specific scope",
    icon: Tag,
  },
};

const ALL_RUNGS: readonly BindingRung[] = [
  "global",
  "user",
  "organization",
  "project",
  "task",
];

export interface BindingTargetPickerProps<R extends BindingRung> {
  scope: R;
  scopeId?: string;
  onScopeChange: (scope: R, scopeId?: string) => void;
  disabled?: boolean;
  /** Offer the platform-wide rung. Default on. */
  allowGlobal?: boolean;
  /** Restrict the rungs offered, for storage that has fewer (a mandate
   *  binding has no project or task rung). Omitted = every rung but `scope`. */
  allowedScopes?: readonly R[];
  /** The field label; `null` drops it. */
  label?: string | null;
  /** Keep the label for assistive tech only (a bar that names it elsewhere). */
  hideLabel?: boolean;
  className?: string;
}

export function BindingTargetPicker<R extends BindingRung>({
  scope,
  scopeId,
  onScopeChange,
  disabled = false,
  allowGlobal = true,
  allowedScopes,
  label = "Scope",
  hideLabel = false,
  className,
}: BindingTargetPickerProps<R>) {
  const universe = useUniverse();
  const [open, setOpen] = useState(false);
  const offered = ((allowedScopes as readonly BindingRung[] | undefined) ??
    ALL_RUNGS
  ).filter((rung) => allowGlobal || rung !== "global");
  const idless = offered.filter((rung) => !RUNG_KIND[rung]);
  const selectableKinds = offered
    .map((rung) => RUNG_KIND[rung])
    .filter((kind): kind is NodeKind => Boolean(kind));

  const kind = RUNG_KIND[scope];
  const engine = useSingleNodeEngine({
    universe,
    value: kind && scopeId ? { kind, id: scopeId } : null,
    onChange: (node: PickNode | null) => {
      if (!node) {
        // Clearing the record keeps the rung; the record is still required.
        onScopeChange(scope, "");
        return;
      }
      const rung = KIND_RUNG[node.kind];
      if (!rung) return;
      onScopeChange(rung as R, node.id);
      setOpen(false);
    },
    selectableKinds,
  });

  const copy = RUNG_COPY[scope] ?? RUNG_COPY.user;
  const Icon = copy.icon;
  const held = engine.nodes[0];
  const needsRecord = Boolean(kind);
  const triggerText = needsRecord
    ? held
      ? null
      : `Choose ${copy.label.toLowerCase() === "organization" ? "an" : "a"} ${copy.label.toLowerCase()}…`
    : copy.label;

  return (
    <div className={cn("space-y-1.5", className)} data-binding-target-picker>
      {label !== null && (
        <Label className={cn("text-sm", hideLabel && "sr-only")}>{label}</Label>
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className={cn(
              "h-9 w-full justify-between gap-2 px-3 font-normal",
              needsRecord && !held && "text-muted-foreground",
            )}
          >
            <span className="flex min-w-0 items-center gap-2">
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate">
                {triggerText ?? (
                  <>
                    <NodeLabel node={held!} />
                    {held!.path.length > 0 && (
                      <span className="text-muted-foreground">
                        {" "}
                        · {held!.path.join(" › ")}
                      </span>
                    )}
                  </>
                )}
              </span>
            </span>
            <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          /* sizing: fixed — one-column drill deck, its own width */
          align="start"
          className="w-[min(360px,calc(100vw-2rem))] p-0"
        >
          {idless.length > 0 && (
            <div className="border-b border-border p-1">
              {idless.map((rung) => {
                const RungIcon = RUNG_COPY[rung].icon;
                const on = scope === rung;
                return (
                  <button
                    key={rung}
                    type="button"
                    aria-pressed={on}
                    onClick={() => {
                      onScopeChange(rung as R, undefined);
                      setOpen(false);
                    }}
                    className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted"
                  >
                    <span className="pt-0.5">
                      <CheckGlyph on={on} round />
                    </span>
                    <RungIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0">
                      <span className="block text-sm text-foreground">
                        {RUNG_COPY[rung].label}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {RUNG_COPY[rung].description}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          {selectableKinds.length > 0 && (
            <DrillDeckCore
              universe={universe}
              engine={engine}
              mode="select"
              rungs={selectableKinds.includes("scope") ? "scopes" : "engagements"}
              selectableKinds={selectableKinds}
              rootLabel="Or pick one"
              className="h-[300px] rounded-none border-0"
            />
          )}
        </PopoverContent>
      </Popover>
      {needsRecord && (
        <p className="text-xs text-muted-foreground">{copy.description}</p>
      )}
    </div>
  );
}
