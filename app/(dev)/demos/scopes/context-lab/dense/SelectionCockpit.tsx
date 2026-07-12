"use client";

// INSIDE — "Selection cockpit" (pick-left / show-right; revised).
//
// The pick-one-side / show-the-other idea, with the blocker fixed: the left
// side is now the real ContextTree (structure; row click drills, checkbox
// selects) instead of the rejected flat full-path menu. Right: a permanent
// LEDGER of the selection, grouped by level, one-click removal.
// For roomy hosts: dialogs, window panels, assign flows.

import React, { useMemo } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  isEmptySelection,
  resolveSelection,
  selectionCount,
  toggleNode,
  type DenseNodeKind,
  type DenseSelection,
  type SelectMode,
} from "./model";
import { ContextTree } from "./ContextTree";
import type { DenseData } from "./shared";

function LedgerGroup({
  title,
  rows,
}: {
  title: string;
  rows: {
    key: string;
    label: string;
    sub?: string;
    tone?: string;
    onRemove: () => void;
  }[];
}) {
  if (rows.length === 0) return null;
  return (
    <div>
      <div className="flex h-5 items-center px-1.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/70">
        {title} · {rows.length}
      </div>
      {rows.map((r) => (
        <div
          key={r.key}
          className="group flex h-6 items-center gap-1.5 rounded-sm px-1.5 hover:bg-muted/60"
        >
          <span className={cn("min-w-0 flex-1 truncate text-xs", r.tone)}>
            {r.label}
          </span>
          {r.sub && (
            <span className="shrink-0 truncate text-[9px] text-muted-foreground/60">
              {r.sub}
            </span>
          )}
          <button
            type="button"
            aria-label={`Remove ${r.label}`}
            onClick={r.onRemove}
            className="flex h-4 w-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground/40 hover:bg-muted hover:text-destructive"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
    </div>
  );
}

export function SelectionCockpit({
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

  const remove = (kind: DenseNodeKind, id: string) =>
    onChange(toggleNode(selection, kind, id, "multi"));

  return (
    <div className="grid w-full grid-cols-1 gap-2 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <ContextTree
        data={data}
        selection={selection}
        onChange={onChange}
        mode={mode}
        height={height - 62}
        autoFocus={false}
      />
      <div
        className="flex flex-col overflow-hidden rounded-md border border-border bg-card"
        style={{ height }}
      >
        <div className="flex h-6 shrink-0 items-center justify-between border-b border-border bg-muted/40 px-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Selected buckets
          </span>
          <span className="font-mono text-[10px] text-muted-foreground">
            {selectionCount(selection)}
          </span>
        </div>
        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto py-0.5">
          {isEmptySelection(selection) ? (
            <div className="flex h-full items-center justify-center px-4 text-center text-[11px] text-muted-foreground/60">
              Nothing selected — every bucket you pick on the left lands here,
              grouped by level.
            </div>
          ) : (
            <>
              <LedgerGroup
                title="Organizations"
                rows={resolved.orgs.map((o) => ({
                  key: o.id,
                  label: o.label,
                  tone: "font-medium",
                  onRemove: () => remove("org", o.id),
                }))}
              />
              <LedgerGroup
                title="Whole dimensions"
                rows={resolved.types.map((t) => ({
                  key: t.id,
                  label: `All ${t.label}`,
                  sub: t.orgName,
                  onRemove: () => remove("type", t.id),
                }))}
              />
              <LedgerGroup
                title="Scopes"
                rows={resolved.scopes.map((s) => ({
                  key: s.id,
                  label: s.label,
                  sub: `${s.typeLabel} · ${s.orgName}`,
                  onRemove: () => remove("scope", s.id),
                }))}
              />
              <LedgerGroup
                title="Fields"
                rows={resolved.items.map((i) => ({
                  key: i.ref,
                  label: `${i.scopeName} › ${i.label}`,
                  sub: i.typeLabel,
                  onRemove: () => remove("item", i.ref),
                }))}
              />
              <LedgerGroup
                title="Projects"
                rows={resolved.projects.map((p) => ({
                  key: p.id,
                  label: p.label,
                  onRemove: () => remove("project", p.id),
                }))}
              />
              <LedgerGroup
                title="Tasks"
                rows={resolved.tasks.map((t) => ({
                  key: t.id,
                  label: t.label,
                  onRemove: () => remove("task", t.id),
                }))}
              />
            </>
          )}
        </div>
        <div className="flex h-6 shrink-0 items-center justify-between border-t border-border bg-muted/30 px-2 text-[10px] text-muted-foreground">
          <span>These buckets feed the agent</span>
          {!isEmptySelection(selection) && (
            <button
              type="button"
              onClick={() =>
                onChange({
                  orgIds: [],
                  scopeTypeIds: [],
                  scopeIds: [],
                  itemRefs: [],
                  projectIds: [],
                  taskIds: [],
                })
              }
              className="text-destructive hover:underline"
            >
              Clear all
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
