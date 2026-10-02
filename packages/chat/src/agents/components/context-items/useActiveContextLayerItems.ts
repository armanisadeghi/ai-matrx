"use client";

/**
 * useActiveContextLayerItems(conversationId)
 *
 * Normalizes the global active context (the scope-selection system: org,
 * scope(s), project, task) into `ContextDrawerItem[]` so all of it surfaces in
 * the SAME side drawer as every other context item — one shared "Context" chip
 * opens it, and the user navigates the layers prev/next.
 *
 * Read-only: it never writes `appContextSlice` (that's Surface A's job). It just
 * mirrors the selections into drawer items.
 */

import { Briefcase, Building2, CheckSquare, Layers } from "lucide-react";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectActiveOrganizationId,
  selectActiveOrganizationName,
  selectActiveProjectId,
  selectActiveScopeIds,
  selectActiveTaskId,
} from "@/features/scopes/redux/selectors/active-context";
import {
  selectProjectName,
  selectTaskName,
} from "@/lib/redux/slices/appContextSlice";
import { useScopeTree } from "@/features/scopes/hooks/useScopeTree";
import type { ContextDrawerItem } from "./types";

export interface ActiveContextLayerSummary {
  items: ContextDrawerItem[];
  /** Short label for the single grouped chip, e.g. "Acme · 2 scopes". */
  summary: string;
  count: number;
}

export function useActiveContextLayerItems(
  conversationId: string,
): ActiveContextLayerSummary {
  const orgId = useAppSelector(selectActiveOrganizationId);
  const orgName = useAppSelector(selectActiveOrganizationName);
  const scopeIds = useAppSelector(selectActiveScopeIds);
  const projectId = useAppSelector(selectActiveProjectId);
  const projectName = useAppSelector(selectProjectName);
  const taskId = useAppSelector(selectActiveTaskId);
  const taskName = useAppSelector(selectTaskName);
  const { organizations } = useScopeTree();

  const org = orgId
    ? (organizations.find((o) => o.id === orgId) ?? null)
    : null;

  const resolveScopeName = (sid: string): string => {
    for (const o of organizations) {
      for (const t of o.scope_types) {
        const s = t.scopes.find((x) => x.id === sid);
        if (s) return s.name;
      }
    }
    return "Scope";
  };

  const items: ContextDrawerItem[] = [];

  if (orgId || orgName) {
    items.push({
      id: `ctx_org:${orgId ?? "active"}`,
      blockType: "ctx_org",
      typeLabel: "Organization",
      title: org?.name ?? orgName ?? "Organization",
      icon: Building2,
      themeKey: "input_project",
      origin: "block",
      conversationId,
      editable: false,
      refs: { orgId: orgId ?? null },
      raw: null,
    });
  }

  for (const sid of scopeIds) {
    items.push({
      id: `ctx_scope:${sid}`,
      blockType: "ctx_scope",
      typeLabel: "Scope",
      title: resolveScopeName(sid),
      icon: Layers,
      themeKey: "input_project",
      origin: "block",
      conversationId,
      editable: false,
      refs: { scopeId: sid, orgId: orgId ?? null },
      raw: null,
    });
  }

  if (projectId) {
    items.push({
      id: `ctx_project:${projectId}`,
      blockType: "ctx_project",
      typeLabel: "Project",
      title: projectName ?? "Project",
      icon: Briefcase,
      themeKey: "input_project",
      origin: "block",
      conversationId,
      editable: false,
      refs: { projectIds: [projectId], orgId: orgId ?? null },
      raw: null,
    });
  }

  if (taskId) {
    items.push({
      id: `ctx_task:${taskId}`,
      blockType: "ctx_task",
      typeLabel: "Task",
      title: taskName ?? "Task",
      icon: CheckSquare,
      themeKey: "input_task",
      origin: "block",
      conversationId,
      editable: true,
      refs: { taskIds: [taskId] },
      raw: null,
    });
  }

  const parts: string[] = [];
  if (org?.name ?? orgName) parts.push(org?.name ?? orgName ?? "");
  if (scopeIds.length === 1) parts.push(resolveScopeName(scopeIds[0]));
  else if (scopeIds.length > 1) parts.push(`${scopeIds.length} scopes`);
  const summary = parts.filter(Boolean).join(" · ") || "Context";

  return { items, summary, count: items.length };
}
