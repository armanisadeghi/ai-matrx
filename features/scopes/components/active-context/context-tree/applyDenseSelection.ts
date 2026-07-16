// Map DenseSelection ↔ appContextSlice (Surface A only).
//
// Production cardinality:
//   • one org
//   • multi scope (any number / any types)
//   • active_scope_type_ids for types with no chosen scope instance
//   • one project · one task
// Item refs are session-local in the tree host — not persisted on the slice.
//
// WRITE PATH — `setFullContext` WITHOUT `conversation_id`.
// The sequential writers (setOrganization → setScopeSelections → …) each
// cascade-clear descendants AND conversation_id — fatal on the chat route.
// setFullContext is the only non-cascading writer; we must never pass
// conversation_id here (undefined = leave the chat's conversation alone).

import type { AppDispatch } from "@/lib/redux/store";
import { setFullContext } from "@/lib/redux/slices/appContextSlice";
import type { OrgNode } from "@/features/scopes/types";
import type {
  AssignableProject,
  AssignableTask,
} from "@/features/scopes/components/context-assignment/data";
import { EMPTY_SELECTION, type DenseSelection } from "./model";

export function denseSelectionFromRedux(args: {
  organizationId: string | null;
  scopeSelections: Record<string, string | null>;
  activeScopeTypeIds: string[];
  projectId: string | null;
  taskId: string | null;
  /** Types of currently selected scopes — shown checked via cascade-up. */
  organizations: OrgNode[];
  itemRefs?: string[];
}): DenseSelection {
  const scopeIds = Object.values(args.scopeSelections).filter(
    (v): v is string => !!v,
  );

  // Derive type ids for selected scopes so the type checkbox stays on.
  const typesFromScopes = new Set<string>();
  for (const o of args.organizations) {
    for (const t of o.scope_types) {
      if (t.scopes.some((s) => scopeIds.includes(s.id))) {
        typesFromScopes.add(t.id);
      }
    }
  }

  return {
    orgIds: args.organizationId ? [args.organizationId] : [],
    scopeTypeIds: [
      ...new Set([...args.activeScopeTypeIds, ...typesFromScopes]),
    ],
    scopeIds,
    itemRefs: args.itemRefs ?? [],
    projectIds: args.projectId ? [args.projectId] : [],
    taskIds: args.taskId ? [args.taskId] : [],
  };
}

function workingContextPatch(
  sel: DenseSelection,
  organizations: OrgNode[],
  projects: AssignableProject[],
  tasks: AssignableTask[],
) {
  const orgId = sel.orgIds[0] ?? null;
  const org = orgId ? organizations.find((o) => o.id === orgId) : undefined;

  const scopeSelections: Record<string, string | null> = {};
  for (const id of sel.scopeIds) scopeSelections[id] = id;

  // Types that are selected but have no chosen scope instance under them.
  const typesWithScopes = new Set<string>();
  for (const o of organizations) {
    for (const t of o.scope_types) {
      if (t.scopes.some((s) => sel.scopeIds.includes(s.id))) {
        typesWithScopes.add(t.id);
      }
    }
  }
  const activeScopeTypeIds = sel.scopeTypeIds.filter(
    (id) => !typesWithScopes.has(id),
  );

  const projectId = sel.projectIds[0] ?? null;
  const project = projectId
    ? projects.find((p) => p.id === projectId)
    : undefined;
  const taskId = sel.taskIds[0] ?? null;
  const task = taskId ? tasks.find((t) => t.id === taskId) : undefined;

  return {
    organization_id: orgId,
    organization_name: org?.name ?? null,
    scope_selections: scopeSelections,
    active_scope_type_ids: activeScopeTypeIds,
    project_id: projectId,
    project_name: projectId ? (project?.name ?? null) : null,
    task_id: taskId,
    task_name: taskId ? (task?.title ?? null) : null,
    // conversation_id intentionally omitted — never touch the chat pointer.
  };
}

export function applyDenseSelectionToRedux(
  dispatch: AppDispatch,
  sel: DenseSelection,
  organizations: OrgNode[],
  projects: AssignableProject[],
  tasks: AssignableTask[],
): void {
  dispatch(
    setFullContext(workingContextPatch(sel, organizations, projects, tasks)),
  );
}

/** Clear working context without touching personal org / conversation. */
export function clearWorkingContext(dispatch: AppDispatch): void {
  dispatch(
    setFullContext({
      organization_id: null,
      organization_name: null,
      scope_selections: {},
      active_scope_type_ids: [],
      project_id: null,
      project_name: null,
      task_id: null,
      task_name: null,
    }),
  );
}

export function emptyDenseSelection(): DenseSelection {
  return { ...EMPTY_SELECTION };
}
