"use client";

// features/scopes/components/active-context/engagement/EngagementPicker.tsx
//
// THE organization → project → task picker, with scopes as tags — the
// canonical scope selection family's engagement host (lane HIERARCHY-CASCADE,
// 2026-09-25; it replaced the bespoke agent-context HierarchyCascade). It is
// Miller Columns in `rungs="engagements"` mode over `useEngagementEngine`:
// no picker logic lives here, only the two presentations and the three
// in-place creates (project, task, scope) through their canonical writers.
//
// Persistence is the HOST's: every pick calls `onChange` with the whole
// EngagementSelection and the host writes what it owns (FK columns, the
// Surface-A active context, a form draft, `useEntityScopes().setScopes`).

import React, { useState } from "react";
import { Building2, ChevronsUpDown, FolderKanban, ListTodo, Tags } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppDispatch } from "@/lib/redux/hooks";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import {
  useCreateProject,
  useCreateTask,
} from "@/features/agent-context/hooks/useHierarchy";
import { createScope } from "@/features/scopes/redux/thunks/scopeTreeMutations";
import { isScopesRpcErr } from "@/features/scopes/types";
import { invalidateAssignableData } from "@/features/scopes/components/context-assignment/data";
import {
  ALL_ENGAGEMENT_RUNGS,
  applyEngagementPick,
  resolvePickNode,
  useEngagementEngine,
  useProjectTasks,
  useUniverse,
  type NodeKind,
  type CreatePayload,
  type EngagementRung,
  type EngagementSelection,
  type PickNode,
} from "../quick-pick/engine";
import { MillerColumnsCore } from "../miller-columns/MillerColumns";
import { MillerColumnsPopover } from "../miller-columns/MillerColumnsPopover";

export interface EngagementPickerProps {
  value: EngagementSelection;
  onChange: (next: EngagementSelection) => void;
  /** The rungs offered (default all four: organization, scope, project, task). */
  rungs?: readonly EngagementRung[];
  /** `field` (default): one trigger that names the chain and opens the
   *  columns (popover on desktop, the context sheet on mobile). `inline`: the
   *  columns sit in the page. */
  presentation?: "field" | "inline";
  disabled?: boolean;
  /** The trigger reads as incomplete while no project is held. */
  requireProject?: boolean;
  /** In-place create of a project, task or scope. Default on. */
  allowCreate?: boolean;
  className?: string;
  /** Inline presentation: the columns' own class (height, width). */
  columnsClassName?: string;
}

const RUNG_WORD: Record<EngagementRung, string> = {
  organization: "organization",
  project: "project",
  task: "task",
  scope: "scopes",
};

/** "Choose an organization, project or task" — the rungs this host offers. */
function placeholderFor(rungs: readonly EngagementRung[]): string {
  const words = rungs.filter((r) => r !== "scope").map((r) => RUNG_WORD[r]);
  if (words.length === 0) return "Tag with scopes";
  if (words.length === 1) return `Choose ${words[0] === "organization" ? "an" : "a"} ${words[0]}`;
  const last = words.at(-1);
  return `Choose ${words[0] === "organization" ? "an" : "a"} ${words.slice(0, -1).join(", ")} or ${last}`;
}

export function EngagementPicker({
  value,
  onChange,
  rungs = ALL_ENGAGEMENT_RUNGS,
  presentation = "field",
  disabled,
  requireProject = false,
  allowCreate = true,
  className,
  columnsClassName,
}: EngagementPickerProps) {
  const base = useUniverse();
  // The held project's own tasks join the universe, so a held task always
  // resolves to its name (the person's whole task list is a capped read).
  const heldProjectTasks = useProjectTasks(
    rungs.includes("task") ? value.projectId : null,
  );
  const extraTasks = heldProjectTasks.tasks.filter(
    (task) => !base.tasks.some((known) => known.id === task.id),
  );
  const universe =
    extraTasks.length > 0 ? { ...base, tasks: [...base.tasks, ...extraTasks] } : base;
  const engine = useEngagementEngine({ universe, value, onChange, rungs });
  const dispatch = useAppDispatch();
  const createProject = useCreateProject();
  const createTask = useCreateTask();
  const [open, setOpen] = useState(false);

  const pickCreated = (node: PickNode) =>
    onChange(applyEngagementPick(value, node, universe));

  const onCreate = async (payload: CreatePayload): Promise<void> => {
    const name = payload.name.trim();
    if (!name) return;
    if (payload.kind === "project") {
      const project = await createProject
        .mutateAsync({ name, organization_id: payload.orgId ?? undefined })
        .catch(() => null); // the mutation's onError already told the person
      if (!project) return;
      invalidateAssignableData("projects");
      universe.retryEngagement();
      pickCreated({
        kind: "project",
        id: project.id,
        label: project.name,
        path: [],
        orgId: project.organization_id ?? payload.orgId,
      });
      return;
    }
    if (payload.kind === "task") {
      const orgId = payload.orgId ?? value.organizationId;
      if (!payload.projectId || !orgId) {
        toast.error("Pick a project first — a new task is filed under one.");
        return;
      }
      const task = await createTask
        .mutateAsync({ title: name, project_id: payload.projectId, organization_id: orgId })
        .catch(() => null);
      if (!task) return;
      invalidateAssignableData("tasks");
      universe.retryEngagement();
      pickCreated({
        kind: "task",
        id: task.id,
        label: task.title,
        path: [],
        orgId,
        projectId: payload.projectId,
      });
      return;
    }
    if (payload.kind === "scope") {
      const res = await dispatch(
        createScope({ org_id: payload.orgId, type_id: payload.typeId, name }),
      );
      if (isScopesRpcErr(res)) {
        toast.error(`Couldn't create the ${payload.typeName.toLowerCase()}`, {
          description: res.error.message,
        });
        return;
      }
      pickCreated({
        kind: "scope",
        id: res.data.id,
        label: res.data.name,
        path: [],
        orgId: payload.orgId,
        typeId: payload.typeId,
        scopeId: res.data.id,
      });
    }
    // Scope types and context items are not created from an engagement host.
  };

  const columns = {
    universe,
    engine,
    mode: "select" as const,
    rungs: "engagements" as const,
    engagementRungs: rungs,
    onCreate: allowCreate && !disabled ? onCreate : undefined,
  };

  if (presentation === "inline") {
    return (
      <div
        className={cn(disabled && "pointer-events-none opacity-60", className)}
        aria-disabled={disabled || undefined}
        data-engagement-picker="inline"
      >
        <MillerColumnsCore
          {...columns}
          className={cn("h-[340px]", columnsClassName)}
        />
      </div>
    );
  }

  const missingProject =
    requireProject && rungs.includes("project") && !value.projectId;
  // Each held rung by its real name; while the data that names it is still
  // loading it reads "…", and a held id nobody can resolve says so.
  const loading =
    universe.treeStatus === "loading" ||
    universe.engagementStatus === "loading" ||
    heldProjectTasks.status === "loading";
  const nameOf = (
    rung: EngagementRung,
    kind: NodeKind,
    id: string | null,
    name: string | null,
  ): string | null => {
    if (!rungs.includes(rung) || !id) return null;
    const node = resolvePickNode(universe, kind, id);
    if (node) return node.label;
    if (name) return name;
    return loading ? "…" : `Unavailable ${RUNG_WORD[rung]}`;
  };
  const chain = [
    nameOf("organization", "org", value.organizationId, value.organizationName),
    nameOf("project", "project", value.projectId, value.projectName),
    nameOf("task", "task", value.taskId, value.taskName),
  ].filter((part): part is string => Boolean(part));
  const tagCount = rungs.includes("scope") ? value.scopeIds.length : 0;
  const LeadIcon = value.taskId
    ? ListTodo
    : value.projectId
      ? FolderKanban
      : Building2;

  return (
    <MillerColumnsPopover
      {...columns}
      open={open}
      onOpenChange={setOpen}
      variant="full"
      sheetTitle={placeholderFor(rungs)}
      className="h-[360px]"
      trigger={
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          aria-haspopup="dialog"
          aria-expanded={open}
          data-engagement-picker="field"
          className={cn(
            "h-8 w-full max-w-md justify-between gap-2 px-2 text-xs font-normal",
            chain.length === 0 && tagCount === 0 && "text-muted-foreground",
            missingProject && "border-destructive text-destructive",
            className,
          )}
        >
          <span className="flex min-w-0 items-center gap-1.5">
            <LeadIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">
              {chain.length > 0 ? chain.join(" › ") : placeholderFor(rungs)}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-1.5">
            {tagCount > 0 && (
              <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                <Tags className="h-3 w-3" />
                {tagCount}
              </span>
            )}
            <ChevronsUpDown className="h-3 w-3 opacity-50" />
          </span>
        </Button>
      }
    />
  );
}
