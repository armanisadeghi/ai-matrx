"use client";

// features/scopes/components/context-assignment/ContextAssignmentField.tsx
//
// THE core context-assignment component — the one field for attaching any
// entity (file, note, agent, conversation, …) to the user's context structure:
// organization (default-but-changeable), scopes (multi, grouped by type),
// projects (all orgs + unassigned), tasks (independent of projects).
//
// It is designed to be rendered EVERYWHERE via thin wrappers
// (ContextAssignmentPopover / ContextAssignmentDialog / ContextAssignmentWindow),
// so the contracts below are load-bearing:
//
//   READS — core tree from Redux only (hydrated once at boot; refreshed only
//   by `refreshScopeTreeAfterMutation` on structural writes). Engagement data
//   (projects/tasks/items) via the module-cached `data.ts` layer. This
//   component NEVER fetches the tree and can never cause a request storm.
//
//   WRITES — `writeMode="live"` (default) writes scope assignments through the
//   canonical `useEntityScopes().setScopes` path (ctx_scope_assignments via
//   the scopesService chokepoint, incl. org adoption for org-less containers).
//   Project/task associations log loudly until the ctx_associations migration
//   lands. `writeMode="preview"` logs everything (design surfaces, demos).
//
//   MODES — "assignment" (durable tagging, multi-select) vs "active"
//   (ephemeral working-context, single-select per scope type + single
//   project/task). Active mode NEVER writes appContextSlice itself — that is
//   Surface A's exclusive right — it emits the selection via `onApplyActive`
//   for a Surface A host to dispatch.
//
//   ORG — always user-changeable (product decision 2026-06-10). Surfaces that
//   "enforce" an org just pass `defaultOrganizationId`; the field defaults to
//   the active org, else the richest org.
//
//   LAYOUT — fixed section height; selection never resizes anything. Width is
//   the parent's job (wrappers pass a fixed width).

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Building2,
  Briefcase,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  FolderOpen,
  Loader2,
  Plus,
  Save,
  Search,
  Wand2,
  X,
  FileText,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { useScopeTree } from "@/features/scopes/hooks/useScopeTree";
import { ensureScopeTree } from "@/features/scopes/redux/thunks/ensureScopeTree";
import { useEntityScopes } from "@/features/scopes/hooks/useEntityScopes";
import { selectActiveOrganizationId } from "@/features/scopes/redux/selectors/active-context";
import { resolveIcon } from "@/features/scope-system/utils/resolveIcon";
import { resolveColor } from "@/features/scope-system/constants/scope-colors";
import {
  fetchAssignableProjects,
  fetchAssignableTasks,
  invalidateAssignableData,
  type AssignableProject,
  type AssignableTask,
} from "./data";
import type {
  OrgNode,
  ScopeTypeNode,
  ScopeAssignmentEntityType,
} from "@/features/scopes/types";

/* ── public contract ─────────────────────────────────────────────────────── */

export interface ContextAssignmentSubject {
  /** Canonical entity type ("file", "note", "agent", …). */
  entityType: ScopeAssignmentEntityType;
  entityId: string;
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
}

export interface ContextSelection {
  organizationId: string | null;
  scopeIds: string[];
  projectIds: string[];
  taskIds: string[];
}

export interface ContextAssignmentSaveResult {
  ok: boolean;
  mode: "assignment" | "active";
  selection: ContextSelection;
  /** True when scope assignments were persisted to the DB this save. */
  wroteScopes: boolean;
  error?: string;
}

export interface ContextAssignmentFieldProps {
  subject: ContextAssignmentSubject;
  mode?: "assignment" | "active";
  /** "live" persists (scopes today; projects/tasks after ctx_associations).
   *  "preview" console.logs everything. Default: "live". */
  writeMode?: "live" | "preview";
  /** Enforced-context default. User can ALWAYS change it afterwards. */
  defaultOrganizationId?: string | null;
  /** Active mode only: receives the selection — the Surface A host dispatches. */
  onApplyActive?: (selection: ContextSelection) => void;
  onSaved?: (result: ContextAssignmentSaveResult) => void;
  onSelectionChange?: (selection: ContextSelection) => void;
  /** Fixed height of the scrolling section area (px). Default 440. */
  sectionHeight?: number;
  className?: string;
}

/* ── internal atoms (zero layout shift) ──────────────────────────────────── */

function CheckRow({
  on, label, right, onClick, textClass,
}: { on: boolean; label: string; right?: React.ReactNode; onClick: () => void; textClass?: string }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-muted">
      <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded border", on ? "border-primary bg-primary text-primary-foreground" : "border-border")}>
        {on && <Check className="h-3 w-3" />}
      </span>
      <span className={cn("min-w-0 flex-1 truncate", textClass)}>{label}</span>
      {right}
    </button>
  );
}

function MiniToggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" onClick={() => onChange(!on)} className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground">
      <span className={cn("relative inline-flex h-3.5 w-6 shrink-0 items-center rounded-full transition-colors", on ? "bg-primary" : "bg-muted-foreground/30")}>
        <span className={cn("inline-block h-2.5 w-2.5 rounded-full bg-white transition-transform", on ? "translate-x-3" : "translate-x-0.5")} />
      </span>
      {label}
    </button>
  );
}

function SectionShell({
  icon: Icon, title, count, onAdd, addLabel, children, headerExtra, iconClass, borderClass,
}: {
  icon: React.ComponentType<{ className?: string }>; title: string; count: number;
  onAdd: () => void; addLabel: string; children: React.ReactNode; headerExtra?: React.ReactNode;
  iconClass?: string; borderClass?: string;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className={cn("rounded-lg border", borderClass ?? "border-border")}>
      <div className="flex items-center gap-2 px-3 py-2">
        <button onClick={() => setOpen((o) => !o)} className="flex min-w-0 flex-1 items-center gap-2 text-sm font-medium">
          {open ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
          <Icon className={cn("h-4 w-4 shrink-0", iconClass ?? "text-muted-foreground")} />
          <span className={cn("truncate", iconClass)}>{title}</span>
          <span className="shrink-0 text-xs text-muted-foreground">{count}</span>
        </button>
        {headerExtra}
        <button onClick={onAdd} className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground">
          <Plus className="h-3.5 w-3.5" /> {addLabel}
        </button>
      </div>
      {open && <div className="border-t border-border p-1.5">{children}</div>}
    </div>
  );
}

function InlineAdd({ placeholder, onCommit, onCancel }: { placeholder: string; onCommit: (v: string) => void; onCancel: () => void }) {
  const [v, setV] = useState("");
  return (
    <div className="mb-1.5 flex items-center gap-1.5 px-1">
      <Input autoFocus value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") onCommit(v); if (e.key === "Escape") onCancel(); }} placeholder={placeholder} className="h-8" style={{ fontSize: "16px" }} />
      <Button size="sm" className="h-8" onClick={() => onCommit(v)}>Add</Button>
      <Button size="sm" variant="ghost" className="h-8 px-2" onClick={onCancel}><X className="h-4 w-4" /></Button>
    </div>
  );
}

function Chip({ label, onRemove, fg, border }: { label: string; onRemove: () => void; fg?: string; border?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md border bg-transparent px-2 py-1 text-xs font-medium", fg ?? "text-foreground", border ?? "border-border")}>
      <span className="max-w-[160px] truncate">{label}</span>
      <button onClick={onRemove} className="rounded p-0.5 hover:bg-muted"><X className="h-3 w-3" /></button>
    </span>
  );
}

/* ── the field ───────────────────────────────────────────────────────────── */

export function ContextAssignmentField({
  subject,
  mode = "assignment",
  writeMode = "live",
  defaultOrganizationId,
  onApplyActive,
  onSaved,
  onSelectionChange,
  sectionHeight = 440,
  className,
}: ContextAssignmentFieldProps) {
  const dispatch = useAppDispatch();
  const { organizations } = useScopeTree();
  const activeOrgId = useAppSelector(selectActiveOrganizationId);

  // Tree: idempotent ensure (no-refetch policy — a no-op when already loaded).
  useEffect(() => { void dispatch(ensureScopeTree({})); }, [dispatch]);

  // Engagement data via the shared cached layer (mount = engagement; wrappers
  // mount this content on open, so popovers/dialogs are lazy by construction).
  const [allProjects, setAllProjects] = useState<AssignableProject[]>([]);
  const [allTasks, setAllTasks] = useState<AssignableTask[]>([]);
  useEffect(() => {
    let alive = true;
    void fetchAssignableProjects().then((p) => { if (alive) setAllProjects(p); });
    void fetchAssignableTasks().then((t) => { if (alive) setAllTasks(t); });
    return () => { alive = false; };
  }, []);

  // Org: default → active → richest. Always changeable afterwards.
  const [orgId, setOrgId] = useState<string | null>(defaultOrganizationId ?? null);
  useEffect(() => {
    if (orgId || organizations.length === 0) return;
    const fallback = activeOrgId && organizations.some((o) => o.id === activeOrgId)
      ? activeOrgId
      : [...organizations].sort((a, b) => b.scope_types.length - a.scope_types.length)[0].id;
    setOrgId(defaultOrganizationId && organizations.some((o) => o.id === defaultOrganizationId) ? defaultOrganizationId : fallback);
  }, [organizations, orgId, defaultOrganizationId, activeOrgId]);
  const org: OrgNode | undefined = organizations.find((o) => o.id === orgId) ?? organizations[0];

  // Selection state
  const [query, setQuery] = useState("");
  const [selScopes, setSelScopes] = useState<Set<string>>(new Set());
  const [selProjects, setSelProjects] = useState<Set<string>>(new Set());
  const [selTasks, setSelTasks] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState<string | null>(null);
  const [showAllProjects, setShowAllProjects] = useState(false);
  const [showAllTasks, setShowAllTasks] = useState(false);
  const [addedScopes, setAddedScopes] = useState<{ id: string; name: string; typeId: string }[]>([]);
  const [addedProjects, setAddedProjects] = useState<AssignableProject[]>([]);
  const [addedTasks, setAddedTasks] = useState<AssignableTask[]>([]);
  const [busy, setBusy] = useState(false);

  // Existing assignments (assignment mode): hydrate the current scope tags
  // once per subject via the canonical per-entity cache — edits then diff
  // against reality instead of starting blank.
  const entityScopes = useEntityScopes({
    entityType: subject.entityType,
    entityId: mode === "assignment" ? subject.entityId : null,
    organizationId: org?.id,
  });
  const hydratedFor = useRef<string | null>(null);
  useEffect(() => {
    const key = `${subject.entityType}:${subject.entityId}`;
    if (mode !== "assignment" || hydratedFor.current === key) return;
    if (entityScopes.status !== "ready") return;
    hydratedFor.current = key;
    if (entityScopes.scopeIds.length > 0) setSelScopes(new Set(entityScopes.scopeIds));
  }, [mode, subject.entityType, subject.entityId, entityScopes.status, entityScopes.scopeIds]);

  // Reset on subject change (NOT on org change — org switch keeps cross-org
  // project/task picks and existing scope tags from other orgs are unioned).
  useEffect(() => {
    setSelScopes(new Set()); setSelProjects(new Set()); setSelTasks(new Set());
    setAddedScopes([]); setAddedProjects([]); setAddedTasks([]); setQuery("");
    hydratedFor.current = null;
  }, [subject.entityType, subject.entityId]);

  const q = query.trim().toLowerCase();
  const match = (s: string) => !q || s.toLowerCase().includes(q);

  const scopeTypes = useMemo(() => (org?.scope_types ?? []).map((t) => {
    const extra = addedScopes.filter((a) => a.typeId === t.id).map((a) => ({ id: a.id, name: a.name }));
    const all = [...t.scopes.map((s) => ({ id: s.id, name: s.name })), ...extra];
    return { type: t, scopes: all.filter((s) => match(s.name)), total: all.length };
  }), [org, addedScopes, q]);

  const inScope = (oid: string | null) => oid === org?.id || oid == null;
  const projOrgOf = (pid: string | null) => (pid ? [...allProjects, ...addedProjects].find((p) => p.id === pid)?.orgId ?? null : null);
  const taskOrg = (t: AssignableTask) => t.orgId ?? projOrgOf(t.projectId);
  const projects = useMemo(() => [...allProjects, ...addedProjects].filter((p) => match(p.name) && (showAllProjects || inScope(p.orgId))), [allProjects, addedProjects, q, showAllProjects, org?.id]);
  const tasks = useMemo(() => [...allTasks, ...addedTasks].filter((t) => match(t.title) && (showAllTasks || inScope(taskOrg(t)))), [allTasks, addedTasks, allProjects, addedProjects, q, showAllTasks, org?.id]);
  const hiddenProjects = useMemo(() => allProjects.filter((p) => !inScope(p.orgId)).length, [allProjects, org?.id]);
  const hiddenTasks = useMemo(() => allTasks.filter((t) => !inScope(taskOrg(t))).length, [allTasks, allProjects, addedProjects, org?.id]);

  const typeById = (id: string): ScopeTypeNode | undefined => org?.scope_types.find((t) => t.id === id);
  const typeOfScope = (id: string): ScopeTypeNode | undefined =>
    org?.scope_types.find((t) => t.scopes.some((s) => s.id === id)) ?? typeById(addedScopes.find((a) => a.id === id)?.typeId ?? "");
  const projName = (id: string) => [...allProjects, ...addedProjects].find((p) => p.id === id)?.name ?? id;
  const orgLabel = (oid: string | null) => (oid === org?.id ? "this org" : oid ? organizations.find((o) => o.id === oid)?.name ?? "other org" : "Unassigned");

  const derivedTypeIds = useMemo(() => { const s = new Set<string>(); selScopes.forEach((id) => { const t = typeOfScope(id); if (t) s.add(t.id); }); return s; }, [selScopes, org, addedScopes]);

  // Lateral suggestions from REAL project↔scope links (suggest, never force).
  const suggestions = useMemo(() => {
    if (mode === "active" || !org) return [] as { id: string; label: string; kind: "project" | "scope" }[];
    const out: { id: string; label: string; kind: "project" | "scope" }[] = [];
    const seen = new Set<string>();
    selScopes.forEach((sid) => {
      org.projects.forEach((p) => {
        if (p.scope_ids.includes(sid) && !selProjects.has(p.id) && !seen.has(p.id)) { seen.add(p.id); out.push({ id: p.id, label: p.name, kind: "project" }); }
      });
    });
    selProjects.forEach((pid) => {
      const p = org.projects.find((x) => x.id === pid);
      p?.scope_ids.forEach((sid) => {
        if (selScopes.has(sid) || seen.has(sid)) return;
        const sc = org.scope_types.flatMap((t) => t.scopes).find((s) => s.id === sid);
        if (sc) { seen.add(sid); out.push({ id: sid, label: sc.name, kind: "scope" }); }
      });
    });
    return out.slice(0, 4);
  }, [mode, selScopes, selProjects, org]);

  const toggle = (set: React.Dispatch<React.SetStateAction<Set<string>>>, id: string) =>
    set((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  function toggleScope(id: string) {
    if (mode === "assignment") return toggle(setSelScopes, id);
    const typeId = typeOfScope(id)?.id;
    setSelScopes((p) => {
      const n = new Set(p);
      if (n.has(id)) { n.delete(id); return n; }
      n.forEach((other) => { if (typeOfScope(other)?.id === typeId) n.delete(other); });
      n.add(id);
      return n;
    });
  }
  const toggleSingle = (set: React.Dispatch<React.SetStateAction<Set<string>>>) => (id: string) =>
    set((p) => (p.has(id) ? new Set<string>() : new Set([id])));
  const toggleProject = mode === "active" ? toggleSingle(setSelProjects) : (id: string) => toggle(setSelProjects, id);
  const toggleTask = mode === "active" ? toggleSingle(setSelTasks) : (id: string) => toggle(setSelTasks, id);

  const selection: ContextSelection = useMemo(() => ({
    organizationId: org?.id ?? null,
    scopeIds: [...selScopes],
    projectIds: [...selProjects],
    taskIds: [...selTasks],
  }), [org?.id, selScopes, selProjects, selTasks]);

  useEffect(() => { onSelectionChange?.(selection); }, [selection]);

  /* quick-adds */
  async function addScope(typeId: string, name: string) {
    const v = name.trim(); if (!v || !org) return;
    if (writeMode === "live") {
      try {
        const { createScope } = await import("@/features/agent-context/redux/scope/scopesSlice");
        const created = await dispatch(createScope({ org_id: org.id, type_id: typeId, name: v })).unwrap();
        setSelScopes((p) => new Set(p).add(created.id));
        setAdding(null);
        toast.success(`Created "${v}"`);
        // No manual tree refresh here: scopeTreeInvalidationMiddleware watches
        // scopes/create/fulfilled and refreshes the tree app-wide once.
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't create the scope");
      }
      return;
    }
    const id = `new:scope:${typeId}:${v}`;
    console.log("[context-assignment] create scope (preview) →", { org_id: org.id, scope_type_id: typeId, name: v });
    setAddedScopes((p) => [...p, { id, name: v, typeId }]); setSelScopes((p) => new Set(p).add(id)); setAdding(null);
  }
  async function addTask(title: string) {
    const v = title.trim(); if (!v) return;
    if (writeMode === "live") {
      try {
        const { quickCreateTask } = await import("@/features/tasks/services/taskService");
        const t = await quickCreateTask(v);
        if (!t) throw new Error("Task creation returned nothing");
        invalidateAssignableData("tasks");
        setAddedTasks((p) => [...p, { id: t.id, title: v, projectId: null, orgId: null, status: "incomplete" }]);
        setSelTasks((p) => new Set(p).add(t.id)); setAdding(null);
        toast.success(`Created task "${v}"`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't create the task");
      }
      return;
    }
    const id = `new:task:${v}`;
    console.log("[context-assignment] create task (preview) →", { title: v });
    setAddedTasks((p) => [...p, { id, title: v, projectId: null, orgId: org?.id ?? null, status: "incomplete" }]);
    setSelTasks((p) => new Set(p).add(id)); setAdding(null);
  }
  function addProject(name: string) {
    const v = name.trim(); if (!v) return;
    // Live project creation carries slug/membership semantics — wired during
    // per-surface rollout. Loud in live mode so it can't silently no-op.
    if (writeMode === "live") console.warn("[context-assignment] live project quick-add not wired yet — logged only");
    console.log("[context-assignment] create project →", { name: v, org_id: org?.id ?? null });
    const id = `new:project:${v}`;
    setAddedProjects((p) => [...p, { id, name: v, orgId: org?.id ?? null, isPersonal: false }]);
    setSelProjects((p) => new Set(p).add(id)); setAdding(null);
  }

  /* save */
  async function save() {
    setBusy(true);
    try {
      if (mode === "active") {
        if (onApplyActive) onApplyActive(selection);
        else console.log("[context-assignment] ACTIVE selection (no Surface A host wired) →", selection);
        onSaved?.({ ok: true, mode, selection, wroteScopes: false });
        toast.success("Context applied");
        return;
      }
      if (writeMode === "preview") {
        console.log("[context-assignment] SAVE (preview) →", {
          entity: { entity_type: subject.entityType, entity_id: subject.entityId, name: subject.title },
          ...selection,
          derived_spine: [...derivedTypeIds].map((id) => typeById(id)?.label_plural).filter(Boolean).concat(org?.name ?? []),
        });
        onSaved?.({ ok: true, mode, selection, wroteScopes: false });
        toast.success("Saved (logged to console — no DB write)");
        return;
      }
      // LIVE: scopes through the canonical chokepoint (replaces the set).
      const realScopeIds = selection.scopeIds.filter((id) => !id.startsWith("new:"));
      const res = await entityScopes.setScopes(realScopeIds);
      if (!res.ok) {
        toast.error(res.error ?? "Failed to save scope assignments");
        onSaved?.({ ok: false, mode, selection, wroteScopes: false, error: res.error });
        return;
      }
      if (selection.projectIds.length > 0 || selection.taskIds.length > 0) {
        // Loud until ctx_associations lands — never a silent partial save.
        console.warn("[context-assignment] project/task associations await the ctx_associations migration — logged only", {
          entity: { entity_type: subject.entityType, entity_id: subject.entityId },
          projectIds: selection.projectIds, taskIds: selection.taskIds,
        });
        toast.info("Scopes saved. Project/task links recorded for the upcoming migration.");
      } else {
        toast.success("Saved");
      }
      onSaved?.({ ok: true, mode, selection, wroteScopes: true });
    } finally {
      setBusy(false);
    }
  }

  const totalSelected = selScopes.size + selProjects.size + selTasks.size;
  const SubIcon = subject.icon ?? FileText;
  const loadingTree = organizations.length === 0;

  return (
    <div className={cn("overflow-hidden rounded-xl border border-border bg-card", className)}>
      {/* subject */}
      <div className="flex items-center gap-3 border-b border-border p-4">
        <div className="rounded-lg bg-muted p-2 text-muted-foreground"><SubIcon className="h-5 w-5" /></div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{subject.title}</div>
          {subject.subtitle && <div className="truncate text-xs text-muted-foreground">{subject.subtitle}</div>}
        </div>
      </div>

      <div className="space-y-3 p-4">
        {/* org + search */}
        <div className="flex items-center gap-2">
          <Select value={org?.id ?? ""} onValueChange={setOrgId}>
            <SelectTrigger className="h-9 w-[260px] shrink-0">
              {/* div (not span): the trigger's [&>span]:line-clamp-1 forces
                  -webkit-box display and would break this flex row */}
              <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
                <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-left"><SelectValue placeholder="Organization" /></span>
              </div>
            </SelectTrigger>
            <SelectContent>
              {organizations.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}{o.is_personal ? " (personal)" : ""}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search scopes, projects, tasks…" className="h-9 pl-9" style={{ fontSize: "16px" }} />
          </div>
        </div>

        {/* sections — fixed height: expanding/collapsing never resizes the card */}
        <div className="space-y-2 overflow-y-auto pr-1" style={{ height: sectionHeight }}>
          {loadingTree ? (
            <div className="flex h-full items-center justify-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading your context…</div>
          ) : (
            <>
              {scopeTypes.length === 0 && <div className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">This organization has no scopes yet.</div>}
              {scopeTypes.map(({ type, scopes, total }) => {
                const Icon = resolveIcon(type.icon);
                const c = resolveColor(type);
                return (
                  <SectionShell key={type.id} icon={Icon} iconClass={c.fg} borderClass={c.border} title={type.label_plural} count={total} addLabel={`New ${type.label_singular}`} onAdd={() => setAdding(type.id)}>
                    {adding === type.id && <InlineAdd placeholder={`New ${type.label_singular.toLowerCase()} name`} onCommit={(v) => void addScope(type.id, v)} onCancel={() => setAdding(null)} />}
                    {scopes.length === 0 ? (
                      <div className="px-2.5 py-1.5 text-xs text-muted-foreground">{q ? "No matches." : `No ${type.label_plural.toLowerCase()} yet.`}</div>
                    ) : scopes.map((s) => <CheckRow key={s.id} on={selScopes.has(s.id)} label={s.name} textClass={c.fg} onClick={() => toggleScope(s.id)} />)}
                  </SectionShell>
                );
              })}

              <SectionShell icon={Briefcase} title="Projects" count={projects.length} addLabel="New project" onAdd={() => setAdding("project")}
                headerExtra={hiddenProjects > 0 || showAllProjects ? <MiniToggle on={showAllProjects} onChange={setShowAllProjects} label={showAllProjects ? "All orgs" : `Show all (${hiddenProjects})`} /> : undefined}>
                {adding === "project" && <InlineAdd placeholder="New project name" onCommit={addProject} onCancel={() => setAdding(null)} />}
                {projects.length === 0 ? <div className="px-2.5 py-1.5 text-xs text-muted-foreground">{q ? "No matches." : "No projects yet."}</div>
                  : projects.map((p) => <CheckRow key={p.id} on={selProjects.has(p.id)} label={p.name} right={<span className="max-w-[45%] shrink-0 truncate text-[11px] text-muted-foreground">{orgLabel(p.orgId)}</span>} onClick={() => toggleProject(p.id)} />)}
              </SectionShell>

              <SectionShell icon={FolderOpen} title="Tasks" count={tasks.length} addLabel="New task" onAdd={() => setAdding("task")}
                headerExtra={hiddenTasks > 0 || showAllTasks ? <MiniToggle on={showAllTasks} onChange={setShowAllTasks} label={showAllTasks ? "All orgs" : `Show all (${hiddenTasks})`} /> : undefined}>
                {adding === "task" && <InlineAdd placeholder="New task title" onCommit={(v) => void addTask(v)} onCancel={() => setAdding(null)} />}
                {tasks.length === 0 ? <div className="px-2.5 py-1.5 text-xs text-muted-foreground">{q ? "No matches." : "No tasks yet."}</div>
                  : tasks.map((t) => <CheckRow key={t.id} on={selTasks.has(t.id)} label={t.title} right={<span className="flex max-w-[45%] shrink items-center gap-1 text-[11px] text-muted-foreground">{t.status === "completed" ? <CheckCircle2 className="h-3 w-3 shrink-0" /> : <Circle className="h-3 w-3 shrink-0" />}<span className="truncate">{t.projectId ? projName(t.projectId) : "No project"}</span></span>} onClick={() => toggleTask(t.id)} />)}
              </SectionShell>
            </>
          )}
        </div>

        {/* footer */}
        <div className="flex items-start justify-between gap-3 border-t border-border pt-3">
          <div className="max-h-16 min-w-0 flex-1 overflow-y-auto">
            {totalSelected === 0 ? (
              <span className="text-xs text-muted-foreground">{mode === "active" ? "No active context set — the agent gets none." : "Nothing selected — saving with no associations is fine."}</span>
            ) : (
              <div className="flex flex-wrap items-center gap-1.5">
                {[...selScopes].map((id) => { const name = [...(org?.scope_types.flatMap((x) => x.scopes) ?? []), ...addedScopes].find((s) => s.id === id)?.name ?? id; const t = typeOfScope(id); const c = t ? resolveColor(t) : undefined; return <Chip key={id} label={name} fg={c?.fg} border={c?.border} onRemove={() => toggle(setSelScopes, id)} />; })}
                {[...selProjects].map((id) => <Chip key={id} label={projName(id)} onRemove={() => toggle(setSelProjects, id)} />)}
                {[...selTasks].map((id) => <Chip key={id} label={[...allTasks, ...addedTasks].find((t) => t.id === id)?.title ?? id} onRemove={() => toggle(setSelTasks, id)} />)}
                {[...derivedTypeIds].map((tid) => <span key={tid} className="inline-flex items-center gap-1 rounded-md border border-dashed border-border px-2 py-1 text-xs text-muted-foreground">{typeById(tid)?.label_plural}<span className="text-[9px] uppercase opacity-70">auto</span></span>)}
                {org && <span className="inline-flex items-center gap-1 rounded-md border border-dashed border-border px-2 py-1 text-xs text-muted-foreground">{org.name}<span className="text-[9px] uppercase opacity-70">auto</span></span>}
                {suggestions.map((s) => (
                  <button key={s.id} onClick={() => (s.kind === "project" ? toggleProject(s.id) : toggleScope(s.id))} title={s.kind === "project" ? "This scope is in this project — attach there too?" : "This project is linked to this scope — file it scope-wide?"} className="inline-flex items-center gap-1 rounded-md border border-dashed border-amber-400/60 px-2 py-1 text-xs text-amber-700 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-950/40">
                    <Wand2 className="h-3 w-3" />{s.label}<Plus className="h-3 w-3" />
                  </button>
                ))}
              </div>
            )}
          </div>
          <Button size="sm" onClick={() => void save()} disabled={busy || loadingTree} className="shrink-0">
            {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
            {mode === "active" ? "Set context" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}
