"use client";

import React, { useMemo, useState } from "react";
import {
  Briefcase,
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  itemNodeOf,
  orgNameLookup,
  orgNodeOf,
  projectNodeOf,
  scopeNodeOf,
  taskNodeOf,
  typeNodeOf,
  useTypeItems,
  useUniverse,
  type CreatePayload,
  type NodeKind,
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

type Deck =
  | { t: "root" }
  | { t: "org"; node: PickNode }
  | { t: "type"; node: PickNode }
  | { t: "scope"; node: PickNode }
  | { t: "projects" }
  | { t: "tasks" };

interface DeckRow {
  key: string;
  node?: PickNode;
  drill?: Deck;
  railLabel?: string;
  railCount?: number;
}

export interface DrillDeckCoreProps {
  universe: Universe;
  engine: SelectionEngine;
  mode: PickerMode;
  className?: string;
  rootLabel?: string;
  includeEngagements?: boolean;
  selectableKinds?: readonly NodeKind[];
  onBack?: () => void;
  onCreate?: (payload: CreatePayload) => void | Promise<unknown>;
  onCommit?: (nodes: PickNode[]) => void;
}

/**
 * Canonical one-column context navigator. The core receives its universe and
 * selection engine, so it can be embedded in popovers, drawers, panels, and
 * resource pickers without owning host state.
 */
export function DrillDeckCore({
  universe: u,
  engine,
  mode,
  className,
  rootLabel = "Context",
  includeEngagements = true,
  selectableKinds,
  onBack,
  onCreate,
  onCommit,
}: DrillDeckCoreProps) {
  const [stack, setStack] = useState<Deck[]>([{ t: "root" }]);
  const [creating, setCreating] = useState(false);
  const deck: Deck = stack.at(-1) ?? { t: "root" };
  const orgName = useMemo(() => orgNameLookup(u), [u]);
  const allowedKinds = useMemo(
    () => (selectableKinds ? new Set(selectableKinds) : null),
    [selectableKinds],
  );

  const scopeDeck = deck.t === "scope" ? deck.node : null;
  const itemsQ = useTypeItems(scopeDeck?.typeId ?? null);

  const rows: DeckRow[] = useMemo(() => {
    const out: DeckRow[] = [];
    if (deck.t === "root") {
      for (const org of u.orgs) {
        const node = orgNodeOf(org);
        out.push({ key: node.id, node, drill: { t: "org", node } });
      }
      if (includeEngagements) {
        out.push({
          key: "rail:projects",
          drill: { t: "projects" },
          railLabel: "Projects",
          railCount: u.projects.length,
        });
        out.push({
          key: "rail:tasks",
          drill: { t: "tasks" },
          railLabel: "Tasks",
          railCount: u.tasks.length,
        });
      }
    } else if (deck.t === "org") {
      const org = u.orgs.find((candidate) => candidate.id === deck.node.id);
      if (org) {
        for (const type of org.scope_types) {
          const node = typeNodeOf(org, type);
          out.push({ key: type.id, node, drill: { t: "type", node } });
        }
      }
    } else if (deck.t === "type") {
      const org = u.orgs.find((candidate) => candidate.id === deck.node.orgId);
      const type = org?.scope_types.find(
        (candidate) => candidate.id === deck.node.typeId,
      );
      if (org && type) {
        for (const scope of type.scopes) {
          const node = scopeNodeOf(org, type, scope);
          out.push({ key: scope.id, node, drill: { t: "scope", node } });
        }
      }
    } else if (deck.t === "scope") {
      for (const item of itemsQ.items) {
        out.push({
          key: item.id,
          node: itemNodeOf(deck.node, {
            id: item.id,
            label: item.label,
          }),
        });
      }
    } else if (deck.t === "projects") {
      for (const project of u.projects) {
        out.push({ key: project.id, node: projectNodeOf(project, orgName) });
      }
    } else {
      for (const task of u.tasks) {
        out.push({ key: task.id, node: taskNodeOf(task, orgName) });
      }
    }
    return out;
  }, [deck, includeEngagements, itemsQ.items, orgName, u]);

  const title =
    deck.t === "root"
      ? rootLabel
      : deck.t === "projects"
        ? "Projects"
        : deck.t === "tasks"
          ? "Tasks"
          : deck.node.label;

  const createConfig = useMemo(() => {
    if (!onCreate) return null;
    if (deck.t === "org") {
      const node = deck.node;
      return {
        label: "New scope type",
        run: (name: string) =>
          onCreate({
            kind: "type",
            orgId: node.id,
            orgName: node.label,
            name,
          }),
      };
    }
    if (deck.t === "type") {
      const node = deck.node;
      const org = u.orgs.find((candidate) => candidate.id === node.orgId);
      const type = org?.scope_types.find(
        (candidate) => candidate.id === node.typeId,
      );
      if (!org || !type) return null;
      return {
        label: `New ${type.label_singular.toLowerCase()}`,
        run: (name: string) =>
          onCreate({
            kind: "scope",
            orgId: org.id,
            typeId: type.id,
            typeName: type.label_singular,
            name,
          }),
      };
    }
    if (deck.t === "scope") {
      const node = deck.node;
      if (!node.typeId) return null;
      const typeId = node.typeId;
      return {
        label: "New context item",
        run: (name: string) =>
          onCreate({
            kind: "item",
            typeId,
            typeName: node.path[1] ?? "type",
            name,
          }),
      };
    }
    if (deck.t === "projects") {
      return {
        label: "New project",
        run: (name: string) => onCreate({ kind: "project", orgId: null, name }),
      };
    }
    if (deck.t === "tasks") {
      return {
        label: "New task",
        run: (name: string) => onCreate({ kind: "task", name }),
      };
    }
    return null;
  }, [deck, onCreate, u.orgs]);

  const loading =
    u.treeStatus === "loading" ||
    (deck.t === "scope" && itemsQ.status === "loading");
  const errored =
    u.treeStatus === "error" ||
    (deck.t === "scope" && itemsQ.status === "error");
  const canGoBack = stack.length > 1 || Boolean(onBack);

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-xl border border-border bg-card",
        className,
      )}
    >
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-border px-1.5">
        <button
          type="button"
          disabled={!canGoBack}
          onClick={() => {
            if (stack.length === 1) {
              onBack?.();
              return;
            }
            setStack((current) => current.slice(0, -1));
            setCreating(false);
          }}
          aria-label={stack.length === 1 ? "Back to resource types" : "Back"}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground">
          {title}
        </span>
        {deck.t !== "root" && deck.t !== "projects" && deck.t !== "tasks" && (
          <span className="max-w-[45%] shrink-0 truncate pr-1 text-[10px] text-muted-foreground">
            {deck.node.path.join(" › ")}
          </span>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1 scrollbar-thin">
        {loading && <SkeletonRows count={6} />}
        {u.treeStatus === "error" && (
          <ErrorPane message={u.treeError} onRetry={u.retryTree} />
        )}
        {deck.t === "scope" && itemsQ.status === "error" && (
          <ErrorPane message={itemsQ.error} onRetry={itemsQ.retry} />
        )}
        {u.treeStatus === "empty" && <EmptyPane text="No organizations yet." />}
        {!loading &&
          !errored &&
          rows.length === 0 &&
          u.treeStatus === "ready" && (
            <EmptyPane
              text={
                deck.t === "scope"
                  ? "No context items on this scope's type yet."
                  : "Nothing here yet."
              }
            />
          )}
        {!loading &&
          !errored &&
          rows.map((row) => {
            const node = row.node;
            const drill = row.drill;
            const selectable = Boolean(
              node && (!allowedKinds || allowedKinds.has(node.kind)),
            );
            const on = node ? engine.isOn(node.kind, node.id) : false;
            return (
              <div key={row.key} className="flex items-stretch">
                {node && selectable && (
                  <button
                    type="button"
                    onClick={() => engine.toggle(node)}
                    aria-label={`${on ? "Deselect" : "Select"} ${node.label}`}
                    className="flex w-8 shrink-0 items-center justify-center rounded-l-md hover:bg-muted"
                  >
                    <CheckGlyph on={on} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (drill) {
                      setStack((current) => [...current, drill]);
                      setCreating(false);
                    } else if (node && selectable) {
                      engine.toggle(node);
                    }
                  }}
                  disabled={!drill && !selectable}
                  className={cn(
                    "flex min-w-0 flex-1 items-center gap-2 py-2 pr-1.5 text-left text-sm hover:bg-muted disabled:cursor-default disabled:hover:bg-transparent",
                    node && selectable
                      ? "rounded-r-md pl-0.5"
                      : "rounded-md pl-2",
                  )}
                >
                  {node ? (
                    <KindGlyph node={node} />
                  ) : row.railLabel === "Projects" ? (
                    <FolderOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  ) : (
                    <Briefcase className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  )}
                  <span className="min-w-0 flex-1 truncate text-foreground">
                    {node?.label ?? row.railLabel}
                  </span>
                  {row.railCount !== undefined && (
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {u.engagementStatus === "loading" ? "…" : row.railCount}
                    </span>
                  )}
                  {drill && (
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  )}
                </button>
              </div>
            );
          })}
      </div>

      {createConfig && !loading && !errored && (
        <div className="shrink-0 border-t border-border">
          {creating ? (
            <InlineCreate
              placeholder={`${createConfig.label} name`}
              onCommit={(value) => {
                void createConfig.run(value);
                setCreating(false);
              }}
              onCancel={() => setCreating(false)}
            />
          ) : (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Plus className="h-3 w-3" /> {createConfig.label}
            </button>
          )}
        </div>
      )}

      <PickerFooter engine={engine} mode={mode} dense onCommit={onCommit} />
    </div>
  );
}

export type DrillDeckProps = Omit<DrillDeckCoreProps, "universe">;

/** Convenience face backed by the canonical scopes universe hook. */
export function DrillDeck(props: DrillDeckProps) {
  const universe = useUniverse();
  return <DrillDeckCore {...props} universe={universe} />;
}
