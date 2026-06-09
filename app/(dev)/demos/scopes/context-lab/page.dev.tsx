"use client";

// /demos/scopes/context-lab
//
// REAL-DATA lab for the ContextAssignmentField. Rule (per Arman): every entity
// shown is real — your actual orgs / scope types / scopes / projects / files,
// pulled live from the DB. Only the *save* is faked (console.log instead of an
// RPC that doesn't exist yet). The left card is EXACTLY the user UI, nothing
// talking to the reviewer inside it; all commentary lives outside, on the right.

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
import type { OrgNode, ScopeTypeNode } from "@/features/scopes/types";

interface DemoFile {
  id: string;
  file_name: string;
  mime_type?: string | null;
}

/* Optimistic locally-added scopes/projects (from inline quick-add). Keyed so
   the UI reflects a create that the real RPC would persist. */
type AddedScope = { id: string; name: string; typeId: string };

/* ────────────────────────────────────────────────────────────────────────
   THE COMPONENT — this is exactly what the user sees. Nothing in here is
   reviewer-facing. It takes a real file + the real scope tree and assigns it.
   ──────────────────────────────────────────────────────────────────────── */

function OrganizeDocumentPanel({
  file,
  org,
  orgs,
  onChangeOrg,
}: {
  file: DemoFile;
  org: OrgNode;
  orgs: OrgNode[];
  onChangeOrg: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [addingType, setAddingType] = useState<string | null>(null);
  const [addName, setAddName] = useState("");
  const [addedScopes, setAddedScopes] = useState<AddedScope[]>([]);
  const [addingProject, setAddingProject] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [addedProjects, setAddedProjects] = useState<{ id: string; name: string }[]>([]);
  const [busy, setBusy] = useState(false);

  // reset selections when the org or file changes
  useEffect(() => {
    setSelected(new Set());
    setAddedScopes([]);
    setAddedProjects([]);
    setQuery("");
  }, [org.id, file.id]);

  const q = query.trim().toLowerCase();

  // real scope types + scopes for THIS org, plus any optimistic adds
  const types = useMemo(() => {
    return org.scope_types.map((t) => {
      const extra = addedScopes.filter((a) => a.typeId === t.id).map((a) => ({ id: a.id, name: a.name, scope_type_id: t.id, organization_id: org.id }));
      const all = [...t.scopes, ...extra];
      const filtered = q ? all.filter((s) => s.name.toLowerCase().includes(q)) : all;
      return { type: t, scopes: filtered, total: all.length };
    });
  }, [org, addedScopes, q]);

  const projects = useMemo(() => {
    const all = [...org.projects.map((p) => ({ id: p.id, name: p.name })), ...addedProjects];
    return q ? all.filter((p) => p.name.toLowerCase().includes(q)) : all;
  }, [org, addedProjects, q]);

  const typeOf = (scopeId: string): ScopeTypeNode | undefined =>
    org.scope_types.find((t) => t.scopes.some((s) => s.id === scopeId) || addedScopes.some((a) => a.id === scopeId && a.typeId === t.id));

  // derived: each selected scope implies its type + the org (vertical spine)
  const derivedTypeIds = useMemo(() => {
    const s = new Set<string>();
    selected.forEach((id) => { const t = typeOf(id); if (t) s.add(t.id); });
    return s;
  }, [selected, org, addedScopes]);

  const selectedScopeChips = [...selected];

  function toggle(id: string) {
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function commitAddScope(typeId: string) {
    const name = addName.trim();
    if (!name) return;
    const id = `new:${typeId}:${name}`;
    // eslint-disable-next-line no-console
    console.log("[context-lab] create scope →", { org_id: org.id, scope_type_id: typeId, name });
    setAddedScopes((p) => [...p, { id, name, typeId }]);
    setSelected((p) => new Set(p).add(id));
    setAddName("");
    setAddingType(null);
    toast.success(`Added "${name}" (logged — no DB write)`);
  }
  function commitAddProject() {
    const name = projectName.trim();
    if (!name) return;
    const id = `newproj:${name}`;
    // eslint-disable-next-line no-console
    console.log("[context-lab] create project →", { org_id: org.id, name });
    setAddedProjects((p) => [...p, { id, name }]);
    setSelected((p) => new Set(p).add(id));
    setProjectName("");
    setAddingProject(false);
    toast.success(`Added project "${name}" (logged — no DB write)`);
  }
  function save() {
    setBusy(true);
    const explicit = [...selected].map((id) => {
      const t = typeOf(id);
      const proj = projects.find((p) => p.id === id);
      return proj ? { target_type: "project", target_id: id } : { target_type: "scope", target_id: id, via_type: t?.label_plural };
    });
    const payload = {
      entity: { entity_type: "user_file", entity_id: file.id, name: file.file_name },
      organization_id: org.id,
      explicit_associations: explicit,
      derived_spine: [...derivedTypeIds].map((id) => org.scope_types.find((t) => t.id === id)?.label_plural).filter(Boolean),
    };
    // eslint-disable-next-line no-console
    console.log("[context-lab] SAVE association payload →", payload);
    setTimeout(() => { setBusy(false); toast.success("Saved (logged to console — no DB write)"); }, 350);
  }

  const FileIcon = FileText;

  return (
    <Card className="w-full max-w-xl overflow-hidden">
      {/* file being organized */}
      <div className="flex items-center gap-3 border-b border-border p-4">
        <div className="rounded-lg bg-muted p-2 text-muted-foreground"><FileIcon className="h-5 w-5" /></div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{file.file_name}</div>
          <div className="text-xs text-muted-foreground">{file.mime_type || "file"}</div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* org */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Organization</label>
          <Select value={org.id} onValueChange={onChangeOrg}>
            <SelectTrigger className="w-full">
              <span className="flex items-center gap-2"><Building2 className="h-4 w-4 text-muted-foreground" /><SelectValue /></span>
            </SelectTrigger>
            <SelectContent>
              {orgs.map((o) => (
                <SelectItem key={o.id} value={o.id}>{o.name}{o.is_personal ? " (personal)" : ""}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search scopes, projects…" className="pl-9" style={{ fontSize: "16px" }} />
        </div>

        {/* scope types */}
        <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
          {types.length === 0 && (
            <div className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
              This organization has no scopes yet.
            </div>
          )}
          {types.map(({ type, scopes, total }) => {
            const Icon = resolveIcon(type.icon);
            const isCollapsed = collapsed.has(type.id);
            const selCount = scopes.filter((s) => selected.has(s.id)).length + (q ? 0 : 0);
            return (
              <div key={type.id} className="rounded-lg border border-border">
                <div className="flex items-center justify-between px-3 py-2">
                  <button onClick={() => setCollapsed((p) => { const n = new Set(p); n.has(type.id) ? n.delete(type.id) : n.add(type.id); return n; })} className="flex items-center gap-2 text-sm font-medium">
                    {isCollapsed ? <ChevronRight className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    {type.label_plural}
                    <span className="text-xs text-muted-foreground">{total}</span>
                    {selCount > 0 && <span className="rounded-full bg-primary/10 px-1.5 text-[10px] font-semibold text-primary">{selCount}</span>}
                  </button>
                  <button onClick={() => { setAddingType(type.id); setAddName(""); }} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground">
                    <Plus className="h-3.5 w-3.5" /> New {type.label_singular}
                  </button>
                </div>
                {!isCollapsed && (
                  <div className="border-t border-border p-2">
                    {addingType === type.id && (
                      <div className="mb-2 flex items-center gap-1.5">
                        <Input autoFocus value={addName} onChange={(e) => setAddName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") commitAddScope(type.id); if (e.key === "Escape") setAddingType(null); }} placeholder={`New ${type.label_singular.toLowerCase()} name`} className="h-8" style={{ fontSize: "16px" }} />
                        <Button size="sm" className="h-8" onClick={() => commitAddScope(type.id)}>Add</Button>
                        <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => setAddingType(null)}><X className="h-4 w-4" /></Button>
                      </div>
                    )}
                    {scopes.length === 0 ? (
                      <div className="px-1 py-1.5 text-xs text-muted-foreground">{q ? "No matches." : `No ${type.label_plural.toLowerCase()} yet.`}</div>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {scopes.map((s) => {
                          const on = selected.has(s.id);
                          return (
                            <button key={s.id} onClick={() => toggle(s.id)} className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs", on ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted")}>
                              {on && <Check className="h-3 w-3" />}
                              {s.name}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* projects */}
          <div className="rounded-lg border border-border">
            <div className="flex items-center justify-between px-3 py-2">
              <span className="flex items-center gap-2 text-sm font-medium"><Briefcase className="h-4 w-4 text-muted-foreground" />Projects<span className="text-xs text-muted-foreground">{projects.length}</span></span>
              <button onClick={() => { setAddingProject(true); setProjectName(""); }} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground"><Plus className="h-3.5 w-3.5" /> New project</button>
            </div>
            <div className="border-t border-border p-2">
              {addingProject && (
                <div className="mb-2 flex items-center gap-1.5">
                  <Input autoFocus value={projectName} onChange={(e) => setProjectName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") commitAddProject(); if (e.key === "Escape") setAddingProject(false); }} placeholder="New project name" className="h-8" style={{ fontSize: "16px" }} />
                  <Button size="sm" className="h-8" onClick={commitAddProject}>Add</Button>
                  <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => setAddingProject(false)}><X className="h-4 w-4" /></Button>
                </div>
              )}
              {projects.length === 0 ? (
                <div className="px-1 py-1.5 text-xs text-muted-foreground">No projects yet.</div>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {projects.map((p) => {
                    const on = selected.has(p.id);
                    return (
                      <button key={p.id} onClick={() => toggle(p.id)} className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs", on ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted")}>
                        {on && <Check className="h-3 w-3" />}{p.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* tasks — containment under a project */}
          <div className="rounded-lg border border-border">
            <div className="flex items-center gap-2 px-3 py-2 text-sm font-medium"><FolderOpen className="h-4 w-4 text-muted-foreground" />Tasks</div>
            <div className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
              {projects.length === 0 ? "Add a project first — tasks live inside a project." : "Pick a project to see its tasks."}
            </div>
          </div>
        </div>

        {/* footer: what's tagged + save */}
        <div className="border-t border-border pt-3 space-y-2">
          {selectedScopeChips.length === 0 ? (
            <div className="text-xs text-muted-foreground">Not filed anywhere yet — that&apos;s allowed.</div>
          ) : (
            <div className="flex flex-wrap items-center gap-1.5">
              {selectedScopeChips.map((id) => {
                const t = typeOf(id);
                const proj = projects.find((p) => p.id === id);
                const all = [...org.scope_types.flatMap((x) => x.scopes), ...addedScopes.map((a) => ({ id: a.id, name: a.name }))];
                const label = proj ? proj.name : all.find((s) => s.id === id)?.name ?? id;
                return (
                  <span key={id} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
                    {label}
                    <button onClick={() => toggle(id)} className="rounded p-0.5 hover:bg-primary/20"><X className="h-3 w-3" /></button>
                  </span>
                );
              })}
              {[...derivedTypeIds].map((tid) => (
                <span key={tid} className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-1 text-xs text-muted-foreground">
                  {org.scope_types.find((t) => t.id === tid)?.label_plural}
                  <span className="text-[9px] uppercase opacity-70">auto</span>
                </span>
              ))}
              <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-1 text-xs text-muted-foreground">{org.name}<span className="text-[9px] uppercase opacity-70">auto</span></span>
            </div>
          )}
          <div className="flex justify-end">
            <Button size="sm" onClick={save} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
              Save
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   PAGE — harness + boundary structure
   ──────────────────────────────────────────────────────────────────────── */

export default function ContextLabPage() {
  const dispatch = useAppDispatch();
  const { organizations, status } = useScopeTree();
  const [orgId, setOrgId] = useState<string | null>(null);
  const [files, setFiles] = useState<DemoFile[]>([]);
  const [filesErr, setFilesErr] = useState<string | null>(null);
  const [filesLoading, setFilesLoading] = useState(true);
  const [fileId, setFileId] = useState<string | null>(null);
  const requested = useRef(false);

  useEffect(() => { dispatch(ensureScopeTree({})); }, [dispatch]);

  useEffect(() => {
    if (requested.current) return;
    requested.current = true;
    listFiles({ limit: 50 })
      .then((res) => {
        const docs = (res.data as DemoFile[]).filter((f) => f.file_name);
        setFiles(docs);
        if (docs[0]) setFileId(docs[0].id);
      })
      .catch((e) => setFilesErr(e instanceof Error ? e.message : "Could not load your files"))
      .finally(() => setFilesLoading(false));
  }, []);

  // default org = the one with the most scope types (most interesting), real data
  useEffect(() => {
    if (orgId || organizations.length === 0) return;
    const best = [...organizations].sort((a, b) => b.scope_types.length - a.scope_types.length)[0];
    setOrgId(best.id);
  }, [organizations, orgId]);

  const org = organizations.find((o) => o.id === orgId) ?? organizations[0];
  const file = files.find((f) => f.id === fileId) ?? files[0];

  return (
    <div className="min-h-dvh bg-textured">
      <div className="mx-auto max-w-[1400px] p-5 lg:p-8 space-y-6">
        {/* header */}
        <div className="space-y-1.5">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-primary">Context Lab · real data · saves to console</div>
          <h1 className="text-2xl font-bold">Organize a document — the real ContextAssignmentField</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">Your actual orgs, scope types, scopes, projects and files — loaded live. The only thing faked is the write (it console.logs instead of calling an RPC that doesn&apos;t exist yet). The boxed component on the left is exactly what a user would see; everything else is commentary.</p>
        </div>

        {/* DEMO HARNESS — clearly not part of the component */}
        <div className="rounded-lg border border-dashed border-border bg-muted/30 p-3">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Demo harness — picks which real document the component receives (not part of the UI)</div>
          {filesErr ? (
            <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-300"><AlertTriangle className="h-4 w-4" />{filesErr}</div>
          ) : filesLoading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading your files…</div>
          ) : files.length === 0 ? (
            <div className="text-xs text-muted-foreground">No files found on your account. Upload one and revisit, or the component still works with a represented file.</div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">Document:</span>
              <Select value={fileId ?? undefined} onValueChange={setFileId}>
                <SelectTrigger className="h-8 w-[340px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {files.map((f) => <SelectItem key={f.id} value={f.id}>{f.file_name}</SelectItem>)}
                </SelectContent>
              </Select>
              <span className="text-xs text-muted-foreground">{files.length} real files loaded</span>
            </div>
          )}
        </div>

        {/* The concept block: UI on the left, notes on the right — labels OUTSIDE the boxes */}
        <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-6">
          {/* LEFT — the real component */}
          <div className="space-y-2">
            <div className="text-[11px] font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">Exactly what the user sees</div>
            {status === "loading" && organizations.length === 0 ? (
              <Card className="w-full max-w-xl p-10 flex items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></Card>
            ) : !org ? (
              <Card className="w-full max-w-xl p-6 text-sm text-muted-foreground">No organizations found for your account.</Card>
            ) : !file ? (
              <Card className="w-full max-w-xl p-6 text-sm text-muted-foreground">No documents found. Upload a file, then revisit.</Card>
            ) : (
              <OrganizeDocumentPanel file={file} org={org} orgs={organizations} onChangeOrg={setOrgId} />
            )}
          </div>

          {/* RIGHT — commentary only */}
          <div className="space-y-3">
            <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Notes (not shown to the user)</div>
            <Note><b>All real.</b> The org dropdown, the scope types and their counts, every scope chip, the projects list — straight from your DB via <code>useScopeTree()</code>. Switch the org and watch the whole list change. Castellano has one type with a pile of scopes — that&apos;s why there&apos;s a search box.</Note>
            <Note tone="good"><b>Quick-add knows its type.</b> &quot;+ New Client&quot; lives <i>inside</i> the Clients section, so the scope type is never ambiguous — that was the hole in the earlier fake. It logs the create payload and optimistically shows the new scope selected.</Note>
            <Note><b>The dashed &quot;auto&quot; chips</b> are the derived vertical spine — pick a scope and its type + org light up without a click. We&apos;d store only the explicit row; these are computed on read.</Note>
            <Note tone="warn"><b>Real empty states.</b> Castellano has 0 projects, so Projects shows &quot;No projects yet&quot; with inline create, and Tasks says &quot;add a project first&quot; (tasks are contained by projects). Nothing is invented.</Note>
            <Note><b>Save logs, doesn&apos;t write.</b> Open the console and hit Save — you&apos;ll see the exact <code>ctx_associations</code>-shaped payload (entity + explicit targets + derived spine) we&apos;d persist.</Note>
            <Note tone="warn"><b>Still open for your call:</b> should org be changeable here (I made it so), or locked to the file&apos;s owning org? And where does this surface — a slide-over on the file row, a step right after upload, or both?</Note>
          </div>
        </div>

        {/* honesty about the rest */}
        <Card className="p-4 bg-muted/30">
          <div className="flex gap-2 text-sm text-muted-foreground">
            <Lightbulb className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
            <div>I stripped the earlier scope-as-value / required-slots / context-hints panels — they were fake-data and caused exactly the confusion you flagged. Once this real one is the agreed shape, I&apos;ll rebuild each of those the same way: real entities, faked-only-where-the-feature-doesn&apos;t-exist-yet, clean boundary.</div>
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
    <div className={cn("rounded-lg border p-3 text-xs leading-relaxed flex gap-2", map[tone])}>
      <Icon className="h-4 w-4 shrink-0 mt-0.5" />
      <div>{children}</div>
    </div>
  );
}
