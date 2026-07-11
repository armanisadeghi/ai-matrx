"use client";

// INSIDE №3 — Miller Columns (the Finder one).
//
// Four synced columns — Org | Scope Type | Scope | Context Items — plus a
// Projects/Tasks rail across the bottom, exactly the shape the model demands.
// Highlighting a row navigates (fills the next column); the check target on
// the same row selects. The whole universe stays browsable in constant
// height no matter how big the tree gets — the current field's "one expanded
// type fills a page" failure cannot happen here. Every column has its own
// add-at-this-level footer.

import React, { useMemo, useState } from "react";
import { ChevronRight, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  createDraft,
  itemNodeOf,
  orgNameLookup,
  orgNodeOf,
  projectNodeOf,
  scopeNodeOf,
  taskNodeOf,
  typeNodeOf,
  useTypeItems,
  useUniverse,
  type PickerMode,
  type PickNode,
  type SelectionEngine,
} from "./engine";
import {
  CheckGlyph,
  EmptyPane,
  ErrorPane,
  InlineCreate,
  KindGlyph,
  PickerFooter,
  SkeletonRows,
} from "./parts";

function Column({
  title,
  count,
  children,
  createLabel,
  onCreate,
  className,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
  createLabel?: string;
  onCreate?: (name: string) => void;
  className?: string;
}) {
  const [creating, setCreating] = useState(false);
  return (
    <div
      className={cn(
        "flex min-h-0 min-w-0 flex-1 flex-col border-r border-border last:border-r-0",
        className,
      )}
    >
      <div className="flex h-7 shrink-0 items-center gap-1.5 border-b border-border px-2">
        <span className="min-w-0 flex-1 truncate text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </span>
        {count !== undefined && (
          <span className="shrink-0 text-[10px] text-muted-foreground">
            {count}
          </span>
        )}
        {onCreate && createLabel && (
          <button
            type="button"
            onClick={() => setCreating((c) => !c)}
            aria-label={createLabel}
            title={createLabel}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Plus className="h-3 w-3" />
          </button>
        )}
      </div>
      {creating && onCreate && createLabel && (
        <div className="shrink-0 border-b border-border">
          <InlineCreate
            placeholder={createLabel}
            onCommit={(v) => {
              onCreate(v);
              setCreating(false);
            }}
            onCancel={() => setCreating(false)}
          />
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1 scrollbar-thin">
        {children}
      </div>
    </div>
  );
}

function ColRow({
  node,
  on,
  navActive,
  hasChildren,
  onNavigate,
  onToggle,
}: {
  node: PickNode;
  on: boolean;
  navActive?: boolean;
  hasChildren?: boolean;
  onNavigate?: () => void;
  onToggle: () => void;
}) {
  return (
    <div
      className={cn(
        "flex items-center rounded-md",
        navActive ? "bg-accent" : "hover:bg-muted",
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-label={`${on ? "Deselect" : "Select"} ${node.label}`}
        className="flex h-7 w-7 shrink-0 items-center justify-center"
      >
        <CheckGlyph on={on} />
      </button>
      <button
        type="button"
        onClick={onNavigate ?? onToggle}
        className="flex h-7 min-w-0 flex-1 items-center gap-1.5 pr-1 text-left"
      >
        <KindGlyph node={node} />
        <span className="min-w-0 flex-1 truncate text-xs text-foreground">
          {node.label}
        </span>
        {hasChildren && (
          <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
        )}
      </button>
    </div>
  );
}

export function MillerColumns({
  engine,
  mode,
  className,
}: {
  engine: SelectionEngine;
  mode: PickerMode;
  className?: string;
}) {
  const u = useUniverse();
  const orgName = useMemo(() => orgNameLookup(u), [u]);
  const [navOrgId, setNavOrgId] = useState<string | null>(null);
  const [navTypeId, setNavTypeId] = useState<string | null>(null);
  const [navScopeId, setNavScopeId] = useState<string | null>(null);

  const navOrg = u.orgs.find((o) => o.id === navOrgId) ?? u.orgs[0];
  const navType =
    navOrg?.scope_types.find((t) => t.id === navTypeId) ??
    navOrg?.scope_types[0];
  const navScope =
    navType?.scopes.find((s) => s.id === navScopeId) ?? navType?.scopes[0];

  const itemsQ = useTypeItems(navType?.id ?? null);
  const navScopeNode =
    navOrg && navType && navScope
      ? scopeNodeOf(navOrg, navType, navScope)
      : null;

  if (u.treeStatus === "loading") {
    return (
      <div className={cn("rounded-xl border border-border bg-card", className)}>
        <SkeletonRows count={8} />
      </div>
    );
  }
  if (u.treeStatus === "error") {
    return (
      <div className={cn("rounded-xl border border-border bg-card", className)}>
        <ErrorPane message={u.treeError} onRetry={u.retryTree} />
      </div>
    );
  }
  if (u.treeStatus === "empty") {
    return (
      <div className={cn("rounded-xl border border-border bg-card", className)}>
        <EmptyPane text="No organizations yet — nothing to browse." />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-xl border border-border bg-card",
        className,
      )}
    >
      {/* the four columns — org → type → scope → items */}
      <div className="flex min-h-0 flex-1 overflow-x-auto">
        <div className="flex h-full min-w-[560px] flex-1">
          <Column title="Organizations" count={u.orgs.length}>
            {u.orgs.map((o) => {
              const n = orgNodeOf(o);
              return (
                <ColRow
                  key={o.id}
                  node={n}
                  on={engine.isOn("org", o.id)}
                  navActive={o.id === navOrg?.id}
                  hasChildren={o.scope_types.length > 0}
                  onNavigate={() => {
                    setNavOrgId(o.id);
                    setNavTypeId(null);
                    setNavScopeId(null);
                  }}
                  onToggle={() => engine.toggle(n)}
                />
              );
            })}
          </Column>

          <Column
            title="Scope types"
            count={navOrg?.scope_types.length}
            createLabel={navOrg ? `New scope type in ${navOrg.name}` : undefined}
            onCreate={
              navOrg
                ? (name) =>
                    void createDraft({
                      kind: "type",
                      orgId: navOrg.id,
                      orgName: navOrg.name,
                      name,
                    })
                : undefined
            }
          >
            {!navOrg && <EmptyPane text="Pick an organization." />}
            {navOrg?.scope_types.length === 0 && (
              <EmptyPane text="No scope types in this org yet." />
            )}
            {navOrg?.scope_types.map((t) => {
              const n = typeNodeOf(navOrg, t);
              return (
                <ColRow
                  key={t.id}
                  node={n}
                  on={engine.isOn("type", t.id)}
                  navActive={t.id === navType?.id}
                  hasChildren={t.scopes.length > 0}
                  onNavigate={() => {
                    setNavTypeId(t.id);
                    setNavScopeId(null);
                  }}
                  onToggle={() => engine.toggle(n)}
                />
              );
            })}
          </Column>

          <Column
            title={navType?.label_plural ?? "Scopes"}
            count={navType?.scopes.length}
            createLabel={
              navType && navOrg
                ? `New ${navType.label_singular.toLowerCase()}`
                : undefined
            }
            onCreate={
              navType && navOrg
                ? (name) =>
                    void createDraft({
                      kind: "scope",
                      orgId: navOrg.id,
                      typeId: navType.id,
                      typeName: navType.label_singular,
                      name,
                    })
                : undefined
            }
          >
            {!navType && <EmptyPane text="Pick a scope type." />}
            {navType && navType.scopes.length === 0 && (
              <EmptyPane
                text={`No ${navType.label_plural.toLowerCase()} yet.`}
              />
            )}
            {navOrg &&
              navType?.scopes.map((s) => {
                const n = scopeNodeOf(navOrg, navType, s);
                return (
                  <ColRow
                    key={s.id}
                    node={n}
                    on={engine.isOn("scope", s.id)}
                    navActive={s.id === navScope?.id}
                    hasChildren
                    onNavigate={() => setNavScopeId(s.id)}
                    onToggle={() => engine.toggle(n)}
                  />
                );
              })}
          </Column>

          <Column
            title={navScope ? `${navScope.name} · items` : "Context items"}
            count={itemsQ.status === "ready" ? itemsQ.items.length : undefined}
            createLabel={navType ? "New context item" : undefined}
            onCreate={
              navType
                ? (name) =>
                    void createDraft({
                      kind: "item",
                      typeId: navType.id,
                      typeName: navType.label_singular,
                      name,
                    })
                : undefined
            }
          >
            {!navScopeNode && <EmptyPane text="Pick a scope." />}
            {navScopeNode && itemsQ.status === "loading" && (
              <SkeletonRows count={4} />
            )}
            {navScopeNode && itemsQ.status === "error" && (
              <ErrorPane message={itemsQ.error} onRetry={itemsQ.retry} />
            )}
            {navScopeNode &&
              itemsQ.status === "ready" &&
              itemsQ.items.length === 0 && (
                <EmptyPane text="No items defined on this type yet." />
              )}
            {navScopeNode &&
              itemsQ.status === "ready" &&
              itemsQ.items.map((it) => {
                const n = itemNodeOf(navScopeNode, {
                  id: it.id,
                  label: it.label,
                });
                return (
                  <ColRow
                    key={it.id}
                    node={n}
                    on={engine.isOn("item", n.id)}
                    onToggle={() => engine.toggle(n)}
                  />
                );
              })}
          </Column>
        </div>
      </div>

      {/* bottom rail — Projects and Tasks live BELOW the hierarchy, always */}
      <div className="flex h-[132px] shrink-0 border-t border-border">
        <div className="flex min-w-0 flex-1">
          <Column
            title="Projects"
            count={u.projects.length}
            createLabel="New project"
            onCreate={(name) =>
              void createDraft({
                kind: "project",
                orgId: navOrg?.id ?? null,
                name,
              })
            }
          >
            {u.engagementStatus === "loading" && <SkeletonRows count={2} />}
            {u.engagementStatus === "error" && (
              <ErrorPane
                message={u.engagementError}
                onRetry={u.retryEngagement}
              />
            )}
            {u.engagementStatus === "ready" && u.projects.length === 0 && (
              <EmptyPane text="No projects yet." />
            )}
            {u.engagementStatus === "ready" &&
              u.projects.map((p) => {
                const n = projectNodeOf(p, orgName);
                return (
                  <ColRow
                    key={p.id}
                    node={n}
                    on={engine.isOn("project", p.id)}
                    onToggle={() => engine.toggle(n)}
                  />
                );
              })}
          </Column>
          <Column
            title="Tasks"
            count={u.tasks.length}
            createLabel="New task"
            onCreate={(name) => void createDraft({ kind: "task", name })}
          >
            {u.engagementStatus === "loading" && <SkeletonRows count={2} />}
            {u.engagementStatus === "ready" && u.tasks.length === 0 && (
              <EmptyPane text="No tasks yet." />
            )}
            {u.engagementStatus === "ready" &&
              u.tasks.map((t) => {
                const n = taskNodeOf(t, orgName);
                return (
                  <ColRow
                    key={t.id}
                    node={n}
                    on={engine.isOn("task", t.id)}
                    onToggle={() => engine.toggle(n)}
                  />
                );
              })}
          </Column>
        </div>
      </div>

      <PickerFooter engine={engine} mode={mode} />
    </div>
  );
}
