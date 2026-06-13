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

import React, { useEffect, useMemo, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectOrganizationId,
  selectOrganizationName,
  selectScopeSelectionsContext,
  selectProjectId,
  selectProjectName,
  selectTaskId,
  selectTaskName,
  setOrganization,
  setScopeSelections,
  setProject,
  setTask,
} from "@/lib/redux/slices/appContextSlice";
import { useScopeTree } from "@/features/scopes/hooks/useScopeTree";
import {
  ContextAssignmentField,
  type ContextSelection,
} from "@/features/scopes/components/context-assignment/ContextAssignmentField";
import { ContextSummaryChips } from "@/features/scopes/components/context-assignment/ContextSummaryChips";
import {
  fetchAssignableProjects,
  fetchAssignableTasks,
} from "@/features/scopes/components/context-assignment/data";

export interface ActiveContextButtonProps {
  /** "xs" matches 20px-tall header rows (chat); "sm" fits sidebars/toolbars. */
  size?: "xs" | "sm";
  align?: "start" | "center" | "end";
  /** Icon-only square trigger (collapsed rails). A dot marks set context. */
  iconOnly?: boolean;
  /** Max width of the trigger before the summary truncates. */
  triggerClassName?: string;
  className?: string;
}

export function ActiveContextButton({
  size = "sm",
  align = "start",
  iconOnly = false,
  triggerClassName,
  className,
}: ActiveContextButtonProps) {
  const dispatch = useAppDispatch();
  const { organizations } = useScopeTree();
  const [open, setOpen] = useState(false);

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
  const hasContext = !!orgId || scopeIds.length > 0 || !!projectId || !!taskId;

  // Name lookups for project/task at apply time (cached module fetch — the
  // popover content is the engagement point, so this is lazy + deduped).
  const [projectNames, setProjectNames] = useState<Record<string, string>>({});
  const [taskNames, setTaskNames] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!open) return;
    void fetchAssignableProjects().then((ps) => setProjectNames(Object.fromEntries(ps.map((p) => [p.id, p.name]))));
    void fetchAssignableTasks().then((ts) => setTaskNames(Object.fromEntries(ts.map((t) => [t.id, t.title]))));
  }, [open]);

  function apply(sel: ContextSelection) {
    // Order matters: setOrganization cascades (clears scopes/project/task),
    // and setScopeSelections clears project/task — so dispatch top-down.
    const org = sel.organizationId ? organizations.find((o) => o.id === sel.organizationId) : null;
    dispatch(setOrganization({ id: sel.organizationId, name: org?.name ?? null }));
    // Multi-select (2026-06-12): scope_selections is keyed by scope id.
    const byScope: Record<string, string | null> = {};
    for (const sid of sel.scopeIds) byScope[sid] = sid;
    dispatch(setScopeSelections(byScope));
    const pid = sel.projectIds[0] ?? null;
    dispatch(setProject({ id: pid, name: pid ? projectNames[pid] ?? null : null }));
    const tid = sel.taskIds[0] ?? null;
    dispatch(setTask({ id: tid, name: tid ? taskNames[tid] ?? null : null }));
    setOpen(false);
  }

  const sizeCls = size === "xs"
    ? "h-5 px-1.5 text-xs gap-1"
    : "h-8 px-2 text-xs gap-1.5";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex min-w-0 items-center rounded-md font-medium transition-colors",
            "bg-background text-foreground/80 hover:bg-muted/50 hover:text-foreground",
            size === "sm" && "border border-border",
            sizeCls,
            triggerClassName,
            className,
          )}
          title="Working context — what your agents act within"
        >
          <span className="relative inline-flex shrink-0">
            <SlidersHorizontal className={cn("shrink-0 text-muted-foreground", size === "xs" ? "h-3 w-3" : "h-3.5 w-3.5")} />
            {iconOnly && hasContext && (
              <span className="absolute -right-1 -top-1 h-1.5 w-1.5 rounded-full bg-primary" />
            )}
          </span>
          {!iconOnly && (hasContext ? (
            <span className="min-w-0 overflow-hidden">
              <ContextSummaryChips
                size="sm"
                className="flex-nowrap"
                value={{ organizationId: orgId, organizationName: orgName, scopeIds, projectId, projectName, taskId, taskName }}
              />
            </span>
          ) : (
            <span className="text-muted-foreground">Set context</span>
          ))}
        </button>
      </PopoverTrigger>
      <PopoverContent align={align} className="w-[560px] max-w-[92vw] p-0">
        {open && (
          <ContextAssignmentField
            mode="active"
            hideSubject
            sectionHeight={300}
            className="border-0"
            initialSelection={{
              organizationId: orgId,
              scopeIds,
              projectIds: projectId ? [projectId] : [],
              taskIds: taskId ? [taskId] : [],
            }}
            onApplyActive={apply}
          />
        )}
      </PopoverContent>
    </Popover>
  );
}
