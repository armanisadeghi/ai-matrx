"use client";

// INSIDE 3 — "Compact tree": the shipping field's mental model, executed at
// half the vertical cost.
//
// The fix for "3 orgs = half a page": orgs become a segmented TAB row (one
// line, not three stacked sections), types are 26px header rows, scopes are
// 26px leaf rows, and each scope can expand ONE more level to its context
// items in place. Projects and tasks are pinned collapsible groups at the
// BOTTOM. Add-at-any-level: new type (org tab row), new scope (type header),
// new field (item level).

import React, { useMemo, useState } from "react";
import {
  Briefcase,
  Building2,
  ChevronDown,
  ChevronRight,
  FolderOpen,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { resolveIcon } from "@/features/scope-system/utils/resolveIcon";
import { resolveColor } from "@/features/scope-system/constants/scope-colors";
import { formatOrgDisplayName } from "@/features/scopes/utils/formatOrgDisplayName";
import type {
  AssignableProject,
  AssignableTask,
} from "@/features/scopes/components/context-assignment/data";
import type { OrgNode, ScopeNode, ScopeTypeNode } from "@/features/scopes/types";
import {
  itemPickId,
  mergeDraftItems,
  type DraftStore,
  type ItemsState,
  type PickController,
} from "./model";
import {
  CheckGlyph,
  DenseRow,
  EmptyRow,
  ErrorRow,
  InlineCreate,
  LoadingRow,
} from "./rows";

export function CompactTree({
  orgs,
  projects,
  tasks,
  ctrl,
  items,
  drafts,
  height = 320,
  footer,
  className,
}: {
  orgs: OrgNode[];
  projects: AssignableProject[];
  tasks: AssignableTask[];
  ctrl: PickController;
  items: ItemsState;
  drafts: DraftStore;
  height?: number;
  footer?: React.ReactNode;
  className?: string;
}) {
  const [pickedOrgId, setOrgId] = useState<string | null>(null);
  const [openTypes, setOpenTypes] = useState<Set<string>>(new Set());
  const [openScopes, setOpenScopes] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState<string | null>(null); // "type" | typeId | `item:${typeId}`
  const [projOpen, setProjOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);

  // Derived, not synced: default to the first org until the user picks one.
  const org =
    orgs.find((o) => o.id === pickedOrgId) ?? orgs[0] ?? null;
  const orgId = org?.id ?? null;

  const flipSet =
    (set: React.Dispatch<React.SetStateAction<Set<string>>>) => (id: string) =>
      set((p) => {
        const n = new Set(p);
        n.has(id) ? n.delete(id) : n.add(id);
        return n;
      });
  const flipType = flipSet(setOpenTypes);
  const flipScope = flipSet(setOpenScopes);

  const selectedInType = (t: ScopeTypeNode) =>
    t.scopes.filter((s) => ctrl.has("scope", s.id)).length;

  const orgProjects = useMemo(
    () => projects.filter((p) => !org || p.orgId === org.id || p.orgId == null),
    [projects, org],
  );
  const orgTasks = useMemo(
    () => tasks.filter((t) => !org || t.orgId === org.id || t.orgId == null),
    [tasks, org],
  );

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      {/* org tabs — the whole multi-org story on ONE line */}
      <div className="flex h-8 shrink-0 items-center gap-1 overflow-x-auto border-b border-border px-1.5 scrollbar-hide">
        {orgs.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => setOrgId(o.id)}
            className={cn(
              "flex h-6 shrink-0 items-center gap-1.5 rounded-md px-2 text-[12px] transition-colors",
              orgId === o.id
                ? "bg-accent font-medium text-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Building2 className="h-3 w-3" />
            <span className="max-w-[120px] truncate">
              {formatOrgDisplayName(o)}
            </span>
            <span
              onClick={(e) => {
                e.stopPropagation();
                ctrl.toggle("org", o.id);
              }}
              title="Include this organization itself in the context"
              className="flex items-center"
            >
              <CheckGlyph on={ctrl.has("org", o.id)} />
            </span>
          </button>
        ))}
      </div>

      <div
        className="min-h-0 overflow-y-auto overscroll-contain p-1 scrollbar-thin"
        style={{ height }}
      >
        {!org ? (
          <EmptyRow label="No organizations on your account." />
        ) : (
          <>
            {org.scope_types.length === 0 && adding !== "type" && (
              <EmptyRow label="This org has no dimensions yet — add one below." />
            )}
            {org.scope_types.map((t) => (
              <TypeBlock
                key={t.id}
                org={org}
                type={t}
                open={openTypes.has(t.id)}
                onFlip={() => flipType(t.id)}
                openScopes={openScopes}
                onFlipScope={flipScope}
                ctrl={ctrl}
                items={items}
                drafts={drafts}
                selectedCount={selectedInType(t)}
                adding={adding}
                setAdding={setAdding}
              />
            ))}
            {/* add-at-type-level */}
            {adding === "type" ? (
              <InlineCreate
                placeholder="New dimension (e.g. Client)"
                onCommit={(v) => {
                  drafts.createType(org.id, v);
                  setAdding(null);
                }}
                onCancel={() => setAdding(null)}
              />
            ) : (
              <button
                type="button"
                onClick={() => setAdding("type")}
                className="flex h-[24px] w-full items-center gap-2 rounded-md px-1.5 text-[12px] text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <Plus className="h-3 w-3" />
                New scope type in {formatOrgDisplayName(org)}
              </button>
            )}

            {/* projects + tasks — always the BOTTOM groups */}
            <div className="mt-1 border-t border-border pt-1">
              <GroupHeader
                icon={<FolderOpen className="h-3.5 w-3.5" />}
                label="Projects"
                count={orgProjects.length}
                picked={orgProjects.filter((p) => ctrl.has("project", p.id)).length}
                open={projOpen}
                onFlip={() => setProjOpen((v) => !v)}
              />
              {projOpen &&
                (orgProjects.length === 0 ? (
                  <EmptyRow label="No projects in view." />
                ) : (
                  orgProjects.map((p) => (
                    <DenseRow
                      key={p.id}
                      on={ctrl.has("project", p.id)}
                      single={ctrl.single}
                      label={p.name}
                      sub={p.orgId == null ? "Unassigned" : undefined}
                      onClick={() => ctrl.toggle("project", p.id)}
                      indent={1}
                    />
                  ))
                ))}
              <GroupHeader
                icon={<Briefcase className="h-3.5 w-3.5" />}
                label="Tasks"
                count={orgTasks.length}
                picked={orgTasks.filter((t) => ctrl.has("task", t.id)).length}
                open={taskOpen}
                onFlip={() => setTaskOpen((v) => !v)}
              />
              {taskOpen &&
                (orgTasks.length === 0 ? (
                  <EmptyRow label="No tasks in view." />
                ) : (
                  orgTasks.map((t) => (
                    <DenseRow
                      key={t.id}
                      on={ctrl.has("task", t.id)}
                      single={ctrl.single}
                      label={t.title}
                      sub={t.status ?? undefined}
                      onClick={() => ctrl.toggle("task", t.id)}
                      indent={1}
                    />
                  ))
                ))}
            </div>
          </>
        )}
      </div>

      {footer && (
        <div className="shrink-0 border-t border-border">{footer}</div>
      )}
    </div>
  );
}

function GroupHeader({
  icon,
  label,
  count,
  picked,
  open,
  onFlip,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  picked: number;
  open: boolean;
  onFlip: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onFlip}
      className="flex h-[26px] w-full items-center gap-1.5 rounded-md px-1.5 text-[13px] font-medium hover:bg-muted"
    >
      {open ? (
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      ) : (
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      )}
      <span className="text-muted-foreground">{icon}</span>
      {label}
      <span className="text-[11px] font-normal text-muted-foreground">
        {count}
      </span>
      {picked > 0 && (
        <span className="ml-auto shrink-0 rounded-full bg-primary/10 px-1.5 text-[10px] font-semibold text-primary">
          {picked}
        </span>
      )}
    </button>
  );
}

function TypeBlock({
  org,
  type,
  open,
  onFlip,
  openScopes,
  onFlipScope,
  ctrl,
  items,
  drafts,
  selectedCount,
  adding,
  setAdding,
}: {
  org: OrgNode;
  type: ScopeTypeNode;
  open: boolean;
  onFlip: () => void;
  openScopes: Set<string>;
  onFlipScope: (id: string) => void;
  ctrl: PickController;
  items: ItemsState;
  drafts: DraftStore;
  selectedCount: number;
  adding: string | null;
  setAdding: (v: string | null) => void;
}) {
  const c = resolveColor(type);
  return (
    <div>
      <div className="group flex h-[26px] items-center gap-1.5 rounded-md px-1.5 hover:bg-muted">
        <button
          type="button"
          onClick={onFlip}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-[13px] font-medium"
        >
          {open ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          )}
          {React.createElement(resolveIcon(type.icon), {
            className: cn("h-3.5 w-3.5 shrink-0", c.fg),
          })}
          <span className={cn("min-w-0 truncate", c.fg)}>
            {type.label_plural}
          </span>
          <span className="text-[11px] font-normal text-muted-foreground">
            {type.scopes.length}
          </span>
          {selectedCount > 0 && (
            <span className="shrink-0 rounded-full bg-primary/10 px-1.5 text-[10px] font-semibold text-primary">
              {selectedCount}
            </span>
          )}
        </button>
        <button
          type="button"
          title={`New ${type.label_singular}`}
          onClick={() => {
            if (!open) onFlip();
            setAdding(type.id);
          }}
          className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-background hover:text-foreground group-hover:opacity-100"
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>
      {open && (
        <>
          {adding === type.id && (
            <InlineCreate
              indent={1}
              placeholder={`New ${type.label_singular.toLowerCase()} name`}
              onCommit={(v) => {
                const d = drafts.createScope(type.id, org.id, v);
                ctrl.toggle("scope", d.id);
                setAdding(null);
              }}
              onCancel={() => setAdding(null)}
            />
          )}
          {type.scopes.length === 0 && adding !== type.id ? (
            <div style={{ paddingLeft: 20 }}>
              <EmptyRow label={`No ${type.label_plural.toLowerCase()} yet.`} />
            </div>
          ) : (
            type.scopes.map((s) => (
              <ScopeLeaf
                key={s.id}
                scope={s}
                type={type}
                colorFg={c.fg}
                open={openScopes.has(s.id)}
                onFlip={() => {
                  onFlipScope(s.id);
                  items.ensure(type.id);
                }}
                ctrl={ctrl}
                items={items}
                drafts={drafts}
                adding={adding}
                setAdding={setAdding}
              />
            ))
          )}
        </>
      )}
    </div>
  );
}

function ScopeLeaf({
  scope,
  type,
  colorFg,
  open,
  onFlip,
  ctrl,
  items,
  drafts,
  adding,
  setAdding,
}: {
  scope: ScopeNode;
  type: ScopeTypeNode;
  colorFg: string;
  open: boolean;
  onFlip: () => void;
  ctrl: PickController;
  items: ItemsState;
  drafts: DraftStore;
  adding: string | null;
  setAdding: (v: string | null) => void;
}) {
  const loaded = items.itemsByType[type.id];
  const merged = mergeDraftItems(loaded, drafts, type.id);
  const loading = items.loadingTypeIds.has(type.id);
  const error = items.errorTypeIds.has(type.id);
  const addKey = `item:${type.id}:${scope.id}`;

  return (
    <div>
      <div className="group flex h-[26px] items-center gap-2 rounded-md pl-[20px] pr-1.5 hover:bg-muted">
        <span
          onClick={() => ctrl.toggle("scope", scope.id)}
          className="flex cursor-pointer items-center"
        >
          <CheckGlyph on={ctrl.has("scope", scope.id)} />
        </span>
        <span
          onClick={() => ctrl.toggle("scope", scope.id)}
          className={cn(
            "min-w-0 flex-1 cursor-pointer truncate text-[13px]",
            colorFg,
          )}
        >
          {scope.name}
        </span>
        <button
          type="button"
          onClick={onFlip}
          title="This scope's fields"
          className={cn(
            "flex h-5 shrink-0 items-center gap-0.5 rounded px-1 text-[10px] text-muted-foreground transition-opacity hover:bg-background hover:text-foreground",
            open ? "opacity-100" : "opacity-0 group-hover:opacity-100",
          )}
        >
          fields
          {open ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
        </button>
      </div>
      {open && (
        <div>
          {loading && merged.length === 0 ? (
            <div style={{ paddingLeft: 34 }}>
              <LoadingRow label="Loading fields…" />
            </div>
          ) : error ? (
            <div style={{ paddingLeft: 34 }}>
              <ErrorRow
                label="Couldn't load fields"
                onRetry={() => items.retry(type.id)}
              />
            </div>
          ) : (
            <>
              {merged.length === 0 && adding !== addKey && (
                <div style={{ paddingLeft: 34 }}>
                  <EmptyRow
                    label={`${type.label_singular} has no fields yet.`}
                  />
                </div>
              )}
              {merged.map((it) => {
                const pid = itemPickId(scope.id, it.id);
                return (
                  <DenseRow
                    key={it.id}
                    indent={2.4}
                    on={ctrl.has("item", pid)}
                    single={ctrl.single}
                    label={it.display_name}
                    sub={String(it.value_type)}
                    onClick={() => ctrl.toggle("item", pid)}
                  />
                );
              })}
              {adding === addKey ? (
                <InlineCreate
                  indent={2.4}
                  placeholder="New field name"
                  onCommit={(v) => {
                    drafts.createItem(type.id, v);
                    setAdding(null);
                  }}
                  onCancel={() => setAdding(null)}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setAdding(addKey)}
                  className="flex h-[22px] w-full items-center gap-1.5 rounded-md px-1.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
                  style={{ paddingLeft: 34 }}
                >
                  <Plus className="h-3 w-3" />
                  New field on every {type.label_singular.toLowerCase()}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
