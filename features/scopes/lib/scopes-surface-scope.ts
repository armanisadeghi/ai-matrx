// features/scopes/lib/scopes-surface-scope.ts
//
// Runtime scope builder for the `matrx-user/scopes` surface (and the shared
// half of `matrx-user/context-items`). Turns the loaded scope tree + the
// READ-ONLY global active-context reflection into the declared SurfaceValues.
//
// Nothing here writes anything: the active-context values are a mirror of
// appContextSlice for the agent's benefit, per the Surface A invariant in
// features/scopes/FEATURE.md.

import type {
  ScopesActiveScopeEntry,
  ScopesOrganizationEntry,
  ScopesScopeEntry,
  ScopesScopeTypeEntry,
  ScopesScopeValues,
} from "@/features/surfaces/manifests/scopes.manifest";
import type { OrgNode } from "@/features/scopes/types";

/** The read-only slice of global active context this surface reflects. */
export interface ActiveContextReflection {
  organizationId: string | null;
  projectId: string | null;
  taskId: string | null;
  scopeIds: string[];
}

/**
 * Directory + active-context values shared by every hub view. Returns only the
 * keys it can honestly fill: with an unloaded (empty) tree, the directory
 * values are omitted rather than emitted as zeroes.
 */
export function buildScopesDirectoryValues(
  organizations: readonly OrgNode[],
  active: ActiveContextReflection,
): Omit<ScopesScopeValues, "current_view"> {
  const activeOrg =
    organizations.find((o) => o.id === active.organizationId) ?? null;

  const activeIds = new Set(active.scopeIds);
  const activeScopes: ScopesActiveScopeEntry[] = [];
  const scopeTypes: ScopesScopeTypeEntry[] = [];
  const scopes: ScopesScopeEntry[] = [];
  const orgSummaries: ScopesOrganizationEntry[] = [];
  const emptyOrgIds: string[] = [];

  for (const org of organizations) {
    let orgScopeCount = 0;
    for (const type of org.scope_types) {
      orgScopeCount += type.scopes.length;
      scopeTypes.push({
        id: type.id,
        organization_id: org.id,
        organization_name: org.name,
        label_singular: type.label_singular,
        label_plural: type.label_plural,
        icon: type.icon,
        color: type.color,
        sort_order: type.sort_order,
        parent_type_id: type.parent_type_id,
        scope_count: type.scopes.length,
      });
      for (const scope of type.scopes) {
        scopes.push({
          id: scope.id,
          scope_type_id: type.id,
          scope_type_label: type.label_singular,
          organization_id: org.id,
          name: scope.name,
          description: scope.description,
          parent_scope_id: scope.parent_scope_id,
        });
        if (activeIds.has(scope.id)) {
          activeScopes.push({
            id: scope.id,
            name: scope.name,
            scope_type_id: type.id,
            scope_type_label: type.label_singular,
            organization_id: org.id,
          });
        }
      }
    }
    if (org.scope_types.length === 0) emptyOrgIds.push(org.id);
    orgSummaries.push({
      id: org.id,
      name: org.name,
      slug: org.slug,
      abbreviation: org.abbreviation,
      is_personal: org.is_personal,
      role: org.role,
      scope_type_count: org.scope_types.length,
      scope_count: orgScopeCount,
    });
  }

  const loaded = organizations.length > 0;

  return {
    ...(loaded
      ? {
          organization_count: organizations.length,
          organizations_summary: orgSummaries,
          scope_type_count: scopeTypes.length,
          scope_count: scopes.length,
          scope_types_summary: scopeTypes,
          scopes_summary: scopes,
          empty_organization_ids: emptyOrgIds,
        }
      : {}),
    ...(active.organizationId
      ? { active_organization_id: active.organizationId }
      : {}),
    ...(activeOrg ? { active_organization_name: activeOrg.name } : {}),
    active_scope_ids: active.scopeIds,
    active_scopes_summary: activeScopes,
    ...(active.projectId ? { active_project_id: active.projectId } : {}),
    ...(active.taskId ? { active_task_id: active.taskId } : {}),
    active_context_selection: {
      organization_id: active.organizationId,
      organization_name: activeOrg?.name ?? null,
      scope_ids: active.scopeIds,
      project_id: active.projectId,
      task_id: active.taskId,
    },
  };
}

/** The user's current text selection, or undefined when nothing is selected. */
export function currentSelection(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return window.getSelection()?.toString() || undefined;
}
