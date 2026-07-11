"use client";

// INSIDE 3 — "Tree ledger" (the blotter).
//
// The entire multi-org tree as one dense 24px-row table: indent guides,
// expand/collapse at every level, a fixed columns rail on the right
// (kind / count / select). Sticky org headers keep you oriented while
// scrolling a big tree; "n/N picked" bulk toggles select a whole type in one
// click. Context items appear as child rows under each scope on expand.
// Projects and tasks close the ledger as two bottom sections — always last.
//
// This is the "do a far better job with space than today" variation for
// medium/roomy hosts: the old field spent half a page on 3 org sections;
// this shows the same tree in ~30 rows with everything reachable.

import React, { useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { resolveColor } from "@/features/scope-system/constants/scope-colors";
import { resolveIcon } from "@/features/scope-system/utils/resolveIcon";
import {
  isSelected,
  itemRef,
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

const INDENT = 14;

function Disclosure({
  open,
  onClick,
}: {
  open: boolean;
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      type="button"
      aria-label={open ? "Collapse" : "Expand"}
      onClick={onClick}
      className="flex h-4 w-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      <ChevronRight
        className={cn("h-3 w-3 transition-transform", open && "rotate-90")}
      />
    </button>
  );
}

function LedgerRow({
  depth,
  on,
  label,
  labelTone,
  metaLeft,
  count,
  kind,
  onToggle,
  disclosure,
  sticky,
}: {
  depth: number;
  on: boolean;
  label: React.ReactNode;
  labelTone?: string;
  metaLeft?: React.ReactNode;
  count?: string;
  kind: string;
  onToggle: () => void;
  disclosure?: React.ReactNode;
  sticky?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex h-6 items-center gap-1 border-b border-border/40 pr-1.5 hover:bg-muted/50",
        sticky && "sticky top-0 z-10 bg-card",
      )}
      style={{ paddingLeft: 6 + depth * INDENT }}
    >
      {disclosure ?? <span className="w-4 shrink-0" />}
      {metaLeft}
      {/* div-not-button: labels may CONTAIN buttons (bulk toggles) */}
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
        className={cn(
          "flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 text-left text-xs",
          labelTone,
        )}
      >
        <span className="min-w-0 truncate">{label}</span>
      </div>
      <span className="w-[52px] shrink-0 text-right font-mono text-[9px] text-muted-foreground/60">
        {count ?? ""}
      </span>
      <span className="w-[40px] shrink-0 text-right font-mono text-[9px] uppercase tracking-wider text-muted-foreground/50">
        {kind}
      </span>
      <button
        type="button"
        aria-label="Toggle selection"
        onClick={onToggle}
        className="flex h-5 w-5 shrink-0 items-center justify-center"
      >
        <CheckGlyph on={on} />
      </button>
    </div>
  );
}

export function TreeLedger({
  data,
  selection,
  onChange,
  mode = "multi",
  height = 380,
}: {
  data: DenseData;
  selection: DenseSelection;
  onChange: (sel: DenseSelection) => void;
  mode?: SelectMode;
  height?: number;
}) {
  const [collapsedOrgs, setCollapsedOrgs] = useState<Set<string>>(new Set());
  const [collapsedTypes, setCollapsedTypes] = useState<Set<string>>(new Set());
  const [expandedScopes, setExpandedScopes] = useState<Set<string>>(new Set());
  const [showProjects, setShowProjects] = useState(true);
  const [showTasks, setShowTasks] = useState(true);

  const toggle = (kind: Parameters<typeof toggleNode>[1], id: string) =>
    onChange(toggleNode(selection, kind, id, mode));

  const flip = (set: Set<string>, id: string) => {
    const n = new Set(set);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  };

  /** Bulk: select/clear every scope of a type (multi mode only). */
  const bulkType = (typeScopeIds: string[]) => {
    if (mode === "single") return;
    const allOn = typeScopeIds.every((id) => selection.scopeIds.includes(id));
    onChange({
      ...selection,
      scopeIds: allOn
        ? selection.scopeIds.filter((id) => !typeScopeIds.includes(id))
        : [...new Set([...selection.scopeIds, ...typeScopeIds])],
    });
  };

  const totals = useMemo(() => {
    let types = 0;
    let scopes = 0;
    for (const o of data.organizations) {
      types += o.scope_types.length;
      for (const t of o.scope_types) scopes += t.scopes.length;
    }
    return { types, scopes };
  }, [data.organizations]);

  const loading =
    data.treeStatus === "loading" && data.organizations.length === 0;

  return (
    <div className="w-full overflow-hidden rounded-md border border-border bg-card">
      <div className="flex h-6 items-center gap-2 border-b border-border bg-muted/40 px-2 text-[10px] text-muted-foreground">
        <span className="font-semibold uppercase tracking-wider">
          Context ledger
        </span>
        <span className="font-mono">
          {data.organizations.length} orgs · {totals.types} types ·{" "}
          {totals.scopes} scopes
        </span>
        <span className="ml-auto font-mono">
          {selection.scopeIds.length + selection.itemRefs.length} picked
        </span>
      </div>
      <div className="scrollbar-thin overflow-y-auto" style={{ height }}>
        {loading ? (
          <div className="space-y-1 p-2">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="h-5 animate-pulse rounded-sm bg-muted" />
            ))}
          </div>
        ) : data.treeError ? (
          <div className="p-3 text-xs text-destructive">{data.treeError}</div>
        ) : data.organizations.length === 0 ? (
          <div className="p-3 text-xs text-muted-foreground">
            No organizations yet.
          </div>
        ) : (
          <>
            {data.organizations.map((org) => {
              const orgOpen = !collapsedOrgs.has(org.id);
              return (
                <React.Fragment key={org.id}>
                  <LedgerRow
                    depth={0}
                    sticky
                    on={isSelected(selection, "org", org.id)}
                    label={org.name}
                    labelTone="font-semibold"
                    count={`${org.scope_types.length}t`}
                    kind="org"
                    onToggle={() => toggle("org", org.id)}
                    disclosure={
                      <Disclosure
                        open={orgOpen}
                        onClick={() =>
                          setCollapsedOrgs((p) => flip(p, org.id))
                        }
                      />
                    }
                  />
                  {orgOpen &&
                    org.scope_types.map((type) => {
                      const c = resolveColor(type);
                      const TIcon = resolveIcon(type.icon);
                      const typeOpen = !collapsedTypes.has(type.id);
                      const scopeIds = type.scopes.map((s) => s.id);
                      const pickedHere = scopeIds.filter((id) =>
                        selection.scopeIds.includes(id),
                      ).length;
                      return (
                        <React.Fragment key={type.id}>
                          <LedgerRow
                            depth={1}
                            on={isSelected(selection, "type", type.id)}
                            label={
                              <span className="flex items-center gap-1.5">
                                <TIcon className={cn("h-3 w-3", c.fg)} />
                                <span className={cn("font-medium", c.fg)}>
                                  {type.label_plural}
                                </span>
                                {mode === "multi" &&
                                  scopeIds.length > 0 && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        bulkType(scopeIds);
                                      }}
                                      className="rounded-sm border border-border px-1 font-mono text-[9px] text-muted-foreground hover:bg-muted hover:text-foreground"
                                    >
                                      {pickedHere}/{scopeIds.length} picked
                                    </button>
                                  )}
                              </span>
                            }
                            count={`${type.scopes.length}s`}
                            kind="type"
                            onToggle={() => toggle("type", type.id)}
                            disclosure={
                              <Disclosure
                                open={typeOpen}
                                onClick={() =>
                                  setCollapsedTypes((p) => flip(p, type.id))
                                }
                              />
                            }
                          />
                          {typeOpen && (
                            <>
                              {type.scopes.map((scope) => {
                                const sOpen = expandedScopes.has(scope.id);
                                const items = data.itemsByType[type.id];
                                const sLoading =
                                  sOpen &&
                                  data.itemsLoading.has(type.id) &&
                                  !items;
                                return (
                                  <React.Fragment key={scope.id}>
                                    <LedgerRow
                                      depth={2}
                                      on={isSelected(
                                        selection,
                                        "scope",
                                        scope.id,
                                      )}
                                      label={scope.name}
                                      count={
                                        sLoading ? undefined : undefined
                                      }
                                      kind="scope"
                                      onToggle={() =>
                                        toggle("scope", scope.id)
                                      }
                                      disclosure={
                                        <Disclosure
                                          open={sOpen}
                                          onClick={() => {
                                            data.loadItems(type.id);
                                            setExpandedScopes((p) =>
                                              flip(p, scope.id),
                                            );
                                          }}
                                        />
                                      }
                                    />
                                    {sOpen &&
                                      (sLoading ? (
                                        <div
                                          className="flex h-6 items-center gap-1.5 border-b border-border/40 text-[11px] text-muted-foreground"
                                          style={{
                                            paddingLeft: 6 + 3 * INDENT,
                                          }}
                                        >
                                          <InlineSpinner /> Loading fields…
                                        </div>
                                      ) : (items ?? []).length === 0 ? (
                                        <div
                                          className="flex h-6 items-center border-b border-border/40 text-[11px] text-muted-foreground/60"
                                          style={{
                                            paddingLeft: 6 + 3 * INDENT,
                                          }}
                                        >
                                          No fields on {type.label_singular}
                                        </div>
                                      ) : (
                                        (items ?? []).map((it) => {
                                          const ref = itemRef(
                                            scope.id,
                                            it.id,
                                          );
                                          return (
                                            <LedgerRow
                                              key={it.id}
                                              depth={3}
                                              on={isSelected(
                                                selection,
                                                "item",
                                                ref,
                                              )}
                                              label={it.display_name}
                                              count={String(it.value_type)}
                                              kind="field"
                                              onToggle={() =>
                                                toggle("item", ref)
                                              }
                                            />
                                          );
                                        })
                                      ))}
                                  </React.Fragment>
                                );
                              })}
                              <InlineAddRow
                                placeholder={`New ${type.label_singular.toLowerCase()}`}
                                indentPx={6 + 2 * INDENT}
                                onCommit={(v) =>
                                  fakeCreate("scope", v, {
                                    org_id: org.id,
                                    scope_type_id: type.id,
                                  })
                                }
                              />
                            </>
                          )}
                        </React.Fragment>
                      );
                    })}
                  {orgOpen && (
                    <InlineAddRow
                      placeholder={`New scope type in ${org.name}`}
                      indentPx={6 + INDENT}
                      onCommit={(v) =>
                        fakeCreate("scope type", v, { org_id: org.id })
                      }
                    />
                  )}
                </React.Fragment>
              );
            })}

            {/* ── projects, then tasks — always the bottom of the ledger ── */}
            <LedgerRow
              depth={0}
              sticky
              on={false}
              label={`Projects · ${data.projects.length}`}
              labelTone="font-semibold"
              kind=""
              onToggle={() => setShowProjects((v) => !v)}
              disclosure={
                <Disclosure
                  open={showProjects}
                  onClick={() => setShowProjects((v) => !v)}
                />
              }
            />
            {showProjects &&
              (data.engagementLoading ? (
                <div className="flex h-6 items-center gap-1.5 pl-6 text-[11px] text-muted-foreground">
                  <InlineSpinner /> Loading projects…
                </div>
              ) : (
                <>
                  {data.projects.map((p) => (
                    <LedgerRow
                      key={p.id}
                      depth={1}
                      on={isSelected(selection, "project", p.id)}
                      label={p.name}
                      count={
                        data.organizations.find((o) => o.id === p.orgId)
                          ?.slug ?? "none"
                      }
                      kind="proj"
                      onToggle={() => toggle("project", p.id)}
                    />
                  ))}
                  <InlineAddRow
                    placeholder="New project"
                    indentPx={6 + INDENT}
                    onCommit={(v) => fakeCreate("project", v, {})}
                  />
                </>
              ))}
            <LedgerRow
              depth={0}
              sticky
              on={false}
              label={`Tasks · ${data.tasks.length}`}
              labelTone="font-semibold"
              kind=""
              onToggle={() => setShowTasks((v) => !v)}
              disclosure={
                <Disclosure
                  open={showTasks}
                  onClick={() => setShowTasks((v) => !v)}
                />
              }
            />
            {showTasks &&
              (data.engagementLoading ? (
                <div className="flex h-6 items-center gap-1.5 pl-6 text-[11px] text-muted-foreground">
                  <InlineSpinner /> Loading tasks…
                </div>
              ) : (
                <>
                  {data.tasks.map((t) => (
                    <LedgerRow
                      key={t.id}
                      depth={1}
                      on={isSelected(selection, "task", t.id)}
                      label={t.title}
                      count={t.status ?? ""}
                      kind="task"
                      onToggle={() => toggle("task", t.id)}
                    />
                  ))}
                  <InlineAddRow
                    placeholder="New task"
                    indentPx={6 + INDENT}
                    onCommit={(v) => fakeCreate("task", v, {})}
                  />
                </>
              ))}
          </>
        )}
      </div>
    </div>
  );
}
