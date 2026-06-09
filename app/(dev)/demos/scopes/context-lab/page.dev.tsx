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
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
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
import { useAppDispatch } from "@/lib/redux/hooks";
import { useScopeTree } from "@/features/scopes/hooks/useScopeTree";
import { ensureScopeTree } from "@/features/scopes/redux/thunks/ensureScopeTree";
import { resolveIcon } from "@/features/scope-system/utils/resolveIcon";
import { listFiles } from "@/features/files/api/files";
import { getUserProjects } from "@/features/projects/service";
import { getUserTasks } from "@/features/tasks/services/taskService";
import type { OrgNode, ScopeTypeNode } from "@/features/scopes/types";

interface DemoFile { id: string; file_name: string; mime_type?: string | null }
interface FlatProject { id: string; name: string; orgId: string | null; isPersonal: boolean }
interface FlatTask { id: string; title: string; projectId: string | null; status: string | null }

type Target =
  | { kind: "scope"; id: string; label: string; typeId: string }
  | { kind: "project"; id: string; label: string }
  | { kind: "task"; id: string; label: string };

/* ───────────────────────── reusable row (zero layout shift) ───────────────── */

function CheckRow({
  on, label, right, onClick,
}: { on: boolean; label: string; right?: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-muted"
    >
      <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded border", on ? "border-primary bg-primary text-primary-foreground" : "border-border")}>
        {on && <Check className="h-3 w-3" />}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {right}
    </button>
  );
}

function SectionShell({
  icon: Icon, title, count, onAdd, addLabel, children, collapsible = true,
}: {
  icon: React.ComponentType<{ className?: string }>; title: string; count: number;
  onAdd: () => void; addLabel: string; children: React.ReactNode; collapsible?: boolean;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="rounded-lg border border-border">
      <div className="flex items-center justify-between px-3 py-2">
        <button onClick={() => collapsible && setOpen((o) => !o)} className="flex items-center gap-2 text-sm font-medium">
          {collapsible ? (open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />) : <span className="w-4" />}
          <Icon className="h-4 w-4 text-muted-foreground" />
          {title}
          <span className="text-xs text-muted-foreground">{count}</span>
        </button>
        <button onClick={onAdd} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground">
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

function OrganizeDocumentPanel({
  file, org, orgs, onChangeOrg, allProjects, allTasks,
}: {
  file: DemoFile; org: OrgNode; orgs: OrgNode[]; onChangeOrg: (id: string) => void;
  allProjects: FlatProject[]; allTasks: FlatTask[];
}) {
  const [query, setQuery] = useState("");
  const [selScopes, setSelScopes] = useState<Set<string>>(new Set());
  const [selProjects, setSelProjects] = useState<Set<string>>(new Set());
  const [selTasks, setSelTasks] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState<string | null>(null); // typeId | 'project' | 'task'
  const [addedScopes, setAddedScopes] = useState<{ id: string; name: string; typeId: string }[]>([]);
  const [addedProjects, setAddedProjects] = useState<FlatProject[]>([]);
  const [addedTasks, setAddedTasks] = useState<FlatTask[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => { setSelScopes(new Set()); setSelProjects(new Set()); setSelTasks(new Set()); setAddedScopes([]); setAddedProjects([]); setAddedTasks([]); setQuery(""); }, [org.id, file.id]);

  const q = query.trim().toLowerCase();
  const match = (s: string) => !q || s.toLowerCase().includes(q);

  const scopeTypes = useMemo(() => org.scope_types.map((t) => {
    const extra = addedScopes.filter((a) => a.typeId === t.id).map((a) => ({ id: a.id, name: a.name }));
    const all = [...t.scopes.map((s) => ({ id: s.id, name: s.name })), ...extra];
    return { type: t, scopes: all.filter((s) => match(s.name)), total: all.length };
  }), [org, addedScopes, q]);

  const projects = useMemo(() => [...allProjects, ...addedProjects].filter((p) => match(p.name)), [allProjects, addedProjects, q]);
  const tasks = useMemo(() => [...allTasks, ...addedTasks].filter((t) => match(t.title)), [allTasks, addedTasks, q]);

  const typeById = (id: string): ScopeTypeNode | undefined => org.scope_types.find((t) => t.id === id);
  const typeOfScope = (id: string): ScopeTypeNode | undefined => org.scope_types.find((t) => t.scopes.some((s) => s.id === id)) ?? typeById(addedScopes.find((a) => a.id === id)?.typeId ?? "");
  const projName = (id: string) => [...allProjects, ...addedProjects].find((p) => p.id === id)?.name ?? id;
  const orgLabel = (orgId: string | null) => orgId === org.id ? "this org" : orgId ? orgs.find((o) => o.id === orgId)?.name ?? "other org" : "Unassigned";

  const derivedTypeIds = useMemo(() => { const s = new Set<string>(); selScopes.forEach((id) => { const t = typeOfScope(id); if (t) s.add(t.id); }); return s; }, [selScopes, org, addedScopes]);

  const toggle = (set: React.Dispatch<React.SetStateAction<Set<string>>>, id: string) => set((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

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
    setAddedTasks((p) => [...p, { id, title: v, projectId: null, status: "incomplete" }]); setSelTasks((p) => new Set(p).add(id)); setAdding(null);
    toast.success(`Added task "${v}" (logged — no DB write)`);
  }

  function save() {
    setBusy(true);
    const explicit: Target[] = [
      ...[...selScopes].map((id): Target => ({ kind: "scope", id, label: "", typeId: typeOfScope(id)?.id ?? "" })),
      ...[...selProjects].map((id): Target => ({ kind: "project", id, label: projName(id) })),
      ...[...selTasks].map((id): Target => ({ kind: "task", id, label: "" })),
    ];
    const payload = {
      entity: { entity_type: "user_file", entity_id: file.id, name: file.file_name },
      organization_id: org.id,
      explicit_associations: explicit.map((t) => ({ target_type: t.kind, target_id: t.id })),
      derived_spine: [...derivedTypeIds].map((id) => typeById(id)?.label_plural).filter(Boolean).concat(org.name),
    };
    console.log("[context-lab] SAVE association payload →", payload);
    setTimeout(() => { setBusy(false); toast.success("Saved (logged to console — no DB write)"); }, 350);
  }

  const totalSelected = selScopes.size + selProjects.size + selTasks.size;

  return (
    <Card className="w-full max-w-2xl overflow-hidden">
      {/* file */}
      <div className="flex items-center gap-3 border-b border-border p-4">
        <div className="rounded-lg bg-muted p-2 text-muted-foreground"><FileText className="h-5 w-5" /></div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{file.file_name}</div>
          <div className="text-xs text-muted-foreground">{file.mime_type || "file"}</div>
        </div>
      </div>

      <div className="space-y-3 p-4">
        {/* org + search on one row */}
        <div className="flex items-center gap-2">
          <Select value={org.id} onValueChange={onChangeOrg}>
            <SelectTrigger className="h-9 w-[260px] shrink-0">
              <span className="flex min-w-0 items-center gap-2">
                <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate"><SelectValue /></span>
              </span>
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

        {/* sections */}
        <div className="max-h-[440px] space-y-2 overflow-y-auto pr-1">
          {scopeTypes.length === 0 && <div className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">This organization has no scopes yet.</div>}

          {scopeTypes.map(({ type, scopes, total }) => {
            const Icon = resolveIcon(type.icon);
            return (
              <SectionShell key={type.id} icon={Icon} title={type.label_plural} count={total} addLabel={`New ${type.label_singular}`} onAdd={() => setAdding(type.id)}>
                {adding === type.id && <InlineAdd placeholder={`New ${type.label_singular.toLowerCase()} name`} onCommit={(v) => addScope(type.id, v)} onCancel={() => setAdding(null)} />}
                {scopes.length === 0 ? (
                  <div className="px-2.5 py-1.5 text-xs text-muted-foreground">{q ? "No matches." : `No ${type.label_plural.toLowerCase()} yet.`}</div>
                ) : scopes.map((s) => <CheckRow key={s.id} on={selScopes.has(s.id)} label={s.name} onClick={() => toggle(setSelScopes, s.id)} />)}
              </SectionShell>
            );
          })}

          {/* projects — ALL of the user's, incl. unassigned */}
          <SectionShell icon={Briefcase} title="Projects" count={projects.length} addLabel="New project" onAdd={() => setAdding("project")}>
            {adding === "project" && <InlineAdd placeholder="New project name" onCommit={addProject} onCancel={() => setAdding(null)} />}
            {projects.length === 0 ? <div className="px-2.5 py-1.5 text-xs text-muted-foreground">{q ? "No matches." : "No projects yet."}</div>
              : projects.map((p) => <CheckRow key={p.id} on={selProjects.has(p.id)} label={p.name} right={<span className="shrink-0 text-[11px] text-muted-foreground">{orgLabel(p.orgId)}</span>} onClick={() => toggle(setSelProjects, p.id)} />)}
          </SectionShell>

          {/* tasks — independent of projects */}
          <SectionShell icon={FolderOpen} title="Tasks" count={tasks.length} addLabel="New task" onAdd={() => setAdding("task")}>
            {adding === "task" && <InlineAdd placeholder="New task title" onCommit={addTask} onCancel={() => setAdding(null)} />}
            {tasks.length === 0 ? <div className="px-2.5 py-1.5 text-xs text-muted-foreground">{q ? "No matches." : "No tasks yet."}</div>
              : tasks.map((t) => <CheckRow key={t.id} on={selTasks.has(t.id)} label={t.title} right={<span className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">{t.status === "completed" ? <CheckCircle2 className="h-3 w-3" /> : <Circle className="h-3 w-3" />}{t.projectId ? projName(t.projectId) : "No project"}</span>} onClick={() => toggle(setSelTasks, t.id)} />)}
          </SectionShell>
        </div>

        {/* footer: stable-height summary + save */}
        <div className="space-y-2 border-t border-border pt-3">
          <div className="min-h-[28px]">
            {totalSelected === 0 ? (
              <span className="text-xs text-muted-foreground">Not filed anywhere yet — that&apos;s allowed.</span>
            ) : (
              <div className="flex flex-wrap items-center gap-1.5">
                {[...selScopes].map((id) => { const t = typeOfScope(id); const name = [...org.scope_types.flatMap((x) => x.scopes), ...addedScopes].find((s) => s.id === id)?.name ?? id; return <Chip key={id} label={name} onRemove={() => toggle(setSelScopes, id)} />; })}
                {[...selProjects].map((id) => <Chip key={id} label={projName(id)} onRemove={() => toggle(setSelProjects, id)} />)}
                {[...selTasks].map((id) => <Chip key={id} label={[...allTasks, ...addedTasks].find((t) => t.id === id)?.title ?? id} onRemove={() => toggle(setSelTasks, id)} />)}
                {[...derivedTypeIds].map((tid) => <span key={tid} className="inline-flex items-center gap-1 rounded-md border border-dashed border-border px-2 py-1 text-xs text-muted-foreground">{typeById(tid)?.label_plural}<span className="text-[9px] uppercase opacity-70">auto</span></span>)}
                <span className="inline-flex items-center gap-1 rounded-md border border-dashed border-border px-2 py-1 text-xs text-muted-foreground">{org.name}<span className="text-[9px] uppercase opacity-70">auto</span></span>
              </div>
            )}
          </div>
          <div className="flex justify-end">
            <Button size="sm" onClick={save} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}Save</Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
      <span className="max-w-[160px] truncate">{label}</span>
      <button onClick={onRemove} className="rounded p-0.5 hover:bg-primary/20"><X className="h-3 w-3" /></button>
    </span>
  );
}

/* ───────────────────────── page (harness + boundary) ─────────────────────── */

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
    getUserTasks().then((ts) => setTasks(ts.map((t) => ({ id: t.id, title: (t as { title?: string }).title ?? "Untitled task", projectId: (t as { project_id?: string | null }).project_id ?? null, status: (t as { status?: string | null }).status ?? null })))).catch(() => {});
  }, []);

  useEffect(() => {
    if (orgId || organizations.length === 0) return;
    const best = [...organizations].sort((a, b) => b.scope_types.length - a.scope_types.length)[0];
    setOrgId(best.id);
  }, [organizations, orgId]);

  const org = organizations.find((o) => o.id === orgId) ?? organizations[0];
  const file = files.find((f) => f.id === fileId) ?? files[0];

  return (
    <div className="min-h-dvh bg-textured">
      <div className="mx-auto max-w-[1400px] space-y-6 p-5 lg:p-8">
        <div className="space-y-1.5">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-primary">Context Lab · real data · saves to console</div>
          <h1 className="text-2xl font-bold">Organize a document — the real ContextAssignmentField</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">Your actual orgs, scopes, projects, tasks and files — live. Only the write is faked. The boxed component on the left is exactly what a user sees; everything else is commentary.</p>
        </div>

        {/* harness */}
        <div className="rounded-lg border border-dashed border-border bg-muted/30 p-3">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Demo harness — picks which real document the component receives (not part of the UI)</div>
          {filesErr ? <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-300"><AlertTriangle className="h-4 w-4" />{filesErr}</div>
            : filesLoading ? <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading your files…</div>
            : files.length === 0 ? <div className="text-xs text-muted-foreground">No files on your account.</div>
            : (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">Document:</span>
                <Select value={fileId ?? undefined} onValueChange={setFileId}>
                  <SelectTrigger className="h-8 w-[340px]"><span className="min-w-0 truncate"><SelectValue /></span></SelectTrigger>
                  <SelectContent>{files.map((f) => <SelectItem key={f.id} value={f.id}>{f.file_name}</SelectItem>)}</SelectContent>
                </Select>
                <span className="text-xs text-muted-foreground">{files.length} real files · {projects.length} projects · {tasks.length} tasks loaded</span>
              </div>
            )}
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[auto_1fr]">
          <div className="space-y-2">
            <div className="text-[11px] font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">Exactly what the user sees</div>
            {status === "loading" && organizations.length === 0 ? (
              <Card className="flex w-full max-w-2xl items-center justify-center p-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></Card>
            ) : !org ? (
              <Card className="w-full max-w-2xl p-6 text-sm text-muted-foreground">No organizations found for your account.</Card>
            ) : !file ? (
              <Card className="w-full max-w-2xl p-6 text-sm text-muted-foreground">No documents found. Upload a file, then revisit.</Card>
            ) : (
              <OrganizeDocumentPanel file={file} org={org} orgs={organizations} onChangeOrg={setOrgId} allProjects={projects} allTasks={tasks} />
            )}
          </div>

          <div className="space-y-3">
            <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Notes (not shown to the user)</div>
            <Note tone="good"><b>No layout shift.</b> Rows have a fixed checkbox on the left — selecting toggles only the inner check, so nothing resizes. Replaced the pill toggles you didn&apos;t like; this is Linear&apos;s property-picker pattern.</Note>
            <Note><b>Projects are now all of yours, not just this org&apos;s.</b> Each row tags its home — &quot;this org&quot;, another org&apos;s name, or <b>Unassigned</b>. Unassigned/cross-org projects are exactly the ones you said matter.</Note>
            <Note><b>Tasks are independent.</b> Loaded from all your tasks via <code>getUserTasks()</code> — not assumed to live under a project. Each shows its project (or &quot;No project&quot;) and status. New task + select-from-all, same as projects.</Note>
            <Note><b>Org dropdown</b> is single-line + truncated now (no wrap), and changeable — switch it and the scope sections change; projects/tasks stay (they&apos;re global) but re-tag relative to the new org.</Note>
            <Note><b>Dashed &quot;auto&quot; chips</b> = derived vertical spine (scope → its type → org), computed, not stored. Save logs the exact <code>ctx_associations</code> payload.</Note>
            <Note tone="warn"><b>Still your call:</b> lock org to the file&apos;s owner or keep it changeable? And where does this surface — slide-over on the file row, a step after upload, or both? I can also spin alternate picker variations (flat table, command-palette) if you want to compare.</Note>
          </div>
        </div>
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
