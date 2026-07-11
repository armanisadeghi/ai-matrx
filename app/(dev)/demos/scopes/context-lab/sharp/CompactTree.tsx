"use client";

// INSIDE 2 — Compact Tree. The VS Code explorer, for context.
//
// One scroll area, 24px rows, indent guides, everything collapsed to counts
// by default — three orgs fit in the height the old component spent on one
// scope type. Every level expands: org → type → scope → context items (lazy
// fetch). Every level also CREATES: hover any header for its "+" (previewed).
// Projects and Tasks are pinned sections at the bottom.

import React, { useMemo, useState } from "react";
import {
  Briefcase,
  Building2,
  Check,
  ChevronDown,
  ChevronRight,
  Loader2,
  Plus,
  SquareCheckBig,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { resolveColor } from "@/features/scope-system/constants/scope-colors";
import { resolveIcon } from "@/features/scope-system/utils/resolveIcon";
import { fetchTypeItems } from "@/features/scopes/components/context-assignment/data";
import type { ContextItemRow } from "@/features/scopes/types";
import { previewWrite, type PickerData, type SelectionApi } from "./engine";

interface CompactTreeProps {
  data: PickerData;
  sel: SelectionApi;
  height?: number;
  footer?: React.ReactNode;
}

type ItemCache = Record<string, ContextItemRow[] | "loading" | "error">;

interface AddDraft {
  key: string; // "type:<orgId>" | "scope:<typeId>" | "item:<typeId>" | "project" | "task"
  value: string;
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

export function CompactTree({
  data,
  sel,
  height = 320,
  footer,
}: CompactTreeProps) {
  const [query, setQuery] = useState("");
  const [openOrgs, setOpenOrgs] = useState<Set<string>>(
    () => new Set(data.orgs.map((o) => o.id)),
  );
  const [openTypes, setOpenTypes] = useState<Set<string>>(new Set());
  const [openScopes, setOpenScopes] = useState<Set<string>>(new Set());
  const [items, setItems] = useState<ItemCache>({});
  const [draft, setDraft] = useState<AddDraft | null>(null);

  const q = query.trim().toLowerCase();
  const searching = q.length > 0;

  function flip(set: Set<string>, id: string): Set<string> {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  }

  function openScopeItems(scopeId: string, typeId: string) {
    setOpenScopes((p) => flip(p, scopeId));
    if (!items[typeId]) {
      setItems((p) => ({ ...p, [typeId]: "loading" }));
      fetchTypeItems(typeId)
        .then((rows) => setItems((p) => ({ ...p, [typeId]: rows })))
        .catch(() => setItems((p) => ({ ...p, [typeId]: "error" })));
    }
  }

  function commitDraft(run: (value: string) => void) {
    if (!draft || !draft.value.trim()) {
      setDraft(null);
      return;
    }
    run(draft.value.trim());
    setDraft(null);
  }

  const addRow = (key: string, placeholder: string, run: (v: string) => void) =>
    draft?.key === key ? (
      <div className="flex h-6 items-center gap-1.5 pl-1">
        <Plus className="h-3 w-3 shrink-0 text-primary" />
        <input
          autoFocus
          value={draft.value}
          onChange={(e) => setDraft({ key, value: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitDraft(run);
            if (e.key === "Escape") setDraft(null);
          }}
          onBlur={() => commitDraft(run)}
          placeholder={placeholder}
          className="h-5 min-w-0 flex-1 rounded border border-primary/40 bg-background px-1.5 text-xs outline-none"
          style={{ fontSize: "16px" }}
        />
      </div>
    ) : null;

  const plusButton = (key: string, label: string) => (
    <button
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        setDraft({ key, value: "" });
      }}
      className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground/0 hover:!text-foreground hover:bg-background group-hover/row:text-muted-foreground"
    >
      <Plus className="h-3.5 w-3.5" />
    </button>
  );

  const orgsToRender = useMemo(() => {
    if (!searching) return data.orgs;
    return data.orgs
      .map((o) => ({
        ...o,
        scope_types: o.scope_types
          .map((t) => ({
            ...t,
            scopes: t.scopes.filter((s) => s.name.toLowerCase().includes(q)),
          }))
          .filter(
            (t) =>
              t.scopes.length > 0 || t.label_plural.toLowerCase().includes(q),
          ),
      }))
      .filter(
        (o) => o.scope_types.length > 0 || o.name.toLowerCase().includes(q),
      );
  }, [data.orgs, q, searching]);

  const projects = useMemo(
    () =>
      searching
        ? data.projects.filter((p) => p.name.toLowerCase().includes(q))
        : data.projects,
    [data.projects, q, searching],
  );
  const tasks = useMemo(
    () =>
      searching
        ? data.tasks.filter((t) => t.title.toLowerCase().includes(q))
        : data.tasks,
    [data.tasks, q, searching],
  );

  return (
    <div className="flex w-full flex-col text-sm">
      <div className="border-b border-border px-2 py-1.5">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter…"
          className="h-6 w-full rounded bg-muted/50 px-2 text-xs outline-none placeholder:text-muted-foreground/70 focus:bg-muted"
          style={{ fontSize: "16px" }}
        />
      </div>

      <div
        className="overflow-y-auto px-1.5 py-1 scrollbar-thin"
        style={{ height }}
      >
        {orgsToRender.length === 0 && projects.length === 0 && tasks.length === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            Nothing matches “{query.trim()}”.
          </div>
        ) : (
          <>
            {orgsToRender.map((org) => {
              const orgOpen = searching || openOrgs.has(org.id);
              return (
                <div key={org.id}>
                  <div className="group/row flex h-6 items-center gap-1.5">
                    <button
                      onClick={() => setOpenOrgs((p) => flip(p, org.id))}
                      aria-label={orgOpen ? "Collapse" : "Expand"}
                      className="flex h-5 w-4 shrink-0 items-center justify-center text-muted-foreground"
                    >
                      {orgOpen ? (
                        <ChevronDown className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5" />
                      )}
                    </button>
                    <button
                      onClick={() => sel.toggleOrg(org.id)}
                      className="flex h-full min-w-0 flex-1 items-center gap-1.5 rounded text-left hover:bg-muted"
                    >
                      <CheckTarget on={sel.hasOrg(org.id)} />
                      <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
                        {org.name}
                      </span>
                    </button>
                    {plusButton(`type:${org.id}`, `New scope type in ${org.name}`)}
                  </div>
                  {orgOpen && (
                    <div className="ml-[7px] border-l border-border pl-2">
                      {addRow(`type:${org.id}`, "New scope type…", (v) =>
                        previewWrite(
                          "create scope type",
                          { org_id: org.id, label_plural: v },
                          `Created scope type "${v}" in ${org.name}`,
                        ),
                      )}
                      {org.scope_types.map((type) => {
                        const typeOpen = searching || openTypes.has(type.id);
                        const c = resolveColor(type);
                        const TIcon = resolveIcon(type.icon);
                        return (
                          <div key={type.id}>
                            <div className="group/row flex h-6 items-center gap-1.5">
                              <button
                                onClick={() =>
                                  setOpenTypes((p) => flip(p, type.id))
                                }
                                aria-label={typeOpen ? "Collapse" : "Expand"}
                                className="flex h-5 w-4 shrink-0 items-center justify-center text-muted-foreground"
                              >
                                {typeOpen ? (
                                  <ChevronDown className="h-3.5 w-3.5" />
                                ) : (
                                  <ChevronRight className="h-3.5 w-3.5" />
                                )}
                              </button>
                              <button
                                onClick={() =>
                                  setOpenTypes((p) => flip(p, type.id))
                                }
                                className="flex h-full min-w-0 flex-1 items-center gap-1.5 rounded text-left hover:bg-muted"
                              >
                                <TIcon
                                  className={cn("h-3.5 w-3.5 shrink-0", c.fg)}
                                />
                                <span
                                  className={cn(
                                    "min-w-0 truncate text-[12px] font-medium",
                                    c.fg,
                                  )}
                                >
                                  {type.label_plural}
                                </span>
                                <span className="shrink-0 text-[11px] text-muted-foreground/70">
                                  {type.scopes.length}
                                </span>
                              </button>
                              {plusButton(
                                `scope:${type.id}`,
                                `New ${type.label_singular}`,
                              )}
                            </div>
                            {typeOpen && (
                              <div className="ml-[7px] border-l border-border pl-2">
                                {addRow(
                                  `scope:${type.id}`,
                                  `New ${type.label_singular.toLowerCase()}…`,
                                  (v) =>
                                    previewWrite(
                                      "create scope",
                                      {
                                        org_id: org.id,
                                        type_id: type.id,
                                        name: v,
                                      },
                                      `Created "${v}" in ${type.label_plural}`,
                                    ),
                                )}
                                {type.scopes.length === 0 && (
                                  <div className="flex h-6 items-center pl-1 text-[11px] text-muted-foreground/70">
                                    No {type.label_plural.toLowerCase()} yet —
                                    hover the row for +
                                  </div>
                                )}
                                {type.scopes.map((scope) => {
                                  const scopeOpen = openScopes.has(scope.id);
                                  const typeItems = items[type.id];
                                  return (
                                    <div key={scope.id}>
                                      <div className="group/row flex h-6 items-center gap-1.5">
                                        <button
                                          onClick={() =>
                                            openScopeItems(scope.id, type.id)
                                          }
                                          aria-label={
                                            scopeOpen
                                              ? "Hide fields"
                                              : "Show fields"
                                          }
                                          className="flex h-5 w-4 shrink-0 items-center justify-center text-muted-foreground/70"
                                        >
                                          {scopeOpen ? (
                                            <ChevronDown className="h-3 w-3" />
                                          ) : (
                                            <ChevronRight className="h-3 w-3" />
                                          )}
                                        </button>
                                        <button
                                          onClick={() =>
                                            sel.toggleScope(scope.id)
                                          }
                                          className="flex h-full min-w-0 flex-1 items-center gap-1.5 rounded text-left hover:bg-muted"
                                        >
                                          <CheckTarget
                                            on={sel.hasScope(scope.id)}
                                          />
                                          <span className="min-w-0 flex-1 truncate text-[13px]">
                                            {scope.name}
                                          </span>
                                        </button>
                                        {plusButton(
                                          `item:${type.id}`,
                                          `New field on ${type.label_plural}`,
                                        )}
                                      </div>
                                      {scopeOpen && (
                                        <div className="ml-[7px] border-l border-border/70 pl-2">
                                          {addRow(
                                            `item:${type.id}`,
                                            "New field…",
                                            (v) =>
                                              previewWrite(
                                                "create context item",
                                                {
                                                  scope_type_id: type.id,
                                                  display_name: v,
                                                },
                                                `Defined "${v}" on ${type.label_plural}`,
                                              ),
                                          )}
                                          {typeItems === "loading" ? (
                                            <div className="flex h-6 items-center gap-1.5 pl-1 text-[11px] text-muted-foreground">
                                              <Loader2 className="h-3 w-3 animate-spin" />
                                              Loading fields…
                                            </div>
                                          ) : typeItems === "error" ? (
                                            <div className="flex h-6 items-center pl-1 text-[11px] text-destructive">
                                              Couldn&apos;t load fields.
                                            </div>
                                          ) : (typeItems ?? []).length === 0 ? (
                                            <div className="flex h-6 items-center pl-1 text-[11px] text-muted-foreground/70">
                                              No fields defined.
                                            </div>
                                          ) : (
                                            (typeItems as ContextItemRow[]).map(
                                              (item) => (
                                                <button
                                                  key={item.id}
                                                  onClick={() =>
                                                    sel.toggleItem({
                                                      scopeId: scope.id,
                                                      itemId: item.id,
                                                      itemLabel:
                                                        item.display_name,
                                                      scopeName: scope.name,
                                                    })
                                                  }
                                                  className="flex h-6 w-full items-center gap-1.5 rounded pl-1 text-left hover:bg-muted"
                                                >
                                                  <CheckTarget
                                                    on={sel.hasItem(
                                                      scope.id,
                                                      item.id,
                                                    )}
                                                  />
                                                  <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                                                    {item.display_name}
                                                  </span>
                                                </button>
                                              ),
                                            )
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            {/* projects + tasks — always at the bottom */}
            <div className="group/row mt-1.5 flex h-6 items-center gap-1.5 border-t border-border pt-1.5">
              <Briefcase className="ml-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Projects · {projects.length}
              </span>
              {plusButton("project", "New project")}
            </div>
            {addRow("project", "New project…", (v) =>
              previewWrite("create project", { name: v }, `Created project "${v}"`),
            )}
            {projects.map((p) => (
              <button
                key={p.id}
                onClick={() => sel.toggleProject(p.id)}
                className="flex h-6 w-full items-center gap-1.5 rounded pl-5 text-left hover:bg-muted"
              >
                <CheckTarget on={sel.hasProject(p.id)} />
                <span className="min-w-0 flex-1 truncate text-[13px]">
                  {p.name}
                </span>
                <span className="shrink-0 pr-1 text-[10px] text-muted-foreground/60">
                  {p.orgId
                    ? (data.orgs.find((o) => o.id === p.orgId)?.name ?? "")
                    : "unassigned"}
                </span>
              </button>
            ))}

            <div className="group/row mt-1.5 flex h-6 items-center gap-1.5 border-t border-border pt-1.5">
              <SquareCheckBig className="ml-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Tasks · {tasks.length}
              </span>
              {plusButton("task", "New task")}
            </div>
            {addRow("task", "New task…", (v) =>
              previewWrite("create task", { title: v }, `Created task "${v}"`),
            )}
            {tasks.slice(0, searching ? 100 : 12).map((t) => (
              <button
                key={t.id}
                onClick={() => sel.toggleTask(t.id)}
                className="flex h-6 w-full items-center gap-1.5 rounded pl-5 text-left hover:bg-muted"
              >
                <CheckTarget on={sel.hasTask(t.id)} />
                <span className="min-w-0 flex-1 truncate text-[13px]">
                  {t.title}
                </span>
              </button>
            ))}
            {!searching && tasks.length > 12 && (
              <div className="flex h-6 items-center pl-6 text-[11px] text-muted-foreground/70">
                +{tasks.length - 12} more — use the filter
              </div>
            )}
          </>
        )}
      </div>

      {footer}
    </div>
  );
}
