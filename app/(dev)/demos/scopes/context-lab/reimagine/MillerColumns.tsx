"use client";

// INSIDE №3 — Miller Columns (the Finder one).
//
// Four synced columns — Org | Scope Type | Scope | Context Items — plus a
// Projects/Tasks rail across the bottom, exactly the shape the model demands.
//
// INTERACTION LAW (Arman, 2026-07-11):
//   • ANY click on a row toggles its check (like Drill Deck) — one gesture
//     does both jobs: the click checks the node AND feeds the next column.
//   • Multi-select within a column OR-MERGES: with two orgs checked, the
//     type column shows the union of both orgs' scope types; with three
//     scopes checked, the items column shows every checked scope's items.
//     Nothing checked in a column → it follows the last-clicked (browsed)
//     row, so you can walk the tree without selecting anything.
//
// Constant height no matter how big the tree gets — the current field's
// "one expanded type fills a page" failure cannot happen here. Every column
// has add-at-this-level.

import React, { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  OrgNode,
  ScopeTypeNode,
  ScopeNode,
} from "@/features/scopes/types";
import {
  createDraft,
  itemNodeOf,
  orgNameLookup,
  orgNodeOf,
  projectNodeOf,
  scopeNodeOf,
  taskNodeOf,
  typeNodeOf,
  useItemsForTypes,
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

/** Dim group label used when a column is showing an OR-merged union. */
function GroupLabel({ text }: { text: string }) {
  return (
    <div className="px-1.5 pb-0.5 pt-1.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground/70">
      {text}
    </div>
  );
}

/** One row = ONE gesture: click toggles the check AND drives the next
 *  column (navActive marks the rows currently feeding it). */
function ColRow({
  node,
  on,
  navActive,
  onActivate,
}: {
  node: PickNode;
  on: boolean;
  navActive?: boolean;
  onActivate: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onActivate}
      aria-pressed={on}
      className={cn(
        "flex h-7 w-full items-center gap-1.5 rounded-md pr-1 text-left",
        navActive ? "bg-accent" : "hover:bg-muted",
      )}
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center">
        <CheckGlyph on={on} />
      </span>
      <KindGlyph node={node} />
      <span className="min-w-0 flex-1 truncate text-xs text-foreground">
        {node.label}
      </span>
    </button>
  );
}

interface TypeEntry {
  org: OrgNode;
  type: ScopeTypeNode;
}
interface ScopeEntry extends TypeEntry {
  scope: ScopeNode;
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
  // Browse focus — only consulted when NOTHING is checked in that column.
  const [focusOrgId, setFocusOrgId] = useState<string | null>(null);
  const [focusTypeId, setFocusTypeId] = useState<string | null>(null);
  const [focusScopeId, setFocusScopeId] = useState<string | null>(null);

  /* ── OR-merge chain: the checked set drives the next column; fall back to
        the browsed row, then the first row, so columns are never empty. ── */

  const checkedOrgs = u.orgs.filter((o) => engine.isOn("org", o.id));
  const focusOrg = u.orgs.find((o) => o.id === focusOrgId);
  const activeOrgs: OrgNode[] =
    checkedOrgs.length > 0
      ? checkedOrgs
      : focusOrg
        ? [focusOrg]
        : u.orgs.slice(0, 1);

  const typeEntries: TypeEntry[] = activeOrgs.flatMap((org) =>
    org.scope_types.map((type) => ({ org, type })),
  );
  const checkedTypeEntries = typeEntries.filter((e) =>
    engine.isOn("type", e.type.id),
  );
  const focusTypeEntry = typeEntries.find((e) => e.type.id === focusTypeId);
  const activeTypeEntries: TypeEntry[] =
    checkedTypeEntries.length > 0
      ? checkedTypeEntries
      : focusTypeEntry
        ? [focusTypeEntry]
        : typeEntries.slice(0, 1);

  const scopeEntries: ScopeEntry[] = activeTypeEntries.flatMap(
    ({ org, type }) => type.scopes.map((scope) => ({ org, type, scope })),
  );
  const checkedScopeEntries = scopeEntries.filter((e) =>
    engine.isOn("scope", e.scope.id),
  );
  const focusScopeEntry = scopeEntries.find(
    (e) => e.scope.id === focusScopeId,
  );
  const activeScopeEntries: ScopeEntry[] =
    checkedScopeEntries.length > 0
      ? checkedScopeEntries
      : focusScopeEntry
        ? [focusScopeEntry]
        : scopeEntries.slice(0, 1);

  const itemsQ = useItemsForTypes(activeScopeEntries.map((e) => e.type.id));
  const totalItems = activeScopeEntries.reduce(
    (n, e) => n + (itemsQ.itemsByType[e.type.id]?.length ?? 0),
    0,
  );

  /* create targets = first active parent */
  const createOrg = activeOrgs[0];
  const createType = activeTypeEntries[0];
  const createItemType = activeScopeEntries[0]?.type ?? createType?.type;

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

  const orgGroups = activeOrgs.length > 1;
  const typeGroups = activeTypeEntries.length > 1;
  const scopeGroups = activeScopeEntries.length > 1;

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
                  navActive={activeOrgs.some((a) => a.id === o.id)}
                  onActivate={() => {
                    engine.toggle(n);
                    setFocusOrgId(o.id);
                    setFocusTypeId(null);
                    setFocusScopeId(null);
                  }}
                />
              );
            })}
          </Column>

          <Column
            title={
              orgGroups
                ? `Scope types · ${activeOrgs.length} orgs`
                : "Scope types"
            }
            count={typeEntries.length}
            createLabel={
              createOrg ? `New scope type in ${createOrg.name}` : undefined
            }
            onCreate={
              createOrg
                ? (name) =>
                    void createDraft({
                      kind: "type",
                      orgId: createOrg.id,
                      orgName: createOrg.name,
                      name,
                    })
                : undefined
            }
          >
            {typeEntries.length === 0 && (
              <EmptyPane text="No scope types here yet." />
            )}
            {activeOrgs.map((org) => (
              <React.Fragment key={org.id}>
                {orgGroups && org.scope_types.length > 0 && (
                  <GroupLabel text={org.name} />
                )}
                {org.scope_types.map((t) => {
                  const n = typeNodeOf(org, t);
                  return (
                    <ColRow
                      key={t.id}
                      node={n}
                      on={engine.isOn("type", t.id)}
                      navActive={activeTypeEntries.some(
                        (e) => e.type.id === t.id,
                      )}
                      onActivate={() => {
                        engine.toggle(n);
                        setFocusTypeId(t.id);
                        setFocusScopeId(null);
                      }}
                    />
                  );
                })}
              </React.Fragment>
            ))}
          </Column>

          <Column
            title={
              typeGroups
                ? `Scopes · ${activeTypeEntries.length} types`
                : (activeTypeEntries[0]?.type.label_plural ?? "Scopes")
            }
            count={scopeEntries.length}
            createLabel={
              createType
                ? `New ${createType.type.label_singular.toLowerCase()}`
                : undefined
            }
            onCreate={
              createType
                ? (name) =>
                    void createDraft({
                      kind: "scope",
                      orgId: createType.org.id,
                      typeId: createType.type.id,
                      typeName: createType.type.label_singular,
                      name,
                    })
                : undefined
            }
          >
            {scopeEntries.length === 0 && (
              <EmptyPane text="No scopes under the checked types yet." />
            )}
            {activeTypeEntries.map(({ org, type }) => (
              <React.Fragment key={type.id}>
                {typeGroups && type.scopes.length > 0 && (
                  <GroupLabel
                    text={
                      orgGroups
                        ? `${org.name} › ${type.label_plural}`
                        : type.label_plural
                    }
                  />
                )}
                {type.scopes.map((s) => {
                  const n = scopeNodeOf(org, type, s);
                  return (
                    <ColRow
                      key={s.id}
                      node={n}
                      on={engine.isOn("scope", s.id)}
                      navActive={activeScopeEntries.some(
                        (e) => e.scope.id === s.id,
                      )}
                      onActivate={() => {
                        engine.toggle(n);
                        setFocusScopeId(s.id);
                      }}
                    />
                  );
                })}
              </React.Fragment>
            ))}
          </Column>

          <Column
            title={
              scopeGroups
                ? `Items · ${activeScopeEntries.length} scopes`
                : activeScopeEntries[0]
                  ? `${activeScopeEntries[0].scope.name} · items`
                  : "Context items"
            }
            count={itemsQ.status === "ready" ? totalItems : undefined}
            createLabel={createItemType ? "New context item" : undefined}
            onCreate={
              createItemType
                ? (name) =>
                    void createDraft({
                      kind: "item",
                      typeId: createItemType.id,
                      typeName: createItemType.label_singular,
                      name,
                    })
                : undefined
            }
          >
            {activeScopeEntries.length === 0 && (
              <EmptyPane text="Check a scope to see its items." />
            )}
            {activeScopeEntries.length > 0 && itemsQ.status === "loading" && (
              <SkeletonRows count={4} />
            )}
            {itemsQ.status === "error" && (
              <ErrorPane message={itemsQ.error} onRetry={itemsQ.retry} />
            )}
            {itemsQ.status === "ready" &&
              activeScopeEntries.length > 0 &&
              totalItems === 0 && (
                <EmptyPane text="No items defined on these types yet." />
              )}
            {itemsQ.status === "ready" &&
              activeScopeEntries.map((entry) => {
                const scopeNode = scopeNodeOf(
                  entry.org,
                  entry.type,
                  entry.scope,
                );
                const items = itemsQ.itemsByType[entry.type.id] ?? [];
                if (items.length === 0) return null;
                return (
                  <React.Fragment key={entry.scope.id}>
                    {scopeGroups && <GroupLabel text={entry.scope.name} />}
                    {items.map((it) => {
                      const n = itemNodeOf(scopeNode, {
                        id: it.id,
                        label: it.label,
                      });
                      return (
                        <ColRow
                          key={n.id}
                          node={n}
                          on={engine.isOn("item", n.id)}
                          onActivate={() => engine.toggle(n)}
                        />
                      );
                    })}
                  </React.Fragment>
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
                orgId: createOrg?.id ?? null,
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
                    onActivate={() => engine.toggle(n)}
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
                    onActivate={() => engine.toggle(n)}
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
