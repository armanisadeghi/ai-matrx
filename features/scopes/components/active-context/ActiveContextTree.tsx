"use client";

// features/scopes/components/active-context/ActiveContextTree.tsx
//
// THE canonical COMPACT active-context picker — a small collapsible tree
// (Org → scope types → scopes, plus Projects / Tasks groups) that reads and
// writes the working context directly. Same semantics as ActiveContextPanel
// (org explicit, ONE scope per type, single project, single task) at a
// fraction of the footprint: no search bar, no fixed section height, no
// summary footer. Drop it into popovers/menus where the full field is too
// tall (ContextDocsMenu, quick rows); keep ActiveContextPanel for hosts with
// real vertical room.
//
// SURFACE A: lives in active-context/ because it dispatches appContextSlice.

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronRight, FolderKanban, ListCheck, X } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { cn } from "@/lib/utils";
import {
  selectOrganizationId,
  selectScopeSelectionsContext,
  selectProjectId,
  selectTaskId,
  setOrganization,
  setScopeSelections,
  setProject,
  setTask,
  clearContext,
} from "@/lib/redux/slices/appContextSlice";
import { selectHasActiveContext } from "@/features/scopes/redux/selectors/active-context";
import { useScopeTree } from "@/features/scopes/hooks/useScopeTree";
import { ensureScopeTree } from "@/features/scopes/redux/thunks/ensureScopeTree";
import {
  fetchAssignableProjects,
  fetchAssignableTasks,
  type AssignableProject,
  type AssignableTask,
} from "@/features/scopes/components/context-assignment/data";
import { DynamicIcon } from "@/components/official/icons/IconResolver";

export interface ActiveContextTreeProps {
  className?: string;
  /** Cap the tree's own scroll area (px). Default 260. */
  maxHeight?: number;
}

const ROW =
  "flex w-full min-w-0 items-center gap-1.5 rounded px-1.5 py-1 text-left text-[11px] transition-colors hover:bg-muted/60";

function Chevron({ open }: { open: boolean }) {
  return (
    <ChevronRight
      className={cn(
        "h-3 w-3 shrink-0 text-muted-foreground/60 transition-transform",
        open && "rotate-90",
      )}
    />
  );
}

function CheckDot({ on }: { on: boolean }) {
  return (
    <span
      className={cn(
        "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[4px] border",
        on
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background",
      )}
    >
      {on && <Check className="h-2.5 w-2.5" />}
    </span>
  );
}

export function ActiveContextTree({
  className,
  maxHeight = 260,
}: ActiveContextTreeProps) {
  const dispatch = useAppDispatch();
  const { organizations } = useScopeTree();
  useEffect(() => {
    void dispatch(ensureScopeTree({}));
  }, [dispatch]);

  const orgId = useAppSelector(selectOrganizationId);
  const scopeSelections = useAppSelector(selectScopeSelectionsContext);
  const projectId = useAppSelector(selectProjectId);
  const taskId = useAppSelector(selectTaskId);
  const hasActiveContext = useAppSelector(selectHasActiveContext);

  const selectedScopeIds = useMemo(
    () =>
      new Set(Object.values(scopeSelections).filter((v): v is string => !!v)),
    [scopeSelections],
  );

  const [projects, setProjects] = useState<AssignableProject[]>([]);
  const [tasks, setTasks] = useState<AssignableTask[]>([]);
  useEffect(() => {
    void fetchAssignableProjects().then(setProjects);
    void fetchAssignableTasks().then(setTasks);
  }, []);

  // Open the active org's branch by default; everything else starts closed.
  const [openNodes, setOpenNodes] = useState<Set<string>>(
    () => new Set(orgId ? [`org:${orgId}`] : []),
  );
  const toggleNode = (key: string) =>
    setOpenNodes((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // ── Writers (ONE scope per type, single project/task — same product
  // semantics as ActiveContextPanel/ActiveContextButton) ──────────────────
  const toggleOrg = (id: string, name: string) => {
    if (orgId === id) dispatch(setOrganization({ id: null, name: null }));
    else {
      dispatch(setOrganization({ id, name }));
      setOpenNodes((prev) => new Set(prev).add(`org:${id}`));
    }
  };

  const toggleScope = (scopeId: string, siblingIds: string[]) => {
    const next: Record<string, string | null> = {};
    for (const sid of selectedScopeIds) {
      if (sid === scopeId || siblingIds.includes(sid)) continue; // drop self + same-type siblings
      next[sid] = sid;
    }
    if (!selectedScopeIds.has(scopeId)) next[scopeId] = scopeId;
    dispatch(setScopeSelections(next));
  };

  const toggleProject = (p: AssignableProject) =>
    dispatch(
      projectId === p.id
        ? setProject({ id: null, name: null })
        : setProject({ id: p.id, name: p.name }),
    );

  const toggleTask = (t: AssignableTask) =>
    dispatch(
      taskId === t.id
        ? setTask({ id: null, name: null })
        : setTask({ id: t.id, name: t.title }),
    );

  // Projects/tasks scoped to the active org when one is set (org-less always shown).
  const visibleProjects = useMemo(
    () => projects.filter((p) => !orgId || !p.orgId || p.orgId === orgId),
    [projects, orgId],
  );
  const visibleTasks = useMemo(
    () => tasks.filter((t) => !orgId || !t.orgId || t.orgId === orgId),
    [tasks, orgId],
  );
  const selectedProjectName = projects.find((p) => p.id === projectId)?.name;
  const selectedTaskName = tasks.find((t) => t.id === taskId)?.title;

  return (
    <div className={cn("min-w-0", className)}>
      <div
        className="overflow-y-auto overscroll-contain pr-0.5"
        style={{ maxHeight }}
      >
        {organizations.map((org) => {
          const orgOpen = openNodes.has(`org:${org.id}`);
          const orgSelectedCount = org.scope_types.reduce(
            (n, st) =>
              n + st.scopes.filter((s) => selectedScopeIds.has(s.id)).length,
            0,
          );
          return (
            <div key={org.id}>
              <div className={cn(ROW, "font-medium")}>
                <button
                  type="button"
                  onClick={() => toggleNode(`org:${org.id}`)}
                  aria-label={`${orgOpen ? "Collapse" : "Expand"} ${org.name}`}
                  className="shrink-0"
                >
                  <Chevron open={orgOpen} />
                </button>
                <button
                  type="button"
                  onClick={() => toggleOrg(org.id, org.name)}
                  className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                >
                  <CheckDot on={orgId === org.id} />
                  <span className="min-w-0 truncate text-foreground">
                    {org.name}
                  </span>
                  {orgSelectedCount > 0 && !orgOpen && (
                    <span className="shrink-0 text-[10px] tabular-nums text-primary">
                      {orgSelectedCount}
                    </span>
                  )}
                </button>
              </div>

              {orgOpen &&
                org.scope_types.map((st) => {
                  if (st.scopes.length === 0) return null;
                  const stKey = `st:${st.id}`;
                  const stOpen = openNodes.has(stKey);
                  const stSelected = st.scopes.filter((s) =>
                    selectedScopeIds.has(s.id),
                  );
                  return (
                    <div key={st.id} className="pl-4">
                      <button
                        type="button"
                        onClick={() => toggleNode(stKey)}
                        className={cn(ROW, "text-muted-foreground")}
                      >
                        <Chevron open={stOpen} />
                        <DynamicIcon
                          name={st.icon}
                          className="h-3 w-3 shrink-0"
                        />
                        <span className="min-w-0 truncate">
                          {st.label_plural}
                        </span>
                        {stSelected.length > 0 && !stOpen && (
                          <span className="min-w-0 truncate text-[10px] text-primary">
                            {stSelected.map((s) => s.name).join(", ")}
                          </span>
                        )}
                      </button>
                      {stOpen &&
                        st.scopes.map((scope) => (
                          <button
                            key={scope.id}
                            type="button"
                            onClick={() =>
                              toggleScope(
                                scope.id,
                                st.scopes.map((s) => s.id),
                              )
                            }
                            className={cn(ROW, "pl-8")}
                          >
                            <CheckDot on={selectedScopeIds.has(scope.id)} />
                            <span
                              className={cn(
                                "min-w-0 truncate",
                                selectedScopeIds.has(scope.id)
                                  ? "text-foreground"
                                  : "text-muted-foreground",
                              )}
                            >
                              {scope.name}
                            </span>
                          </button>
                        ))}
                    </div>
                  );
                })}
            </div>
          );
        })}

        {/* Projects */}
        {visibleProjects.length > 0 && (
          <div>
            <button
              type="button"
              onClick={() => toggleNode("projects")}
              className={cn(ROW, "font-medium text-muted-foreground")}
            >
              <Chevron open={openNodes.has("projects")} />
              <FolderKanban className="h-3 w-3 shrink-0" />
              <span>Projects</span>
              {selectedProjectName && !openNodes.has("projects") && (
                <span className="min-w-0 truncate text-[10px] text-primary">
                  {selectedProjectName}
                </span>
              )}
            </button>
            {openNodes.has("projects") &&
              visibleProjects.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => toggleProject(p)}
                  className={cn(ROW, "pl-6")}
                >
                  <CheckDot on={projectId === p.id} />
                  <span
                    className={cn(
                      "min-w-0 truncate",
                      projectId === p.id
                        ? "text-foreground"
                        : "text-muted-foreground",
                    )}
                  >
                    {p.name}
                  </span>
                </button>
              ))}
          </div>
        )}

        {/* Tasks */}
        {visibleTasks.length > 0 && (
          <div>
            <button
              type="button"
              onClick={() => toggleNode("tasks")}
              className={cn(ROW, "font-medium text-muted-foreground")}
            >
              <Chevron open={openNodes.has("tasks")} />
              <ListCheck className="h-3 w-3 shrink-0" />
              <span>Tasks</span>
              {selectedTaskName && !openNodes.has("tasks") && (
                <span className="min-w-0 truncate text-[10px] text-primary">
                  {selectedTaskName}
                </span>
              )}
            </button>
            {openNodes.has("tasks") &&
              visibleTasks.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => toggleTask(t)}
                  className={cn(ROW, "pl-6")}
                >
                  <CheckDot on={taskId === t.id} />
                  <span
                    className={cn(
                      "min-w-0 truncate",
                      taskId === t.id
                        ? "text-foreground"
                        : "text-muted-foreground",
                    )}
                  >
                    {t.title}
                  </span>
                </button>
              ))}
          </div>
        )}
      </div>

      {hasActiveContext && (
        <button
          type="button"
          onClick={() => dispatch(clearContext())}
          className="mt-1 flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="h-2.5 w-2.5" />
          Clear context
        </button>
      )}
    </div>
  );
}
