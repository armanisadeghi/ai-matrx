"use client";

import React, { useState } from "react";
import { Briefcase, FolderOpen, Plus } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type {
  OrgNode,
  ScopeNode,
  ScopeTypeNode,
} from "@/features/scopes/types";
import {
  itemNodeOf,
  orgNameLookup,
  orgNodeOf,
  projectNodeOf,
  scopeNodeOf,
  taskNodeOf,
  typeNodeOf,
  useItemsForTypes,
  useUniverse,
  type CreatePayload,
  type PickerMode,
  type PickNode,
  type SelectionEngine,
  type Universe,
} from "../quick-pick/engine";
import {
  CheckGlyph,
  EmptyPane,
  ErrorPane,
  InlineCreate,
  KindGlyph,
  PickerFooter,
  SkeletonRows,
} from "../quick-pick/parts";

export type MillerColumnsVariant = "full" | "condensed";

export interface MillerColumnsCoreProps {
  universe: Universe;
  engine: SelectionEngine;
  mode: PickerMode;
  variant?: MillerColumnsVariant;
  className?: string;
  /** Structural creation is host-owned. Omit to render a selection-only picker. */
  onCreate?: (payload: CreatePayload) => void | Promise<void>;
  /** Real assignment/filter commit. Demo hosts may omit it for preview logging. */
  onCommit?: (nodes: PickNode[]) => void;
}

export interface MillerColumnsProps extends Omit<
  MillerColumnsCoreProps,
  "universe"
> {}

function Column({
  title,
  count,
  children,
  createLabel,
  onCreate,
  condensed,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
  createLabel?: string;
  onCreate?: (name: string) => void;
  condensed: boolean;
}) {
  const [creating, setCreating] = useState(false);
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col border-r border-border last:border-r-0">
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
            onClick={() => setCreating((value) => !value)}
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
            onCommit={(value) => {
              onCreate(value);
              setCreating(false);
            }}
            onCancel={() => setCreating(false)}
          />
        </div>
      )}
      <div
        className={cn(
          "min-h-0 flex-1 overscroll-contain p-1 scrollbar-thin",
          condensed ? "overflow-hidden" : "overflow-y-auto",
        )}
      >
        {children}
      </div>
    </div>
  );
}

function GroupLabel({ text }: { text: string }) {
  return (
    <div className="px-1.5 pb-0.5 pt-1.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground/70">
      {text}
    </div>
  );
}

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

function MoreRows({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <div className="px-2 py-1 text-[10px] text-muted-foreground">
      +{count} more in the full picker
    </div>
  );
}

function CompactEngagementPicker({
  kind,
  nodes,
  engine,
}: {
  kind: "project" | "task";
  nodes: PickNode[];
  engine: SelectionEngine;
}) {
  const selected = nodes.filter((node) => engine.isOn(kind, node.id));
  const Icon = kind === "project" ? FolderOpen : Briefcase;
  const label = kind === "project" ? "Project" : "Task";
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex h-7 max-w-32 items-center gap-1 rounded-md border px-2 text-[11px]",
            selected.length > 0
              ? "border-primary/40 bg-primary/8 text-foreground"
              : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          <Icon className="h-3 w-3 shrink-0" />
          <span className="truncate">
            {selected.length === 0
              ? label
              : selected.length === 1
                ? selected[0].label
                : `${label} (${selected.length})`}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-1">
        <div className="max-h-[156px] overflow-y-auto scrollbar-thin">
          {nodes.length === 0 ? (
            <EmptyPane text={`No ${label.toLowerCase()}s available.`} />
          ) : (
            nodes.map((node) => (
              <ColRow
                key={node.id}
                node={node}
                on={engine.isOn(kind, node.id)}
                onActivate={() => engine.toggle(node)}
              />
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface TypeEntry {
  org: OrgNode;
  type: ScopeTypeNode;
}

interface ScopeEntry extends TypeEntry {
  scope: ScopeNode;
}

const visible = <T,>(rows: T[], condensed: boolean): T[] =>
  condensed ? rows.slice(0, 5) : rows;

export function MillerColumnsCore({
  universe: u,
  engine,
  mode,
  variant = "full",
  className,
  onCreate,
  onCommit,
}: MillerColumnsCoreProps) {
  const condensed = variant === "condensed";
  const orgName = orgNameLookup(u);
  const [focusOrgId, setFocusOrgId] = useState<string | null>(null);
  const [focusTypeId, setFocusTypeId] = useState<string | null>(null);
  const [focusScopeId, setFocusScopeId] = useState<string | null>(null);

  const checkedOrgs = u.orgs.filter((org) => engine.isOn("org", org.id));
  const focusOrg = u.orgs.find((org) => org.id === focusOrgId);
  const activeOrgs =
    checkedOrgs.length > 0
      ? checkedOrgs
      : focusOrg
        ? [focusOrg]
        : u.orgs.slice(0, 1);

  const typeEntries: TypeEntry[] = activeOrgs.flatMap((org) =>
    org.scope_types.map((type) => ({ org, type })),
  );
  const checkedTypeEntries = typeEntries.filter(({ type }) =>
    engine.isOn("type", type.id),
  );
  const focusTypeEntry = typeEntries.find(
    ({ type }) => type.id === focusTypeId,
  );
  const activeTypeEntries =
    checkedTypeEntries.length > 0
      ? checkedTypeEntries
      : focusTypeEntry
        ? [focusTypeEntry]
        : typeEntries.slice(0, 1);

  const scopeEntries: ScopeEntry[] = activeTypeEntries.flatMap(
    ({ org, type }) => type.scopes.map((scope) => ({ org, type, scope })),
  );
  const checkedScopeEntries = scopeEntries.filter(({ scope }) =>
    engine.isOn("scope", scope.id),
  );
  const focusScopeEntry = scopeEntries.find(
    ({ scope }) => scope.id === focusScopeId,
  );
  const activeScopeEntries =
    checkedScopeEntries.length > 0
      ? checkedScopeEntries
      : focusScopeEntry
        ? [focusScopeEntry]
        : scopeEntries.slice(0, 1);

  const itemsQ = useItemsForTypes(
    activeScopeEntries.map(({ type }) => type.id),
  );
  const totalItems = activeScopeEntries.reduce(
    (count, entry) => count + (itemsQ.itemsByType[entry.type.id]?.length ?? 0),
    0,
  );
  const createOrg = activeOrgs[0];
  const createType = activeTypeEntries[0];
  const createItemType = activeScopeEntries[0]?.type ?? createType?.type;

  if (u.treeStatus === "loading") {
    return (
      <div className={cn("rounded-xl border border-border bg-card", className)}>
        <SkeletonRows count={condensed ? 5 : 8} />
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
  const projectNodes = u.projects.map((project) =>
    projectNodeOf(project, orgName),
  );
  const taskNodes = u.tasks.map((task) => taskNodeOf(task, orgName));

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-xl border border-border bg-card",
        className,
      )}
    >
      <div className="flex min-h-0 flex-1 overflow-x-auto">
        <div className="flex h-full min-w-[560px] flex-1">
          <Column
            title="Organizations"
            count={u.orgs.length}
            condensed={condensed}
          >
            {visible(u.orgs, condensed).map((org) => {
              const node = orgNodeOf(org);
              return (
                <ColRow
                  key={org.id}
                  node={node}
                  on={engine.isOn("org", org.id)}
                  navActive={activeOrgs.some((active) => active.id === org.id)}
                  onActivate={() => {
                    engine.toggle(node);
                    setFocusOrgId(org.id);
                    setFocusTypeId(null);
                    setFocusScopeId(null);
                  }}
                />
              );
            })}
            <MoreRows count={condensed ? u.orgs.length - 5 : 0} />
          </Column>

          <Column
            title={
              orgGroups
                ? `Scope types · ${activeOrgs.length} orgs`
                : "Scope types"
            }
            count={typeEntries.length}
            condensed={condensed}
            createLabel={
              createOrg ? `New scope type in ${createOrg.name}` : undefined
            }
            onCreate={
              onCreate && createOrg
                ? (name) =>
                    void onCreate({
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
            {visible(typeEntries, condensed).map(({ org, type }, index) => {
              const node = typeNodeOf(org, type);
              const previousOrg = visible(typeEntries, condensed)[index - 1]
                ?.org.id;
              return (
                <React.Fragment key={type.id}>
                  {orgGroups && previousOrg !== org.id && (
                    <GroupLabel text={org.name} />
                  )}
                  <ColRow
                    node={node}
                    on={engine.isOn("type", type.id)}
                    navActive={activeTypeEntries.some(
                      (entry) => entry.type.id === type.id,
                    )}
                    onActivate={() => {
                      engine.toggle(node);
                      setFocusTypeId(type.id);
                      setFocusScopeId(null);
                    }}
                  />
                </React.Fragment>
              );
            })}
            <MoreRows count={condensed ? typeEntries.length - 5 : 0} />
          </Column>

          <Column
            title={
              typeGroups
                ? `Scopes · ${activeTypeEntries.length} types`
                : (activeTypeEntries[0]?.type.label_plural ?? "Scopes")
            }
            count={scopeEntries.length}
            condensed={condensed}
            createLabel={
              createType
                ? `New ${createType.type.label_singular.toLowerCase()}`
                : undefined
            }
            onCreate={
              onCreate && createType
                ? (name) =>
                    void onCreate({
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
              <EmptyPane text="No scopes under the selected types yet." />
            )}
            {visible(scopeEntries, condensed).map(
              ({ org, type, scope }, index) => {
                const node = scopeNodeOf(org, type, scope);
                const previousType = visible(scopeEntries, condensed)[index - 1]
                  ?.type.id;
                return (
                  <React.Fragment key={scope.id}>
                    {typeGroups && previousType !== type.id && (
                      <GroupLabel
                        text={
                          orgGroups
                            ? `${org.name} › ${type.label_plural}`
                            : type.label_plural
                        }
                      />
                    )}
                    <ColRow
                      node={node}
                      on={engine.isOn("scope", scope.id)}
                      navActive={activeScopeEntries.some(
                        (entry) => entry.scope.id === scope.id,
                      )}
                      onActivate={() => {
                        engine.toggle(node);
                        setFocusScopeId(scope.id);
                      }}
                    />
                  </React.Fragment>
                );
              },
            )}
            <MoreRows count={condensed ? scopeEntries.length - 5 : 0} />
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
            condensed={condensed}
            createLabel={createItemType ? "New context item" : undefined}
            onCreate={
              onCreate && createItemType
                ? (name) =>
                    void onCreate({
                      kind: "item",
                      typeId: createItemType.id,
                      typeName: createItemType.label_singular,
                      name,
                    })
                : undefined
            }
          >
            {activeScopeEntries.length === 0 && (
              <EmptyPane text="Select a scope to see its items." />
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
              visible(
                activeScopeEntries.flatMap((entry) => {
                  const scopeNode = scopeNodeOf(
                    entry.org,
                    entry.type,
                    entry.scope,
                  );
                  return (itemsQ.itemsByType[entry.type.id] ?? []).map(
                    (item) => ({
                      entry,
                      node: itemNodeOf(scopeNode, {
                        id: item.id,
                        label: item.label,
                      }),
                    }),
                  );
                }),
                condensed,
              ).map(({ entry, node }, index, rows) => (
                <React.Fragment key={node.id}>
                  {scopeGroups &&
                    rows[index - 1]?.entry.scope.id !== entry.scope.id && (
                      <GroupLabel text={entry.scope.name} />
                    )}
                  <ColRow
                    node={node}
                    on={engine.isOn("item", node.id)}
                    onActivate={() => engine.toggle(node)}
                  />
                </React.Fragment>
              ))}
            <MoreRows count={condensed ? totalItems - 5 : 0} />
          </Column>
        </div>
      </div>

      {!condensed && (
        <div className="flex h-[132px] shrink-0 border-t border-border">
          <div className="flex min-w-0 flex-1">
            <Column
              title="Projects"
              count={u.projects.length}
              condensed={false}
              createLabel="New project"
              onCreate={
                onCreate
                  ? (name) =>
                      void onCreate({
                        kind: "project",
                        orgId: createOrg?.id ?? null,
                        name,
                      })
                  : undefined
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
                projectNodes.map((node) => (
                  <ColRow
                    key={node.id}
                    node={node}
                    on={engine.isOn("project", node.id)}
                    onActivate={() => engine.toggle(node)}
                  />
                ))}
            </Column>
            <Column
              title="Tasks"
              count={u.tasks.length}
              condensed={false}
              createLabel="New task"
              onCreate={
                onCreate
                  ? (name) => void onCreate({ kind: "task", name })
                  : undefined
              }
            >
              {u.engagementStatus === "loading" && <SkeletonRows count={2} />}
              {u.engagementStatus === "ready" && u.tasks.length === 0 && (
                <EmptyPane text="No tasks yet." />
              )}
              {u.engagementStatus === "ready" &&
                taskNodes.map((node) => (
                  <ColRow
                    key={node.id}
                    node={node}
                    on={engine.isOn("task", node.id)}
                    onActivate={() => engine.toggle(node)}
                  />
                ))}
            </Column>
          </div>
        </div>
      )}

      <PickerFooter
        engine={engine}
        mode={mode}
        dense={condensed}
        onCommit={onCommit}
        beforeActions={
          condensed && u.engagementStatus === "ready" ? (
            <div className="flex shrink-0 items-center gap-1">
              <CompactEngagementPicker
                kind="project"
                nodes={projectNodes}
                engine={engine}
              />
              <CompactEngagementPicker
                kind="task"
                nodes={taskNodes}
                engine={engine}
              />
            </div>
          ) : undefined
        }
      />
    </div>
  );
}

/** Data-owning convenience face. Use MillerColumnsCore when the host owns data. */
export function MillerColumns(props: MillerColumnsProps) {
  const universe = useUniverse();
  return <MillerColumnsCore {...props} universe={universe} />;
}
