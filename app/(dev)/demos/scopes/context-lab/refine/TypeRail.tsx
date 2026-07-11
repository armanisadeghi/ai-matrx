"use client";

// INSIDE 4 — "Type rail": a two-pane browser (think Slack's channel browser or
// VS Code's activity bar + panel).
//
// Left: a slim rail of every scope type across every org (grouped under tiny
// org initials), plus Projects and Tasks pinned at the BOTTOM of the rail.
// Right: the selected group's rows — scopes (with a fields drill-in), projects,
// or tasks. The tree never stacks vertically: depth moves horizontally, so
// three orgs cost ~10 rail rows, not half a page. Shines in mid-size hosts and
// single-select "set the working context" flows.

import React, { useEffect, useMemo, useState } from "react";
import {
  Briefcase,
  Building2,
  ChevronLeft,
  ChevronRight,
  FolderOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { resolveIcon } from "@/features/scope-system/utils/resolveIcon";
import { resolveColor } from "@/features/scope-system/constants/scope-colors";
import { formatOrgDisplayName } from "@/features/scopes/utils/formatOrgDisplayName";
import type {
  AssignableProject,
  AssignableTask,
} from "@/features/scopes/components/context-assignment/data";
import type { OrgNode, ScopeNode, ScopeTypeNode } from "@/features/scopes/types";
import {
  itemPickId,
  mergeDraftItems,
  type DraftStore,
  type ItemsState,
  type PickController,
} from "./model";
import {
  AddRow,
  CheckGlyph,
  DenseRow,
  EmptyRow,
  ErrorRow,
  InlineCreate,
  LoadingRow,
  MicroHeader,
} from "./rows";

type RailTarget =
  | { kind: "type"; org: OrgNode; type: ScopeTypeNode }
  | { kind: "projects" }
  | { kind: "tasks" };

export function TypeRail({
  orgs,
  projects,
  tasks,
  ctrl,
  items,
  drafts,
  height = 300,
  footer,
  className,
}: {
  orgs: OrgNode[];
  projects: AssignableProject[];
  tasks: AssignableTask[];
  ctrl: PickController;
  items: ItemsState;
  drafts: DraftStore;
  height?: number;
  footer?: React.ReactNode;
  className?: string;
}) {
  const [pickedTarget, setTarget] = useState<RailTarget | null>(null);
  const [drillScope, setDrillScope] = useState<ScopeNode | null>(null);
  const [adding, setAdding] = useState<"scope" | "type" | "field" | null>(null);
  const [addingTypeOrg, setAddingTypeOrg] = useState<OrgNode | null>(null);

  // Default target is DERIVED (first type of the first org that has one) —
  // no state syncing. User picks go through focusTarget, which also resets
  // the drill/add sub-state explicitly.
  const firstOrgWithTypes = orgs.find((o) => o.scope_types.length > 0);
  const target: RailTarget | null =
    pickedTarget ??
    (firstOrgWithTypes
      ? {
          kind: "type",
          org: firstOrgWithTypes,
          type: firstOrgWithTypes.scope_types[0],
        }
      : null);

  function focusTarget(t: RailTarget) {
    setTarget(t);
    setDrillScope(null);
    setAdding(null);
  }

  const activeType = target?.kind === "type" ? target.type : null;
  useEffect(() => {
    if (drillScope && activeType) items.ensure(activeType.id);
  }, [drillScope, activeType, items]);

  const selectedInType = (t: ScopeTypeNode) =>
    t.scopes.filter((s) => ctrl.has("scope", s.id)).length;
  const pickedProjects = projects.filter((p) => ctrl.has("project", p.id)).length;
  const pickedTasks = tasks.filter((t) => ctrl.has("task", t.id)).length;

  const railRow = (opts: {
    key: string;
    active: boolean;
    icon: React.ReactNode;
    label: string;
    count?: number;
    picked?: number;
    onClick: () => void;
  }) => (
    <button
      key={opts.key}
      type="button"
      onClick={opts.onClick}
      className={cn(
        "flex h-[26px] w-full items-center gap-1.5 rounded-md px-1.5 text-[12px]",
        opts.active
          ? "bg-accent font-medium text-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {opts.icon}
      <span className="min-w-0 flex-1 truncate text-left">{opts.label}</span>
      {opts.picked ? (
        <span className="shrink-0 rounded-full bg-primary/10 px-1 text-[10px] font-semibold text-primary">
          {opts.picked}
        </span>
      ) : null}
      {opts.count !== undefined && (
        <span className="shrink-0 text-[10px] opacity-60">{opts.count}</span>
      )}
    </button>
  );

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div className="flex min-h-0" style={{ height }}>
        {/* rail */}
        <div className="flex w-[148px] shrink-0 flex-col border-r border-border">
          <div className="min-h-0 flex-1 overflow-y-auto p-1 scrollbar-thin">
            {orgs.length === 0 && <EmptyRow label="No orgs." />}
            {orgs.map((o) => (
              <div key={o.id}>
                <div className="flex h-[20px] items-center gap-1 px-1.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                  <Building2 className="h-2.5 w-2.5" />
                  <span className="truncate">{formatOrgDisplayName(o)}</span>
                </div>
                {o.scope_types.map((t) => {
                  const c = resolveColor(t);
                  const Icon = resolveIcon(t.icon);
                  return railRow({
                    key: t.id,
                    active: activeType?.id === t.id,
                    icon: <Icon className={cn("h-3.5 w-3.5 shrink-0", c.fg)} />,
                    label: t.label_plural,
                    count: t.scopes.length,
                    picked: selectedInType(t),
                    onClick: () => focusTarget({ kind: "type", org: o, type: t }),
                  });
                })}
                {addingTypeOrg?.id === o.id && adding === "type" ? (
                  <InlineCreate
                    placeholder="New type"
                    onCommit={(v) => {
                      drafts.createType(o.id, v);
                      setAdding(null);
                      setAddingTypeOrg(null);
                    }}
                    onCancel={() => {
                      setAdding(null);
                      setAddingTypeOrg(null);
                    }}
                  />
                ) : (
                  <AddRow
                    label="New type"
                    onClick={() => {
                      setAdding("type");
                      setAddingTypeOrg(o);
                    }}
                  />
                )}
              </div>
            ))}
          </div>
          {/* pinned bottom rail entries — projects & tasks LAST, always */}
          <div className="shrink-0 border-t border-border p-1">
            {railRow({
              key: "projects",
              active: target?.kind === "projects",
              icon: <FolderOpen className="h-3.5 w-3.5 shrink-0" />,
              label: "Projects",
              count: projects.length,
              picked: pickedProjects,
              onClick: () => focusTarget({ kind: "projects" }),
            })}
            {railRow({
              key: "tasks",
              active: target?.kind === "tasks",
              icon: <Briefcase className="h-3.5 w-3.5 shrink-0" />,
              label: "Tasks",
              count: tasks.length,
              picked: pickedTasks,
              onClick: () => focusTarget({ kind: "tasks" }),
            })}
          </div>
        </div>

        {/* pane */}
        <div className="flex min-w-0 flex-1 flex-col">
          {target?.kind === "type" ? (
            drillScope ? (
              <ScopeFieldsPane
                org={target.org}
                type={target.type}
                scope={drillScope}
                onBack={() => setDrillScope(null)}
                ctrl={ctrl}
                items={items}
                drafts={drafts}
                adding={adding === "field"}
                onStartAdd={() => setAdding("field")}
                onEndAdd={() => setAdding(null)}
              />
            ) : (
              <>
                <MicroHeader
                  label={`${target.type.label_plural} · ${formatOrgDisplayName(target.org)}`}
                  count={target.type.scopes.length}
                />
                <div className="min-h-0 flex-1 overflow-y-auto p-1 scrollbar-thin">
                  {target.type.scopes.length === 0 && adding !== "scope" && (
                    <EmptyRow
                      label={`No ${target.type.label_plural.toLowerCase()} yet — add the first one.`}
                    />
                  )}
                  {target.type.scopes.map((s) => {
                    const c = resolveColor(target.type);
                    return (
                      <DenseRow
                        key={s.id}
                        on={ctrl.has("scope", s.id)}
                        single={ctrl.single}
                        label={s.name}
                        textClass={c.fg}
                        onClick={() => ctrl.toggle("scope", s.id)}
                        right={
                          <button
                            type="button"
                            title="This scope's fields"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDrillScope(s);
                            }}
                            className="flex h-5 items-center gap-0.5 rounded px-1 text-[10px] text-muted-foreground opacity-0 transition-opacity hover:bg-background hover:text-foreground group-hover:opacity-100"
                          >
                            fields
                            <ChevronRight className="h-3 w-3" />
                          </button>
                        }
                      />
                    );
                  })}
                  {adding === "scope" ? (
                    <InlineCreate
                      placeholder={`New ${target.type.label_singular.toLowerCase()} name`}
                      onCommit={(v) => {
                        const d = drafts.createScope(
                          target.type.id,
                          target.org.id,
                          v,
                        );
                        ctrl.toggle("scope", d.id);
                        setAdding(null);
                      }}
                      onCancel={() => setAdding(null)}
                    />
                  ) : (
                    <AddRow
                      label={`New ${target.type.label_singular}`}
                      onClick={() => setAdding("scope")}
                    />
                  )}
                </div>
              </>
            )
          ) : target?.kind === "projects" ? (
            <>
              <MicroHeader label="Projects — any org" count={projects.length} />
              <div className="min-h-0 flex-1 overflow-y-auto p-1 scrollbar-thin">
                {projects.length === 0 ? (
                  <EmptyRow label="No projects yet." />
                ) : (
                  projects.map((p) => (
                    <DenseRow
                      key={p.id}
                      on={ctrl.has("project", p.id)}
                      single={ctrl.single}
                      label={p.name}
                      sub={
                        p.orgId
                          ? (orgs.find((o) => o.id === p.orgId)?.name ?? undefined)
                          : "Unassigned"
                      }
                      onClick={() => ctrl.toggle("project", p.id)}
                    />
                  ))
                )}
              </div>
            </>
          ) : target?.kind === "tasks" ? (
            <>
              <MicroHeader label="Tasks — any org" count={tasks.length} />
              <div className="min-h-0 flex-1 overflow-y-auto p-1 scrollbar-thin">
                {tasks.length === 0 ? (
                  <EmptyRow label="No tasks yet." />
                ) : (
                  tasks.map((t) => (
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
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-[12px] text-muted-foreground">
              Pick a group on the left.
            </div>
          )}
        </div>
      </div>

      {footer && (
        <div className="shrink-0 border-t border-border">{footer}</div>
      )}
    </div>
  );
}

function ScopeFieldsPane({
  org,
  type,
  scope,
  onBack,
  ctrl,
  items,
  drafts,
  adding,
  onStartAdd,
  onEndAdd,
}: {
  org: OrgNode;
  type: ScopeTypeNode;
  scope: ScopeNode;
  onBack: () => void;
  ctrl: PickController;
  items: ItemsState;
  drafts: DraftStore;
  adding: boolean;
  onStartAdd: () => void;
  onEndAdd: () => void;
}) {
  const merged = mergeDraftItems(items.itemsByType[type.id], drafts, type.id);
  const loading = items.loadingTypeIds.has(type.id);
  const error = items.errorTypeIds.has(type.id);
  const c = resolveColor(type);
  return (
    <>
      <div className="flex h-[22px] shrink-0 items-center gap-1 px-1.5">
        <button
          type="button"
          onClick={onBack}
          className="flex h-4 items-center gap-0.5 rounded pr-1 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ChevronLeft className="h-3 w-3" />
          {type.label_plural}
        </button>
        <span className={cn("min-w-0 truncate text-[11px] font-semibold", c.fg)}>
          {scope.name}
        </span>
        <span className="text-[10px] text-muted-foreground">
          · fields · {formatOrgDisplayName(org)}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-1 scrollbar-thin">
        {loading && merged.length === 0 ? (
          <LoadingRow label="Loading fields…" />
        ) : error ? (
          <ErrorRow label="Couldn't load fields" onRetry={() => items.retry(type.id)} />
        ) : (
          <>
            {merged.length === 0 && !adding && (
              <EmptyRow label={`${type.label_singular} has no fields yet.`} />
            )}
            {merged.map((it) => {
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
            {adding ? (
              <InlineCreate
                placeholder="New field name"
                onCommit={(v) => {
                  drafts.createItem(type.id, v);
                  onEndAdd();
                }}
                onCancel={onEndAdd}
              />
            ) : (
              <AddRow label="New field" onClick={onStartAdd} />
            )}
          </>
        )}
      </div>
    </>
  );
}
