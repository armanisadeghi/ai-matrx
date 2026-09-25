"use client";

import React, { useEffect, useRef, useState } from "react";
import { Briefcase, FolderOpen, Plus } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@ai-matrx/design-system";
import { cn } from "@/lib/utils";
import type {
  OrgNode,
  ScopeNode,
  ScopeTypeNode,
} from "@/features/scopes/types";
import {
  columnFeed,
  columnShowsSearch,
  filterColumnRows,
  focusedColumnIndex,
  itemNodeOf,
  orgNameLookup,
  orgNodeOf,
  projectNodeOf,
  scopeNodeOf,
  taskNodeOf,
  typeNodeOf,
  useColumnQuery,
  useItemsForTypes,
  useProjectTasks,
  useUniverse,
  ALL_ENGAGEMENT_RUNGS,
  type CreatePayload,
  type EngagementRung,
  type PickerMode,
  type PickNode,
  type SelectionEngine,
  type Universe,
} from "../quick-pick/engine";
import {
  CheckGlyph,
  ColumnSearch,
  EmptyPane,
  ErrorPane,
  InlineCreate,
  KindGlyph,
  NodeLabel,
  nodeTitle,
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
  /** Show the Projects / Tasks row (full) or pickers (condensed). Default on;
   *  hosts whose selection never reads projects or tasks turn it off. */
  includeEngagements?: boolean;
  /** Which rungs the columns walk.
   *  - `scopes` (default): Organizations → Scope types → Scopes → Context
   *    items, with the Projects / Tasks row beneath.
   *  - `engagements`: Organizations → Projects → Tasks, with Scope types →
   *    Scopes beneath as TAGS. Run it on `useEngagementEngine`. */
  rungs?: "scopes" | "engagements";
  /** `rungs="engagements"` only: the rungs offered (default all four). */
  engagementRungs?: readonly EngagementRung[];
}

export interface MillerColumnsProps extends Omit<
  MillerColumnsCoreProps,
  "universe"
> {}

interface ColumnSearchState {
  value: string;
  onChange: (value: string) => void;
  /** Rows the column lists before the query narrows them. */
  total: number;
}

function Column({
  title,
  count,
  children,
  createLabel,
  onCreate,
  condensed,
  search,
  focused,
  columnRef,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
  createLabel?: string;
  onCreate?: (name: string) => void;
  condensed: boolean;
  /** Per-column search; the box renders only when the column is long. */
  search?: ColumnSearchState;
  /** The column the person is working in. When the columns are squeezed (a
   *  phone, a narrow panel) it takes the room its names need and the others
   *  compress — Finder's column view. At full width every column is equal. */
  focused?: boolean;
  columnRef?: React.Ref<HTMLDivElement>;
}) {
  const [creating, setCreating] = useState(false);
  return (
    <div
      ref={columnRef}
      data-miller-focused={focused ? "" : undefined}
      className={cn(
        "flex min-h-0 min-w-0 flex-1 flex-col border-r border-border last:border-r-0",
        focused && "@max-[720px]:flex-[2.4]",
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
            onClick={() => setCreating((value) => !value)}
            aria-label={createLabel}
            title={createLabel}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Plus className="h-3 w-3" />
          </button>
        )}
      </div>
      {search && (columnShowsSearch(search.total) || search.value) && (
        <ColumnSearch
          value={search.value}
          onChange={search.onChange}
          label={`Search ${title}`}
        />
      )}
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
      title={nodeTitle(node)}
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
        <NodeLabel node={node} />
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
      <PopoverContent sizing="content" align="end" className="p-1">
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

export function MillerColumnsCore(props: MillerColumnsCoreProps) {
  if (props.rungs === "engagements") return <EngagementColumns {...props} />;
  return <ScopeColumns {...props} />;
}

function ScopeColumns({
  universe: u,
  engine,
  mode,
  variant = "full",
  className,
  onCreate,
  onCommit,
  includeEngagements = true,
}: MillerColumnsCoreProps) {
  const condensed = variant === "condensed";
  const orgName = orgNameLookup(u);
  const [focusOrgId, setFocusOrgId] = useState<string | null>(null);
  const [focusTypeId, setFocusTypeId] = useState<string | null>(null);
  const [focusScopeId, setFocusScopeId] = useState<string | null>(null);

  // A drill path previews nothing it was not given (`previewUnpicked: false`):
  // the columns after the deepest pick wait, with a hint, for their parent.
  const preview = engine.previewUnpicked !== false;
  const checkedOrgs = u.orgs.filter((org) => engine.isOn("org", org.id));
  const focusOrg = u.orgs.find((org) => org.id === focusOrgId);
  const activeOrgs = columnFeed(checkedOrgs, focusOrg, u.orgs, preview);

  const typeEntries: TypeEntry[] = activeOrgs.flatMap((org) =>
    org.scope_types.map((type) => ({ org, type })),
  );
  const checkedTypeEntries = typeEntries.filter(({ type }) =>
    engine.isOn("type", type.id),
  );
  const focusTypeEntry = typeEntries.find(
    ({ type }) => type.id === focusTypeId,
  );
  const activeTypeEntries = columnFeed(
    checkedTypeEntries,
    focusTypeEntry,
    typeEntries,
    preview,
  );

  const scopeEntries: ScopeEntry[] = activeTypeEntries.flatMap(
    ({ org, type }) => type.scopes.map((scope) => ({ org, type, scope })),
  );
  const checkedScopeEntries = scopeEntries.filter(({ scope }) =>
    engine.isOn("scope", scope.id),
  );
  const focusScopeEntry = scopeEntries.find(
    ({ scope }) => scope.id === focusScopeId,
  );
  const activeScopeEntries = columnFeed(
    checkedScopeEntries,
    focusScopeEntry,
    scopeEntries,
    preview,
  );
  const checkedItemCount = activeScopeEntries.length > 0 && engine.nodes.some((n) => n.kind === "item") ? 1 : 0;
  const focusedColumn = focusedColumnIndex([
    checkedOrgs.length,
    checkedTypeEntries.length,
    checkedScopeEntries.length,
    checkedItemCount,
  ]);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const columnRefs = useRef<(HTMLDivElement | null)[]>([]);
  // Keep the focused column in view when the columns scroll sideways (a phone,
  // a deep link): scroll the columns' own box, never the page.
  useEffect(() => {
    const scroller = scrollerRef.current;
    const column = columnRefs.current[Math.min(focusedColumn, 3)];
    if (!scroller || !column || scroller.scrollWidth <= scroller.clientWidth) return;
    const left = column.offsetLeft;
    const right = left + column.offsetWidth;
    if (left < scroller.scrollLeft) scroller.scrollLeft = left;
    else if (right > scroller.scrollLeft + scroller.clientWidth)
      scroller.scrollLeft = Math.min(left, right - scroller.clientWidth);
  }, [focusedColumn, u.treeStatus]);

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

  // Per-column search: each column narrows its OWN rows; a column's query
  // clears when its source (the org / type / scope feeding it) changes.
  const [orgQuery, setOrgQuery] = useColumnQuery("orgs");
  const [typeQuery, setTypeQuery] = useColumnQuery(
    activeOrgs.map((org) => org.id).join(","),
  );
  const [scopeQuery, setScopeQuery] = useColumnQuery(
    activeTypeEntries.map(({ type }) => type.id).join(","),
  );
  const [itemQuery, setItemQuery] = useColumnQuery(
    activeScopeEntries.map(({ scope }) => scope.id).join(","),
  );
  const [projectQuery, setProjectQuery] = useColumnQuery("projects");
  const [taskQuery, setTaskQuery] = useColumnQuery("tasks");
  const shownOrgs = filterColumnRows(u.orgs, orgQuery, (org) => org.name);
  const shownTypeEntries = filterColumnRows(
    typeEntries,
    typeQuery,
    ({ type }) => type.label_plural,
  );
  const shownScopeEntries = filterColumnRows(
    scopeEntries,
    scopeQuery,
    ({ scope }) => scope.name,
  );
  const itemRows =
    itemsQ.status === "ready"
      ? activeScopeEntries.flatMap((entry) => {
          const scopeNode = scopeNodeOf(entry.org, entry.type, entry.scope);
          return (itemsQ.itemsByType[entry.type.id] ?? []).map((item) => ({
            entry,
            node: itemNodeOf(scopeNode, { id: item.id, label: item.label }),
          }));
        })
      : [];
  const shownItemRows = filterColumnRows(
    itemRows,
    itemQuery,
    ({ node }) => node.label,
  );

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
      <div
        ref={scrollerRef}
        className="@container relative flex min-h-0 flex-1 overflow-x-auto"
      >
        <div className="flex h-full min-w-[560px] flex-1">
          <Column
            title="Organizations"
            count={u.orgs.length}
            condensed={condensed}
            focused={focusedColumn === 0}
            columnRef={(el) => {
              columnRefs.current[0] = el;
            }}
            search={{
              value: orgQuery,
              onChange: setOrgQuery,
              total: u.orgs.length,
            }}
          >
            {orgQuery && shownOrgs.length === 0 && (
              <EmptyPane text={`No organization matches "${orgQuery}".`} />
            )}
            {visible(shownOrgs, condensed).map((org) => {
              const node = orgNodeOf(org, u.orgs);
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
            <MoreRows count={condensed ? shownOrgs.length - 5 : 0} />
          </Column>

          <Column
            title={
              orgGroups
                ? `Scope types · ${activeOrgs.length} orgs`
                : "Scope types"
            }
            count={activeOrgs.length > 0 ? typeEntries.length : undefined}
            condensed={condensed}
            focused={focusedColumn === 1}
            columnRef={(el) => {
              columnRefs.current[1] = el;
            }}
            search={{
              value: typeQuery,
              onChange: setTypeQuery,
              total: typeEntries.length,
            }}
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
            {activeOrgs.length === 0 && (
              <EmptyPane text="Pick an organization" />
            )}
            {activeOrgs.length > 0 && typeEntries.length === 0 && (
              <EmptyPane text="No scope types here yet." />
            )}
            {typeQuery && typeEntries.length > 0 && shownTypeEntries.length === 0 && (
              <EmptyPane text={`No scope type matches "${typeQuery}".`} />
            )}
            {visible(shownTypeEntries, condensed).map(({ org, type }, index) => {
              const node = typeNodeOf(org, type);
              const previousOrg = visible(shownTypeEntries, condensed)[index - 1]
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
            <MoreRows count={condensed ? shownTypeEntries.length - 5 : 0} />
          </Column>

          <Column
            title={
              typeGroups
                ? `Scopes · ${activeTypeEntries.length} types`
                : (activeTypeEntries[0]?.type.label_plural ?? "Scopes")
            }
            count={activeTypeEntries.length > 0 ? scopeEntries.length : undefined}
            condensed={condensed}
            focused={focusedColumn === 2}
            columnRef={(el) => {
              columnRefs.current[2] = el;
            }}
            search={{
              value: scopeQuery,
              onChange: setScopeQuery,
              total: scopeEntries.length,
            }}
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
            {activeTypeEntries.length === 0 && (
              <EmptyPane
                text={
                  activeOrgs.length === 0
                    ? "Pick an organization"
                    : "Pick a scope type"
                }
              />
            )}
            {activeTypeEntries.length > 0 && scopeEntries.length === 0 && (
              <EmptyPane
                text={
                  activeTypeEntries.length > 1
                    ? "No scopes of these types yet."
                    : `No ${activeTypeEntries[0].type.label_plural.toLowerCase()} yet.`
                }
              />
            )}
            {scopeQuery &&
              scopeEntries.length > 0 &&
              shownScopeEntries.length === 0 && (
                <EmptyPane text={`No scope matches "${scopeQuery}".`} />
              )}
            {visible(shownScopeEntries, condensed).map(
              ({ org, type, scope }, index) => {
                const node = scopeNodeOf(org, type, scope);
                const previousType = visible(shownScopeEntries, condensed)[
                  index - 1
                ]?.type.id;
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
            <MoreRows count={condensed ? shownScopeEntries.length - 5 : 0} />
          </Column>

          <Column
            title={
              scopeGroups
                ? `Items · ${activeScopeEntries.length} scopes`
                : activeScopeEntries[0]
                  ? `${activeScopeEntries[0].scope.name} · items`
                  : "Context items"
            }
            count={
              itemsQ.status === "ready" && activeScopeEntries.length > 0
                ? totalItems
                : undefined
            }
            condensed={condensed}
            focused={focusedColumn >= 3}
            columnRef={(el) => {
              columnRefs.current[3] = el;
            }}
            search={{
              value: itemQuery,
              onChange: setItemQuery,
              total: itemRows.length,
            }}
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
              <EmptyPane
                text={
                  activeOrgs.length === 0
                    ? "Pick an organization"
                    : activeTypeEntries.length === 0
                      ? "Pick a scope type"
                      : "Pick a scope to see its items."
                }
              />
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
            {itemQuery && itemRows.length > 0 && shownItemRows.length === 0 && (
              <EmptyPane text={`No context item matches "${itemQuery}".`} />
            )}
            {itemsQ.status === "ready" &&
              visible(
                shownItemRows,
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
            <MoreRows count={condensed ? shownItemRows.length - 5 : 0} />
          </Column>
        </div>
      </div>

      {!condensed && includeEngagements && (
        <div className="flex h-[132px] shrink-0 border-t border-border">
          <div className="flex min-w-0 flex-1">
            <Column
              title="Projects"
              count={u.projects.length}
              condensed={false}
              search={{
                value: projectQuery,
                onChange: setProjectQuery,
                total: u.projects.length,
              }}
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
                filterColumnRows(projectNodes, projectQuery, (n) => n.label).map((node) => (
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
              search={{
                value: taskQuery,
                onChange: setTaskQuery,
                total: u.tasks.length,
              }}
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
                filterColumnRows(taskNodes, taskQuery, (n) => n.label).map((node) => (
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
          condensed && includeEngagements && u.engagementStatus === "ready" ? (
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

function TreeStatusPane({
  u,
  condensed,
  className,
}: {
  u: Universe;
  condensed: boolean;
  className?: string;
}) {
  if (u.treeStatus === "ready") return null;
  return (
    <div className={cn("rounded-xl border border-border bg-card", className)}>
      {u.treeStatus === "loading" && <SkeletonRows count={condensed ? 5 : 8} />}
      {u.treeStatus === "error" && (
        <ErrorPane message={u.treeError} onRetry={u.retryTree} />
      )}
      {u.treeStatus === "empty" && (
        <EmptyPane text="No organizations yet — nothing to browse." />
      )}
    </div>
  );
}

/**
 * `rungs="engagements"`: Organizations → Projects → Tasks across the top, the
 * organization's Scope types → Scopes beneath as tags. One organization, one
 * project, one task (the engine decides; `useEngagementEngine` holds them) and
 * any number of scope tags. Project, task and scope rows can be created in
 * place when the host passes `onCreate`.
 */
function EngagementColumns({
  universe: u,
  engine,
  mode,
  variant = "full",
  className,
  onCreate,
  onCommit,
  engagementRungs = ALL_ENGAGEMENT_RUNGS,
}: MillerColumnsCoreProps) {
  const condensed = variant === "condensed";
  const has = (rung: EngagementRung) => engagementRungs.includes(rung);
  const orgName = orgNameLookup(u);
  const [focusOrgId, setFocusOrgId] = useState<string | null>(null);
  const [focusTypeId, setFocusTypeId] = useState<string | null>(null);

  const checkedOrg = u.orgs.find((org) => engine.isOn("org", org.id));
  const activeOrg = has("organization")
    ? (checkedOrg ??
      u.orgs.find((org) => org.id === focusOrgId) ??
      u.orgs[0] ??
      null)
    : null;

  const projectNodes = u.projects
    .filter((project) => !activeOrg || project.orgId === activeOrg.id)
    .map((project) => projectNodeOf(project, orgName));
  const checkedProject = projectNodes.find((node) =>
    engine.isOn("project", node.id),
  );
  // With a project rung, a task column lists the chosen project's tasks (the
  // old cascade's rule), read for that project on demand — the person's whole
  // task list is a capped organization-wide read; without one, the
  // organization's tasks.
  const projectTasks = useProjectTasks(
    has("project") && has("task") ? (checkedProject?.id ?? null) : null,
  );
  const taskRows = has("project")
    ? [
        ...projectTasks.tasks,
        ...u.tasks.filter(
          (task) =>
            checkedProject !== undefined &&
            task.projectId === checkedProject.id &&
            !projectTasks.tasks.some((t) => t.id === task.id),
        ),
      ]
    : u.tasks.filter((task) => !activeOrg || task.orgId === activeOrg.id);
  const taskNodes = taskRows.map((task) => taskNodeOf(task, orgName));

  const types = activeOrg?.scope_types ?? [];
  const activeType =
    types.find((type) => type.id === focusTypeId) ??
    types.find((type) =>
      type.scopes.some((scope) => engine.isOn("scope", scope.id)),
    ) ??
    types[0];

  const [orgQuery, setOrgQuery] = useColumnQuery("orgs");
  const [projectQuery, setProjectQuery] = useColumnQuery(
    `projects:${activeOrg?.id ?? ""}`,
  );
  const [taskQuery, setTaskQuery] = useColumnQuery(
    `tasks:${activeOrg?.id ?? ""}:${checkedProject?.id ?? ""}`,
  );
  const [typeQuery, setTypeQuery] = useColumnQuery(
    `types:${activeOrg?.id ?? ""}`,
  );
  const [scopeQuery, setScopeQuery] = useColumnQuery(
    `scopes:${activeType?.id ?? ""}`,
  );

  const pane = <TreeStatusPane u={u} condensed={condensed} className={className} />;
  if (u.treeStatus !== "ready") return pane;

  const shownOrgs = filterColumnRows(u.orgs, orgQuery, (org) => org.name);
  const shownProjects = filterColumnRows(projectNodes, projectQuery, (n) => n.label);
  const shownTasks = filterColumnRows(taskNodes, taskQuery, (n) => n.label);
  const shownTypes = filterColumnRows(types, typeQuery, (t) => t.label_plural);
  const scopes = activeType?.scopes ?? [];
  const shownScopes = filterColumnRows(scopes, scopeQuery, (s) => s.name);
  const topColumns =
    Number(has("organization")) + Number(has("project")) + Number(has("task"));
  const engagementPane =
    u.engagementStatus === "loading" ? (
      <SkeletonRows count={3} />
    ) : u.engagementStatus === "error" ? (
      <ErrorPane message={u.engagementError} onRetry={u.retryEngagement} />
    ) : null;

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-xl border border-border bg-card",
        className,
      )}
      data-miller-rungs="engagements"
    >
      <div className="flex min-h-0 flex-1 overflow-x-auto">
        <div
          className="flex h-full flex-1"
          style={{ minWidth: `${Math.max(1, topColumns) * 180}px` }}
        >
          {has("organization") && (
            <Column
              title="Organizations"
              count={u.orgs.length}
              condensed={condensed}
              search={{ value: orgQuery, onChange: setOrgQuery, total: u.orgs.length }}
            >
              {orgQuery && shownOrgs.length === 0 && (
                <EmptyPane text={`No organization matches "${orgQuery}".`} />
              )}
              {visible(shownOrgs, condensed).map((org) => {
                const node = orgNodeOf(org, u.orgs);
                return (
                  <ColRow
                    key={org.id}
                    node={node}
                    on={engine.isOn("org", org.id)}
                    navActive={activeOrg?.id === org.id}
                    onActivate={() => {
                      engine.toggle(node);
                      setFocusOrgId(org.id);
                      setFocusTypeId(null);
                    }}
                  />
                );
              })}
              <MoreRows count={condensed ? shownOrgs.length - 5 : 0} />
            </Column>
          )}

          {has("project") && (
            <Column
              title={activeOrg ? `Projects · ${activeOrg.name}` : "Projects"}
              count={u.engagementStatus === "ready" ? projectNodes.length : undefined}
              condensed={condensed}
              search={{ value: projectQuery, onChange: setProjectQuery, total: projectNodes.length }}
              createLabel={
                activeOrg ? `New project in ${activeOrg.name}` : "New project"
              }
              onCreate={
                onCreate
                  ? (name) =>
                      void onCreate({
                        kind: "project",
                        orgId: activeOrg?.id ?? null,
                        name,
                      })
                  : undefined
              }
            >
              {engagementPane}
              {u.engagementStatus === "ready" && projectNodes.length === 0 && (
                <EmptyPane text="No projects in this organization yet." />
              )}
              {projectQuery && projectNodes.length > 0 && shownProjects.length === 0 && (
                <EmptyPane text={`No project matches "${projectQuery}".`} />
              )}
              {u.engagementStatus === "ready" &&
                visible(shownProjects, condensed).map((node) => (
                  <ColRow
                    key={node.id}
                    node={node}
                    on={engine.isOn("project", node.id)}
                    navActive={checkedProject?.id === node.id}
                    onActivate={() => engine.toggle(node)}
                  />
                ))}
              <MoreRows count={condensed ? shownProjects.length - 5 : 0} />
            </Column>
          )}

          {has("task") && (
            <Column
              title={checkedProject ? `Tasks · ${checkedProject.label}` : "Tasks"}
              count={u.engagementStatus === "ready" ? taskNodes.length : undefined}
              condensed={condensed}
              search={{ value: taskQuery, onChange: setTaskQuery, total: taskNodes.length }}
              createLabel={
                has("project") && !checkedProject ? undefined : "New task"
              }
              onCreate={
                onCreate && (!has("project") || checkedProject)
                  ? (name) =>
                      void onCreate({
                        kind: "task",
                        name,
                        projectId: checkedProject?.id ?? null,
                        orgId: activeOrg?.id ?? null,
                      })
                  : undefined
              }
            >
              {engagementPane}
              {u.engagementStatus === "ready" &&
                has("project") &&
                !checkedProject && (
                  <EmptyPane text="Pick a project to see its tasks." />
                )}
              {u.engagementStatus === "ready" &&
                (!has("project") || checkedProject) &&
                taskNodes.length === 0 && <EmptyPane text="No tasks here yet." />}
              {taskQuery && taskNodes.length > 0 && shownTasks.length === 0 && (
                <EmptyPane text={`No task matches "${taskQuery}".`} />
              )}
              {u.engagementStatus === "ready" &&
                visible(shownTasks, condensed).map((node) => (
                  <ColRow
                    key={node.id}
                    node={node}
                    on={engine.isOn("task", node.id)}
                    onActivate={() => engine.toggle(node)}
                  />
                ))}
              <MoreRows count={condensed ? shownTasks.length - 5 : 0} />
            </Column>
          )}
        </div>
      </div>

      {has("scope") && (
        <div
          className="flex h-[148px] shrink-0 border-t border-border"
          data-miller-row="scope-tags"
        >
          <div className="flex min-w-0 flex-1">
            <Column
              title="Tag with · scope types"
              count={types.length}
              condensed={false}
              search={{ value: typeQuery, onChange: setTypeQuery, total: types.length }}
            >
              {!activeOrg && <EmptyPane text="Pick an organization to tag with its scopes." />}
              {activeOrg && types.length === 0 && (
                <EmptyPane text="This organization has no scope types yet." />
              )}
              {shownTypes.map((type) => {
                const node = typeNodeOf(activeOrg!, type);
                const tagged = type.scopes.filter((scope) =>
                  engine.isOn("scope", scope.id),
                ).length;
                return (
                  <button
                    key={type.id}
                    type="button"
                    onClick={() => setFocusTypeId(type.id)}
                    aria-current={activeType?.id === type.id}
                    className={cn(
                      "flex h-7 w-full items-center gap-1.5 rounded-md px-1.5 text-left",
                      activeType?.id === type.id ? "bg-accent" : "hover:bg-muted",
                    )}
                  >
                    <KindGlyph node={node} />
                    <span className="min-w-0 flex-1 truncate text-xs text-foreground">
                      {node.label}
                    </span>
                    {tagged > 0 && (
                      <span className="shrink-0 text-[10px] text-primary">{tagged}</span>
                    )}
                  </button>
                );
              })}
            </Column>
            <Column
              title={activeType ? activeType.label_plural : "Scopes"}
              count={activeType ? scopes.length : undefined}
              condensed={false}
              search={{ value: scopeQuery, onChange: setScopeQuery, total: scopes.length }}
              createLabel={
                activeType
                  ? `New ${activeType.label_singular.toLowerCase()}`
                  : undefined
              }
              onCreate={
                onCreate && activeOrg && activeType
                  ? (name) =>
                      void onCreate({
                        kind: "scope",
                        orgId: activeOrg.id,
                        typeId: activeType.id,
                        typeName: activeType.label_singular,
                        name,
                      })
                  : undefined
              }
            >
              {activeType && scopes.length === 0 && (
                <EmptyPane text={`No ${activeType.label_plural.toLowerCase()} yet.`} />
              )}
              {scopeQuery && scopes.length > 0 && shownScopes.length === 0 && (
                <EmptyPane text={`No scope matches "${scopeQuery}".`} />
              )}
              {activeOrg &&
                activeType &&
                shownScopes.map((scope) => {
                  const node = scopeNodeOf(activeOrg, activeType, scope);
                  return (
                    <ColRow
                      key={scope.id}
                      node={node}
                      on={engine.isOn("scope", scope.id)}
                      onActivate={() => engine.toggle(node)}
                    />
                  );
                })}
            </Column>
          </div>
        </div>
      )}

      <PickerFooter engine={engine} mode={mode} dense={condensed} onCommit={onCommit} />
    </div>
  );
}

/** Data-owning convenience face. Use MillerColumnsCore when the host owns data. */
export function MillerColumns(props: MillerColumnsProps) {
  const universe = useUniverse();
  return <MillerColumnsCore {...props} universe={universe} />;
}
