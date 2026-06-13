// features/scopes/components/active-context/ActiveScopePicker.tsx
//
// Surface A picker — writes to appContextSlice. THE ONLY component family
// allowed to dispatch setOrganization / setScopeSelections / setProject /
// setTask. Every other "tag this with…" picker in the codebase writes to
// `ctx_scope_assignments` via setEntityScopes (Surface B) — see
// features/scopes/FEATURE.md §"Global vs Local context".
//
// Replaces features/shell/components/sidebar/DirectContextSelection.tsx as
// the test bed. The old slices (state.scopes, state.hierarchy, ...) are
// no longer read here — everything routes through useScopeTree (which
// reads state.scopesTree) and the active-context selectors.
//
// Visual primitives — ContextRow / HoverFlyout / FlyoutItem — are reused
// from features/agent-context/components/ContextPickerPrimitives.tsx
// (which has no Redux dependency). Those primitives are slated for
// retirement in Phase 5; when they leave, this file gets a one-line swap
// to whatever the replacement is. The contract here is the data + dispatch
// layer, not the visual layer.

"use client";

import type * as React from "react";
import { useMemo, useEffect, useRef, useState, useCallback } from "react";
import {
  Building,
  FolderKanban,
  ListCheck,
  ChevronDown,
  X,
  Settings2,
  AlertTriangle,
} from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  clearContext,
  selectOrganizationName,
  selectProjectName,
  selectTaskName,
  setOrganization,
  setProject,
  setScopeSelections,
  setTask,
} from "@/lib/redux/slices/appContextSlice";
import {
  selectActiveOrganizationId,
  selectActiveProjectId,
  selectActiveScopeSelections,
  selectActiveTaskId,
} from "@/features/scopes/redux/selectors/active-context";
import {
  makeSelectOrphanProjects,
  makeSelectProjectsForOrg,
  makeSelectTaskBucket,
  makeSelectTasksForLevel,
  selectAllScopeTypesFlat,
  selectOrganizations,
  selectOrganizationsList,
  selectTreeStatus,
} from "@/features/scopes/redux/selectors/tree";
import { useScopeTree } from "@/features/scopes/hooks/useScopeTree";
import { ensureScopeTree } from "@/features/scopes/redux/thunks/ensureScopeTree";
import {
  fetchAssignableProjects,
  fetchAssignableTasks,
  type AssignableProject,
  type AssignableTask,
} from "@/features/scopes/components/context-assignment/data";
import { ensureScopeTasks } from "@/features/scopes/redux/thunks/ensureScopeTasks";
import { ensureOrphanProjects } from "@/features/scopes/redux/thunks/ensureOrphanProjects";
import { selectDefaultContextPreferences } from "@/lib/redux/preferences/userPreferenceSelectors";
import {
  ContextRow,
  type PickerOption,
} from "@/features/agent-context/components/ContextPickerPrimitives";
import { DynamicIcon } from "@/components/official/icons/IconResolver";
import type { ScopeTypeNode } from "@/features/scopes/types";
import { cn } from "@/utils/cn";

export interface ActiveScopePickerProps {
  /** Start expanded (e.g., inside a bottom sheet). Default: false. */
  defaultExpanded?: boolean;
  /** Hide the chevron + collapsed header (always expanded). */
  alwaysExpanded?: boolean;
}

type CollapsedIconDescriptor =
  | { kind: "lucide"; Component: React.ComponentType<{ className?: string }> }
  | { kind: "dynamic"; iconName: string };

export function ActiveScopePicker({
  defaultExpanded = false,
  alwaysExpanded = false,
}: ActiveScopePickerProps) {
  const dispatch = useAppDispatch();

  // ─── Boot fetch + status ───────────────────────────────────────────
  useScopeTree(); // ensures the tree is fetched lazily on first render
  const treeStatus = useAppSelector(selectTreeStatus);

  // ─── Active context selectors ──────────────────────────────────────
  const orgId = useAppSelector(selectActiveOrganizationId);
  const orgName = useAppSelector(selectOrganizationName);
  const projectId = useAppSelector(selectActiveProjectId);
  const projectName = useAppSelector(selectProjectName);
  const taskId = useAppSelector(selectActiveTaskId);
  const taskName = useAppSelector(selectTaskName);
  const scopeSelections = useAppSelector(selectActiveScopeSelections);

  // ─── Tree selectors ────────────────────────────────────────────────
  // The picker surfaces scope items (the things users actually think
  // about — "Ava", "Sara", clients, departments) at the TOP, flattened
  // across every org the user belongs to. The org/project/task rows live
  // below as drill-downs. When a user picks a scope from any org, we
  // auto-promote that org into the active context (Surface A invariant
  // — global context is only updated by Surface A actions, and this IS
  // one). Org → scope_types are still the same group, but no longer
  // gated on a selected org.
  const organizations = useAppSelector(selectOrganizationsList);
  const organizationsById = useAppSelector(selectOrganizations);
  const allScopeTypes = useAppSelector(selectAllScopeTypesFlat);
  const selectProjectsForOrg = useMemo(() => makeSelectProjectsForOrg(), []);
  const selectOrphanProjects = useMemo(() => makeSelectOrphanProjects(), []);
  const projects = useAppSelector((s) => selectProjectsForOrg(s, orgId));
  const orphanProjectsBucket = useAppSelector((s) =>
    selectOrphanProjects(s, orgId),
  );

  // When there are multiple orgs, scope types from different orgs can
  // share labels ("Project", "Client"). Disambiguate with the org name
  // suffix only when needed.
  const scopeTypeRowLabel = useCallback(
    (st: ScopeTypeNode): string => {
      if (organizations.length <= 1) return st.label_singular;
      const collisions = allScopeTypes.filter(
        (other) => other.label_singular === st.label_singular,
      );
      if (collisions.length <= 1) return st.label_singular;
      const orgName = organizationsById[st.organization_id]?.name;
      return orgName ? `${st.label_singular} · ${orgName}` : st.label_singular;
    },
    [allScopeTypes, organizations.length, organizationsById],
  );

  // ─── Task selectors (per drill-down level) ─────────────────────────
  //
  // Resolution order for the active task list:
  //   1. Active project selected   → tasks under that project
  //   2. Else active scope selected → tasks tagged with that scope
  //   3. Else active org selected   → tasks at the org level
  //   4. Else nothing
  const activeScopeIds = useMemo(
    () => Object.values(scopeSelections).filter(Boolean) as string[],
    [scopeSelections],
  );
  const taskLevel: { level: "project" | "scope" | "org"; id: string } | null =
    useMemo(() => {
      if (projectId) return { level: "project", id: projectId };
      if (activeScopeIds[0]) return { level: "scope", id: activeScopeIds[0] };
      if (orgId) return { level: "org", id: orgId };
      return null;
    }, [projectId, activeScopeIds, orgId]);

  const selectTaskBucket = useMemo(() => makeSelectTaskBucket(), []);
  const selectTasks = useMemo(() => makeSelectTasksForLevel(), []);
  const taskBucket = useAppSelector((s) =>
    taskLevel ? selectTaskBucket(s, taskLevel) : null,
  );
  const tasksForLevel = useAppSelector((s) =>
    taskLevel ? selectTasks(s, taskLevel) : undefined,
  );

  // Lazy-fetch tasks when the level changes.
  useEffect(() => {
    if (!taskLevel) return;
    void dispatch(ensureScopeTasks(taskLevel.level, taskLevel.id));
  }, [dispatch, taskLevel?.level, taskLevel?.id]);

  // ─── Default-context preference (one-shot) ──────────────────────────
  const defaultCtxPref = useAppSelector(selectDefaultContextPreferences);
  const appliedDefault = useRef(false);
  useEffect(() => {
    if (appliedDefault.current) return;
    if (!defaultCtxPref || defaultCtxPref.level === "none") {
      appliedDefault.current = true;
      return;
    }
    if (!organizations || organizations.length === 0) return;
    const {
      level,
      organizationId,
      projectId: prefProjectId,
      taskId: prefTaskId,
    } = defaultCtxPref;
    if (
      (level === "org" || level === "project" || level === "task") &&
      organizationId
    ) {
      const org = organizations.find((o) => o.id === organizationId);
      if (org) dispatch(setOrganization({ id: org.id, name: org.name }));
    }
    if ((level === "project" || level === "task") && prefProjectId) {
      const proj = projects.find((p) => p.id === prefProjectId);
      if (proj) dispatch(setProject({ id: proj.id, name: proj.name }));
    }
    if (level === "task" && prefTaskId) {
      // Task name resolves later when the task bucket fetches; for now
      // we set the id and let the chips/header backfill the name.
      dispatch(setTask({ id: prefTaskId, name: null }));
    }
    appliedDefault.current = true;
  }, [dispatch, defaultCtxPref, organizations, projects]);

  // ─── Collapsed/expanded UI ─────────────────────────────────────────
  const [expanded, setExpanded] = useState(defaultExpanded || alwaysExpanded);

  // No-org fallback: the user's WHOLE project/task lists (org-less ones
  // included) via the shared cached data layer — projects and tasks do NOT
  // require an organization, so the picker must never gate them behind one.
  // Loaded only while the picker is expanded and no org narrows the lists;
  // the module cache (60s TTL + in-flight dedup) keeps this storm-safe.
  const [allProjects, setAllProjects] = useState<AssignableProject[]>([]);
  const [allTasks, setAllTasks] = useState<AssignableTask[]>([]);
  useEffect(() => {
    if (!expanded || orgId) return;
    let alive = true;
    void fetchAssignableProjects().then((p) => { if (alive) setAllProjects(p); });
    void fetchAssignableTasks().then((t) => { if (alive) setAllTasks(t); });
    return () => { alive = false; };
  }, [expanded, orgId]);
  const reallyExpanded = alwaysExpanded || expanded;

  // ─── Picker options ───────────────────────────────────────────────
  const orgOptions: PickerOption[] = useMemo(
    () => organizations.map((o) => ({ id: o.id, name: o.name })),
    [organizations],
  );

  const projectOptions: PickerOption[] = useMemo(
    () =>
      orgId
        ? projects.map((p) => ({ id: p.id, name: p.name }))
        : allProjects.map((p) => ({ id: p.id, name: p.name })),
    [orgId, projects, allProjects],
  );

  const orphanProjectOptions: PickerOption[] = useMemo(
    () =>
      orphanProjectsBucket.status === "ready"
        ? orphanProjectsBucket.items.map((p) => ({
            id: p.id,
            name: p.name,
          }))
        : [],
    [orphanProjectsBucket],
  );

  const taskOptions: PickerOption[] = useMemo(() => {
    if (taskLevel) {
      return (tasksForLevel ?? [])
        .filter((t) => t.status !== "completed")
        .map((t) => ({ id: t.id, name: t.title, status: t.status }));
    }
    // No org/scope/project picked → every open task the user has.
    return allTasks
      .filter((t) => t.status !== "completed")
      .map((t) => ({ id: t.id, name: t.title, status: t.status ?? undefined }));
  }, [taskLevel, tasksForLevel, allTasks]);

  // ─── Handlers (Surface A — all writes to appContextSlice) ──────────
  const handleSelectOrg = useCallback(
    (id: string | null) => {
      const org = organizations.find((o) => o.id === id);
      dispatch(setOrganization({ id, name: org?.name ?? null }));
    },
    [dispatch, organizations],
  );

  const handleSelectScope = useCallback(
    (scopeType: ScopeTypeNode, scopeId: string | null) => {
      // MULTI-SELECT (2026-06-12): scope_selections is keyed by scope id —
      // clicking toggles a scope in/out; null clears every scope of the type.
      const next: Record<string, string | null> = { ...scopeSelections };
      if (scopeId === null) {
        for (const s of scopeType.scopes) delete next[s.id];
      } else if (next[scopeId]) {
        delete next[scopeId];
      } else {
        next[scopeId] = scopeId;
      }
      dispatch(setScopeSelections(next));
      // Auto-promote the scope's org to active context when the user adds a
      // scope from an org that isn't the current active org. Surface A path,
      // so dispatching setOrganization here is sanctioned.
      if (scopeId && !scopeSelections[scopeId] && scopeType.organization_id !== orgId) {
        const org = organizationsById[scopeType.organization_id];
        if (org) dispatch(setOrganization({ id: org.id, name: org.name }));
      }
    },
    [dispatch, scopeSelections, orgId, organizationsById],
  );

  const handleSelectProject = useCallback(
    (id: string | null) => {
      const proj =
        projects.find((p) => p.id === id) ??
        orphanProjectsBucket.items.find((p) => p.id === id) ??
        allProjects.find((p) => p.id === id);
      dispatch(setProject({ id, name: proj?.name ?? null }));
    },
    [dispatch, projects, orphanProjectsBucket.items, allProjects],
  );

  const handleSelectTask = useCallback(
    (id: string | null) => {
      const levelTask = tasksForLevel?.find((t) => t.id === id);
      const flatTask = levelTask ? null : allTasks.find((t) => t.id === id);
      const taskProjectId = levelTask?.project_id ?? flatTask?.projectId ?? null;
      if (taskProjectId && !projectId) {
        const proj =
          projects.find((p) => p.id === taskProjectId) ??
          allProjects.find((p) => p.id === taskProjectId);
        dispatch(setProject({ id: taskProjectId, name: proj?.name ?? null }));
      }
      dispatch(setTask({ id, name: levelTask?.title ?? flatTask?.title ?? null }));
    },
    [dispatch, tasksForLevel, allTasks, projects, allProjects, projectId],
  );

  const handleClearAll = useCallback(() => {
    dispatch(clearContext());
  }, [dispatch]);

  const handleLoadOrphanProjects = useCallback(() => {
    if (!orgId) return;
    void dispatch(ensureOrphanProjects(orgId));
  }, [dispatch, orgId]);

  // ─── Collapsed-header summary ──────────────────────────────────────
  const hasAnyContext =
    !!orgId || !!projectId || !!taskId || activeScopeIds.length > 0;

  const collapsedLabel = useMemo(() => {
    if (taskName) return taskName;
    if (projectName) return projectName;
    const firstScopeId = activeScopeIds[0];
    if (firstScopeId) {
      for (const t of allScopeTypes) {
        const s = t.scopes.find((sc) => sc.id === firstScopeId);
        if (s) return s.name;
      }
    }
    if (orgName) return orgName;
    return null;
  }, [taskName, projectName, activeScopeIds, allScopeTypes, orgName]);

  // Discriminated descriptor instead of a component-during-render — keeps
  // render-time identity stable and lets React Compiler optimize.
  const collapsedIcon: CollapsedIconDescriptor = (() => {
    if (taskId) return { kind: "lucide", Component: ListCheck };
    if (projectId) return { kind: "lucide", Component: FolderKanban };
    const firstScopeId = activeScopeIds[0];
    if (firstScopeId) {
      for (const t of allScopeTypes) {
        const s = t.scopes.find((sc) => sc.id === firstScopeId);
        if (s) return { kind: "dynamic", iconName: t.icon };
      }
    }
    if (orgId) return { kind: "lucide", Component: Building };
    return { kind: "lucide", Component: Settings2 };
  })();

  // ─── Render ────────────────────────────────────────────────────────
  const collapsedIconClass = cn(
    "h-3.5 w-3.5 flex-shrink-0 transition-colors",
    hasAnyContext
      ? "text-primary"
      : "text-muted-foreground group-hover:text-foreground",
  );

  return (
    <div>
      {!alwaysExpanded && (
        <div
          role="button"
          tabIndex={0}
          onClick={() => setExpanded((v) => !v)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") setExpanded((v) => !v);
          }}
          className="flex items-center gap-2 w-full px-2.5 py-1 text-left hover:bg-accent/40 transition-colors group cursor-pointer select-none"
        >
          {collapsedIcon.kind === "lucide" ? (
            <collapsedIcon.Component className={collapsedIconClass} />
          ) : (
            <DynamicIcon
              name={collapsedIcon.iconName}
              className={collapsedIconClass}
            />
          )}
          <span
            className={cn(
              "text-xs flex-1 truncate",
              hasAnyContext
                ? "text-foreground font-medium"
                : "text-muted-foreground",
            )}
          >
            {collapsedLabel ?? "Set Context"}
          </span>
          {hasAnyContext && !reallyExpanded && (
            <button
              onMouseDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
                handleClearAll();
              }}
              className="text-muted-foreground hover:text-foreground transition-colors mr-0.5"
            >
              <X className="h-2.5 w-2.5" />
            </button>
          )}
          <ChevronDown
            className={cn(
              "h-3 w-3 text-muted-foreground transition-transform duration-150",
              reallyExpanded && "rotate-180",
            )}
          />
        </div>
      )}

      {reallyExpanded && (
        <div className="px-1.5 pb-1">
          {treeStatus === "loading" && allScopeTypes.length === 0 && (
            <>
              {[1, 2].map((i) => (
                <div
                  key={i}
                  className="flex items-center gap-2.5 px-2.5 py-1.5"
                >
                  <div className="h-3.5 w-3.5 rounded bg-muted animate-pulse flex-shrink-0" />
                  <div className="h-3 w-16 rounded bg-muted animate-pulse" />
                </div>
              ))}
            </>
          )}

          {treeStatus === "error" && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] text-destructive">
              <AlertTriangle className="h-3 w-3 flex-shrink-0" />
              Failed to load context tree.
              <button
                type="button"
                className="ml-auto rounded px-1.5 py-0.5 text-[10px] font-medium text-foreground bg-muted hover:bg-accent"
                onClick={() => void dispatch(ensureScopeTree({ refresh: true }))}
              >
                Retry
              </button>
            </div>
          )}

          {allScopeTypes.map((scopeType) => {
            // Multi-select: any number of this type's scopes can be active.
            const selectedScopes = scopeType.scopes.filter(
              (s) => !!scopeSelections[s.id],
            );
            const selectedLabel =
              selectedScopes.length === 0
                ? null
                : selectedScopes.length === 1
                  ? selectedScopes[0].name
                  : `${selectedScopes.length} selected`;
            const scopeOptions: PickerOption[] = scopeType.scopes.map((s) => ({
              id: s.id,
              name: s.name,
            }));
            return (
              <ContextRow
                key={scopeType.id}
                icon={(props) => (
                  <DynamicIcon name={scopeType.icon} {...props} />
                )}
                label={scopeTypeRowLabel(scopeType)}
                selectedName={selectedLabel}
                selectedId={selectedScopes[0]?.id ?? null}
                selectedIds={selectedScopes.map((s) => s.id)}
                accentClass="text-emerald-500"
                options={scopeOptions}
                onSelect={(id) => handleSelectScope(scopeType, id)}
                emptyText={`No ${scopeType.label_plural.toLowerCase()} yet`}
              />
            );
          })}

          {allScopeTypes.length > 0 && (
            <div className="mx-1 my-0.5 border-t border-border/40" />
          )}

          <ContextRow
            icon={Building}
            label="Organization"
            selectedName={orgName}
            selectedId={orgId}
            accentClass="text-violet-500"
            options={orgOptions}
            onSelect={handleSelectOrg}
            emptyText="No organizations found"
          />

          <ContextRow
            icon={FolderKanban}
            label="Project"
            selectedName={projectName}
            selectedId={projectId}
            accentClass="text-amber-500"
            options={projectOptions}
            orphanOptions={orphanProjectOptions}
            onSelect={handleSelectProject}
            emptyText={
              orgId ? "No projects in this organization" : "No projects yet"
            }
          />

          {orgId && orphanProjectsBucket.status === "unfetched" && (
            <button
              onClick={handleLoadOrphanProjects}
              className="flex items-center gap-1.5 w-full px-2.5 py-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-accent/30"
            >
              <FolderKanban className="h-2.5 w-2.5" />
              Load other projects
            </button>
          )}
          {orphanProjectsBucket.status === "empty" && (
            <div className="px-2.5 py-1 text-[11px] text-muted-foreground">
              No other projects.
            </div>
          )}

          <ContextRow
            icon={ListCheck}
            label="Tasks"
            selectedName={taskName}
            selectedId={taskId}
            accentClass="text-sky-500"
            options={taskOptions}
            onSelect={handleSelectTask}
            emptyText={
              !taskLevel
                ? "No open tasks yet"
                : taskBucket?.status === "loading"
                  ? "Loading tasks…"
                  : taskBucket?.status === "empty"
                    ? "No open tasks at this level"
                    : "Search tasks"
            }
          />

          {hasAnyContext && (
            <div className="pt-0.5">
              <button
                onClick={handleClearAll}
                className="flex items-center gap-1.5 w-full px-2.5 py-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-accent/30"
              >
                <X className="h-2.5 w-2.5" />
                Clear context
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default ActiveScopePicker;
