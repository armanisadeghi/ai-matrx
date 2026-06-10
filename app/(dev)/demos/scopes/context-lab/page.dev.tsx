"use client";

// /demos/scopes/context-lab
//
// REAL-DATA lab for the ContextAssignmentField. Every entity shown is real —
// your actual orgs / scope types / scopes / projects / tasks / files, pulled
// live. Only the *save* is faked (console.log). The boxed component on the left
// is exactly the user UI; all reviewer commentary lives outside, on the right.
//
// Style: modeled after Linear's property/label picker — grouped sections of
// left-checkbox rows (no toggle-pills, so selecting never resizes anything).

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  FileText,
  Search,
  Plus,
  Check,
  Building2,
  Save,
  X,
  Loader2,
  FolderOpen,
  Briefcase,
  ChevronDown,
  ChevronRight,
  Lightbulb,
  AlertTriangle,
  Circle,
  CheckCircle2,
  MessageSquare,
  Layers,
  Network,
  Lock,
  ListChecks,
  CornerDownRight,
  Ban,
  ArrowRight,
  Wand2,
  GitBranch,
  ShieldCheck,
  ShieldAlert,
  Bell,
  Database,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectActiveOrganizationId,
  selectActiveOrganizationName,
  selectActiveProjectId,
  selectActiveScopeSelections,
} from "@/features/scopes/redux/selectors/active-context";
import { useScopeTree } from "@/features/scopes/hooks/useScopeTree";
import { ensureScopeTree } from "@/features/scopes/redux/thunks/ensureScopeTree";
import { resolveIcon } from "@/features/scope-system/utils/resolveIcon";
import { resolveColor } from "@/features/scope-system/constants/scope-colors";
import { listFiles } from "@/features/files/api/files";
import { getUserProjects } from "@/features/projects/service";
import { getUserTasks } from "@/features/tasks/services/taskService";
import { scopesService } from "@/features/scopes/service/scopesService";
import type { OrgNode, ScopeTypeNode, ContextItemRow, ContextItemValue } from "@/features/scopes/types";

interface DemoFile { id: string; file_name: string; mime_type?: string | null }
interface FlatProject { id: string; name: string; orgId: string | null; isPersonal: boolean }
interface FlatTask { id: string; title: string; projectId: string | null; orgId: string | null; status: string | null }

type Target =
  | { kind: "scope"; id: string; label: string; typeId: string }
  | { kind: "project"; id: string; label: string }
  | { kind: "task"; id: string; label: string };

/* ───────────────────────── reusable row (zero layout shift) ───────────────── */

function CheckRow({
  on, label, right, onClick, textClass,
}: { on: boolean; label: string; right?: React.ReactNode; onClick: () => void; textClass?: string }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-muted"
    >
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
  icon: Icon, title, count, onAdd, addLabel, children, headerExtra, iconClass, borderClass, collapsible = true,
}: {
  icon: React.ComponentType<{ className?: string }>; title: string; count: number;
  onAdd: () => void; addLabel: string; children: React.ReactNode; headerExtra?: React.ReactNode;
  iconClass?: string; borderClass?: string; collapsible?: boolean;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className={cn("rounded-lg border", borderClass ?? "border-border")}>
      <div className="flex items-center gap-2 px-3 py-2">
        <button onClick={() => collapsible && setOpen((o) => !o)} className="flex min-w-0 flex-1 items-center gap-2 text-sm font-medium">
          {collapsible ? (open ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />) : <span className="w-4" />}
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

function InlineAdd({
  placeholder, onCommit, onCancel,
}: { placeholder: string; onCommit: (v: string) => void; onCancel: () => void }) {
  const [v, setV] = useState("");
  return (
    <div className="mb-1.5 flex items-center gap-1.5 px-1">
      <Input autoFocus value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") onCommit(v); if (e.key === "Escape") onCancel(); }} placeholder={placeholder} className="h-8" style={{ fontSize: "16px" }} />
      <Button size="sm" className="h-8" onClick={() => onCommit(v)}>Add</Button>
      <Button size="sm" variant="ghost" className="h-8 px-2" onClick={onCancel}><X className="h-4 w-4" /></Button>
    </div>
  );
}

/* ───────────────────────── the component (user UI) ────────────────────────── */

interface Subject { icon: LucideIcon; title: string; sub: string; entity?: { type: string; id: string } }

export interface LiveRow { table: string; cols: string }

function ContextField({
  mode, subject, org, orgs, onChangeOrg, allProjects, allTasks, onRowsChange,
}: {
  mode: "assignment" | "active"; subject: Subject;
  org: OrgNode; orgs: OrgNode[]; onChangeOrg: (id: string) => void;
  allProjects: FlatProject[]; allTasks: FlatTask[];
  /** Reports the exact rows the current selection would write (for the live data panel). */
  onRowsChange?: (rows: LiveRow[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [selScopes, setSelScopes] = useState<Set<string>>(new Set());
  const [selProjects, setSelProjects] = useState<Set<string>>(new Set());
  const [selTasks, setSelTasks] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState<string | null>(null); // typeId | 'project' | 'task'
  const [showAllProjects, setShowAllProjects] = useState(false);
  const [showAllTasks, setShowAllTasks] = useState(false);
  const [addedScopes, setAddedScopes] = useState<{ id: string; name: string; typeId: string }[]>([]);
  const [addedProjects, setAddedProjects] = useState<FlatProject[]>([]);
  const [addedTasks, setAddedTasks] = useState<FlatTask[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => { setSelScopes(new Set()); setSelProjects(new Set()); setSelTasks(new Set()); setAddedScopes([]); setAddedProjects([]); setAddedTasks([]); setQuery(""); }, [org.id, subject.title]);

  const q = query.trim().toLowerCase();
  const match = (s: string) => !q || s.toLowerCase().includes(q);

  const scopeTypes = useMemo(() => org.scope_types.map((t) => {
    const extra = addedScopes.filter((a) => a.typeId === t.id).map((a) => ({ id: a.id, name: a.name }));
    const all = [...t.scopes.map((s) => ({ id: s.id, name: s.name })), ...extra];
    return { type: t, scopes: all.filter((s) => match(s.name)), total: all.length };
  }), [org, addedScopes, q]);

  // Default: only this-org + unassigned (no org). "Show all" reveals other orgs'.
  const inScope = (oid: string | null) => oid === org.id || oid == null;
  // A task follows its parent: its org is its own, else its project's org.
  const projOrgOf = (pid: string | null) => (pid ? [...allProjects, ...addedProjects].find((p) => p.id === pid)?.orgId ?? null : null);
  const taskOrg = (t: FlatTask) => t.orgId ?? projOrgOf(t.projectId);
  const projects = useMemo(() => [...allProjects, ...addedProjects].filter((p) => match(p.name) && (showAllProjects || inScope(p.orgId))), [allProjects, addedProjects, q, showAllProjects, org.id]);
  const tasks = useMemo(() => [...allTasks, ...addedTasks].filter((t) => match(t.title) && (showAllTasks || inScope(taskOrg(t)))), [allTasks, addedTasks, allProjects, addedProjects, q, showAllTasks, org.id]);
  const hiddenProjects = useMemo(() => [...allProjects].filter((p) => !inScope(p.orgId)).length, [allProjects, org.id]);
  const hiddenTasks = useMemo(() => [...allTasks].filter((t) => !inScope(taskOrg(t))).length, [allTasks, allProjects, addedProjects, org.id]);

  const typeById = (id: string): ScopeTypeNode | undefined => org.scope_types.find((t) => t.id === id);
  const typeOfScope = (id: string): ScopeTypeNode | undefined => org.scope_types.find((t) => t.scopes.some((s) => s.id === id)) ?? typeById(addedScopes.find((a) => a.id === id)?.typeId ?? "");
  const projName = (id: string) => [...allProjects, ...addedProjects].find((p) => p.id === id)?.name ?? id;
  const orgLabel = (orgId: string | null) => orgId === org.id ? "this org" : orgId ? orgs.find((o) => o.id === orgId)?.name ?? "other org" : "Unassigned";

  const derivedTypeIds = useMemo(() => { const s = new Set<string>(); selScopes.forEach((id) => { const t = typeOfScope(id); if (t) s.add(t.id); }); return s; }, [selScopes, org, addedScopes]);

  // Lateral suggestions (REAL links via ctx_scope_assignments → ProjectNode.scope_ids):
  //  - a selected scope sits in a project → suggest attaching the project too
  //  - a selected project has linked scopes → suggest the scope ("looks scope-wide")
  // Suggest-don't-force: one click to accept, never auto-written (arch §4).
  const suggestions = useMemo(() => {
    if (mode === "active") return [] as { id: string; label: string; kind: "project" | "scope" }[];
    const out: { id: string; label: string; kind: "project" | "scope" }[] = [];
    const seen = new Set<string>();
    selScopes.forEach((sid) => {
      org.projects.forEach((p) => {
        if (p.scope_ids.includes(sid) && !selProjects.has(p.id) && !seen.has(p.id)) {
          seen.add(p.id);
          out.push({ id: p.id, label: p.name, kind: "project" });
        }
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

  const toggle = (set: React.Dispatch<React.SetStateAction<Set<string>>>, id: string) => set((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // Active context resolves to ONE scope per type and one project/task — picking
  // replaces within the group instead of accumulating (assignment stays multi).
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

  // Report the exact rows this selection would write (live data panel).
  useEffect(() => {
    if (!onRowsChange) return;
    if (mode === "active") return;
    const eShort = (subject.entity?.id ?? "").slice(0, 8) || "?";
    const rows: LiveRow[] = [
      ...[...selScopes].map((id) => ({ table: "ctx_associations", cols: `(source='${subject.entity?.type}':${eShort}, target='scope':${[...org.scope_types.flatMap((t) => t.scopes), ...addedScopes].find((s) => s.id === id)?.name ?? id})` })),
      ...[...selProjects].map((id) => ({ table: "ctx_associations", cols: `(source='${subject.entity?.type}':${eShort}, target='project':${projName(id)})` })),
      ...[...selTasks].map((id) => ({ table: "ctx_associations", cols: `(source='${subject.entity?.type}':${eShort}, target='task':${[...allTasks, ...addedTasks].find((t) => t.id === id)?.title ?? id})` })),
    ];
    onRowsChange(rows);
  }, [selScopes, selProjects, selTasks, mode]);

  function addScope(typeId: string, name: string) {
    const v = name.trim(); if (!v) return;
    const id = `new:scope:${typeId}:${v}`;
    console.log("[context-lab] create scope →", { org_id: org.id, scope_type_id: typeId, name: v });
    setAddedScopes((p) => [...p, { id, name: v, typeId }]); setSelScopes((p) => new Set(p).add(id)); setAdding(null);
    toast.success(`Added "${v}" (logged — no DB write)`);
  }
  function addProject(name: string) {
    const v = name.trim(); if (!v) return; const id = `new:project:${v}`;
    console.log("[context-lab] create project →", { name: v, org_id: org.id });
    setAddedProjects((p) => [...p, { id, name: v, orgId: org.id, isPersonal: false }]); setSelProjects((p) => new Set(p).add(id)); setAdding(null);
    toast.success(`Added project "${v}" (logged — no DB write)`);
  }
  function addTask(title: string) {
    const v = title.trim(); if (!v) return; const id = `new:task:${v}`;
    console.log("[context-lab] create task →", { title: v });
    setAddedTasks((p) => [...p, { id, title: v, projectId: null, orgId: org.id, status: "incomplete" }]); setSelTasks((p) => new Set(p).add(id)); setAdding(null);
    toast.success(`Added task "${v}" (logged — no DB write)`);
  }

  function save() {
    setBusy(true);
    if (mode === "active") {
      // Active context = ephemeral "what I'm working on now" → appContextSlice
      // (one scope per type is the canonical resolution; we log the raw picks).
      const payload = {
        kind: "active_context",
        organization_id: org.id,
        scope_selections: [...selScopes],
        project_id: [...selProjects][0] ?? null,
        task_id: [...selTasks][0] ?? null,
      };
      console.log("[context-lab] SET ACTIVE CONTEXT (appContextSlice) →", payload);
      setTimeout(() => { setBusy(false); toast.success("Active context set (logged — no real write)"); }, 350);
      return;
    }
    const explicit: Target[] = [
      ...[...selScopes].map((id): Target => ({ kind: "scope", id, label: "", typeId: typeOfScope(id)?.id ?? "" })),
      ...[...selProjects].map((id): Target => ({ kind: "project", id, label: projName(id) })),
      ...[...selTasks].map((id): Target => ({ kind: "task", id, label: "" })),
    ];
    const payload = {
      entity: { entity_type: subject.entity?.type ?? "unknown", entity_id: subject.entity?.id ?? "", name: subject.title },
      organization_id: org.id,
      explicit_associations: explicit.map((t) => ({ target_type: t.kind, target_id: t.id })),
      derived_spine: [...derivedTypeIds].map((id) => typeById(id)?.label_plural).filter(Boolean).concat(org.name),
    };
    console.log("[context-lab] SAVE association payload →", payload);
    setTimeout(() => { setBusy(false); toast.success("Saved (logged to console — no DB write)"); }, 350);
  }

  const totalSelected = selScopes.size + selProjects.size + selTasks.size;

  const SubIcon = subject.icon;
  return (
    <Card className="w-[680px] max-w-full overflow-hidden">
      {/* subject */}
      <div className="flex items-center gap-3 border-b border-border p-4">
        <div className="rounded-lg bg-muted p-2 text-muted-foreground"><SubIcon className="h-5 w-5" /></div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{subject.title}</div>
          <div className="text-xs text-muted-foreground">{subject.sub}</div>
        </div>
      </div>

      <div className="space-y-3 p-4">
        {/* org + search on one row */}
        <div className="flex items-center gap-2">
          <Select value={org.id} onValueChange={onChangeOrg}>
            <SelectTrigger className="h-9 w-[260px] shrink-0">
              {/* div (not span) so the trigger's [&>span]:line-clamp-1 — which forces
                  display:-webkit-box and breaks flex — never lands on our row */}
              <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
                <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-left"><SelectValue /></span>
              </div>
            </SelectTrigger>
            <SelectContent>
              {orgs.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}{o.is_personal ? " (personal)" : ""}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search scopes, projects, tasks…" className="h-9 pl-9" style={{ fontSize: "16px" }} />
          </div>
        </div>

        {/* sections — FIXED height so showing/hiding/expanding never resizes the card */}
        <div className="h-[440px] space-y-2 overflow-y-auto pr-1">
          {scopeTypes.length === 0 && <div className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">This organization has no scopes yet.</div>}

          {scopeTypes.map(({ type, scopes, total }) => {
            const Icon = resolveIcon(type.icon);
            const c = resolveColor(type);
            return (
              <SectionShell key={type.id} icon={Icon} iconClass={c.fg} borderClass={c.border} title={type.label_plural} count={total} addLabel={`New ${type.label_singular}`} onAdd={() => setAdding(type.id)}>
                {adding === type.id && <InlineAdd placeholder={`New ${type.label_singular.toLowerCase()} name`} onCommit={(v) => addScope(type.id, v)} onCancel={() => setAdding(null)} />}
                {scopes.length === 0 ? (
                  <div className="px-2.5 py-1.5 text-xs text-muted-foreground">{q ? "No matches." : `No ${type.label_plural.toLowerCase()} yet.`}</div>
                ) : scopes.map((s) => <CheckRow key={s.id} on={selScopes.has(s.id)} label={s.name} textClass={c.fg} onClick={() => toggleScope(s.id)} />)}
              </SectionShell>
            );
          })}

          {/* projects — this org + unassigned by default; "Show all" reveals other orgs' */}
          <SectionShell icon={Briefcase} title="Projects" count={projects.length} addLabel="New project" onAdd={() => setAdding("project")}
            headerExtra={hiddenProjects > 0 || showAllProjects ? <MiniToggle on={showAllProjects} onChange={setShowAllProjects} label={showAllProjects ? "All orgs" : `Show all (${hiddenProjects})`} /> : undefined}>
            {adding === "project" && <InlineAdd placeholder="New project name" onCommit={addProject} onCancel={() => setAdding(null)} />}
            {projects.length === 0 ? <div className="px-2.5 py-1.5 text-xs text-muted-foreground">{q ? "No matches." : "No projects yet."}</div>
              : projects.map((p) => <CheckRow key={p.id} on={selProjects.has(p.id)} label={p.name} right={<span className="max-w-[45%] shrink-0 truncate text-[11px] text-muted-foreground">{orgLabel(p.orgId)}</span>} onClick={() => toggleProject(p.id)} />)}
          </SectionShell>

          {/* tasks — independent of projects; same this-org+unassigned default */}
          <SectionShell icon={FolderOpen} title="Tasks" count={tasks.length} addLabel="New task" onAdd={() => setAdding("task")}
            headerExtra={hiddenTasks > 0 || showAllTasks ? <MiniToggle on={showAllTasks} onChange={setShowAllTasks} label={showAllTasks ? "All orgs" : `Show all (${hiddenTasks})`} /> : undefined}>
            {adding === "task" && <InlineAdd placeholder="New task title" onCommit={addTask} onCancel={() => setAdding(null)} />}
            {tasks.length === 0 ? <div className="px-2.5 py-1.5 text-xs text-muted-foreground">{q ? "No matches." : "No tasks yet."}</div>
              : tasks.map((t) => <CheckRow key={t.id} on={selTasks.has(t.id)} label={t.title} right={<span className="flex max-w-[45%] shrink items-center gap-1 text-[11px] text-muted-foreground">{t.status === "completed" ? <CheckCircle2 className="h-3 w-3 shrink-0" /> : <Circle className="h-3 w-3 shrink-0" />}<span className="truncate">{t.projectId ? projName(t.projectId) : "No project"}</span></span>} onClick={() => toggleTask(t.id)} />)}
          </SectionShell>
        </div>

        {/* footer: one tight row — selection summary left, Save right */}
        <div className="flex items-start justify-between gap-3 border-t border-border pt-3">
          <div className="max-h-16 min-w-0 flex-1 overflow-y-auto">
            {totalSelected === 0 ? (
              <span className="text-xs text-muted-foreground">{mode === "active" ? "No active context set — the agent gets none." : "Nothing selected — saving with no associations is fine."}</span>
            ) : (
              <div className="flex flex-wrap items-center gap-1.5">
                {[...selScopes].map((id) => { const name = [...org.scope_types.flatMap((x) => x.scopes), ...addedScopes].find((s) => s.id === id)?.name ?? id; const t = typeOfScope(id); const c = t ? resolveColor(t) : undefined; return <Chip key={id} label={name} fg={c?.fg} border={c?.border} onRemove={() => toggle(setSelScopes, id)} />; })}
                {[...selProjects].map((id) => <Chip key={id} label={projName(id)} onRemove={() => toggle(setSelProjects, id)} />)}
                {[...selTasks].map((id) => <Chip key={id} label={[...allTasks, ...addedTasks].find((t) => t.id === id)?.title ?? id} onRemove={() => toggle(setSelTasks, id)} />)}
                {[...derivedTypeIds].map((tid) => <span key={tid} className="inline-flex items-center gap-1 rounded-md border border-dashed border-border px-2 py-1 text-xs text-muted-foreground">{typeById(tid)?.label_plural}<span className="text-[9px] uppercase opacity-70">auto</span></span>)}
                <span className="inline-flex items-center gap-1 rounded-md border border-dashed border-border px-2 py-1 text-xs text-muted-foreground">{org.name}<span className="text-[9px] uppercase opacity-70">auto</span></span>
                {suggestions.map((s) => (
                  <button key={s.id} onClick={() => (s.kind === "project" ? toggleProject(s.id) : toggleScope(s.id))} title={s.kind === "project" ? "This scope is in this project — attach there too?" : "This project is linked to this scope — file it scope-wide?"} className="inline-flex items-center gap-1 rounded-md border border-dashed border-amber-400/60 px-2 py-1 text-xs text-amber-700 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-950/40">
                    <Wand2 className="h-3 w-3" />{s.label}<Plus className="h-3 w-3" />
                  </button>
                ))}
              </div>
            )}
          </div>
          <Button size="sm" onClick={save} disabled={busy} className="shrink-0">{busy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}{mode === "active" ? "Set context" : "Save"}</Button>
        </div>
      </div>
    </Card>
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

/* ───────────────────────── assign-to-context-item (the cascade flagship) ───── */

const FILE_FIT = new Set(["document", "reference", "file"]);

function AssignToItemPanel({ file, orgs }: { file: DemoFile; orgs: OrgNode[] }) {
  const [scopeId, setScopeId] = useState<string | null>(null);
  const [itemsByType, setItemsByType] = useState<Record<string, ContextItemRow[]>>({});
  const [loadingType, setLoadingType] = useState<string | null>(null);
  const [itemId, setItemId] = useState<string | null>(null);
  const [assigned, setAssigned] = useState(false);

  // Scope-FIRST: every scope across every org. Picking one DERIVES its org —
  // the user never has to pick an org (they usually don't have one set).
  const scopeOptions = useMemo(() => orgs.flatMap((o) => o.scope_types.flatMap((t) => t.scopes.map((s) => ({ id: s.id, name: s.name, type: t, org: o })))), [orgs]);
  const scope = scopeOptions.find((s) => s.id === scopeId);
  const type = scope?.type;
  const org = scope?.org;

  // reset item + result when the scope changes
  useEffect(() => { setItemId(null); setAssigned(false); }, [scopeId]);

  // load the selected scope's TYPE's real context items (cached per type)
  useEffect(() => {
    if (!type || itemsByType[type.id]) return;
    setLoadingType(type.id);
    scopesService.listContextItems(type.id)
      .then((r) => { if (r.ok) setItemsByType((p) => ({ ...p, [type.id]: r.data.items })); })
      .finally(() => setLoadingType(null));
  }, [type?.id]);

  const items = type ? itemsByType[type.id] ?? [] : [];
  const item = items.find((i) => i.id === itemId);
  const fits = item ? FILE_FIT.has(String(item.value_type)) : false;
  const c = type ? resolveColor(type) : undefined;

  function assign() {
    if (!scope || !item || !type) return;
    // The future write: ONE ctx_context_item_values row, value_kind='reference'.
    console.log("[context-lab] ASSIGN file → context item (future reference value) →", {
      table: "ctx_context_item_values",
      scope_id: scope.id, context_item_id: item.id,
      value_kind: "reference", ref_entity_type: "user_file", ref_entity_id: file.id,
    });
    setAssigned(true);
    toast.success(`Set as ${scope.name}'s ${item.display_name} (logged — no DB write)`);
  }

  return (
    <Card className="w-[680px] max-w-full overflow-hidden">
      <div className="flex items-center gap-3 border-b border-border p-4">
        <div className="rounded-lg bg-muted p-2 text-muted-foreground"><FileText className="h-5 w-5" /></div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{file.file_name}</div>
          <div className="text-xs text-muted-foreground">{file.mime_type || "file"}</div>
        </div>
      </div>

      <div className="space-y-4 p-4">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">1 · Which scope is this for? <span className="font-normal text-muted-foreground/70">(any org — the org is derived)</span></label>
          <Select value={scopeId ?? undefined} onValueChange={setScopeId}>
            <SelectTrigger className="h-9 w-full"><div className="flex min-w-0 flex-1 items-center overflow-hidden"><span className="min-w-0 flex-1 truncate text-left"><SelectValue placeholder="Pick a scope from any org…" /></span></div></SelectTrigger>
            <SelectContent>
              {scopeOptions.length === 0 ? <div className="px-2 py-1.5 text-xs text-muted-foreground">No scopes in any of your organizations yet.</div>
                : orgs.map((o) => {
                    const opts = o.scope_types.flatMap((t) => t.scopes.map((s) => ({ s, t })));
                    if (opts.length === 0) return null;
                    return (
                      <SelectGroup key={o.id}>
                        <SelectLabel>{o.name}{o.is_personal ? " (personal)" : ""}</SelectLabel>
                        {opts.map(({ s, t }) => <SelectItem key={s.id} value={s.id}>{s.name} · {t.label_singular}</SelectItem>)}
                      </SelectGroup>
                    );
                  })}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">2 · Which slot does it fill?</label>
          <div className="h-[176px] overflow-y-auto rounded-lg border border-border p-1.5">
            {!type ? <div className="px-2.5 py-2 text-xs text-muted-foreground">Pick a scope first.</div>
              : loadingType === type.id && !itemsByType[type.id] ? <div className="flex items-center gap-2 px-2.5 py-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Loading {type.label_plural}&apos; context items…</div>
              : items.length === 0 ? <div className="px-2.5 py-2 text-xs text-muted-foreground">{type.label_singular} has no context items defined yet.</div>
              : items.map((it) => {
                  const on = itemId === it.id;
                  const itemFits = FILE_FIT.has(String(it.value_type));
                  return (
                    <button key={it.id} onClick={() => { setItemId(it.id); setAssigned(false); }} className={cn("flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-muted", on && "bg-accent")}>
                      <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded-full border", on ? "border-primary bg-primary text-primary-foreground" : "border-border")}>{on && <Check className="h-3 w-3" />}</span>
                      <span className="min-w-0 flex-1 truncate">{it.display_name}</span>
                      <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-[10px]", itemFits ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "bg-muted text-muted-foreground")}>{String(it.value_type)}</span>
                    </button>
                  );
                })}
          </div>
        </div>

        <Button size="sm" className="w-full" disabled={!scope || !item} onClick={assign}>
          <FileText className="mr-1.5 h-4 w-4" />
          {scope && item ? `Set this file as ${scope.name}'s ${item.display_name}` : "Pick a scope and a slot"}
        </Button>

        {/* fixed-height result area so the card never resizes */}
        <div className="h-[150px] rounded-lg border border-border bg-card/40 p-3">
          {!assigned ? (
            <div className="flex h-full items-center justify-center text-center text-xs text-muted-foreground">The cascade will show here once you assign.</div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-300"><Check className="h-4 w-4" />The file <b>is</b> {scope!.name}&apos;s {item!.display_name}.</div>
              {!fits && <div className="flex items-center gap-1.5 text-[11px] text-amber-700 dark:text-amber-300"><Ban className="h-3 w-3" />This slot is currently <b>{String(item!.value_type)}</b> — assigning a file converts it to a reference value.</div>}
              <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Derived spine (stored once, computed up)</div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 px-2 py-1 text-xs text-emerald-600 dark:text-emerald-400"><ListChecks className="h-3 w-3" />{item!.display_name}</span>
                <CornerDownRight className="h-3 w-3 text-muted-foreground" />
                <span className={cn("inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs", c?.fg, c?.border)}>{scope!.name}</span>
                <CornerDownRight className="h-3 w-3 text-muted-foreground" />
                <span className={cn("inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs", c?.fg, c?.border)}>{type!.label_plural}</span>
                <CornerDownRight className="h-3 w-3 text-muted-foreground" />
                <span className="inline-flex items-center gap-1 rounded-md border border-dashed border-border px-2 py-1 text-xs text-muted-foreground">{org?.name}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

/* ───────────────────────── scope-as-value (relational graph, §3.5) ─────────── */

interface ScopeRef { sourceScopeId: string; itemId: string; targetScopeId: string }

function ScopeAsValuePanel({ orgs }: { orgs: OrgNode[] }) {
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [itemsByType, setItemsByType] = useState<Record<string, ContextItemRow[]>>({});
  const [itemId, setItemId] = useState<string | null>(null);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [refs, setRefs] = useState<ScopeRef[]>([]);
  const [reverseOf, setReverseOf] = useState<string | null>(null);

  const allScopes = useMemo(() => orgs.flatMap((o) => o.scope_types.flatMap((t) => t.scopes.map((s) => ({ id: s.id, name: s.name, type: t, org: o })))), [orgs]);
  const source = allScopes.find((s) => s.id === sourceId);
  const type = source?.type;

  useEffect(() => { setItemId(null); }, [sourceId]);
  useEffect(() => {
    if (!type || itemsByType[type.id]) return;
    scopesService.listContextItems(type.id).then((r) => { if (r.ok) setItemsByType((p) => ({ ...p, [type.id]: r.data.items })); });
  }, [type?.id]);

  const items = type ? itemsByType[type.id] ?? [] : [];
  const item = items.find((i) => i.id === itemId);
  // targets: scopes in the SAME org (cross-org references are a sharing act, not a casual link)
  const targets = useMemo(() => allScopes.filter((s) => source && s.org.id === source.org.id && s.id !== source.id), [allScopes, source]);
  const target = allScopes.find((s) => s.id === targetId);
  const scopeName = (id: string) => allScopes.find((s) => s.id === id)?.name ?? id;

  function link() {
    if (!source || !item || !target) return;
    console.log("[context-lab] SCOPE → SCOPE reference (future) →", {
      table: "ctx_context_item_values",
      scope_id: source.id, context_item_id: item.id,
      value_kind: "reference", ref_entity_type: "scope", ref_entity_id: target.id,
    });
    setRefs((p) => [...p.filter((r) => !(r.sourceScopeId === source.id && r.itemId === item.id && r.targetScopeId === target.id)), { sourceScopeId: source.id, itemId: item.id, targetScopeId: target.id }]);
    setReverseOf(target.id);
    toast.success(`${source.name}.${item.key} → ${target.name} (logged — no DB write)`);
  }

  const reverseHits = useMemo(() => (reverseOf ? refs.filter((r) => r.targetScopeId === reverseOf) : []), [refs, reverseOf]);

  const pickerTrigger = (value: string | null, placeholder: string) => (
    <div className="flex min-w-0 flex-1 items-center overflow-hidden"><span className="min-w-0 flex-1 truncate text-left">{value ?? <span className="text-muted-foreground">{placeholder}</span>}</span></div>
  );

  return (
    <Card className="w-[680px] max-w-full overflow-hidden">
      <div className="space-y-4 p-4">
        <div className="grid grid-cols-3 gap-2">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Scope</label>
            <Select value={sourceId ?? undefined} onValueChange={setSourceId}>
              <SelectTrigger className="h-9 w-full">{pickerTrigger(source?.name ?? null, "Any scope…")}</SelectTrigger>
              <SelectContent>
                {orgs.map((o) => {
                  const opts = o.scope_types.flatMap((t) => t.scopes.map((s) => ({ s, t })));
                  if (opts.length === 0) return null;
                  return <SelectGroup key={o.id}><SelectLabel>{o.name}{o.is_personal ? " (personal)" : ""}</SelectLabel>{opts.map(({ s, t }) => <SelectItem key={s.id} value={s.id}>{s.name} · {t.label_singular}</SelectItem>)}</SelectGroup>;
                })}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Relationship (item)</label>
            <Select value={itemId ?? undefined} onValueChange={setItemId} disabled={!type}>
              <SelectTrigger className="h-9 w-full">{pickerTrigger(item?.display_name ?? null, type ? "Pick the role…" : "Scope first")}</SelectTrigger>
              <SelectContent>
                {items.length === 0 ? <div className="px-2 py-1.5 text-xs text-muted-foreground">{type ? `${type.label_singular} has no items.` : ""}</div>
                  : items.map((i) => <SelectItem key={i.id} value={i.id}>{i.display_name} <span className="text-muted-foreground">· {String(i.value_type)}</span></SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Points to</label>
            <Select value={targetId ?? undefined} onValueChange={setTargetId} disabled={!source}>
              <SelectTrigger className="h-9 w-full">{pickerTrigger(target?.name ?? null, source ? "Another scope…" : "Scope first")}</SelectTrigger>
              <SelectContent>
                {targets.map((s) => <SelectItem key={s.id} value={s.id}>{s.name} · {s.type.label_singular}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Button size="sm" className="w-full" disabled={!source || !item || !target} onClick={link}>
          <GitBranch className="mr-1.5 h-4 w-4" />
          {source && item && target ? `Set ${source.name}'s ${item.display_name} = ${target.name}` : "Pick scope · relationship · target"}
        </Button>

        {/* fixed-height graph + reverse lookup */}
        <div className="h-[190px] space-y-2 overflow-y-auto rounded-lg border border-border bg-card/40 p-3">
          {refs.length === 0 ? (
            <div className="flex h-full items-center justify-center text-center text-xs text-muted-foreground">Link two scopes to start the graph.</div>
          ) : (
            <>
              <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Relationships (stored once, on the source)</div>
              {refs.map((r, i) => {
                const s = allScopes.find((x) => x.id === r.sourceScopeId);
                const it = (s ? itemsByType[s.type.id] ?? [] : []).find((x) => x.id === r.itemId);
                const c = s ? resolveColor(s.type) : undefined;
                return (
                  <div key={i} className="flex flex-wrap items-center gap-1.5 text-xs">
                    <span className={cn("inline-flex items-center gap-1 rounded-md border px-2 py-1", c?.fg, c?.border)}>{s?.name}</span>
                    <span className="font-mono text-[11px] text-emerald-600 dark:text-emerald-400">.{it?.key ?? "?"}</span>
                    <ArrowRight className="h-3 w-3 text-muted-foreground" />
                    <button onClick={() => setReverseOf(r.targetScopeId)} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 hover:bg-muted">{scopeName(r.targetScopeId)}</button>
                  </div>
                );
              })}
              {reverseOf && (
                <div className="border-t border-border pt-2">
                  <div className="text-[11px] text-muted-foreground">Reverse lookup (derived from the <span className="font-mono">(ref_entity_type, ref_entity_id)</span> index — never stored):</div>
                  <div className="mt-1 text-xs">“Who references <b>{scopeName(reverseOf)}</b>?” → {reverseHits.length === 0 ? <span className="text-muted-foreground">nobody yet</span> : reverseHits.map((r, i) => <span key={i} className="mr-1.5 font-medium">{scopeName(r.sourceScopeId)}</span>)}</div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </Card>
  );
}

/* ─────────────── required slots → surface-as-gaps (§3.4, REAL values) ──────── */

function RequiredSlotsPanel({ orgs }: { orgs: OrgNode[] }) {
  const [typeId, setTypeId] = useState<string | null>(null);
  const [itemsByType, setItemsByType] = useState<Record<string, ContextItemRow[]>>({});
  const [itemId, setItemId] = useState<string | null>(null);
  const [valuesByScope, setValuesByScope] = useState<Record<string, ContextItemValue[]>>({});
  const [loading, setLoading] = useState(false);

  const allTypes = useMemo(() => orgs.flatMap((o) => o.scope_types.map((t) => ({ t, o }))), [orgs]);
  const picked = allTypes.find((x) => x.t.id === typeId);
  const type = picked?.t;

  useEffect(() => { setItemId(null); }, [typeId]);
  useEffect(() => {
    if (!type) return;
    if (!itemsByType[type.id]) {
      scopesService.listContextItems(type.id).then((r) => { if (r.ok) setItemsByType((p) => ({ ...p, [type.id]: r.data.items })); });
    }
    // load REAL current values for every scope of this type (gap check)
    const missing = type.scopes.filter((s) => !valuesByScope[s.id]);
    if (missing.length === 0) return;
    setLoading(true);
    Promise.all(missing.map((s) => scopesService.listContextValues(s.id).then((r) => ({ id: s.id, values: r.ok ? r.data.values : [] }))))
      .then((rs) => setValuesByScope((p) => { const n = { ...p }; rs.forEach((r) => { n[r.id] = r.values; }); return n; }))
      .finally(() => setLoading(false));
  }, [type?.id]);

  const items = type ? itemsByType[type.id] ?? [] : [];
  const item = items.find((i) => i.id === itemId);
  const c = type ? resolveColor(type) : undefined;

  const rows = useMemo(() => {
    if (!type || !item) return [];
    return type.scopes.map((s) => {
      const vals = valuesByScope[s.id] ?? [];
      const current = vals.find((v) => v.context_item_id === item.id && v.is_current);
      const display = current ? (current.value_text ?? current.value_reference_id ?? current.value_document_url ?? (current.value_number != null ? String(current.value_number) : null) ?? "set") : null;
      return { scope: s, filled: !!current, display };
    });
  }, [type, item, valuesByScope]);
  const filled = rows.filter((r) => r.filled).length;

  return (
    <Card className="w-[680px] max-w-full overflow-hidden">
      <div className="space-y-4 p-4">
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Scope type</label>
            <Select value={typeId ?? undefined} onValueChange={setTypeId}>
              <SelectTrigger className="h-9 w-full"><div className="flex min-w-0 flex-1 items-center overflow-hidden"><span className="min-w-0 flex-1 truncate text-left">{type ? type.label_plural : <span className="text-muted-foreground">Pick a type…</span>}</span></div></SelectTrigger>
              <SelectContent>
                {orgs.map((o) => o.scope_types.length === 0 ? null : (
                  <SelectGroup key={o.id}><SelectLabel>{o.name}{o.is_personal ? " (personal)" : ""}</SelectLabel>{o.scope_types.map((t) => <SelectItem key={t.id} value={t.id}>{t.label_plural} · {t.scopes.length} {t.scopes.length === 1 ? "scope" : "scopes"}</SelectItem>)}</SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Treat as required</label>
            <Select value={itemId ?? undefined} onValueChange={setItemId} disabled={!type}>
              <SelectTrigger className="h-9 w-full"><div className="flex min-w-0 flex-1 items-center overflow-hidden"><span className="min-w-0 flex-1 truncate text-left">{item ? item.display_name : <span className="text-muted-foreground">{type ? "Pick an item…" : "Type first"}</span>}</span></div></SelectTrigger>
              <SelectContent>
                {items.length === 0 ? <div className="px-2 py-1.5 text-xs text-muted-foreground">{type ? "No items on this type." : ""}</div>
                  : items.map((i) => <SelectItem key={i.id} value={i.id}>{i.display_name} · {String(i.value_type)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="h-[230px] overflow-y-auto rounded-lg border border-border p-1.5">
          {!type || !item ? (
            <div className="flex h-full items-center justify-center text-center text-xs text-muted-foreground">Pick a type and the item every {type ? type.label_singular.toLowerCase() : "scope"} must have.</div>
          ) : loading && rows.every((r) => !valuesByScope[r.scope.id]) ? (
            <div className="flex h-full items-center justify-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Checking real values for {type.scopes.length} {type.label_plural.toLowerCase()}…</div>
          ) : rows.length === 0 ? (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">No {type.label_plural.toLowerCase()} exist yet.</div>
          ) : rows.map((r) => (
            <div key={r.scope.id} className={cn("flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-sm", !r.filled && "bg-amber-50/60 dark:bg-amber-950/30")}>
              <span className={cn("min-w-0 flex-1 truncate", c?.fg)}>{r.scope.name}</span>
              {r.filled ? (
                <span className="flex min-w-0 max-w-[50%] items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400"><ShieldCheck className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{r.display}</span></span>
              ) : (
                <span className="flex shrink-0 items-center gap-1.5 text-xs text-amber-700 dark:text-amber-300"><ShieldAlert className="h-3.5 w-3.5" />Gap<button className="underline" onClick={() => { console.log("[context-lab] fill gap →", { scope_id: r.scope.id, context_item_id: item!.id }); toast.info("Would open the value editor for this cell (logged)"); }}>fill</button></span>
              )}
            </div>
          ))}
        </div>

        <div className="flex h-5 items-center gap-2">
          {type && item && rows.length > 0 ? (<>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full bg-emerald-500 transition-all" style={{ width: `${(filled / rows.length) * 100}%` }} /></div>
            <span className="shrink-0 text-xs text-muted-foreground">{filled}/{rows.length} compliant</span>
          </>) : <span className="text-xs text-muted-foreground/60">Compliance shows here.</span>}
        </div>
      </div>
    </Card>
  );
}

/* ─────────── context hints: Active seeds Durable, never auto-writes (§6) ───── */

function ContextHintsPanel({ orgs }: { orgs: OrgNode[] }) {
  const activeOrgId = useAppSelector(selectActiveOrganizationId);
  const activeOrgName = useAppSelector(selectActiveOrganizationName);
  const activeProjectId = useAppSelector(selectActiveProjectId);
  const scopeSelections = useAppSelector(selectActiveScopeSelections);
  const [decided, setDecided] = useState<null | "added" | "dismissed">(null);

  const allScopes = useMemo(() => orgs.flatMap((o) => o.scope_types.flatMap((t) => t.scopes.map((s) => ({ id: s.id, name: s.name, type: t })))), [orgs]);
  const activeScopes = Object.values(scopeSelections ?? {}).filter(Boolean).map((id) => allScopes.find((s) => s.id === id)).filter(Boolean) as { id: string; name: string; type: ScopeTypeNode }[];
  const hasContext = !!activeOrgId || activeScopes.length > 0;
  const firstScope = activeScopes[0];

  return (
    <Card className="w-[680px] max-w-full overflow-hidden">
      <div className="space-y-3 p-4">
        <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
          <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Your REAL active context right now</div>
          <div className="mt-1 flex min-h-[24px] flex-wrap items-center gap-1.5 text-sm">
            {!hasContext ? <span className="text-xs text-muted-foreground">None set — pick something in the sidebar&apos;s context picker and revisit.</span> : (<>
              {activeOrgName && <span className="font-medium">{activeOrgName}</span>}
              {activeScopes.map((s) => { const c = resolveColor(s.type); return <span key={s.id} className={cn("inline-flex items-center rounded-md border px-2 py-0.5 text-xs", c.fg, c.border)}>{s.name}</span>; })}
              {activeProjectId && <span className="text-xs text-muted-foreground">+ project</span>}
            </>)}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-3 text-sm">You just created an <b>agent</b>. It is <i>not</i> auto-filed anywhere.</div>

        <div className="h-[120px]">
          {decided === null ? (
            <div className={cn("flex h-full flex-col justify-center gap-2 rounded-lg border-2 border-dashed p-3", hasContext ? "border-sky-300/70 bg-sky-50 dark:bg-sky-950/40" : "border-border bg-muted/20")}>
              <div className={cn("flex items-center gap-2 text-sm font-medium", hasContext ? "text-sky-800 dark:text-sky-200" : "text-muted-foreground")}><Bell className="h-4 w-4" />A nudge — never an auto-write</div>
              <div className={cn("text-xs", hasContext ? "text-sky-900/80 dark:text-sky-200/80" : "text-muted-foreground")}>
                {hasContext ? <>You&apos;re working in {firstScope ? <b>{firstScope.name}</b> : <b>{activeOrgName}</b>}. Add this agent there?</> : "With no active context, there is nothing to seed — so no nudge appears. That is the correct behavior."}
              </div>
              {hasContext && (
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => { console.log("[context-lab] hint ACCEPTED → ctx_associations", { source_type: "agent", target_type: firstScope ? "scope" : "organization-share", target_id: firstScope?.id ?? activeOrgId }); setDecided("added"); }}><Plus className="mr-1 h-3.5 w-3.5" />Add it</Button>
                  <Button size="sm" variant="outline" onClick={() => setDecided("dismissed")}>Not now</Button>
                </div>
              )}
            </div>
          ) : (
            <div className={cn("flex h-full items-center rounded-lg border p-3 text-sm", decided === "added" ? "border-emerald-300/60 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200" : "border-border text-muted-foreground")}>
              <span>{decided === "added" ? "One durable association written — by your explicit choice." : "Dismissed. Nothing was written; active context stayed ephemeral."}<button className="ml-2 text-xs underline" onClick={() => setDecided(null)}>reset</button></span>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

/* ───────── compact variation: the chat-composer context bar (active mode) ───── */

function CompactContextBar({ orgs }: { orgs: OrgNode[] }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [scopeByType, setScopeByType] = useState<Record<string, string>>({});
  const [orgId, setOrgIdLocal] = useState<string | null>(null);

  const org = orgs.find((o) => o.id === orgId) ?? null;
  const q = query.trim().toLowerCase();

  function pickScope(o: OrgNode, typeId: string, scopeId: string) {
    // Picking any scope adopts its org (org derives from the most specific pick).
    setOrgIdLocal(o.id);
    setScopeByType((p) => {
      const sameOrg = orgId === o.id ? p : {}; // switching org resets other types
      return sameOrg[typeId] === scopeId ? Object.fromEntries(Object.entries(sameOrg).filter(([k]) => k !== typeId)) : { ...sameOrg, [typeId]: scopeId };
    });
  }

  const chips = useMemo(() => {
    if (!org) return [];
    return Object.entries(scopeByType).map(([typeId, scopeId]) => {
      const t = org.scope_types.find((x) => x.id === typeId);
      const s = t?.scopes.find((x) => x.id === scopeId);
      return t && s ? { id: scopeId, name: s.name, type: t } : null;
    }).filter(Boolean) as { id: string; name: string; type: ScopeTypeNode }[];
  }, [org, scopeByType]);

  function apply() {
    console.log("[context-lab] composer bar → appContextSlice", { organization_id: org?.id ?? null, scope_selections: scopeByType });
    toast.success("Active context set (logged — no real write)");
    setOpen(false);
  }

  return (
    <Card className="w-[680px] max-w-full overflow-hidden">
      {/* a fake-but-faithful composer; the context bar is the real subject */}
      <div className="space-y-2 p-3">
        <div className="flex h-9 items-center gap-2 rounded-md border border-border bg-muted/30 px-3 text-sm text-muted-foreground">Ask anything…<span className="ml-auto text-[10px] uppercase tracking-wide opacity-60">composer (inert)</span></div>
        <div className="flex h-10 items-center gap-1.5 overflow-hidden rounded-md border border-border px-2">
          <span className="shrink-0 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Context</span>
          <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
            {!org ? <span className="text-xs text-muted-foreground/70">none — the agent gets no scope context</span> : (<>
              <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-xs font-medium">{org.name}</span>
              {chips.map((ch) => { const c = resolveColor(ch.type); return <span key={ch.id} className={cn("inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-0.5 text-xs", c.fg, c.border)}>{ch.name}<button onClick={() => setScopeByType((p) => Object.fromEntries(Object.entries(p).filter(([, v]) => v !== ch.id)))}><X className="h-3 w-3" /></button></span>; })}
            </>)}
          </div>
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <button className="inline-flex shrink-0 items-center gap-1 rounded-md border border-dashed border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground"><Plus className="h-3.5 w-3.5" />Set</button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[360px] p-2">
              <div className="relative mb-2">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search scopes…" className="h-8 pl-8" style={{ fontSize: "16px" }} />
              </div>
              <div className="h-[260px] space-y-2 overflow-y-auto">
                {orgs.map((o) => {
                  const groups = o.scope_types.map((t) => ({ t, scopes: t.scopes.filter((s) => !q || s.name.toLowerCase().includes(q)) })).filter((g) => g.scopes.length > 0);
                  if (groups.length === 0) return null;
                  return (
                    <div key={o.id}>
                      <div className="px-1.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{o.name}</div>
                      {groups.map(({ t, scopes }) => {
                        const c = resolveColor(t);
                        const TIcon = resolveIcon(t.icon);
                        return (
                          <div key={t.id} className="mb-1">
                            <div className={cn("flex items-center gap-1.5 px-1.5 py-0.5 text-[11px] font-medium", c.fg)}><TIcon className="h-3 w-3" />{t.label_plural}<span className="font-normal text-muted-foreground">· one</span></div>
                            {scopes.map((s) => {
                              const on = scopeByType[t.id] === s.id && orgId === o.id;
                              return (
                                <button key={s.id} onClick={() => pickScope(o, t.id, s.id)} className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm hover:bg-muted", on && "bg-accent")}>
                                  <span className={cn("flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border", on ? "border-primary bg-primary text-primary-foreground" : "border-border")}>{on && <Check className="h-2.5 w-2.5" />}</span>
                                  <span className="min-w-0 flex-1 truncate">{s.name}</span>
                                </button>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
              <div className="mt-2 flex justify-end border-t border-border pt-2">
                <Button size="sm" className="h-7" onClick={apply}>Apply</Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </Card>
  );
}

/* ───────────────────────── frame: intro band + UI | notes ─────────────────── */

function ConceptBlock({ icon: Icon, kicker, title, intro, ui, notes }: {
  icon: LucideIcon; kicker: string; title: string; intro: React.ReactNode; ui: React.ReactNode; notes: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-xl border-2 border-border bg-background">
      <div className="border-b-2 border-border bg-muted/40 px-5 py-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 shrink-0 rounded-lg bg-primary/10 p-2 text-primary"><Icon className="h-5 w-5" /></div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{kicker}</div>
            <h2 className="text-lg font-bold leading-tight">{title}</h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{intro}</p>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 divide-y-2 divide-border lg:grid-cols-[auto_1fr] lg:divide-x-2 lg:divide-y-0">
        <div className="p-5">
          <div className="mb-3 inline-flex items-center gap-1.5 rounded-md bg-emerald-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">Exactly what the user sees</div>
          {ui}
        </div>
        <div className="bg-card/40 p-5">
          <div className="mb-3 inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Notes — not shown to the user</div>
          <div className="space-y-3">{notes}</div>
        </div>
      </div>
    </div>
  );
}

const MECHANISMS: { icon: LucideIcon; name: string; expresses: string; storage: string; tone: string }[] = [
  { icon: Lock, name: "Ownership / containment", expresses: "“you live inside”", storage: "hard FK (the spine)", tone: "text-slate-600 dark:text-slate-300" },
  { icon: Network, name: "Loose membership", expresses: "“filed under / tagged to”", storage: "ctx_associations", tone: "text-emerald-600 dark:text-emerald-400" },
  { icon: ListChecks, name: "Typed slot", expresses: "“X’s «role» IS Y”", storage: "ctx_context_item_values", tone: "text-violet-600 dark:text-violet-400" },
];

function TaxonomyLegend() {
  return (
    <div className="overflow-hidden rounded-xl border-2 border-border">
      <div className="border-b-2 border-border bg-muted/40 px-5 py-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Every relationship is exactly one of these three</h2>
      </div>
      <div className="grid grid-cols-1 divide-y divide-border md:grid-cols-3 md:divide-x md:divide-y-0">
        {MECHANISMS.map((m) => { const I = m.icon; return (
          <div key={m.name} className="space-y-1 p-4">
            <div className={cn("flex items-center gap-2 text-sm font-semibold", m.tone)}><I className="h-4 w-4" />{m.name}</div>
            <div className="text-xs text-foreground">{m.expresses}</div>
            <div className="font-mono text-[11px] text-muted-foreground">{m.storage}</div>
          </div>
        ); })}
      </div>
      <div className="border-t-2 border-border bg-card/40 px-5 py-2 text-[11px] text-muted-foreground">Orthogonal to all three: <b>tenancy</b> (one owning org) and <b>Active Context</b> (runtime, feeds the agent). Store explicit, derive the rest.</div>
    </div>
  );
}

/* ───────────────────────── page ─────────────────── */


export default function ContextLabPage() {
  const dispatch = useAppDispatch();
  const { organizations, status } = useScopeTree();
  const [orgId, setOrgId] = useState<string | null>(null);
  const [files, setFiles] = useState<DemoFile[]>([]);
  const [filesErr, setFilesErr] = useState<string | null>(null);
  const [filesLoading, setFilesLoading] = useState(true);
  const [fileId, setFileId] = useState<string | null>(null);
  const [projects, setProjects] = useState<FlatProject[]>([]);
  const [tasks, setTasks] = useState<FlatTask[]>([]);
  const [liveRows, setLiveRows] = useState<LiveRow[]>([]);
  const requested = useRef(false);

  useEffect(() => { dispatch(ensureScopeTree({})); }, [dispatch]);

  useEffect(() => {
    if (requested.current) return;
    requested.current = true;
    listFiles({ limit: 50 })
      .then((res) => { const docs = (res.data as DemoFile[]).filter((f) => f.file_name); setFiles(docs); if (docs[0]) setFileId(docs[0].id); })
      .catch((e) => setFilesErr(e instanceof Error ? e.message : "Could not load your files"))
      .finally(() => setFilesLoading(false));
    getUserProjects().then((ps) => setProjects(ps.map((p) => ({ id: p.id, name: p.name, orgId: p.organizationId, isPersonal: p.isPersonal })))).catch(() => {});
    getUserTasks().then((ts) => setTasks(ts.map((t) => ({ id: t.id, title: (t as { title?: string }).title ?? "Untitled task", projectId: (t as { project_id?: string | null }).project_id ?? null, orgId: (t as { organization_id?: string | null }).organization_id ?? null, status: (t as { status?: string | null }).status ?? null })))).catch(() => {});
  }, []);

  useEffect(() => {
    if (orgId || organizations.length === 0) return;
    // Prefer the org whose types actually have custom icons/colors (so the demo
    // shows the feature), then fall back to the one with the most types.
    const richness = (o: OrgNode) => o.scope_types.reduce((n, t) => n + ((t.icon && t.icon.toLowerCase() !== "folder") ? 1 : 0) + (t.color ? 1 : 0), 0);
    const best = [...organizations].sort((a, b) => richness(b) - richness(a) || b.scope_types.length - a.scope_types.length)[0];
    setOrgId(best.id);
  }, [organizations, orgId]);

  const org = organizations.find((o) => o.id === orgId) ?? organizations[0];
  const file = files.find((f) => f.id === fileId) ?? files[0];

  const loadingOrgs = status === "loading" && organizations.length === 0;
  const fileSubject: Subject | null = file ? { icon: FileText, title: file.file_name, sub: file.mime_type || "file", entity: { type: "user_file", id: file.id } } : null;

  function renderField(node: React.ReactNode) {
    if (loadingOrgs) return <Card className="flex w-[680px] max-w-full items-center justify-center p-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></Card>;
    if (!org) return <Card className="w-[680px] max-w-full p-6 text-sm text-muted-foreground">No organizations found for your account.</Card>;
    return node;
  }

  return (
    <div className="min-h-dvh bg-textured">
      <div className="mx-auto max-w-[1400px] space-y-6 p-5 lg:p-8">
        <div className="space-y-1.5">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-primary">Context Lab · real data · saves to console</div>
          <h1 className="text-2xl font-bold">The ctx system — one field, every surface</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">Your actual orgs, scopes, projects, tasks and files — live. Only the write is faked. Each boxed component is exactly what a user sees; everything else is commentary.</p>
        </div>

        <TaxonomyLegend />

        {/* harness — picks the real file for the assignment block */}
        <div className="rounded-lg border border-dashed border-border bg-muted/30 p-3">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Demo harness — picks which real document the assignment field receives (not part of the UI)</div>
          {filesErr ? <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-300"><AlertTriangle className="h-4 w-4" />{filesErr}</div>
            : filesLoading ? <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading your files…</div>
            : files.length === 0 ? <div className="text-xs text-muted-foreground">No files on your account.</div>
            : (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">Document:</span>
                <Select value={fileId ?? undefined} onValueChange={setFileId}>
                  <SelectTrigger className="h-8 w-[340px]"><div className="flex min-w-0 flex-1 items-center overflow-hidden"><span className="min-w-0 flex-1 truncate text-left"><SelectValue /></span></div></SelectTrigger>
                  <SelectContent>{files.map((f) => <SelectItem key={f.id} value={f.id}>{f.file_name}</SelectItem>)}</SelectContent>
                </Select>
                <span className="text-xs text-muted-foreground">{files.length} files · {projects.length} projects · {tasks.length} tasks loaded</span>
              </div>
            )}
        </div>

        {/* Block 1 — assignment (a Source resource) */}
        <ConceptBlock
          icon={Layers}
          kicker="Durable association"
          title="Organize a document (assignment)"
          intro={<>The same field used wherever a user files a resource — note save, file upload, agent edit. It writes durable <code>ctx_associations</code> rows: &quot;this file belongs to these.&quot;</>}
          ui={renderField(fileSubject ? <ContextField mode="assignment" subject={fileSubject} org={org!} orgs={organizations} onChangeOrg={setOrgId} allProjects={projects} allTasks={tasks} onRowsChange={setLiveRows} /> : <Card className="w-[680px] max-w-full p-6 text-sm text-muted-foreground">No documents found. Upload a file, then revisit.</Card>)}
          notes={<>
            <Note tone="good"><b>Fixed size, no shift.</b> Fixed 680px width + 440px section height — toggling Show all, collapsing sections, or long task names never resize the box.</Note>
            <Note><b>Amber wand chips = real lateral suggestions.</b> They come from actual <code>ctx_scope_assignments</code> links (a selected scope sits in a project → offer the project; a selected project links scopes → offer filing scope-wide). One click accepts; nothing is auto-written.</Note>
            <Note><b>Projects &amp; tasks default to this org + unassigned;</b> Show-all reveals other orgs&apos;. A task follows its parent project. Inline <b>+ New</b> everywhere.</Note>
            <div className="rounded-lg border border-border bg-card p-3">
              <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"><Database className="h-3.5 w-3.5" />Rows this selection writes — live</div>
              {liveRows.length === 0 ? <div className="font-mono text-[11px] text-muted-foreground/60">— none —</div>
                : liveRows.map((r, i) => <div key={i} className="truncate font-mono text-[11px] leading-relaxed"><span className="text-emerald-600 dark:text-emerald-400">{r.table}</span><span className="text-muted-foreground">{r.cols}</span></div>)}
              <div className="mt-1 text-[10px] text-muted-foreground/70">Ancestors (type, org) are derived on read — note they never appear as rows.</div>
            </div>
            <Note tone="warn"><b>Your call:</b> lock org to the file&apos;s owner, or keep it changeable? Surface as a slide-over on the file row, a post-upload step, or both?</Note>
          </>}
        />

        {/* Block 2 — active context (chat) — SAME field, different contract */}
        <ConceptBlock
          icon={MessageSquare}
          kicker="Active Context (ephemeral)"
          title="Chat composer (active context)"
          intro={<>The exact same component, one prop flipped. Here it sets <code>appContextSlice</code> — &quot;the work I&apos;m doing right now is relevant to these&quot; — which is what feeds the agent. It writes nothing durable.</>}
          ui={renderField(
            <div className="space-y-4">
              <div>
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Variation A — full panel (settings / focus view)</div>
                <ContextField mode="active" subject={{ icon: MessageSquare, title: "Current chat turn", sub: "What is this work about?" }} org={org!} orgs={organizations} onChangeOrg={setOrgId} allProjects={projects} allTasks={tasks} />
              </div>
              <div>
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Variation B — composer bar (what actually sits under the chat input)</div>
                <CompactContextBar orgs={organizations} />
              </div>
            </div>,
          )}
          notes={<>
            <Note tone="good"><b>Identical engine, different contract.</b> &quot;Set context&quot; / &quot;Apply&quot; logs an <code>appContextSlice</code>-shaped payload, not a <code>ctx_associations</code> row. One <code>mode</code> prop is the whole difference.</Note>
            <Note><b>Active mode is single-select per type</b> now — picking a second Client replaces the first (matches the canonical one-scope-per-type resolution); project and task are single too.</Note>
            <Note><b>Variation B</b> is my recommended chat-composer form: a one-line bar with the org + scope chips and a popover picker. Picking any scope <i>adopts its org</i> — the user never picks an org first.</Note>
            <Note tone="warn"><b>Your pick:</b> A, B, or both (B in the composer, A behind a &quot;manage context&quot; affordance)?</Note>
          </>}
        />

        {/* Block 3 — assign to a context item (the cascade flagship) */}
        <ConceptBlock
          icon={ArrowRight}
          kicker="Typed slot (the flagship)"
          title="Assign the file to a context item"
          intro={<>A context item like <code>Operating Agreement</code> (a file slot on a scope type) is a <b>typed, named slot</b>. Dropping the file into it for a specific scope fills the value <i>and</i> cascades up the spine. This is the new <code>value_kind=&apos;reference&apos;</code> — written as one row, the rest derived.</>}
          ui={renderField(fileSubject ? <AssignToItemPanel file={file!} orgs={organizations} /> : <Card className="w-[680px] max-w-full p-6 text-sm text-muted-foreground">No documents found. Upload a file, then revisit.</Card>)}
          notes={<>
            <Note tone="good"><b>Real scopes + real context items.</b> The slot list loads live via <code>scopesService.listContextItems()</code> for the picked scope&apos;s type. Only the write is faked (it logs the future <code>ctx_context_item_values</code> reference row).</Note>
            <Note><b>One act, two effects.</b> The file becomes the scope&apos;s value (structured data) <i>and</i> the most-specific association — so it cascades the furthest: item → scope → type → org, computed on read.</Note>
            <Note tone="warn"><b>Type guard:</b> file-compatible slots (document / reference / file) are marked green; assigning to a text/number slot would convert it to a reference value (noted at assign time).</Note>
          </>}
        />

        {/* Block 4 — scope-as-value (§3.5, the relational graph) */}
        <ConceptBlock
          icon={GitBranch}
          kicker="Typed slot · scope → scope (§3.5)"
          title="Scopes reference scopes — the relational graph"
          intro={<>A scope can be the value of another scope&apos;s item: <code>Case.opposing_counsel → «Dewey»</code>. The item key IS the relationship role — no separate relationship table. The reverse direction is derived, never stored twice.</>}
          ui={renderField(<ScopeAsValuePanel orgs={organizations} />)}
          notes={<>
            <Note tone="good"><b>Real scopes on both ends; real items as the roles.</b> The relationship dropdown loads the source scope&apos;s type&apos;s actual context items live. Only the write is faked (logs the <code>value_kind=&apos;reference&apos;, ref_entity_type=&apos;scope&apos;</code> row).</Note>
            <Note><b>Click a target chip</b> in the graph to run the reverse lookup — &quot;who references this scope?&quot; — computed from the <code>(ref_entity_type, ref_entity_id)</code> index.</Note>
            <Note tone="warn"><b>Targets are same-org only</b> — cross-org references are a sharing act, not a casual link (tenancy guardrail). And note your DB already has <code>value_reference_id/type</code> columns on <code>ctx_context_item_values</code>; the migration mainly formalizes <code>value_kind</code>.</Note>
          </>}
        />

        {/* Block 5 — required slots → gaps (§3.4) on REAL values */}
        <ConceptBlock
          icon={ShieldCheck}
          kicker="Enforceable structure (§3.4)"
          title="Required slots — surfaced as gaps, computed from your real values"
          intro={<>Mark an item as required (&quot;every Client must have an Operating Agreement&quot;) and the system shows compliance instead of blocking writes. The filled/gap states below are computed from your <b>actual</b> <code>ctx_context_item_values</code> rows.</>}
          ui={renderField(<RequiredSlotsPanel orgs={organizations} />)}
          notes={<>
            <Note tone="good"><b>Fully real reads.</b> Pick a type → it loads every scope&apos;s real current values and checks the picked item. Green = a value exists today; amber = a real gap in your data right now.</Note>
            <Note><b>Surface-as-gaps, never block-on-write</b> (my strong §7.3 vote): hard-blocking creates dead-ends; a compliance list gives admins something to chase.</Note>
            <Note tone="warn"><b>Missing primitive:</b> a <code>required</code> flag on <code>ctx_context_items</code> — the only schema bit this panel pretends exists.</Note>
          </>}
        />

        {/* Block 6 — context hints (§6) reading the REAL active context */}
        <ConceptBlock
          icon={Bell}
          kicker="The sanctioned bridge (§6)"
          title="Context Hints — Active seeds Durable, never auto-writes"
          intro={<>The one allowed crossover: your current Active Context may <b>suggest</b> a durable association when you create something — a nudge with an explicit Add, never a silent write. This panel reads your <b>real</b> active context from <code>appContextSlice</code>.</>}
          ui={renderField(<ContextHintsPanel orgs={organizations} />)}
          notes={<>
            <Note tone="good"><b>Live off your real picker.</b> Change the sidebar&apos;s active context and revisit — the banner and the nudge change with it. No active context → no nudge, honestly shown.</Note>
            <Note tone="warn"><b>The forbidden move</b> this kills: a surface silently converting your chat selection into a permanent tag. Accept writes one explicit row; dismiss writes nothing.</Note>
          </>}
        />

        <Card className="bg-muted/30 p-4">
          <div className="flex gap-2 text-sm text-muted-foreground">
            <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div>Gap list status: assignment field ✓ · active mode (A + composer bar B) ✓ · assign-to-item + cascade ✓ · lateral/promotion suggestions ✓ · live rows panel ✓ · scope-as-value ✓ · required-slots/gaps ✓ · context hints ✓. Open decisions for Arman: org changeable vs locked · where the field surfaces · variation A/B for chat · §7.2 cardinality + §7.3 enforcement.</div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function Note({ children, tone = "info" }: { children: React.ReactNode; tone?: "info" | "warn" | "good" }) {
  const map = {
    info: "border-sky-300/60 bg-sky-50 dark:bg-sky-950/40 text-sky-900 dark:text-sky-200",
    warn: "border-amber-300/60 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200",
    good: "border-emerald-300/60 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200",
  } as const;
  const Icon = tone === "warn" ? AlertTriangle : tone === "good" ? Check : Lightbulb;
  return (
    <div className={cn("flex gap-2 rounded-lg border p-3 text-xs leading-relaxed", map[tone])}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div>{children}</div>
    </div>
  );
}
