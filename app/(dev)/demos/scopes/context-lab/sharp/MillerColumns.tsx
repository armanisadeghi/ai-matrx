"use client";

// INSIDE 3 — Miller Columns. Finder's column view, for context.
//
// Org | Scope type | Scope | Fields — four narrow columns, so the full depth
// of the shape is visible AT ONCE with zero expanding/collapsing. Navigation
// (highlight) and selection (checkbox) are deliberately separate gestures.
// Projects and Tasks live in a pinned strip along the bottom.

import React, { useState } from "react";
import { Building2, Check, ChevronRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { resolveColor } from "@/features/scope-system/constants/scope-colors";
import { resolveIcon } from "@/features/scope-system/utils/resolveIcon";
import type { OrgNode, ScopeNode, ScopeTypeNode } from "@/features/scopes/types";
import { useTypeItems, type PickerData, type SelectionApi } from "./engine";

interface MillerColumnsProps {
  data: PickerData;
  sel: SelectionApi;
  footer?: React.ReactNode;
}

function CheckTarget({ on }: { on: boolean }) {
  return (
    <span
      className={cn(
        "flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-[4px] border",
        on
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background",
      )}
    >
      {on && <Check className="h-3 w-3" strokeWidth={3} />}
    </span>
  );
}

function ColumnShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col border-r border-border last:border-r-0">
      <div className="flex h-6 shrink-0 items-center border-b border-border bg-muted/40 px-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto py-0.5 scrollbar-thin">
        {children}
      </div>
    </div>
  );
}

const HINT = "flex h-full items-center justify-center px-3 text-center text-[11px] text-muted-foreground/70";

export function MillerColumns({ data, sel, footer }: MillerColumnsProps) {
  const [navOrg, setNavOrg] = useState<OrgNode | null>(data.orgs[0] ?? null);
  const [navType, setNavType] = useState<ScopeTypeNode | null>(null);
  const [navScope, setNavScope] = useState<ScopeNode | null>(null);
  const itemState = useTypeItems(navScope && navType ? navType.id : null);

  return (
    <div className="flex w-full flex-col text-sm">
      <div className="flex h-64 items-stretch">
        <ColumnShell title="Organization">
          {data.orgs.map((org) => {
            const active = navOrg?.id === org.id;
            return (
              <div
                key={org.id}
                className={cn(
                  "flex h-7 items-center gap-1.5 px-1.5",
                  active ? "bg-accent" : "hover:bg-muted",
                )}
              >
                <button
                  aria-label={`Select ${org.name} as a bucket`}
                  onClick={() => sel.toggleOrg(org.id)}
                  className="flex h-5 items-center"
                >
                  <CheckTarget on={sel.hasOrg(org.id)} />
                </button>
                <button
                  className="flex h-full min-w-0 flex-1 items-center gap-1.5 text-left"
                  onClick={() => {
                    setNavOrg(org);
                    setNavType(null);
                    setNavScope(null);
                  }}
                >
                  <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate text-[13px]">
                    {org.name}
                  </span>
                  <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/50" />
                </button>
              </div>
            );
          })}
        </ColumnShell>

        <ColumnShell title="Scope type">
          {!navOrg ? (
            <div className={HINT}>Pick an organization.</div>
          ) : navOrg.scope_types.length === 0 ? (
            <div className={HINT}>{navOrg.name} has no scope types yet.</div>
          ) : (
            navOrg.scope_types.map((type) => {
              const active = navType?.id === type.id;
              const c = resolveColor(type);
              const TIcon = resolveIcon(type.icon);
              return (
                <button
                  key={type.id}
                  className={cn(
                    "flex h-7 w-full items-center gap-1.5 px-2 text-left",
                    active ? "bg-accent" : "hover:bg-muted",
                  )}
                  onClick={() => {
                    setNavType(type);
                    setNavScope(null);
                  }}
                >
                  <TIcon className={cn("h-3.5 w-3.5 shrink-0", c.fg)} />
                  <span className="min-w-0 flex-1 truncate text-[13px]">
                    {type.label_plural}
                  </span>
                  <span className="shrink-0 text-[11px] text-muted-foreground/70">
                    {type.scopes.length}
                  </span>
                  <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/50" />
                </button>
              );
            })
          )}
        </ColumnShell>

        <ColumnShell title={navType ? navType.label_plural : "Scope"}>
          {!navType ? (
            <div className={HINT}>Pick a scope type.</div>
          ) : navType.scopes.length === 0 ? (
            <div className={HINT}>
              No {navType.label_plural.toLowerCase()} yet.
            </div>
          ) : (
            navType.scopes.map((scope) => {
              const active = navScope?.id === scope.id;
              return (
                <div
                  key={scope.id}
                  className={cn(
                    "flex h-7 items-center gap-1.5 px-1.5",
                    active ? "bg-accent" : "hover:bg-muted",
                  )}
                >
                  <button
                    aria-label={`Select ${scope.name}`}
                    onClick={() => sel.toggleScope(scope.id)}
                    className="flex h-5 items-center"
                  >
                    <CheckTarget on={sel.hasScope(scope.id)} />
                  </button>
                  <button
                    className="flex h-full min-w-0 flex-1 items-center gap-1.5 text-left"
                    onClick={() => setNavScope(scope)}
                  >
                    <span className="min-w-0 flex-1 truncate text-[13px]">
                      {scope.name}
                    </span>
                    <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/50" />
                  </button>
                </div>
              );
            })
          )}
        </ColumnShell>

        <ColumnShell title={navScope ? `${navScope.name} · fields` : "Fields"}>
          {!navScope ? (
            <div className={HINT}>
              Pick a scope to reach its context fields.
            </div>
          ) : itemState.loading ? (
            <div className="flex h-full items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading…
            </div>
          ) : itemState.error ? (
            <div className="px-2 py-1 text-[11px] text-destructive">
              {itemState.error}
            </div>
          ) : (itemState.items ?? []).length === 0 ? (
            <div className={HINT}>
              No fields defined on {navType?.label_plural.toLowerCase()}.
            </div>
          ) : (
            (itemState.items ?? []).map((item) => (
              <button
                key={item.id}
                onClick={() =>
                  sel.toggleItem({
                    scopeId: navScope.id,
                    itemId: item.id,
                    itemLabel: item.display_name,
                    scopeName: navScope.name,
                  })
                }
                className="flex h-7 w-full items-center gap-1.5 px-1.5 text-left hover:bg-muted"
              >
                <CheckTarget on={sel.hasItem(navScope.id, item.id)} />
                <span className="min-w-0 flex-1 truncate text-xs">
                  {item.display_name}
                </span>
              </button>
            ))
          )}
        </ColumnShell>
      </div>

      {/* pinned bottom strip — projects + tasks */}
      <div className="grid h-28 grid-cols-2 border-t border-border">
        <div className="flex min-w-0 flex-col border-r border-border">
          <div className="flex h-6 shrink-0 items-center px-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Projects · {data.projects.length}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
            {data.projects.length === 0 ? (
              <div className={HINT}>No projects.</div>
            ) : (
              data.projects.map((p) => (
                <button
                  key={p.id}
                  onClick={() => sel.toggleProject(p.id)}
                  className="flex h-6 w-full items-center gap-1.5 px-1.5 text-left hover:bg-muted"
                >
                  <CheckTarget on={sel.hasProject(p.id)} />
                  <span className="min-w-0 flex-1 truncate text-xs">
                    {p.name}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
        <div className="flex min-w-0 flex-col">
          <div className="flex h-6 shrink-0 items-center px-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Tasks · {data.tasks.length}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
            {data.tasks.length === 0 ? (
              <div className={HINT}>No tasks.</div>
            ) : (
              data.tasks.map((t) => (
                <button
                  key={t.id}
                  onClick={() => sel.toggleTask(t.id)}
                  className="flex h-6 w-full items-center gap-1.5 px-1.5 text-left hover:bg-muted"
                >
                  <CheckTarget on={sel.hasTask(t.id)} />
                  <span className="min-w-0 flex-1 truncate text-xs">
                    {t.title}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      </div>

      {footer}
    </div>
  );
}
