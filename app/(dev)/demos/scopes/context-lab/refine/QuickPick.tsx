"use client";

// INSIDE 1 — "Quick Pick": the VS Code command-palette treatment.
//
// One flat, search-first list. Every scope in every org is one 26px row with a
// dim "Type · Org" breadcrumb — no half-page of section shells. Orgs are
// opt-in rows at the top; projects and tasks are pinned groups at the BOTTOM.
// ArrowRight (or the "fields" affordance) drills into a scope's context items;
// ArrowLeft backs out. Typing a name that doesn't exist offers inline creation
// (scope-in-type, or a whole new type) — add-at-any-level stays one keystroke
// away. Works in multi (checkbox) and single (radio, pick-closes) modes.

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Building2,
  ChevronLeft,
  ChevronRight,
  CornerDownLeft,
  Search,
} from "lucide-react";
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
  flattenScopes,
  itemPickId,
  mergeDraftItems,
  type DraftStore,
  type FlatScope,
  type ItemsState,
  type PickController,
} from "./model";
import {
  AddRow,
  DenseRow,
  EmptyRow,
  ErrorRow,
  LoadingRow,
  MicroHeader,
} from "./rows";

type QPRow =
  | { kind: "org"; org: OrgNode }
  | { kind: "scope"; fs: FlatScope }
  | { kind: "project"; project: AssignableProject }
  | { kind: "task"; task: AssignableTask }
  | { kind: "create-scope"; typeLabel: string; typeId: string; orgId: string; name: string }
  | { kind: "create-type"; org: OrgNode; name: string };

const TASK_CAP = 30;

export function QuickPick({
  orgs,
  projects,
  tasks,
  ctrl,
  items,
  drafts,
  height = 300,
  autoFocus = false,
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
  autoFocus?: boolean;
  /** Rendered pinned under the list (count summary / save button). */
  footer?: React.ReactNode;
  className?: string;
}) {
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const [drill, setDrill] = useState<FlatScope | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const q = query.trim().toLowerCase();

  const flat = useMemo(() => flattenScopes(orgs), [orgs]);

  /* ── main (non-drilled) rows ── */
  const { rows, groups } = useMemo(() => {
    const match = (s: string) => !q || s.toLowerCase().includes(q);
    const orgRows: QPRow[] = orgs
      .filter((o) => match(o.name))
      .map((org) => ({ kind: "org", org }));
    const scopeRows: QPRow[] = flat
      .filter(
        (fs) =>
          match(fs.scope.name) ||
          (q &&
            (fs.type.label_plural.toLowerCase().includes(q) ||
              fs.type.label_singular.toLowerCase().includes(q))),
      )
      .map((fs) => ({ kind: "scope", fs }));
    const projectRows: QPRow[] = projects
      .filter((p) => match(p.name))
      .map((project) => ({ kind: "project", project }));
    const allTaskRows = tasks.filter((t) => match(t.title));
    const taskRows: QPRow[] = allTaskRows
      .slice(0, TASK_CAP)
      .map((task) => ({ kind: "task", task }));

    // Inline creation offers when the query names nothing that exists.
    const createRows: QPRow[] = [];
    if (q.length >= 2) {
      const exact = flat.some((fs) => fs.scope.name.toLowerCase() === q);
      if (!exact) {
        const uniqueTypes = orgs.flatMap((o) =>
          o.scope_types.map((t) => ({ t, o })),
        );
        for (const { t, o } of uniqueTypes.slice(0, 3)) {
          createRows.push({
            kind: "create-scope",
            typeLabel: `${t.label_singular} · ${formatOrgDisplayName(o)}`,
            typeId: t.id,
            orgId: o.id,
            name: query.trim(),
          });
        }
        for (const o of orgs.slice(0, 1)) {
          createRows.push({ kind: "create-type", org: o, name: query.trim() });
        }
      }
    }

    const all: QPRow[] = [
      ...orgRows,
      ...scopeRows,
      ...projectRows,
      ...taskRows,
      ...createRows,
    ];
    return {
      rows: all,
      groups: {
        orgStart: 0,
        scopeStart: orgRows.length,
        projectStart: orgRows.length + scopeRows.length,
        taskStart: orgRows.length + scopeRows.length + projectRows.length,
        createStart:
          orgRows.length + scopeRows.length + projectRows.length + taskRows.length,
        taskOverflow: allTaskRows.length - taskRows.length,
        counts: {
          orgs: orgRows.length,
          scopes: scopeRows.length,
          projects: projectRows.length,
          tasks: taskRows.length,
          creates: createRows.length,
        },
      },
    };
  }, [orgs, flat, projects, tasks, q, query]);

  /* ── drill rows (context items of one scope) ── */
  const drillItems = drill
    ? mergeDraftItems(items.itemsByType[drill.type.id], drafts, drill.type.id)
    : [];
  const drillLoading = drill ? items.loadingTypeIds.has(drill.type.id) : false;
  const drillError = drill ? items.errorTypeIds.has(drill.type.id) : false;
  const [addingField, setAddingField] = useState(false);

  // Drill + query transitions reset the keyboard cursor and the inline-add
  // state at the EVENT, not via effect syncing.
  function openDrill(fs: FlatScope) {
    setDrill(fs);
    setAddingField(false);
    setActiveIdx(0);
    items.ensure(fs.type.id);
  }
  function closeDrill() {
    setDrill(null);
    setAddingField(false);
    setActiveIdx(0);
  }
  function updateQuery(v: string) {
    setQuery(v);
    setActiveIdx(0);
  }

  const rowCount = drill ? drillItems.length : rows.length;

  function activate(row: QPRow) {
    if (row.kind === "org") ctrl.toggle("org", row.org.id);
    else if (row.kind === "scope") ctrl.toggle("scope", row.fs.scope.id);
    else if (row.kind === "project") ctrl.toggle("project", row.project.id);
    else if (row.kind === "task") ctrl.toggle("task", row.task.id);
    else if (row.kind === "create-scope") {
      const d = drafts.createScope(row.typeId, row.orgId, row.name);
      ctrl.toggle("scope", d.id);
      updateQuery("");
    } else if (row.kind === "create-type") {
      drafts.createType(row.org.id, row.name);
      updateQuery("");
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, Math.max(rowCount - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (drill) {
        const it = drillItems[activeIdx];
        if (it) ctrl.toggle("item", itemPickId(drill.scope.id, it.id));
      } else {
        const row = rows[activeIdx];
        if (row) activate(row);
      }
    } else if (e.key === "ArrowRight" && !drill) {
      const row = rows[activeIdx];
      if (row?.kind === "scope") {
        e.preventDefault();
        openDrill(row.fs);
      }
    } else if (e.key === "ArrowLeft" && drill) {
      e.preventDefault();
      closeDrill();
    } else if (e.key === "Escape") {
      if (drill) {
        e.preventDefault();
        closeDrill();
      } else if (query) {
        e.preventDefault();
        updateQuery("");
      }
    }
    // Keep the active row in view.
    requestAnimationFrame(() => {
      listRef.current
        ?.querySelector('[data-qp-active="true"]')
        ?.scrollIntoView({ block: "nearest" });
    });
  }

  return (
    <div
      className={cn("flex min-h-0 flex-col", className)}
      onKeyDown={onKeyDown}
    >
      {/* search / drill header — fixed height, swaps content not size */}
      <div className="flex h-8 shrink-0 items-center gap-1.5 border-b border-border px-2">
        {drill ? (
          <>
            <button
              type="button"
              onClick={closeDrill}
              className="flex h-5 items-center gap-0.5 rounded px-1 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <ChevronLeft className="h-3 w-3" />
              Back
            </button>
            <span className="min-w-0 truncate text-[12px] font-medium">
              {drill.scope.name}
            </span>
            <span className="truncate text-[11px] text-muted-foreground">
              {drill.type.label_singular} fields
            </span>
          </>
        ) : (
          <>
            <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              autoFocus={autoFocus}
              value={query}
              onChange={(e) => updateQuery(e.target.value)}
              placeholder="Type to filter — Enter selects, → opens fields"
              className="h-full min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground/60"
              style={{ fontSize: "16px" }}
            />
            {query && (
              <button
                type="button"
                onClick={() => updateQuery("")}
                className="rounded px-1 text-[11px] text-muted-foreground hover:bg-muted"
              >
                clear
              </button>
            )}
          </>
        )}
      </div>

      {/* list */}
      <div
        ref={listRef}
        role="listbox"
        aria-multiselectable={!ctrl.single}
        className="min-h-0 overflow-y-auto overscroll-contain p-1 scrollbar-thin"
        style={{ height }}
      >
        {drill ? (
          <>
            {drillLoading && drillItems.length === 0 ? (
              <LoadingRow label={`Loading ${drill.type.label_singular} fields…`} />
            ) : drillError ? (
              <ErrorRow
                label="Couldn't load fields"
                onRetry={() => items.retry(drill.type.id)}
              />
            ) : drillItems.length === 0 && !addingField ? (
              <EmptyRow
                label={`${drill.type.label_singular} has no fields defined yet.`}
              />
            ) : (
              drillItems.map((it, i) => {
                const pid = itemPickId(drill.scope.id, it.id);
                return (
                  <div key={it.id} data-qp-active={i === activeIdx}>
                    <DenseRow
                      on={ctrl.has("item", pid)}
                      single={ctrl.single}
                      active={i === activeIdx}
                      label={it.display_name}
                      sub={String(it.value_type)}
                      onClick={() => ctrl.toggle("item", pid)}
                    />
                  </div>
                );
              })
            )}
            {!addingField ? (
              <AddRow
                label={`New ${drill.type.label_singular} field`}
                onClick={() => setAddingField(true)}
              />
            ) : (
              <FieldCreate
                onCommit={(v) => {
                  drafts.createItem(drill.type.id, v);
                  setAddingField(false);
                }}
                onCancel={() => setAddingField(false)}
              />
            )}
          </>
        ) : rows.length === 0 ? (
          <EmptyRow
            label={
              orgs.length === 0
                ? "No organizations on your account."
                : "Nothing matches — keep typing to create it."
            }
          />
        ) : (
          rows.map((row, i) => {
            const header =
              i === groups.orgStart && groups.counts.orgs > 0 ? (
                <MicroHeader label="Organizations" count={groups.counts.orgs} />
              ) : i === groups.scopeStart && groups.counts.scopes > 0 ? (
                <MicroHeader label="Scopes" count={groups.counts.scopes} />
              ) : i === groups.projectStart && groups.counts.projects > 0 ? (
                <MicroHeader label="Projects" count={groups.counts.projects} />
              ) : i === groups.taskStart && groups.counts.tasks > 0 ? (
                <MicroHeader label="Tasks" count={groups.counts.tasks} />
              ) : i === groups.createStart && groups.counts.creates > 0 ? (
                <MicroHeader label="Create new" />
              ) : null;

            let node: React.ReactNode = null;
            if (row.kind === "org") {
              node = (
                <DenseRow
                  on={ctrl.has("org", row.org.id)}
                  single={ctrl.single}
                  active={i === activeIdx}
                  label={formatOrgDisplayName(row.org)}
                  icon={
                    <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  }
                  onClick={() => ctrl.toggle("org", row.org.id)}
                />
              );
            } else if (row.kind === "scope") {
              const c = resolveColor(row.fs.type);
              const Icon = resolveIcon(row.fs.type.icon);
              node = (
                <DenseRow
                  on={ctrl.has("scope", row.fs.scope.id)}
                  single={ctrl.single}
                  active={i === activeIdx}
                  label={row.fs.scope.name}
                  sub={`${row.fs.type.label_singular} · ${row.fs.org.name}`}
                  textClass={c.fg}
                  icon={<Icon className={cn("h-3.5 w-3.5 shrink-0", c.fg)} />}
                  onClick={() => ctrl.toggle("scope", row.fs.scope.id)}
                  right={
                    <button
                      type="button"
                      title="Open this scope's fields"
                      onClick={(e) => {
                        e.stopPropagation();
                        openDrill(row.fs);
                      }}
                      className="flex h-5 items-center gap-0.5 rounded px-1 text-[10px] text-muted-foreground opacity-0 transition-opacity hover:bg-background hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
                    >
                      fields
                      <ChevronRight className="h-3 w-3" />
                    </button>
                  }
                />
              );
            } else if (row.kind === "project") {
              node = (
                <DenseRow
                  on={ctrl.has("project", row.project.id)}
                  single={ctrl.single}
                  active={i === activeIdx}
                  label={row.project.name}
                  sub={
                    row.project.orgId
                      ? (orgs.find((o) => o.id === row.project.orgId)?.name ??
                        undefined)
                      : "Unassigned"
                  }
                  onClick={() => ctrl.toggle("project", row.project.id)}
                />
              );
            } else if (row.kind === "task") {
              node = (
                <DenseRow
                  on={ctrl.has("task", row.task.id)}
                  single={ctrl.single}
                  active={i === activeIdx}
                  label={row.task.title}
                  sub={row.task.status ?? undefined}
                  onClick={() => ctrl.toggle("task", row.task.id)}
                />
              );
            } else {
              // create rows
              const label =
                row.kind === "create-scope"
                  ? `Create "${row.name}" as ${row.typeLabel}`
                  : `Create scope type "${row.name}" in ${formatOrgDisplayName(row.org)}`;
              node = (
                <div
                  role="option"
                  aria-selected={false}
                  onClick={() => activate(row)}
                  className={cn(
                    "flex h-[26px] w-full cursor-pointer items-center gap-2 rounded-md px-1.5 text-[12px] text-primary hover:bg-muted",
                    i === activeIdx && "bg-accent",
                  )}
                >
                  <CornerDownLeft className="h-3 w-3 shrink-0" />
                  <span className="min-w-0 truncate">{label}</span>
                </div>
              );
            }
            return (
              <div key={rowKey(row)} data-qp-active={i === activeIdx}>
                {header}
                {node}
              </div>
            );
          })
        )}
        {!drill && groups.taskOverflow > 0 && (
          <EmptyRow label={`${groups.taskOverflow} more tasks — type to narrow.`} />
        )}
      </div>

      {footer && (
        <div className="shrink-0 border-t border-border">{footer}</div>
      )}
    </div>
  );

  function rowKey(row: QPRow): string {
    switch (row.kind) {
      case "org":
        return `o:${row.org.id}`;
      case "scope":
        return `s:${row.fs.scope.id}`;
      case "project":
        return `p:${row.project.id}`;
      case "task":
        return `t:${row.task.id}`;
      case "create-scope":
        return `cs:${row.typeId}`;
      case "create-type":
        return `ct:${row.org.id}`;
    }
  }
}

function FieldCreate({
  onCommit,
  onCancel,
}: {
  onCommit: (v: string) => void;
  onCancel: () => void;
}) {
  const [v, setV] = useState("");
  return (
    <div className="flex h-[28px] items-center gap-1 pr-1">
      <input
        autoFocus
        value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter" && v.trim()) onCommit(v);
          if (e.key === "Escape") onCancel();
        }}
        placeholder="New field name"
        className="h-6 min-w-0 flex-1 rounded border border-border bg-background px-1.5 text-[13px] outline-none focus:border-ring"
        style={{ fontSize: "16px" }}
      />
    </div>
  );
}
