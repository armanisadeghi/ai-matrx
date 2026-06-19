"use client";

// features/scopes/components/active-context/ActiveContextButton.tsx
//
// THE compact Active-Context control — a small trigger that shows the current
// working context (org · scopes · project · task) and opens a popover to
// change it. Drop it into any header/toolbar/sidebar that needs "what am I
// working on right now" (chat header, transcripts cleanup/scribe, knowledge
// graph, RAG).
//
// SURFACE A: this file lives in active-context/ because it is one of the few
// sanctioned writers of appContextSlice. Everything else (the field, the
// wrappers) only EMITS selections; this component is the host that dispatches.
//
// Semantics (product decisions, 2026-06-11):
//   • The org is part of the context ONLY when explicitly selected — a scope
//     never drags its organization along.
//   • Active context = one scope per type, single project, single task.
//   • Setting context here feeds the agent/runtime; it never writes a durable
//     association anywhere.

import React, { useMemo, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { ContextSheet } from "@/features/scopes/components/context-assignment/ContextSheet";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectOrganizationId,
  selectOrganizationName,
  selectScopeSelectionsContext,
  selectProjectId,
  selectProjectName,
  selectTaskId,
  selectTaskName,
} from "@/lib/redux/slices/appContextSlice";
import { selectHasActiveContext } from "@/features/scopes/redux/selectors/active-context";
import type { ContextCheckboxVariant } from "@/features/scopes/components/context-assignment/ContextAssignmentField";
import { ContextSummaryChips } from "@/features/scopes/components/context-assignment/ContextSummaryChips";
import { ActiveContextPanel } from "./ActiveContextPanel";
import { ClearContextButton } from "./ClearContextButton";

export interface ActiveContextButtonProps {
  /** "xs" matches 20px-tall header rows (chat); "sm" fits sidebars/toolbars. */
  size?: "xs" | "sm";
  align?: "start" | "center" | "end";
  /** Icon-only square trigger (collapsed rails). Shows a count badge when set. */
  iconOnly?: boolean;
  /**
   * When iconOnly and NO context is set, render a warning treatment (amber ring
   * + alert dot) so an empty working context reads as "you need to set this".
   * Use on surfaces where running without context is a likely mistake (Scribe).
   */
  warnWhenEmpty?: boolean;
  /** Max width of the trigger before the summary truncates. */
  triggerClassName?: string;
  /** Checkbox style inside the popover field. Chat uses `standard` as a trial. */
  checkboxVariant?: ContextCheckboxVariant;
  className?: string;
}

export function ActiveContextButton({
  size = "sm",
  align = "start",
  iconOnly = false,
  warnWhenEmpty = false,
  triggerClassName,
  checkboxVariant = "custom",
  className,
}: ActiveContextButtonProps) {
  const [open, setOpen] = useState(false);
  const isMobile = useIsMobile();

  const orgId = useAppSelector(selectOrganizationId);
  const orgName = useAppSelector(selectOrganizationName);
  const scopeSelections = useAppSelector(selectScopeSelectionsContext);
  const projectId = useAppSelector(selectProjectId);
  const projectName = useAppSelector(selectProjectName);
  const taskId = useAppSelector(selectTaskId);
  const taskName = useAppSelector(selectTaskName);

  const scopeIds = useMemo(
    () => Object.values(scopeSelections ?? {}).filter((v): v is string => !!v),
    [scopeSelections],
  );
  const hasContext = useAppSelector(selectHasActiveContext);

  // Count of set context dimensions (org + project + task + each scope) — shown
  // as a badge in iconOnly mode so the user sees "how much" context is set.
  const contextCount =
    (orgId ? 1 : 0) +
    (projectId ? 1 : 0) +
    (taskId ? 1 : 0) +
    scopeIds.length;
  const warnEmpty = iconOnly && warnWhenEmpty && !hasContext;

  const sizeCls =
    size === "xs" ? "h-5 px-1.5 text-xs gap-1" : "h-8 px-2 text-xs gap-1.5";

  const triggerButton = (
    <button
      type="button"
      onClick={isMobile ? () => setOpen(true) : undefined}
      className={cn(
        "inline-flex w-full min-w-0 items-center rounded-md font-medium transition-colors",
        "bg-background text-foreground/80 hover:bg-muted/50 hover:text-foreground",
        size === "sm" && "border border-border",
        // Empty-context warning: amber ring so it reads as "set me".
        warnEmpty &&
          "ring-1 ring-amber-500/60 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10",
        sizeCls,
        triggerClassName,
      )}
      title={
        warnEmpty
          ? "No working context set — your agents have nothing to act within"
          : "Working context — what your agents act within"
      }
    >
      <span className="relative inline-flex shrink-0">
        <SlidersHorizontal
          className={cn(
            "shrink-0",
            warnEmpty ? "text-amber-500" : "text-muted-foreground",
            size === "xs" ? "h-3 w-3" : "h-3.5 w-3.5",
          )}
        />
        {iconOnly && hasContext && contextCount > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary px-0.5 text-[9px] font-semibold leading-none text-primary-foreground">
            {contextCount}
          </span>
        )}
        {warnEmpty && (
          <span className="absolute -right-1 -top-1 h-1.5 w-1.5 rounded-full bg-amber-500" />
        )}
      </span>
      {!iconOnly &&
        (hasContext ? (
          <span className="min-w-0 overflow-hidden">
            <ContextSummaryChips
              size="sm"
              className="flex-nowrap"
              value={{
                organizationId: orgId,
                organizationName: orgName,
                scopeIds,
                projectId,
                projectName,
                taskId,
                taskName,
              }}
            />
          </span>
        ) : (
          <span className="text-muted-foreground">Set context</span>
        ))}
    </button>
  );

  return (
    <div className={cn("flex min-w-0 items-center gap-1", className)}>
      <div className="min-w-0 flex-1">
        {isMobile ? (
          <>
            {triggerButton}
            <ContextSheet
              open={open}
              onOpenChange={setOpen}
              title="Working context"
              headerTrailing={
                hasContext ? (
                  <ClearContextButton
                    size="sm"
                    onCleared={() => setOpen(false)}
                  />
                ) : undefined
              }
            >
              {open && (
                <ActiveContextPanel checkboxVariant={checkboxVariant} fill />
              )}
            </ContextSheet>
          </>
        ) : (
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>{triggerButton}</PopoverTrigger>
            <PopoverContent
              align={align}
              className="w-[560px] max-w-[92vw] p-0"
            >
              {open && (
                <ActiveContextPanel
                  checkboxVariant={checkboxVariant}
                  sectionHeight={300}
                />
              )}
            </PopoverContent>
          </Popover>
        )}
      </div>
      {!iconOnly && hasContext && !isMobile && (
        <ClearContextButton size={size} onCleared={() => setOpen(false)} />
      )}
    </div>
  );
}
