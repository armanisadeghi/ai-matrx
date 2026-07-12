"use client";

// MillerStack — the requested TOP-TO-BOTTOM mobile Miller.
//
// Same navigation-vs-selection split as the columns (row click drills,
// checkbox selects), but one level at a time in a single full-width column:
// Root (orgs + Projects + Tasks) → org → type → scope → fields.
// A slim breadcrumb header drills back; touch-height rows (36px).
// Projects/tasks/fields all fetch lazily on first drill.

import React, { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { resolveColor } from "@/features/scope-system/constants/scope-colors";
import { resolveIcon } from "@/features/scope-system/utils/resolveIcon";
import {
  isSelected,
  itemRef,
  summarizeSelection,
  toggleNode,
  type DenseNodeKind,
  type DenseSelection,
  type SelectMode,
} from "./model";
import {
  CheckGlyph,
  InlineAddRow,
  InlineSpinner,
  fakeCreate,
  type DenseData,
} from "./shared";

type Level =
  | { at: "root" }
  | { at: "org"; orgId: string }
  | { at: "type"; orgId: string; typeId: string }
  | { at: "scope"; orgId: string; typeId: string; scopeId: string }
  | { at: "projects" }
  | { at: "tasks" };

function Row({
  label,
  meta,
  icon,
  tone,
  drillable,
  on,
  selectable,
  onDrill,
  onToggle,
}: {
  label: string;
  meta?: string;
  icon?: React.ReactNode;
  tone?: string;
  drillable?: boolean;
  on?: boolean;
  selectable?: boolean;
  onDrill?: () => void;
  onToggle?: () => void;
}) {
  return (
    <div
      className="flex h-9 cursor-pointer items-center gap-2 border-b border-border/40 px-2 hover:bg-muted/60"
      onClick={() => (drillable ? onDrill?.() : onToggle?.())}
    >
      {selectable && (
        <button
          type="button"
          aria-label={on ? `Deselect ${label}` : `Select ${label}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggle?.();
          }}
          className="flex h-7 w-7 shrink-0 items-center justify-center"
        >
          <CheckGlyph on={!!on} />
        </button>
      )}
      {icon}
      <span className={cn("min-w-0 flex-1 truncate text-sm", tone)}>
        {label}
      </span>
      {meta && (
        <span className="shrink-0 font-mono text-[10px] text-muted-foreground/60">
          {meta}
        </span>
      )}
      {drillable && (
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50" />
      )}
    </div>
  );
}

export function MillerStack({
  data,
  selection,
  onChange,
  mode = "multi",
  height = 340,
}: {
  data: DenseData;
  selection: DenseSelection;
  onChange: (sel: DenseSelection) => void;
  mode?: SelectMode;
  height?: number;
}) {
  const [level, setLevel] = useState<Level>({ at: "root" });

  const toggle = (kind: DenseNodeKind, id: string) =>
    onChange(toggleNode(selection, kind, id, mode));

  const org =
    "orgId" in level
      ? data.organizations.find((o) => o.id === level.orgId)
      : undefined;
  const type =
    org && "typeId" in level
      ? org.scope_types.find((t) => t.id === level.typeId)
      : undefined;
  const scope =
    type && "scopeId" in level
      ? type.scopes.find((s) => s.id === level.scopeId)
      : undefined;

  const crumb: { label: string; to: Level }[] = [
    { label: "Context", to: { at: "root" } },
  ];
  if (level.at === "projects") crumb.push({ label: "Projects", to: level });
  if (level.at === "tasks") crumb.push({ label: "Tasks", to: level });
  if (org) crumb.push({ label: org.name, to: { at: "org", orgId: org.id } });
  if (org && type)
    crumb.push({
      label: type.label_plural,
      to: { at: "type", orgId: org.id, typeId: type.id },
    });
  if (org && type && scope)
    crumb.push({
      label: scope.name,
      to: { at: "scope", orgId: org.id, typeId: type.id, scopeId: scope.id },
    });
  const back = crumb.length > 1 ? crumb[crumb.length - 2].to : null;

  const loading =
    data.treeStatus === "loading" && data.organizations.length === 0;

  return (
    <div className="flex w-full flex-col overflow-hidden rounded-md border border-border bg-card">
      {/* breadcrumb header — the drill-back control */}
      <div className="flex h-8 shrink-0 items-center gap-0.5 border-b border-border bg-muted/40 px-1">
        <button
          type="button"
          aria-label="Back"
          disabled={!back}
          onClick={() => back && setLevel(back)}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted disabled:opacity-30"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden">
          {crumb.map((c, i) => (
            <React.Fragment key={i}>
              {i > 0 && (
                <span className="shrink-0 text-[10px] text-muted-foreground/40">
                  ›
                </span>
              )}
              <button
                type="button"
                onClick={() => setLevel(c.to)}
                className={cn(
                  "truncate rounded-sm px-1 text-xs",
                  i === crumb.length - 1
                    ? "font-medium text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {c.label}
              </button>
            </React.Fragment>
          ))}
        </div>
      </div>

      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto" style={{ height }}>
        {loading ? (
          <div className="space-y-1.5 p-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-7 animate-pulse rounded-sm bg-muted" />
            ))}
          </div>
        ) : data.treeError && data.organizations.length === 0 ? (
          <div className="p-3 text-xs text-destructive">{data.treeError}</div>
        ) : level.at === "root" ? (
          <>
            {data.organizations.map((o) => (
              <Row
                key={o.id}
                label={o.name}
                meta={o.is_personal ? "personal" : `${o.scope_types.length} types`}
                tone="font-medium"
                drillable
                selectable
                on={isSelected(selection, "org", o.id)}
                onDrill={() => setLevel({ at: "org", orgId: o.id })}
                onToggle={() => toggle("org", o.id)}
              />
            ))}
            <Row
              label="Projects"
              tone="font-medium"
              meta={
                data.projectsStatus === "ready"
                  ? String(data.projects.length)
                  : undefined
              }
              drillable
              onDrill={() => {
                data.loadProjects();
                setLevel({ at: "projects" });
              }}
            />
            <Row
              label="Tasks"
              tone="font-medium"
              meta={
                data.tasksStatus === "ready"
                  ? String(data.tasks.length)
                  : undefined
              }
              drillable
              onDrill={() => {
                data.loadTasks();
                setLevel({ at: "tasks" });
              }}
            />
          </>
        ) : level.at === "org" && org ? (
          <>
            {org.scope_types.map((t) => {
              const c = resolveColor(t);
              const TIcon = resolveIcon(t.icon);
              return (
                <Row
                  key={t.id}
                  label={t.label_plural}
                  icon={<TIcon className={cn("h-4 w-4 shrink-0", c.fg)} />}
                  tone={cn("font-medium", c.fg)}
                  meta={String(t.scopes.length)}
                  drillable
                  selectable
                  on={isSelected(selection, "type", t.id)}
                  onDrill={() =>
                    setLevel({ at: "type", orgId: org.id, typeId: t.id })
                  }
                  onToggle={() => toggle("type", t.id)}
                />
              );
            })}
            <InlineAddRow
              placeholder="New scope type"
              indentPx={8}
              onCommit={(v) => fakeCreate("scope type", v, { org_id: org.id })}
            />
          </>
        ) : level.at === "type" && org && type ? (
          <>
            {type.scopes.map((s) => (
              <Row
                key={s.id}
                label={s.name}
                drillable
                selectable
                on={isSelected(selection, "scope", s.id)}
                onDrill={() => {
                  data.loadItems(type.id);
                  setLevel({
                    at: "scope",
                    orgId: org.id,
                    typeId: type.id,
                    scopeId: s.id,
                  });
                }}
                onToggle={() => toggle("scope", s.id)}
              />
            ))}
            <InlineAddRow
              placeholder={`New ${type.label_singular.toLowerCase()}`}
              indentPx={8}
              onCommit={(v) =>
                fakeCreate("scope", v, {
                  org_id: org.id,
                  scope_type_id: type.id,
                })
              }
            />
          </>
        ) : level.at === "scope" && org && type && scope ? (
          <>
            {data.itemsLoading.has(type.id) && !data.itemsByType[type.id] ? (
              <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
                <InlineSpinner /> Loading fields…
              </div>
            ) : (data.itemsByType[type.id] ?? []).length === 0 ? (
              <div className="p-3 text-xs text-muted-foreground/60">
                {type.label_singular} has no fields yet.
              </div>
            ) : (
              (data.itemsByType[type.id] ?? []).map((it) => {
                const ref = itemRef(scope.id, it.id);
                return (
                  <Row
                    key={it.id}
                    label={it.display_name}
                    meta={String(it.value_type)}
                    selectable
                    on={isSelected(selection, "item", ref)}
                    onToggle={() => toggle("item", ref)}
                  />
                );
              })
            )}
            <InlineAddRow
              placeholder="New field"
              indentPx={8}
              onCommit={(v) =>
                fakeCreate("context item", v, { scope_type_id: type.id })
              }
            />
          </>
        ) : level.at === "projects" ? (
          <>
            {data.projectsStatus === "loading" ? (
              <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
                <InlineSpinner /> Loading projects…
              </div>
            ) : data.projectsStatus === "error" ? (
              <button
                type="button"
                onClick={() => data.loadProjects()}
                className="p-3 text-xs text-destructive underline"
              >
                Couldn&apos;t load — retry
              </button>
            ) : (
              data.projects.map((p) => (
                <Row
                  key={p.id}
                  label={p.name}
                  meta={
                    data.organizations.find((o) => o.id === p.orgId)?.slug ??
                    "unassigned"
                  }
                  selectable
                  on={isSelected(selection, "project", p.id)}
                  onToggle={() => toggle("project", p.id)}
                />
              ))
            )}
            {data.projectsStatus === "ready" && (
              <InlineAddRow
                placeholder="New project"
                indentPx={8}
                onCommit={(v) => fakeCreate("project", v, {})}
              />
            )}
          </>
        ) : level.at === "tasks" ? (
          <>
            {data.tasksStatus === "loading" ? (
              <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
                <InlineSpinner /> Loading tasks…
              </div>
            ) : data.tasksStatus === "error" ? (
              <button
                type="button"
                onClick={() => data.loadTasks()}
                className="p-3 text-xs text-destructive underline"
              >
                Couldn&apos;t load — retry
              </button>
            ) : (
              data.tasks.map((t) => (
                <Row
                  key={t.id}
                  label={t.title}
                  meta={t.status ?? ""}
                  selectable
                  on={isSelected(selection, "task", t.id)}
                  onToggle={() => toggle("task", t.id)}
                />
              ))
            )}
            {data.tasksStatus === "ready" && (
              <InlineAddRow
                placeholder="New task"
                indentPx={8}
                onCommit={(v) => fakeCreate("task", v, {})}
              />
            )}
          </>
        ) : null}
      </div>

      <div className="flex h-6 shrink-0 items-center border-t border-border bg-muted/30 px-2 text-[10px] text-muted-foreground">
        <span className="min-w-0 truncate">{summarizeSelection(selection)}</span>
      </div>
    </div>
  );
}
