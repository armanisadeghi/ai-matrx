"use client";

// INSIDE — "Type-tab matrix" (KEEPER concept; gap-closing revision).
//
// Types as one tab rail, scopes as a toggle-chip grid — 8 scopes on one
// line instead of 8 rows. What the first cut was missing (this revision):
//   1. ORG ANCHORING — tabs are now grouped under slim org dividers instead
//      of a per-tab slug suffix; you always know whose dimension you're in.
//   2. THE WHOLE SELECTION IN PLACE — the footer is a removable-chip
//      mini-ledger (every selected bucket, any tab, one-click remove),
//      not a text summary you can't act on.
//   3. LAZY projects/tasks — those tabs fetch on first click, never before.
// Field reach-down stays: the per-chip caret opens the scope's field strip.

import React, { useMemo, useState } from "react";
import { ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { resolveColor } from "@/features/scope-system/constants/scope-colors";
import { resolveIcon } from "@/features/scope-system/utils/resolveIcon";
import {
  isSelected,
  itemRef,
  resolveSelection,
  selectionCount,
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

type Tab =
  | { kind: "type"; orgId: string; typeId: string }
  | { kind: "projects" }
  | { kind: "tasks" };

export function TypeTabMatrix({
  data,
  selection,
  onChange,
  mode = "multi",
  height = 240,
}: {
  data: DenseData;
  selection: DenseSelection;
  onChange: (sel: DenseSelection) => void;
  mode?: SelectMode;
  height?: number;
}) {
  const firstType = data.organizations
    .flatMap((o) => o.scope_types.map((t) => ({ orgId: o.id, typeId: t.id })))
    .at(0);
  const [tab, setTab] = useState<Tab | null>(null);
  const active: Tab | null =
    tab ?? (firstType ? { kind: "type", ...firstType } : null);
  const [fieldScopeId, setFieldScopeId] = useState<string | null>(null);

  const toggle = (kind: DenseNodeKind, id: string) =>
    onChange(toggleNode(selection, kind, id, mode));

  const resolved = useMemo(
    () =>
      resolveSelection(
        selection,
        data.organizations,
        data.projects,
        data.tasks,
        data.itemsByType,
      ),
    [selection, data],
  );

  const loading =
    data.treeStatus === "loading" && data.organizations.length === 0;
  if (loading)
    return (
      <div
        className="animate-pulse rounded-md border border-border bg-muted/40"
        style={{ height }}
      />
    );
  if (data.treeError && data.organizations.length === 0)
    return (
      <div className="rounded-md border border-destructive/40 p-2 text-xs text-destructive">
        {data.treeError}
      </div>
    );

  const activeOrg =
    active?.kind === "type"
      ? data.organizations.find((o) => o.id === active.orgId)
      : null;
  const activeType =
    active?.kind === "type"
      ? activeOrg?.scope_types.find((t) => t.id === active.typeId)
      : null;
  const fieldScope =
    activeType?.scopes.find((s) => s.id === fieldScopeId) ?? null;
  const items = activeType ? data.itemsByType[activeType.id] : undefined;
  const itemsLoading = activeType
    ? data.itemsLoading.has(activeType.id)
    : false;

  const isActiveTab = (t: Tab) =>
    !!active &&
    (t.kind === "type"
      ? active.kind === "type" && active.typeId === t.typeId
      : active.kind === t.kind);

  /* footer mini-ledger chips (whole selection, removable, cross-tab) */
  const ledgerChips: {
    key: string;
    label: string;
    tone?: string;
    remove: () => void;
  }[] = [
    ...resolved.orgs.map((o) => ({
      key: `o:${o.id}`,
      label: o.label,
      tone: "font-medium",
      remove: () => toggle("org", o.id),
    })),
    ...resolved.types.map((t) => ({
      key: `t:${t.id}`,
      label: `All ${t.label}`,
      tone: resolveColor(t.type).fg,
      remove: () => toggle("type", t.id),
    })),
    ...resolved.scopes.map((s) => ({
      key: `s:${s.id}`,
      label: s.label,
      tone: resolveColor(s.type).fg,
      remove: () => toggle("scope", s.id),
    })),
    ...resolved.items.map((i) => ({
      key: `i:${i.ref}`,
      label: `${i.scopeName}·${i.label}`,
      remove: () =>
        onChange({
          ...selection,
          itemRefs: selection.itemRefs.filter((r) => r !== i.ref),
        }),
    })),
    ...resolved.projects.map((p) => ({
      key: `p:${p.id}`,
      label: p.label,
      remove: () => toggle("project", p.id),
    })),
    ...resolved.tasks.map((t) => ({
      key: `k:${t.id}`,
      label: t.label,
      remove: () => toggle("task", t.id),
    })),
  ];

  return (
    <div
      className="flex w-full flex-col overflow-hidden rounded-md border border-border bg-card"
      style={{ height }}
    >
      {/* tab rail — grouped by org, projects/tasks pinned last */}
      <div className="flex h-7 shrink-0 items-center gap-0.5 overflow-x-auto border-b border-border px-1 scrollbar-hide">
        {data.organizations.map((o, oi) => (
          <React.Fragment key={o.id}>
            <button
              type="button"
              onClick={() => toggle("org", o.id)}
              title={`Select all of ${o.name}`}
              className={cn(
                "flex h-6 max-w-[120px] shrink-0 items-center gap-1 rounded-sm px-1 text-[10px] font-semibold uppercase tracking-wider",
                oi > 0 && "ml-1.5",
                isSelected(selection, "org", o.id)
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground/70 hover:bg-muted hover:text-foreground",
              )}
            >
              <span className="truncate">{o.name}</span>
            </button>
            {o.scope_types.map((t) => {
              const c = resolveColor(t);
              const TIcon = resolveIcon(t.icon);
              const on = isActiveTab({
                kind: "type",
                orgId: o.id,
                typeId: t.id,
              });
              const pickedHere = t.scopes.filter((s) =>
                selection.scopeIds.includes(s.id),
              ).length;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setTab({ kind: "type", orgId: o.id, typeId: t.id });
                    setFieldScopeId(null);
                  }}
                  className={cn(
                    "flex h-6 shrink-0 items-center gap-1 rounded-sm border px-1.5 text-[11px]",
                    on
                      ? cn("border-current font-medium", c.fg)
                      : "border-transparent text-muted-foreground hover:bg-muted",
                  )}
                >
                  <TIcon className={cn("h-3 w-3", c.fg)} />
                  {t.label_plural}
                  {pickedHere > 0 && (
                    <span
                      className={cn(
                        "rounded-full bg-muted px-1 font-mono text-[9px]",
                        c.fg,
                      )}
                    >
                      {pickedHere}
                    </span>
                  )}
                </button>
              );
            })}
            <span className="mx-0.5 h-3.5 w-px shrink-0 bg-border" />
          </React.Fragment>
        ))}
        {(["projects", "tasks"] as const).map((k) => {
          const on = isActiveTab({ kind: k });
          const status =
            k === "projects" ? data.projectsStatus : data.tasksStatus;
          const picked =
            k === "projects"
              ? selection.projectIds.length
              : selection.taskIds.length;
          return (
            <button
              key={k}
              type="button"
              onClick={() => {
                setTab({ kind: k });
                if (k === "projects") data.loadProjects();
                else data.loadTasks();
              }}
              className={cn(
                "flex h-6 shrink-0 items-center gap-1 rounded-sm border px-1.5 text-[11px] capitalize",
                on
                  ? "border-current font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:bg-muted",
              )}
            >
              {k}
              {status === "ready" && (
                <span className="font-mono text-[9px] opacity-60">
                  {k === "projects" ? data.projects.length : data.tasks.length}
                </span>
              )}
              {picked > 0 && (
                <span className="rounded-full bg-muted px-1 font-mono text-[9px]">
                  {picked}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* body — chip grid */}
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-1.5">
        {active?.kind === "type" && activeType && activeOrg ? (
          <>
            <div className="flex flex-wrap gap-1">
              <button
                type="button"
                onClick={() => toggle("type", activeType.id)}
                className={cn(
                  "flex h-6 items-center gap-1 rounded-sm border border-dashed px-1.5 text-[11px]",
                  isSelected(selection, "type", activeType.id)
                    ? cn(
                        "border-current font-medium",
                        resolveColor(activeType).fg,
                      )
                    : "border-border text-muted-foreground hover:bg-muted",
                )}
              >
                <CheckGlyph on={isSelected(selection, "type", activeType.id)} />
                All {activeType.label_plural}
              </button>
              {activeType.scopes.map((s) => {
                const on = isSelected(selection, "scope", s.id);
                const c = resolveColor(activeType);
                return (
                  <span key={s.id} className="flex h-6 items-stretch">
                    <button
                      type="button"
                      onClick={() => toggle("scope", s.id)}
                      className={cn(
                        "flex items-center gap-1 rounded-l-sm border border-r-0 px-1.5 text-[11px]",
                        on
                          ? cn("border-current font-medium", c.fg)
                          : "border-border text-foreground hover:bg-muted",
                      )}
                    >
                      <CheckGlyph on={on} />
                      {s.name}
                    </button>
                    <button
                      type="button"
                      aria-label={`Fields of ${s.name}`}
                      onClick={() => {
                        data.loadItems(activeType.id);
                        setFieldScopeId((p) => (p === s.id ? null : s.id));
                      }}
                      className={cn(
                        "flex items-center rounded-r-sm border px-0.5",
                        fieldScopeId === s.id
                          ? "border-current bg-muted text-foreground"
                          : "border-border text-muted-foreground/60 hover:bg-muted hover:text-foreground",
                        on && cn("border-current", c.fg),
                      )}
                    >
                      <ChevronDown className="h-3 w-3" />
                    </button>
                  </span>
                );
              })}
              <InlineAddRow
                placeholder={`New ${activeType.label_singular.toLowerCase()}`}
                onCommit={(v) =>
                  fakeCreate("scope", v, {
                    org_id: activeOrg.id,
                    scope_type_id: activeType.id,
                  })
                }
              />
            </div>

            {fieldScope && (
              <div className="mt-1.5 rounded-sm border border-border bg-muted/30 p-1">
                <div className="flex h-5 items-center gap-1 px-0.5 text-[10px] font-medium text-muted-foreground">
                  Fields of {fieldScope.name}
                  {itemsLoading && !items && <InlineSpinner />}
                </div>
                <div className="flex flex-wrap gap-1">
                  {items && items.length === 0 && (
                    <span className="px-0.5 text-[10px] text-muted-foreground/60">
                      No fields defined on {activeType.label_singular} yet.
                    </span>
                  )}
                  {(items ?? []).map((it) => {
                    const ref = itemRef(fieldScope.id, it.id);
                    const on = isSelected(selection, "item", ref);
                    return (
                      <button
                        key={it.id}
                        type="button"
                        onClick={() => toggle("item", ref)}
                        className={cn(
                          "flex h-5 items-center gap-1 rounded-sm border px-1.5 text-[10px]",
                          on
                            ? "border-primary font-medium text-primary"
                            : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
                        )}
                      >
                        <CheckGlyph on={on} />
                        {it.display_name}
                      </button>
                    );
                  })}
                  <InlineAddRow
                    placeholder="New field"
                    onCommit={(v) =>
                      fakeCreate("context item", v, {
                        scope_type_id: activeType.id,
                      })
                    }
                  />
                </div>
              </div>
            )}
          </>
        ) : active?.kind === "projects" ? (
          <div className="flex flex-wrap gap-1">
            {data.projectsStatus === "loading" ? (
              <InlineSpinner />
            ) : data.projectsStatus === "error" ? (
              <button
                type="button"
                onClick={() => data.loadProjects()}
                className="text-[11px] text-destructive underline"
              >
                Couldn&apos;t load — retry
              </button>
            ) : data.projects.length === 0 ? (
              <span className="text-[11px] text-muted-foreground">
                No projects yet.
              </span>
            ) : (
              data.projects.map((p) => {
                const on = isSelected(selection, "project", p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => toggle("project", p.id)}
                    className={cn(
                      "flex h-6 items-center gap-1 rounded-sm border px-1.5 text-[11px]",
                      on
                        ? "border-primary font-medium text-primary"
                        : "border-border hover:bg-muted",
                    )}
                  >
                    <CheckGlyph on={on} />
                    {p.name}
                  </button>
                );
              })
            )}
            {data.projectsStatus === "ready" && (
              <InlineAddRow
                placeholder="New project"
                onCommit={(v) => fakeCreate("project", v, {})}
              />
            )}
          </div>
        ) : active?.kind === "tasks" ? (
          <div className="flex flex-wrap gap-1">
            {data.tasksStatus === "loading" ? (
              <InlineSpinner />
            ) : data.tasksStatus === "error" ? (
              <button
                type="button"
                onClick={() => data.loadTasks()}
                className="text-[11px] text-destructive underline"
              >
                Couldn&apos;t load — retry
              </button>
            ) : data.tasks.length === 0 ? (
              <span className="text-[11px] text-muted-foreground">
                No tasks yet.
              </span>
            ) : (
              data.tasks.map((t) => {
                const on = isSelected(selection, "task", t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => toggle("task", t.id)}
                    className={cn(
                      "flex h-6 items-center gap-1 rounded-sm border px-1.5 text-[11px]",
                      on
                        ? "border-primary font-medium text-primary"
                        : "border-border hover:bg-muted",
                    )}
                  >
                    <CheckGlyph on={on} />
                    <span className="max-w-[160px] truncate">{t.title}</span>
                  </button>
                );
              })
            )}
            {data.tasksStatus === "ready" && (
              <InlineAddRow
                placeholder="New task"
                onCommit={(v) => fakeCreate("task", v, {})}
              />
            )}
          </div>
        ) : null}
      </div>

      {/* footer — the whole selection as removable chips, any tab */}
      <div className="flex min-h-[26px] shrink-0 items-center gap-1 overflow-x-auto border-t border-border bg-muted/30 px-1.5 py-0.5 scrollbar-hide">
        {ledgerChips.length === 0 ? (
          <span className="text-[10px] text-muted-foreground/60">
            No context selected
          </span>
        ) : (
          <>
            {ledgerChips.map((c) => (
              <span
                key={c.key}
                className={cn(
                  "flex h-5 shrink-0 items-center gap-0.5 rounded-sm border border-border bg-card pl-1.5 pr-0.5 text-[10px]",
                  c.tone,
                )}
              >
                <span className="max-w-[110px] truncate">{c.label}</span>
                <button
                  type="button"
                  aria-label={`Remove ${c.label}`}
                  onClick={c.remove}
                  className="flex h-4 w-4 items-center justify-center rounded-sm text-muted-foreground/50 hover:bg-muted hover:text-destructive"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            ))}
            <span className="shrink-0 pl-1 font-mono text-[9px] text-muted-foreground">
              {selectionCount(selection)}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
