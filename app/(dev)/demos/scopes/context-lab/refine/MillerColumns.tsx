"use client";

// INSIDE 2 — "Miller columns": the Finder-style column browser.
//
// Four fixed columns — Org | Scope type | Scope | Fields — so the whole chain
// down to context items is visible at once with ZERO vertical explosion:
// expanding never pushes anything, it fills the next column instead. Every
// column footer has "+ New …" (add-at-any-level), and projects/tasks live in a
// pinned strip along the bottom. Best for roomy hosts (dialogs, windows).

import React, { useEffect, useMemo, useState } from "react";
import { Briefcase, Building2, ChevronRight, FolderOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { resolveIcon } from "@/features/scope-system/utils/resolveIcon";
import { resolveColor } from "@/features/scope-system/constants/scope-colors";
import { formatOrgDisplayName } from "@/features/scopes/utils/formatOrgDisplayName";
import type {
  AssignableProject,
  AssignableTask,
} from "@/features/scopes/components/context-assignment/data";
import type { OrgNode } from "@/features/scopes/types";
import {
  itemPickId,
  mergeDraftItems,
  type DraftStore,
  type ItemsState,
  type PickController,
} from "./model";
import {
  CheckGlyph,
  DenseRow,
  EmptyRow,
  ErrorRow,
  InlineCreate,
  LoadingRow,
  MicroHeader,
} from "./rows";

const COL_H = 232;

export function MillerColumns({
  orgs,
  projects,
  tasks,
  ctrl,
  items,
  drafts,
  footer,
  className,
}: {
  orgs: OrgNode[];
  projects: AssignableProject[];
  tasks: AssignableTask[];
  ctrl: PickController;
  items: ItemsState;
  drafts: DraftStore;
  footer?: React.ReactNode;
  className?: string;
}) {
  const [pickedOrgId, setOrgId] = useState<string | null>(null);
  const [typeId, setTypeId] = useState<string | null>(null);
  const [scopeId, setScopeId] = useState<string | null>(null);
  const [addingIn, setAddingIn] = useState<"type" | "scope" | "item" | null>(
    null,
  );

  // Focus is derived, never synced: default org = first org; a type/scope id
  // that doesn't belong to the current focus simply resolves to null, and the
  // click handlers below reset the deeper columns explicitly.
  const org = orgs.find((o) => o.id === pickedOrgId) ?? orgs[0] ?? null;
  const orgId = org?.id ?? null;
  const type = org?.scope_types.find((t) => t.id === typeId) ?? null;
  const scope = type?.scopes.find((s) => s.id === scopeId) ?? null;

  function focusOrg(id: string) {
    setOrgId(id);
    setTypeId(null);
    setScopeId(null);
    setAddingIn(null);
  }
  function focusType(id: string) {
    setTypeId(id);
    setScopeId(null);
    setAddingIn(null);
    items.ensure(id);
  }

  useEffect(() => {
    if (type) items.ensure(type.id);
  }, [type, items]);

  const typeItems = type
    ? mergeDraftItems(items.itemsByType[type.id], drafts, type.id)
    : [];
  const itemsLoading = type ? items.loadingTypeIds.has(type.id) : false;
  const itemsError = type ? items.errorTypeIds.has(type.id) : false;

  const orgProjects = projects.filter(
    (p) => !org || p.orgId === org.id || p.orgId == null,
  );
  const orgTasks = tasks.filter(
    (t) => !org || t.orgId === org.id || t.orgId == null,
  );

  const col =
    "flex min-w-0 flex-1 flex-col border-r border-border last:border-r-0";
  const colBody = "min-h-0 flex-1 overflow-y-auto p-1 scrollbar-thin";

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      {/* the four columns */}
      <div className="flex" style={{ height: COL_H }}>
        {/* 1 · Organizations */}
        <div className={cn(col, "max-w-[170px]")}>
          <MicroHeader
            label="Organization"
            icon={<Building2 className="h-3 w-3" />}
          />
          <div className={colBody}>
            {orgs.map((o) => (
              <div
                key={o.id}
                role="option"
                aria-selected={orgId === o.id}
                onClick={() => focusOrg(o.id)}
                className={cn(
                  "group flex h-[26px] cursor-pointer items-center gap-1.5 rounded-md px-1.5 text-[13px] hover:bg-muted",
                  orgId === o.id && "bg-accent",
                )}
              >
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    ctrl.toggle("org", o.id);
                  }}
                  title="Include this organization itself in the context"
                >
                  <CheckGlyph on={ctrl.has("org", o.id)} />
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {formatOrgDisplayName(o)}
                </span>
                <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/50" />
              </div>
            ))}
            {orgs.length === 0 && <EmptyRow label="No organizations." />}
          </div>
        </div>

        {/* 2 · Scope types */}
        <div className={cn(col, "max-w-[170px]")}>
          <MicroHeader
            label={org ? "Scope type" : "Scope type"}
            count={org?.scope_types.length}
            onAdd={org ? () => setAddingIn("type") : undefined}
            addTitle="New scope type"
          />
          <div className={colBody}>
            {!org ? (
              <EmptyRow label="Pick an org." />
            ) : (
              <>
                {org.scope_types.map((t) => {
                  const c = resolveColor(t);
                  const Icon = resolveIcon(t.icon);
                  const selectedIn = t.scopes.filter((s) =>
                    ctrl.has("scope", s.id),
                  ).length;
                  return (
                    <div
                      key={t.id}
                      role="option"
                      aria-selected={typeId === t.id}
                      onClick={() => focusType(t.id)}
                      className={cn(
                        "flex h-[26px] cursor-pointer items-center gap-1.5 rounded-md px-1.5 text-[13px] hover:bg-muted",
                        typeId === t.id && "bg-accent",
                      )}
                    >
                      <Icon className={cn("h-3.5 w-3.5 shrink-0", c.fg)} />
                      <span className={cn("min-w-0 flex-1 truncate", c.fg)}>
                        {t.label_plural}
                      </span>
                      {selectedIn > 0 && (
                        <span className="shrink-0 rounded-full bg-primary/10 px-1 text-[10px] font-semibold text-primary">
                          {selectedIn}
                        </span>
                      )}
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {t.scopes.length}
                      </span>
                      <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/50" />
                    </div>
                  );
                })}
                {addingIn === "type" ? (
                  <InlineCreate
                    placeholder="New type (e.g. Client)"
                    onCommit={(v) => {
                      drafts.createType(org.id, v);
                      setAddingIn(null);
                    }}
                    onCancel={() => setAddingIn(null)}
                  />
                ) : (
                  org.scope_types.length === 0 && (
                    <EmptyRow label="No dimensions yet." />
                  )
                )}
              </>
            )}
          </div>
        </div>

        {/* 3 · Scopes */}
        <div className={col}>
          <MicroHeader
            label={type ? type.label_plural : "Scope"}
            count={type?.scopes.length}
            onAdd={type && org ? () => setAddingIn("scope") : undefined}
            addTitle={type ? `New ${type.label_singular}` : undefined}
          />
          <div className={colBody}>
            {!type ? (
              <EmptyRow label="Pick a type." />
            ) : (
              <>
                {type.scopes.map((s) => {
                  const c = resolveColor(type);
                  return (
                    <div
                      key={s.id}
                      className={cn(
                        "group flex h-[26px] cursor-pointer items-center gap-1.5 rounded-md px-1.5 text-[13px] hover:bg-muted",
                        scopeId === s.id && "bg-accent",
                      )}
                      onClick={() => setScopeId(s.id)}
                    >
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          ctrl.toggle("scope", s.id);
                        }}
                      >
                        <CheckGlyph on={ctrl.has("scope", s.id)} />
                      </span>
                      <span className={cn("min-w-0 flex-1 truncate", c.fg)}>
                        {s.name}
                      </span>
                      <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/50" />
                    </div>
                  );
                })}
                {addingIn === "scope" && org ? (
                  <InlineCreate
                    placeholder={`New ${type.label_singular.toLowerCase()} name`}
                    onCommit={(v) => {
                      const d = drafts.createScope(type.id, org.id, v);
                      ctrl.toggle("scope", d.id);
                      setAddingIn(null);
                    }}
                    onCancel={() => setAddingIn(null)}
                  />
                ) : (
                  type.scopes.length === 0 && (
                    <EmptyRow
                      label={`No ${type.label_plural.toLowerCase()} yet.`}
                    />
                  )
                )}
              </>
            )}
          </div>
        </div>

        {/* 4 · Fields (context items) */}
        <div className={col}>
          <MicroHeader
            label={scope ? `${scope.name} fields` : "Fields"}
            count={scope ? typeItems.length : undefined}
            onAdd={type && scope ? () => setAddingIn("item") : undefined}
            addTitle="New field"
          />
          <div className={colBody}>
            {!scope || !type ? (
              <EmptyRow label="Pick a scope." />
            ) : itemsLoading && typeItems.length === 0 ? (
              <LoadingRow label="Loading fields…" />
            ) : itemsError ? (
              <ErrorRow
                label="Couldn't load fields"
                onRetry={() => items.retry(type.id)}
              />
            ) : (
              <>
                {typeItems.map((it) => {
                  const pid = itemPickId(scope.id, it.id);
                  return (
                    <DenseRow
                      key={it.id}
                      on={ctrl.has("item", pid)}
                      single={ctrl.single}
                      label={it.display_name}
                      sub={String(it.value_type)}
                      onClick={() => ctrl.toggle("item", pid)}
                    />
                  );
                })}
                {addingIn === "item" ? (
                  <InlineCreate
                    placeholder="New field name"
                    onCommit={(v) => {
                      drafts.createItem(type.id, v);
                      setAddingIn(null);
                    }}
                    onCancel={() => setAddingIn(null)}
                  />
                ) : (
                  typeItems.length === 0 && (
                    <EmptyRow
                      label={`${type.label_singular} has no fields yet.`}
                    />
                  )
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* pinned bottom strip — projects & tasks (always at the BOTTOM) */}
      <div className="flex h-[110px] border-t border-border">
        <div className="flex min-w-0 flex-1 flex-col border-r border-border">
          <MicroHeader
            label="Projects"
            count={orgProjects.length}
            icon={<FolderOpen className="h-3 w-3" />}
          />
          <div className="min-h-0 flex-1 overflow-y-auto p-1 scrollbar-thin">
            {orgProjects.length === 0 ? (
              <EmptyRow label="No projects in view." />
            ) : (
              orgProjects.map((p) => (
                <DenseRow
                  key={p.id}
                  on={ctrl.has("project", p.id)}
                  single={ctrl.single}
                  label={p.name}
                  sub={p.orgId == null ? "Unassigned" : undefined}
                  onClick={() => ctrl.toggle("project", p.id)}
                />
              ))
            )}
          </div>
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <MicroHeader
            label="Tasks"
            count={orgTasks.length}
            icon={<Briefcase className="h-3 w-3" />}
          />
          <div className="min-h-0 flex-1 overflow-y-auto p-1 scrollbar-thin">
            {orgTasks.length === 0 ? (
              <EmptyRow label="No tasks in view." />
            ) : (
              orgTasks.map((t) => (
                <DenseRow
                  key={t.id}
                  on={ctrl.has("task", t.id)}
                  single={ctrl.single}
                  label={t.title}
                  sub={t.status ?? undefined}
                  onClick={() => ctrl.toggle("task", t.id)}
                />
              ))
            )}
          </div>
        </div>
      </div>

      {footer && (
        <div className="shrink-0 border-t border-border">{footer}</div>
      )}
    </div>
  );
}
