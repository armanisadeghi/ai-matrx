"use client";

// INSIDE 2 — "Miller columns" (Finder-style).
//
// Four fixed 20%-ish columns: Org | Scope type | Scope | Context item.
// Clicking a row NAVIGATES right; the checkbox SELECTS — navigation and
// selection are independent, so drilling to an item never mutates the
// selection. Every column ends with an inline add row (add-at-any-level).
// Projects + tasks live in a fixed bottom band, always last.
//
// This is the roomy-host variation: full selection depth visible at once,
// nothing ever taller than `height`.

import React, { useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
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

function Column({
  title,
  children,
  footer,
}: {
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col border-r border-border last:border-r-0">
      <div className="flex h-6 shrink-0 items-center border-b border-border bg-muted/40 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </div>
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto py-0.5">
        {children}
      </div>
      {footer}
    </div>
  );
}

function ColRow({
  on,
  focused,
  label,
  meta,
  onNavigate,
  onToggle,
  tone,
  hasChildren,
}: {
  on: boolean;
  focused: boolean;
  label: string;
  meta?: string;
  onNavigate: () => void;
  onToggle: () => void;
  tone?: string;
  hasChildren?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex h-6 cursor-pointer items-center gap-1.5 px-1.5",
        focused ? "bg-accent" : "hover:bg-muted/60",
      )}
      onClick={onNavigate}
    >
      <button
        type="button"
        aria-label={on ? `Deselect ${label}` : `Select ${label}`}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        className="flex h-5 w-5 shrink-0 items-center justify-center"
      >
        <CheckGlyph on={on} />
      </button>
      <span className={cn("min-w-0 flex-1 truncate text-xs", tone)}>
        {label}
      </span>
      {meta && (
        <span className="shrink-0 font-mono text-[9px] text-muted-foreground/60">
          {meta}
        </span>
      )}
      {hasChildren && (
        <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/50" />
      )}
    </div>
  );
}

export function MillerColumns({
  data,
  selection,
  onChange,
  mode = "multi",
  height = 300,
}: {
  data: DenseData;
  selection: DenseSelection;
  onChange: (sel: DenseSelection) => void;
  mode?: SelectMode;
  height?: number;
}) {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [typeId, setTypeId] = useState<string | null>(null);
  const [scopeId, setScopeId] = useState<string | null>(null);
  const [bottomTab, setBottomTab] = useState<"projects" | "tasks">("projects");

  const org = data.organizations.find((o) => o.id === orgId) ?? null;
  const type = org?.scope_types.find((t) => t.id === typeId) ?? null;
  const scope = type?.scopes.find((s) => s.id === scopeId) ?? null;
  const items = type ? (data.itemsByType[type.id] ?? null) : null;
  const itemsLoading = type ? data.itemsLoading.has(type.id) : false;

  const toggle = (kind: Parameters<typeof toggleNode>[1], id: string) =>
    onChange(toggleNode(selection, kind, id, mode));

  const loading =
    data.treeStatus === "loading" && data.organizations.length === 0;

  const bottomRows = useMemo(() => {
    if (bottomTab === "projects") {
      return data.projects.map((p) => ({
        id: p.id,
        kind: "project" as const,
        label: p.name,
        meta:
          data.organizations.find((o) => o.id === p.orgId)?.name ??
          "unassigned",
      }));
    }
    return data.tasks.map((t) => ({
      id: t.id,
      kind: "task" as const,
      label: t.title,
      meta: t.status ?? "",
    }));
  }, [bottomTab, data]);

  if (loading) {
    return (
      <div
        className="grid grid-cols-4 gap-px overflow-hidden rounded-md border border-border bg-border"
        style={{ height }}
      >
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-1 bg-card p-2">
            {Array.from({ length: 6 }).map((_, j) => (
              <div key={j} className="h-4 animate-pulse rounded-sm bg-muted" />
            ))}
          </div>
        ))}
      </div>
    );
  }
  if (data.treeError) {
    return (
      <div className="rounded-md border border-destructive/40 p-3 text-xs text-destructive">
        Couldn&apos;t load the tree: {data.treeError}
      </div>
    );
  }
  if (data.organizations.length === 0) {
    return (
      <div className="rounded-md border border-border p-3 text-xs text-muted-foreground">
        No organizations on your account yet.
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col overflow-hidden rounded-md border border-border bg-card">
      <div className="flex min-h-0 flex-1" style={{ height }}>
        <Column title={`Orgs · ${data.organizations.length}`}>
          {data.organizations.map((o) => (
            <ColRow
              key={o.id}
              on={isSelected(selection, "org", o.id)}
              focused={o.id === orgId}
              label={o.name}
              meta={o.is_personal ? "personal" : String(o.scope_types.length)}
              onNavigate={() => {
                setOrgId(o.id);
                setTypeId(null);
                setScopeId(null);
              }}
              onToggle={() => toggle("org", o.id)}
              tone="font-medium"
              hasChildren={o.scope_types.length > 0}
            />
          ))}
        </Column>

        <Column
          title={org ? `Types in ${org.name}` : "Scope types"}
          footer={
            org ? (
              <div className="border-t border-border px-1">
                <InlineAddRow
                  placeholder={`New type in ${org.name}`}
                  onCommit={(v) =>
                    fakeCreate("scope type", v, { org_id: org.id })
                  }
                />
              </div>
            ) : undefined
          }
        >
          {!org ? (
            <div className="px-2 py-1 text-[11px] text-muted-foreground/60">
              Pick an org
            </div>
          ) : (
            org.scope_types.map((t) => {
              const c = resolveColor(t);
              const TIcon = resolveIcon(t.icon);
              return (
                <div key={t.id} className="flex items-center">
                  <div className="min-w-0 flex-1">
                    <ColRow
                      on={isSelected(selection, "type", t.id)}
                      focused={t.id === typeId}
                      label={t.label_plural}
                      meta={String(t.scopes.length)}
                      onNavigate={() => {
                        setTypeId(t.id);
                        setScopeId(null);
                        data.loadItems(t.id);
                      }}
                      onToggle={() => toggle("type", t.id)}
                      tone={cn("font-medium", c.fg)}
                      hasChildren={t.scopes.length > 0}
                    />
                  </div>
                  <TIcon className={cn("mr-1.5 h-3 w-3 shrink-0", c.fg)} />
                </div>
              );
            })
          )}
        </Column>

        <Column
          title={type ? type.label_plural : "Scopes"}
          footer={
            type && org ? (
              <div className="border-t border-border px-1">
                <InlineAddRow
                  placeholder={`New ${type.label_singular.toLowerCase()}`}
                  onCommit={(v) =>
                    fakeCreate("scope", v, {
                      org_id: org.id,
                      scope_type_id: type.id,
                    })
                  }
                />
              </div>
            ) : undefined
          }
        >
          {!type ? (
            <div className="px-2 py-1 text-[11px] text-muted-foreground/60">
              Pick a type
            </div>
          ) : type.scopes.length === 0 ? (
            <div className="px-2 py-1 text-[11px] text-muted-foreground/60">
              No {type.label_plural.toLowerCase()} yet — add one below
            </div>
          ) : (
            type.scopes.map((s) => (
              <ColRow
                key={s.id}
                on={isSelected(selection, "scope", s.id)}
                focused={s.id === scopeId}
                label={s.name}
                onNavigate={() => setScopeId(s.id)}
                onToggle={() => toggle("scope", s.id)}
                hasChildren
              />
            ))
          )}
        </Column>

        <Column
          title={scope ? `Fields of ${scope.name}` : "Context items"}
          footer={
            type && scope ? (
              <div className="border-t border-border px-1">
                <InlineAddRow
                  placeholder={`New field on ${type.label_singular}`}
                  onCommit={(v) =>
                    fakeCreate("context item", v, { scope_type_id: type.id })
                  }
                />
              </div>
            ) : undefined
          }
        >
          {!scope ? (
            <div className="px-2 py-1 text-[11px] text-muted-foreground/60">
              Pick a {type ? type.label_singular.toLowerCase() : "scope"}
            </div>
          ) : itemsLoading && !items ? (
            <div className="flex items-center gap-1.5 px-2 py-1 text-[11px] text-muted-foreground">
              <InlineSpinner /> Loading fields…
            </div>
          ) : !items || items.length === 0 ? (
            <div className="px-2 py-1 text-[11px] text-muted-foreground/60">
              {type?.label_singular} has no fields yet — add one below
            </div>
          ) : (
            items.map((it) => {
              const ref = itemRef(scope.id, it.id);
              return (
                <ColRow
                  key={it.id}
                  on={isSelected(selection, "item", ref)}
                  focused={false}
                  label={it.display_name}
                  meta={String(it.value_type)}
                  onNavigate={() => toggle("item", ref)}
                  onToggle={() => toggle("item", ref)}
                />
              );
            })
          )}
        </Column>
      </div>

      {/* bottom band — projects & tasks, always last */}
      <div className="flex h-[92px] shrink-0 flex-col border-t-2 border-border">
        <div className="flex h-6 shrink-0 items-center gap-0.5 border-b border-border bg-muted/40 px-1">
          {(["projects", "tasks"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setBottomTab(tab)}
              className={cn(
                "h-5 rounded-sm px-2 text-[10px] font-semibold uppercase tracking-wider",
                bottomTab === tab
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {tab} ·{" "}
              {tab === "projects" ? data.projects.length : data.tasks.length}
            </button>
          ))}
          <span className="ml-auto pr-1 text-[10px] text-muted-foreground">
            {summarizeSelection(selection)}
          </span>
        </div>
        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto py-0.5">
          {data.engagementLoading ? (
            <div className="flex items-center gap-1.5 px-2 py-1 text-[11px] text-muted-foreground">
              <InlineSpinner /> Loading…
            </div>
          ) : data.engagementError ? (
            <div className="px-2 py-1 text-[11px] text-destructive">
              {data.engagementError}
            </div>
          ) : bottomRows.length === 0 ? (
            <div className="px-2 py-1 text-[11px] text-muted-foreground/60">
              No {bottomTab} yet
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-x-2 px-0.5 lg:grid-cols-3">
              {bottomRows.map((r) => (
                <ColRow
                  key={r.id}
                  on={isSelected(selection, r.kind, r.id)}
                  focused={false}
                  label={r.label}
                  meta={r.meta}
                  onNavigate={() => toggle(r.kind, r.id)}
                  onToggle={() => toggle(r.kind, r.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
