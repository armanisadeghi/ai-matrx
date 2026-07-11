"use client";

// INSIDE №2 — Drill Deck (one narrow column, phone-rail sized).
//
// Shows exactly ONE level at a time — orgs, then a chosen org's scope types,
// then a type's scopes, then a scope's context items — with Projects and
// Tasks as two folders pinned at the bottom of the root. The row's name area
// drills, the check target selects; both are full-height touch targets. Made
// for hosts under ~300px wide (side rails, drawers, tool panes) where the
// current field cannot physically fit.

import React, { useMemo, useState } from "react";
import { Briefcase, ChevronLeft, ChevronRight, FolderOpen, Plus } from "lucide-react";
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

export function DrillDeck({
  engine,
  mode,
  className,
}: {
  engine: SelectionEngine;
  mode: PickerMode;
  className?: string;
}) {
  const u = useUniverse();
  const [stack, setStack] = useState<Deck[]>([{ t: "root" }]);
  const [creating, setCreating] = useState(false);
  const deck = stack[stack.length - 1];
  const orgName = useMemo(() => orgNameLookup(u), [u]);

  const scopeDeck = deck.t === "scope" ? deck.node : null;
  const itemsQ = useTypeItems(scopeDeck?.typeId ?? null);

  const rows: DeckRow[] = useMemo(() => {
    const out: DeckRow[] = [];
    if (deck.t === "root") {
      for (const o of u.orgs) {
        const n = orgNodeOf(o);
        out.push({ key: n.id, node: n, drill: { t: "org", node: n } });
      }
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
    } else if (deck.t === "org") {
      const org = u.orgs.find((o) => o.id === deck.node.id);
      if (org) {
        for (const t of org.scope_types) {
          const n = typeNodeOf(org, t);
          out.push({ key: t.id, node: n, drill: { t: "type", node: n } });
        }
      }
    } else if (deck.t === "type") {
      const org = u.orgs.find((o) => o.id === deck.node.orgId);
      const type = org?.scope_types.find((t) => t.id === deck.node.typeId);
      if (org && type) {
        for (const s of type.scopes) {
          const n = scopeNodeOf(org, type, s);
          out.push({ key: s.id, node: n, drill: { t: "scope", node: n } });
        }
      }
    } else if (deck.t === "scope") {
      for (const it of itemsQ.items) {
        out.push({
          key: it.id,
          node: itemNodeOf(deck.node, { id: it.id, label: it.label }),
        });
      }
    } else if (deck.t === "projects") {
      for (const p of u.projects)
        out.push({ key: p.id, node: projectNodeOf(p, orgName) });
    } else {
      for (const t of u.tasks)
        out.push({ key: t.id, node: taskNodeOf(t, orgName) });
    }
    return out;
  }, [deck, u, orgName, itemsQ.items]);

  const title =
    deck.t === "root"
      ? "Context"
      : deck.t === "projects"
        ? "Projects"
        : deck.t === "tasks"
          ? "Tasks"
          : deck.node.label;

  const createConfig = useMemo(() => {
    if (deck.t === "org") {
      const node = deck.node;
      return {
        label: "New scope type",
        run: (name: string) =>
          void createDraft({
            kind: "type",
            orgId: node.id,
            orgName: node.label,
            name,
          }),
      };
    }
    if (deck.t === "type") {
      const node = deck.node;
      const org = u.orgs.find((o) => o.id === node.orgId);
      const type = org?.scope_types.find((t) => t.id === node.typeId);
      if (!org || !type) return null;
      return {
        label: `New ${type.label_singular.toLowerCase()}`,
        run: (name: string) =>
          void createDraft({
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
          void createDraft({
            kind: "item",
            typeId,
            typeName: node.path[1] ?? "type",
            name,
          }),
      };
    }
    if (deck.t === "projects")
      return {
        label: "New project",
        run: (name: string) =>
          void createDraft({ kind: "project", orgId: null, name }),
      };
    if (deck.t === "tasks")
      return {
        label: "New task",
        run: (name: string) => void createDraft({ kind: "task", name }),
      };
    return null;
  }, [deck, u.orgs]);

  const loading =
    u.treeStatus === "loading" ||
    (deck.t === "scope" && itemsQ.status === "loading");
  const errored =
    u.treeStatus === "error" || (deck.t === "scope" && itemsQ.status === "error");

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-xl border border-border bg-card",
        className,
      )}
    >
      {/* header: back + level title */}
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-border px-1.5">
        <button
          type="button"
          disabled={stack.length === 1}
          onClick={() => {
            setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
            setCreating(false);
          }}
          aria-label="Back"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground">
          {title}
        </span>
        {deck.t !== "root" && deck.t !== "projects" && deck.t !== "tasks" && (
          <span className="shrink-0 pr-1 text-[10px] text-muted-foreground">
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
        {u.treeStatus === "empty" && (
          <EmptyPane text="No organizations yet." />
        )}
        {!loading && !errored && rows.length === 0 && u.treeStatus === "ready" && (
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
            const on = node ? engine.isOn(node.kind, node.id) : false;
            return (
              <div key={row.key} className="flex items-stretch">
                {node && (
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
                      setStack((s) => [...s, drill]);
                      setCreating(false);
                    } else if (node) {
                      engine.toggle(node);
                    }
                  }}
                  className={cn(
                    "flex min-w-0 flex-1 items-center gap-2 py-2 pr-1.5 text-left text-sm hover:bg-muted",
                    node ? "rounded-r-md pl-0.5" : "rounded-md pl-2",
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

      {/* add-at-this-level */}
      {createConfig && !loading && !errored && (
        <div className="shrink-0 border-t border-border">
          {creating ? (
            <InlineCreate
              placeholder={`${createConfig.label} name`}
              onCommit={(v) => {
                createConfig.run(v);
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

      <PickerFooter engine={engine} mode={mode} dense />
    </div>
  );
}
