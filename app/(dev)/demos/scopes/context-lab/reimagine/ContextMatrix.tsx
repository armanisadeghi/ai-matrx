"use client";

// INSIDE №5 — Context Matrix (the map).
//
// The entire universe on one screen, spatially: each org is a swimlane, each
// scope type one row, and every scope a small toggle cell laid out in a wrap
// grid — 3 orgs × dozens of scopes fit in the space the current field spends
// on ONE expanded scope type. Org and type labels are themselves toggles;
// a scope cell's chevron opens its context-item strip inline under the row;
// Projects and Tasks are the two bottom lanes. Search dims everything that
// doesn't match instead of reflowing — the map never changes shape under
// your cursor. Add-at-any-level lives on each row and lane.

import React, { useMemo, useState } from "react";
import { Building2, ChevronDown, Plus, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { resolveIcon } from "@/features/scope-system/utils/resolveIcon";
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
  PickerFooter,
  SkeletonRows,
} from "./parts";

function Cell({
  on,
  dim,
  label,
  colorFg,
  colorBorder,
  onToggle,
  onDeepen,
  deepened,
}: {
  on: boolean;
  dim: boolean;
  label: string;
  colorFg?: string;
  colorBorder?: string;
  onToggle: () => void;
  onDeepen?: () => void;
  deepened?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center overflow-hidden rounded-md border transition-opacity",
        on
          ? cn("bg-primary/10", colorBorder ?? "border-primary", colorFg)
          : cn("border-border bg-background text-foreground"),
        dim && "opacity-25",
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={on}
        className={cn(
          "flex h-full min-w-0 items-center gap-1 px-1.5 text-[11px] hover:bg-muted",
          on && "font-medium",
        )}
      >
        <span
          className={cn(
            "h-1.5 w-1.5 shrink-0 rounded-full",
            on ? "bg-current" : "bg-muted-foreground/40",
          )}
        />
        <span className="max-w-[120px] truncate">{label}</span>
      </button>
      {onDeepen && (
        <button
          type="button"
          onClick={onDeepen}
          aria-label={`Show ${label} context items`}
          className={cn(
            "flex h-full w-4 shrink-0 items-center justify-center border-l border-border/60 text-muted-foreground hover:bg-muted hover:text-foreground",
            deepened && "bg-muted text-foreground",
          )}
        >
          <ChevronDown
            className={cn("h-2.5 w-2.5 transition-transform", deepened && "rotate-180")}
          />
        </button>
      )}
    </span>
  );
}

function ItemStrip({
  scope,
  engine,
  match,
}: {
  scope: PickNode;
  engine: SelectionEngine;
  match: (s: string) => boolean;
}) {
  const itemsQ = useTypeItems(scope.typeId ?? null);
  const [creating, setCreating] = useState(false);
  const typeId = scope.typeId;
  return (
    <div className="ml-4 mt-1 rounded-md border border-dashed border-border bg-muted/30 px-1.5 py-1">
      <div className="flex flex-wrap items-center gap-1">
        <span className="pr-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {scope.label} items
        </span>
        {itemsQ.status === "loading" && (
          <span className="h-5 w-24 animate-pulse rounded bg-muted" />
        )}
        {itemsQ.status === "error" && (
          <button
            type="button"
            onClick={itemsQ.retry}
            className="text-[10px] text-destructive underline"
          >
            {itemsQ.error ?? "Failed to load items"} — retry
          </button>
        )}
        {itemsQ.status === "ready" && itemsQ.items.length === 0 && (
          <span className="text-[10px] text-muted-foreground">
            none defined yet
          </span>
        )}
        {itemsQ.status === "ready" &&
          itemsQ.items.map((it) => {
            const n = itemNodeOf(scope, { id: it.id, label: it.label });
            const on = engine.isOn("item", n.id);
            return (
              <Cell
                key={it.id}
                on={on}
                dim={!match(it.label)}
                label={it.label}
                colorFg={scope.color?.fg}
                colorBorder={scope.color?.border}
                onToggle={() => engine.toggle(n)}
              />
            );
          })}
        {typeId &&
          (creating ? (
            <InlineCreate
              placeholder="New item key"
              autoFocus
              onCommit={(v) => {
                void createDraft({
                  kind: "item",
                  typeId,
                  typeName: scope.path[1] ?? "type",
                  name: v,
                });
                setCreating(false);
              }}
              onCancel={() => setCreating(false)}
            />
          ) : (
            <button
              type="button"
              onClick={() => setCreating(true)}
              aria-label="New context item"
              className="flex h-6 w-6 items-center justify-center rounded-md border border-dashed border-border text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Plus className="h-3 w-3" />
            </button>
          ))}
      </div>
    </div>
  );
}

export function ContextMatrix({
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
  const [query, setQuery] = useState("");
  const [deepenedScopeId, setDeepenedScopeId] = useState<string | null>(null);
  const [creating, setCreating] = useState<string | null>(null); // rowKey
  const q = query.trim().toLowerCase();
  const match = (s: string) => !q || s.toLowerCase().includes(q);

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-xl border border-border bg-card",
        className,
      )}
    >
      {/* search dims, never reflows */}
      <div className="relative shrink-0 border-b border-border">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Highlight on the map…"
          aria-label="Highlight on the map"
          className="h-8 w-full bg-transparent pl-8 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground"
          style={{ fontSize: "16px" }}
        />
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-2.5 scrollbar-thin">
        {u.treeStatus === "loading" && <SkeletonRows count={8} />}
        {u.treeStatus === "error" && (
          <ErrorPane message={u.treeError} onRetry={u.retryTree} />
        )}
        {u.treeStatus === "empty" && (
          <EmptyPane text="No organizations yet — the map is blank." />
        )}
        {u.treeStatus === "ready" &&
          u.orgs.map((o) => {
            const oNode = orgNodeOf(o);
            const orgOn = engine.isOn("org", o.id);
            return (
              <div key={o.id}>
                {/* org lane header — itself a toggle */}
                <div className="flex items-center gap-2 pb-1">
                  <button
                    type="button"
                    onClick={() => engine.toggle(oNode)}
                    className="flex items-center gap-1.5 rounded-md px-1 py-0.5 hover:bg-muted"
                  >
                    <CheckGlyph on={orgOn} round />
                    <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                    <span
                      className={cn(
                        "text-xs font-semibold",
                        match(o.name) ? "text-foreground" : "text-muted-foreground/40",
                      )}
                    >
                      {o.name}
                    </span>
                  </button>
                  <div className="h-px flex-1 bg-border" />
                  {creating === `type:${o.id}` ? (
                    <div className="w-56">
                      <InlineCreate
                        placeholder="New scope type"
                        onCommit={(v) => {
                          void createDraft({
                            kind: "type",
                            orgId: o.id,
                            orgName: o.name,
                            name: v,
                          });
                          setCreating(null);
                        }}
                        onCancel={() => setCreating(null)}
                      />
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setCreating(`type:${o.id}`)}
                      className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <Plus className="h-3 w-3" /> type
                    </button>
                  )}
                </div>

                {o.scope_types.length === 0 && (
                  <div className="pl-6 text-[11px] text-muted-foreground">
                    No scope types yet.
                  </div>
                )}
                {o.scope_types.map((t) => {
                  const tNode = typeNodeOf(o, t);
                  const TIcon = resolveIcon(t.icon);
                  const typeOn = engine.isOn("type", t.id);
                  const deepScope = t.scopes.find(
                    (s) => s.id === deepenedScopeId,
                  );
                  return (
                    <div key={t.id} className="mb-1.5 pl-4">
                      <div className="flex flex-wrap items-center gap-1">
                        <button
                          type="button"
                          onClick={() => engine.toggle(tNode)}
                          className={cn(
                            "mr-1 flex w-28 shrink-0 items-center gap-1.5 rounded-md px-1 py-0.5 text-left hover:bg-muted",
                            !match(t.label_plural) && q && "opacity-25",
                          )}
                        >
                          <CheckGlyph on={typeOn} />
                          <TIcon
                            className={cn("h-3 w-3 shrink-0", tNode.color?.fg)}
                          />
                          <span
                            className={cn(
                              "min-w-0 truncate text-[11px] font-medium",
                              tNode.color?.fg,
                            )}
                          >
                            {t.label_plural}
                          </span>
                        </button>
                        {t.scopes.map((s) => {
                          const n = scopeNodeOf(o, t, s);
                          return (
                            <Cell
                              key={s.id}
                              on={engine.isOn("scope", s.id)}
                              dim={q !== "" && !match(s.name)}
                              label={s.name}
                              colorFg={n.color?.fg}
                              colorBorder={n.color?.border}
                              onToggle={() => engine.toggle(n)}
                              onDeepen={() =>
                                setDeepenedScopeId((id) =>
                                  id === s.id ? null : s.id,
                                )
                              }
                              deepened={deepenedScopeId === s.id}
                            />
                          );
                        })}
                        {creating === `scope:${t.id}` ? (
                          <div className="w-56">
                            <InlineCreate
                              placeholder={`New ${t.label_singular.toLowerCase()}`}
                              onCommit={(v) => {
                                void createDraft({
                                  kind: "scope",
                                  orgId: o.id,
                                  typeId: t.id,
                                  typeName: t.label_singular,
                                  name: v,
                                });
                                setCreating(null);
                              }}
                              onCancel={() => setCreating(null)}
                            />
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setCreating(`scope:${t.id}`)}
                            aria-label={`New ${t.label_singular}`}
                            className="flex h-6 w-6 items-center justify-center rounded-md border border-dashed border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                      {deepScope && (
                        <ItemStrip
                          scope={scopeNodeOf(o, t, deepScope)}
                          engine={engine}
                          match={match}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}

        {/* bottom lanes — Projects, Tasks */}
        {u.treeStatus === "ready" && (
          <div className="border-t border-border pt-2">
            {u.engagementStatus === "loading" && <SkeletonRows count={2} />}
            {u.engagementStatus === "error" && (
              <ErrorPane
                message={u.engagementError}
                onRetry={u.retryEngagement}
              />
            )}
            {u.engagementStatus === "ready" && (
              <>
                <div className="mb-1.5 flex flex-wrap items-center gap-1">
                  <span className="mr-1 w-28 shrink-0 px-1 text-[11px] font-medium text-muted-foreground">
                    Projects
                  </span>
                  {u.projects.length === 0 && (
                    <span className="text-[10px] text-muted-foreground">
                      none yet
                    </span>
                  )}
                  {u.projects.map((p) => (
                    <Cell
                      key={p.id}
                      on={engine.isOn("project", p.id)}
                      dim={q !== "" && !match(p.name)}
                      label={p.name}
                      onToggle={() => engine.toggle(projectNodeOf(p, orgName))}
                    />
                  ))}
                  {creating === "project" ? (
                    <div className="w-56">
                      <InlineCreate
                        placeholder="New project"
                        onCommit={(v) => {
                          void createDraft({
                            kind: "project",
                            orgId: null,
                            name: v,
                          });
                          setCreating(null);
                        }}
                        onCancel={() => setCreating(null)}
                      />
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setCreating("project")}
                      aria-label="New project"
                      className="flex h-6 w-6 items-center justify-center rounded-md border border-dashed border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  <span className="mr-1 w-28 shrink-0 px-1 text-[11px] font-medium text-muted-foreground">
                    Tasks
                  </span>
                  {u.tasks.length === 0 && (
                    <span className="text-[10px] text-muted-foreground">
                      none yet
                    </span>
                  )}
                  {u.tasks.map((t) => (
                    <Cell
                      key={t.id}
                      on={engine.isOn("task", t.id)}
                      dim={q !== "" && !match(t.title)}
                      label={t.title}
                      onToggle={() => engine.toggle(taskNodeOf(t, orgName))}
                    />
                  ))}
                  {creating === "task" ? (
                    <div className="w-56">
                      <InlineCreate
                        placeholder="New task"
                        onCommit={(v) => {
                          void createDraft({ kind: "task", name: v });
                          setCreating(null);
                        }}
                        onCancel={() => setCreating(null)}
                      />
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setCreating("task")}
                      aria-label="New task"
                      className="flex h-6 w-6 items-center justify-center rounded-md border border-dashed border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <PickerFooter engine={engine} mode={mode} />
    </div>
  );
}
