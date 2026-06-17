"use client";

// features/scopes/components/context-assignment/ContextSelectionSummary.tsx
//
// Labeled breakdown of an active/filter context selection inside
// ContextAssignmentField. Separates four independent dimensions:
//
//   • Org — explicitly checked organizations (never implied by a scope)
//   • Scope Types — whole type dimensions selected as a group (NOT the same
//     as picking individual scopes under a type; see selScopeTypeIds)
//   • {Type label} — individual scope instances per type (e.g. Clients: Acme)
//   • Projects / Tasks
//
// Pure display + remove handlers — no Redux writes.

import React, { useMemo } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { resolveColor } from "@/features/scope-system/constants/scope-colors";
import type { OrgNode, ScopeTypeNode } from "@/features/scopes/types";
import type { AssignableProject, AssignableTask } from "./data";
import type { ContextAssignmentDimension } from "./ContextAssignmentField";
import { orgDisplayNameById } from "@/features/scopes/utils/formatOrgDisplayName";

export interface ContextSelectionSummaryProps {
  organizations: OrgNode[];
  selOrgs: Set<string>;
  /** Whole scope-type dimensions (group selection). Distinct from scope ids. */
  selScopeTypeIds?: Set<string>;
  selScopes: Set<string>;
  selProjects: Set<string>;
  selTasks: Set<string>;
  addedScopes: { id: string; name: string; typeId: string }[];
  allProjects: AssignableProject[];
  addedProjects: AssignableProject[];
  allTasks: AssignableTask[];
  addedTasks: AssignableTask[];
  onRemoveOrg: (id: string) => void;
  onRemoveScopeType?: (id: string) => void;
  onRemoveScope: (id: string) => void;
  onRemoveProject: (id: string) => void;
  onRemoveTask: (id: string) => void;
  /** When set, hides Projects/Tasks rows that are omitted. Default: all three. */
  dimensions?: ContextAssignmentDimension[];
  className?: string;
}

function SummaryRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2 text-xs leading-relaxed">
      <span className="w-[6.5rem] shrink-0 pt-0.5 font-medium text-muted-foreground">
        {label}:
      </span>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
        {children}
      </div>
    </div>
  );
}

function NoneValue() {
  return <span className="py-0.5 text-muted-foreground">None</span>;
}

function RemovableChip({
  label,
  onRemove,
  fg,
  border,
}: {
  label: string;
  onRemove: () => void;
  fg?: string;
  border?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border bg-transparent px-2 py-0.5 text-xs font-medium",
        fg ?? "text-foreground",
        border ?? "border-border",
      )}
    >
      <span className="max-w-[160px] truncate">{label}</span>
      <button
        type="button"
        onClick={onRemove}
        className="rounded p-0.5 hover:bg-muted"
        aria-label={`Remove ${label}`}
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

function typeRowLabel(type: ScopeTypeNode, organizations: OrgNode[]): string {
  if (organizations.length <= 1) return type.label_plural;
  const org = organizations.find((o) => o.id === type.organization_id);
  return org ? `${type.label_plural} · ${org.name}` : type.label_plural;
}

function resolveScopeType(
  scopeId: string,
  organizations: OrgNode[],
  addedScopes: { id: string; name: string; typeId: string }[],
): ScopeTypeNode | undefined {
  const fromTree = organizations
    .flatMap((o) => o.scope_types)
    .find((t) => t.scopes.some((s) => s.id === scopeId));
  if (fromTree) return fromTree;
  const added = addedScopes.find((a) => a.id === scopeId);
  if (!added) return undefined;
  return organizations
    .flatMap((o) => o.scope_types)
    .find((t) => t.id === added.typeId);
}

function scopeName(
  scopeId: string,
  organizations: OrgNode[],
  addedScopes: { id: string; name: string; typeId: string }[],
): string {
  for (const o of organizations) {
    for (const t of o.scope_types) {
      const s = t.scopes.find((sc) => sc.id === scopeId);
      if (s) return s.name;
    }
  }
  return addedScopes.find((a) => a.id === scopeId)?.name ?? scopeId;
}

export function ContextSelectionSummary({
  organizations,
  selOrgs,
  selScopeTypeIds = new Set(),
  selScopes,
  selProjects,
  selTasks,
  addedScopes,
  allProjects,
  addedProjects,
  allTasks,
  addedTasks,
  onRemoveOrg,
  onRemoveScopeType,
  onRemoveScope,
  onRemoveProject,
  onRemoveTask,
  dimensions,
  className,
}: ContextSelectionSummaryProps) {
  const dims = useMemo(() => {
    const set = new Set(
      dimensions ?? (["scopes", "projects", "tasks"] as const),
    );
    return {
      scopes: set.has("scopes"),
      projects: set.has("projects"),
      tasks: set.has("tasks"),
    };
  }, [dimensions]);
  const allTypes = useMemo(
    () => organizations.flatMap((o) => o.scope_types),
    [organizations],
  );

  const scopeTypeGroupChips = useMemo(() => {
    return [...selScopeTypeIds]
      .map((id) => allTypes.find((t) => t.id === id))
      .filter((t): t is ScopeTypeNode => !!t)
      .sort((a, b) => a.sort_order - b.sort_order);
  }, [selScopeTypeIds, allTypes]);

  const scopesByType = useMemo(() => {
    const map = new Map<string, { type: ScopeTypeNode; scopeIds: string[] }>();
    for (const scopeId of selScopes) {
      const type = resolveScopeType(scopeId, organizations, addedScopes);
      if (!type) continue;
      const entry = map.get(type.id);
      if (entry) entry.scopeIds.push(scopeId);
      else map.set(type.id, { type, scopeIds: [scopeId] });
    }
    return [...map.values()].sort(
      (a, b) => a.type.sort_order - b.type.sort_order,
    );
  }, [selScopes, organizations, addedScopes]);

  const projectName = (id: string) =>
    [...allProjects, ...addedProjects].find((p) => p.id === id)?.name ?? id;

  const taskName = (id: string) =>
    [...allTasks, ...addedTasks].find((t) => t.id === id)?.title ?? id;

  return (
    <div className={cn("space-y-1", className)}>
      <SummaryRow label="Org">
        {selOrgs.size === 0 ? (
          <NoneValue />
        ) : (
          [...selOrgs].map((id) => (
            <RemovableChip
              key={id}
              label={orgDisplayNameById(organizations, id)}
              onRemove={() => onRemoveOrg(id)}
            />
          ))
        )}
      </SummaryRow>

      <SummaryRow label="Scope Types">
        {scopeTypeGroupChips.length === 0 ? (
          <NoneValue />
        ) : (
          scopeTypeGroupChips.map((t) => {
            const c = resolveColor(t);
            return (
              <RemovableChip
                key={t.id}
                label={typeRowLabel(t, organizations)}
                fg={c.fg}
                border={c.border}
                onRemove={() => onRemoveScopeType?.(t.id)}
              />
            );
          })
        )}
      </SummaryRow>

      {dims.scopes &&
        scopesByType.map(({ type, scopeIds }) => {
          const c = resolveColor(type);
          return (
            <SummaryRow key={type.id} label={typeRowLabel(type, organizations)}>
              {scopeIds.map((id) => (
                <RemovableChip
                  key={id}
                  label={scopeName(id, organizations, addedScopes)}
                  fg={c.fg}
                  border={c.border}
                  onRemove={() => onRemoveScope(id)}
                />
              ))}
            </SummaryRow>
          );
        })}

      {dims.projects && (
        <SummaryRow label="Projects">
          {selProjects.size === 0 ? (
            <NoneValue />
          ) : (
            [...selProjects].map((id) => (
              <RemovableChip
                key={id}
                label={projectName(id)}
                onRemove={() => onRemoveProject(id)}
              />
            ))
          )}
        </SummaryRow>
      )}

      {dims.tasks && (
        <SummaryRow label="Tasks">
          {selTasks.size === 0 ? (
            <NoneValue />
          ) : (
            [...selTasks].map((id) => (
              <RemovableChip
                key={id}
                label={taskName(id)}
                onRemove={() => onRemoveTask(id)}
              />
            ))
          )}
        </SummaryRow>
      )}
    </div>
  );
}
