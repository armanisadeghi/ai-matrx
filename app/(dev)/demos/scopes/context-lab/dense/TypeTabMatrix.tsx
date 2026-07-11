"use client";

// INSIDE 4 — "Type-tab matrix".
//
// The whole tree flattened onto two axes: a single row of scope-type tabs
// (org-prefixed, colored, spanning ALL orgs) and a chip GRID of that type's
// scopes below it — multi-toggle chips, fixed chip height, so eight scopes
// take one line instead of eight. A slim field strip appears under the grid
// for the focused scope (long-press… no — a dedicated per-chip expander) so
// items stay reachable. Orgs are selectable from the tab row's first band;
// projects/tasks are two extra tabs pinned to the END of the tab row.
//
// Best-in-class for MEDIUM hosts (settings panels, side rails ~360-480px):
// far more selectable nodes per pixel than any list.

import React, { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { resolveColor } from "@/features/scope-system/constants/scope-colors";
import { resolveIcon } from "@/features/scope-system/utils/resolveIcon";
import {
  isSelected,
  itemRef,
  summarizeSelection,
  toggleNode,
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

type TabId =
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
  const tabs = useMemo(() => {
    const t: { id: TabId; key: string }[] = [];
    for (const o of data.organizations)
      for (const st of o.scope_types)
        t.push({
          id: { kind: "type", orgId: o.id, typeId: st.id },
          key: `t:${st.id}`,
        });
    t.push({ id: { kind: "projects" }, key: "projects" });
    t.push({ id: { kind: "tasks" }, key: "tasks" });
    return t;
  }, [data.organizations]);

  const [tabKey, setTabKey] = useState<string | null>(null);
  const [fieldScopeId, setFieldScopeId] = useState<string | null>(null);
  const activeKey = tabKey ?? tabs[0]?.key ?? null;
  const active = tabs.find((t) => t.key === activeKey)?.id ?? null;

  const toggle = (kind: Parameters<typeof toggleNode>[1], id: string) =>
    onChange(toggleNode(selection, kind, id, mode));

  const loading =
    data.treeStatus === "loading" && data.organizations.length === 0;
  if (loading)
    return (
      <div
        className="animate-pulse rounded-md border border-border bg-muted/40"
        style={{ height }}
      />
    );
  if (data.treeError)
    return (
      <div className="rounded-md border border-destructive/40 p-3 text-xs text-destructive">
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

  return (
    <div
      className="flex w-full flex-col overflow-hidden rounded-md border border-border bg-card"
      style={{ height }}
    >
      {/* org band — orgs themselves are selectable buckets */}
      <div className="flex h-6 shrink-0 items-center gap-0.5 overflow-x-auto border-b border-border bg-muted/30 px-1 scrollbar-hide">
        <span className="shrink-0 pr-1 font-mono text-[9px] uppercase tracking-wider text-muted-foreground/60">
          orgs
        </span>
        {data.organizations.map((o) => {
          const on = isSelected(selection, "org", o.id);
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => toggle("org", o.id)}
              className={cn(
                "flex h-5 shrink-0 items-center gap-1 rounded-sm px-1.5 text-[11px]",
                on
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <CheckGlyph on={on} className={cn(on && "border-primary-foreground/60 bg-transparent")} />
              {o.name}
            </button>
          );
        })}
      </div>

      {/* type tab row — every type of every org, then projects/tasks pinned last */}
      <div className="flex h-7 shrink-0 items-center gap-0.5 overflow-x-auto border-b border-border px-1 scrollbar-hide">
        {tabs.map(({ id, key }) => {
          const isOn = key === activeKey;
          if (id.kind === "type") {
            const org = data.organizations.find((o) => o.id === id.orgId);
            const type = org?.scope_types.find((t) => t.id === id.typeId);
            if (!org || !type) return null;
            const c = resolveColor(type);
            const TIcon = resolveIcon(type.icon);
            const pickedHere = type.scopes.filter((s) =>
              selection.scopeIds.includes(s.id),
            ).length;
            return (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setTabKey(key);
                  setFieldScopeId(null);
                }}
                className={cn(
                  "flex h-6 shrink-0 items-center gap-1 rounded-sm border px-1.5 text-[11px]",
                  isOn
                    ? cn("border-current font-medium", c.fg)
                    : "border-transparent text-muted-foreground hover:bg-muted",
                )}
              >
                <TIcon className={cn("h-3 w-3", c.fg)} />
                {type.label_plural}
                <span className="font-mono text-[9px] opacity-60">
                  {org.slug}
                </span>
                {pickedHere > 0 && (
                  <span
                    className={cn(
                      "rounded-full px-1 font-mono text-[9px]",
                      c.fg,
                      "bg-muted",
                    )}
                  >
                    {pickedHere}
                  </span>
                )}
              </button>
            );
          }
          const label = id.kind === "projects" ? "Projects" : "Tasks";
          const picked =
            id.kind === "projects"
              ? selection.projectIds.length
              : selection.taskIds.length;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setTabKey(key)}
              className={cn(
                "ml-auto flex h-6 shrink-0 items-center gap-1 rounded-sm border px-1.5 text-[11px] last:ml-0",
                isOn
                  ? "border-current font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:bg-muted",
              )}
            >
              {label}
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
              {/* whole-type bucket chip */}
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

            {/* field strip for the focused scope */}
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
                        <span className="font-mono text-[8px] opacity-60">
                          {String(it.value_type)}
                        </span>
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
            {data.engagementLoading ? (
              <InlineSpinner />
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
            <InlineAddRow
              placeholder="New project"
              onCommit={(v) => fakeCreate("project", v, {})}
            />
          </div>
        ) : (
          <div className="flex flex-wrap gap-1">
            {data.engagementLoading ? (
              <InlineSpinner />
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
                    <span className="max-w-[180px] truncate">{t.title}</span>
                  </button>
                );
              })
            )}
            <InlineAddRow
              placeholder="New task"
              onCommit={(v) => fakeCreate("task", v, {})}
            />
          </div>
        )}
      </div>

      <div className="flex h-6 shrink-0 items-center border-t border-border bg-muted/30 px-2 text-[10px] text-muted-foreground">
        <span className="min-w-0 truncate">
          {summarizeSelection(selection)}
        </span>
      </div>
    </div>
  );
}
