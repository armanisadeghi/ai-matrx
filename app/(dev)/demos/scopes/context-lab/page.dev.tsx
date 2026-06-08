"use client";

// /demos/scopes/context-lab
//
// A private, NON-DB playground for the ctx-association overhaul. Pure local
// state + mock data — no Redux, no Supabase. It exists so Arman (UI-first) can
// SEE the behavior + the data shape before any real wiring.
//
// Structure rule (per Arman): every concept is a grouped unit —
//   [ intro band: informative ] + [ UI card: what actually ships ] + [ notes card ]
// inside one shared frame, so "what's code" vs "what's commentary" is obvious.
//
// Playground rule: a global ERA toggle (Today / Future) reshapes the UI so we
// can feel how the schema change (ctx_associations + typed item values) lands.

import React, { useMemo, useState } from "react";
import {
  Building2,
  Briefcase,
  Scale,
  FolderOpen,
  ListChecks,
  FileText,
  Plus,
  Check,
  X,
  CornerDownRight,
  Lightbulb,
  Lock,
  Sparkles,
  Layers,
  CircleDot,
  Wand2,
  AlertTriangle,
  Database,
  MessageSquare,
  ArrowRight,
  Ban,
  GitBranch,
  ShieldCheck,
  ShieldAlert,
  Bell,
  Network,
  type LucideIcon,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Era = "today" | "future";

/* ────────────────────────────────────────────────────────────────────────
   FAKE DATA — a law firm org, modeled the way the REAL ctx system will be.
   node kinds: org (owner) · scope_type · scope · context_item · project · task
   ──────────────────────────────────────────────────────────────────────── */

type NodeKind = "org" | "scope_type" | "scope" | "item" | "project" | "task";

interface Node {
  id: string;
  kind: NodeKind;
  label: string;
  sub?: string;
  parent?: string; // unambiguous vertical spine (auto-derived UP)
  lateral?: string[]; // ambiguous M2M (only SUGGESTED)
  valueType?: "text" | "file" | "number";
}

const ORG: Node = { id: "org_castellano", kind: "org", label: "Castellano & Reyes, LLP", sub: "Owning organization" };

const NODES: Node[] = [
  ORG,
  { id: "st_clients", kind: "scope_type", label: "Clients", parent: ORG.id },
  { id: "st_matters", kind: "scope_type", label: "Matters", parent: ORG.id },
  { id: "sc_acme", kind: "scope", label: "Acme Corp", sub: "Client", parent: "st_clients", lateral: ["pr_acme_lit"] },
  { id: "sc_globex", kind: "scope", label: "Globex", sub: "Client", parent: "st_clients", lateral: ["pr_globex_ma"] },
  { id: "sc_acme_v_globex", kind: "scope", label: "Acme v. Globex", sub: "Matter", parent: "st_matters", lateral: ["pr_acme_lit"] },
  { id: "it_opagreement", kind: "item", label: "Operating Agreement", sub: "on Clients · file", parent: "st_clients", valueType: "file" },
  { id: "it_engagement", kind: "item", label: "Engagement Letter", sub: "on Clients · file", parent: "st_clients", valueType: "file" },
  { id: "it_industry", kind: "item", label: "Industry", sub: "on Clients · text", parent: "st_clients", valueType: "text" },
  { id: "pr_acme_lit", kind: "project", label: "Acme v. Globex Litigation", parent: ORG.id },
  { id: "pr_globex_ma", kind: "project", label: "Globex M&A", parent: ORG.id },
  { id: "tk_motion", kind: "task", label: "Draft motion to compel", parent: "pr_acme_lit" },
  { id: "tk_discovery", kind: "task", label: "Review discovery", parent: "pr_acme_lit" },
  // scope-as-value relational graph (§3.5)
  { id: "sc_case", kind: "scope", label: "Case 12345", sub: "Matter", parent: "st_matters" },
  { id: "sc_oppcounsel", kind: "scope", label: "Dewey & Cheatem", sub: "Opposing Counsel", parent: "st_matters" },
  { id: "sc_expert_a", kind: "scope", label: "Dr. Ramirez", sub: "Expert", parent: "st_matters" },
  { id: "sc_expert_b", kind: "scope", label: "Dr. Okafor", sub: "Expert", parent: "st_matters" },
];

const byId = (id: string) => NODES.find((n) => n.id === id)!;

const KIND_META: Record<NodeKind, { icon: LucideIcon; tone: string; chip: string; word: string }> = {
  org: { icon: Building2, tone: "text-slate-600 dark:text-slate-300", chip: "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200", word: "Organization" },
  scope_type: { icon: Layers, tone: "text-sky-600 dark:text-sky-400", chip: "bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-300", word: "Scope type" },
  scope: { icon: CircleDot, tone: "text-violet-600 dark:text-violet-400", chip: "bg-violet-100 dark:bg-violet-950 text-violet-700 dark:text-violet-300", word: "Scope" },
  item: { icon: ListChecks, tone: "text-emerald-600 dark:text-emerald-400", chip: "bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300", word: "Context item" },
  project: { icon: Briefcase, tone: "text-amber-600 dark:text-amber-400", chip: "bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300", word: "Project" },
  task: { icon: FolderOpen, tone: "text-rose-600 dark:text-rose-400", chip: "bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300", word: "Task" },
};

function spine(id: string): string[] {
  const out: string[] = [];
  let cur: Node | undefined = byId(id);
  while (cur?.parent) { out.push(cur.parent); cur = byId(cur.parent); }
  return out;
}
const lateralOf = (id: string) => byId(id).lateral ?? [];

/* ────────────────────────────────────────────────────────────────────────
   Atoms
   ──────────────────────────────────────────────────────────────────────── */

function NodeChip({ id, derived, onRemove }: { id: string; derived?: boolean; onRemove?: () => void }) {
  const n = byId(id);
  const m = KIND_META[n.kind];
  const Icon = m.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full pl-2 pr-1.5 py-1 text-xs font-medium border",
        derived ? "border-dashed border-border bg-muted/40 text-muted-foreground" : cn("border-transparent", m.chip),
      )}
      title={derived ? "Derived automatically (vertical spine)" : "Explicitly assigned"}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      {n.label}
      {derived ? <span className="text-[9px] uppercase tracking-wide opacity-70">auto</span>
        : onRemove ? (
          <button onClick={onRemove} className="rounded p-0.5 hover:bg-black/10 dark:hover:bg-white/10" aria-label="Remove"><X className="h-3 w-3" /></button>
        ) : null}
    </span>
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

/* The structural wrapper Arman asked for: intro band (informative) on top,
   then a clear two-column split — REAL UI (what ships) | NOTES — inside one
   shared frame so they're grouped but visibly delineated. */
function ConceptBlock({
  icon: Icon, kicker, title, intro, ui, notes,
}: {
  icon: LucideIcon; kicker: string; title: string; intro: React.ReactNode;
  ui: React.ReactNode; notes: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border-2 border-border overflow-hidden bg-background">
      {/* Intro band — informative, sits OUTSIDE the UI card */}
      <div className="bg-muted/40 border-b-2 border-border px-5 py-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-lg bg-primary/10 p-2 text-primary shrink-0"><Icon className="h-5 w-5" /></div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{kicker}</div>
            <h2 className="text-lg font-bold leading-tight">{title}</h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{intro}</p>
          </div>
        </div>
      </div>
      {/* Two columns: the real UI | the notes */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] divide-y-2 lg:divide-y-0 lg:divide-x-2 divide-border">
        <div className="p-5">
          <div className="mb-3 inline-flex items-center gap-1.5 rounded-md bg-emerald-100 dark:bg-emerald-950 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
            <Sparkles className="h-3 w-3" /> What actually ships — exactly what the user sees
          </div>
          {ui}
        </div>
        <div className="p-5 bg-card/40">
          <div className="mb-3 inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            <Lightbulb className="h-3 w-3" /> Notes — why / how / where
          </div>
          <div className="space-y-3">{notes}</div>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   UI 1 — The assignment field (era-aware: Today FK vs Future ctx_associations)
   ════════════════════════════════════════════════════════════════════════ */

const SCOPES = ["sc_acme", "sc_globex", "sc_acme_v_globex"];
const PROJECTS = ["pr_acme_lit", "pr_globex_ma"];
const TASKS = ["tk_motion", "tk_discovery"];

function AssignmentFieldUI({ era, mode }: { era: Era; mode: "assignment" | "active" }) {
  const [scopes, setScopes] = useState<Set<string>>(new Set(["sc_acme"]));
  const [projectsSel, setProjectsSel] = useState<Set<string>>(new Set());
  const [tasksSel, setTasksSel] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<NodeKind | null>("scope");

  const future = era === "future";
  const picked = useMemo(() => new Set<string>([...scopes, ...projectsSel, ...tasksSel]), [scopes, projectsSel, tasksSel]);

  const derived = useMemo(() => {
    if (!future) return new Set<string>(); // Today: no cascade
    const s = new Set<string>();
    picked.forEach((id) => spine(id).forEach((p) => s.add(p)));
    picked.forEach((id) => s.delete(id));
    return s;
  }, [picked, future]);

  const suggestions = useMemo(() => {
    if (!future) return [] as string[];
    const s = new Set<string>();
    picked.forEach((id) => lateralOf(id).forEach((l) => { if (!picked.has(l)) s.add(l); }));
    return [...s];
  }, [picked, future]);

  function toggleIn(setter: React.Dispatch<React.SetStateAction<Set<string>>>, id: string, single: boolean) {
    setter((prev) => {
      const next = new Set(single ? [] : prev);
      if (single) { if (!prev.has(id)) next.add(id); }
      else { prev.has(id) ? next.delete(id) : next.add(id); }
      return next;
    });
  }

  const groups: { kind: NodeKind; ids: string[]; sel: Set<string>; setter: React.Dispatch<React.SetStateAction<Set<string>>>; single: boolean }[] = [
    { kind: "scope", ids: SCOPES, sel: scopes, setter: setScopes, single: false }, // scope is M2M in BOTH eras
    { kind: "project", ids: PROJECTS, sel: projectsSel, setter: setProjectsSel, single: !future }, // FK→single today
    { kind: "task", ids: TASKS, sel: tasksSel, setter: setTasksSel, single: !future },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
        <div className="rounded-md bg-rose-100 dark:bg-rose-950 p-2 text-rose-600 dark:text-rose-400"><FileText className="h-5 w-5" /></div>
        <div className="min-w-0">
          <div className="text-sm font-semibold">Acme_Operating_Agreement_scan.pdf</div>
          <div className="text-xs text-muted-foreground">
            {mode === "assignment" ? "Source resource — tag it now" : "Current chat work — what is this relevant to?"}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2">
        <div className="flex items-center gap-2 text-sm">
          <Lock className="h-3.5 w-3.5 text-muted-foreground" />
          <Building2 className="h-4 w-4 text-slate-500" />
          <span className="font-medium">{ORG.label}</span>
        </div>
        <Badge variant="outline" className="text-[10px]">owning org · single (both eras)</Badge>
      </div>

      {!future && (
        <div className="rounded-md border border-dashed border-rose-300/60 bg-rose-50/60 dark:bg-rose-950/30 px-3 py-1.5 text-[11px] text-rose-700 dark:text-rose-300">
          Today: scope is a tagger (M2M) but Project / Task are single FK columns — two mental models, no cascade.
        </div>
      )}

      <div className="space-y-2">
        {groups.map(({ kind, ids, sel, setter, single }) => {
          const m = KIND_META[kind];
          const Icon = m.icon;
          const isOpen = open === kind;
          return (
            <div key={kind} className="rounded-lg border border-border">
              <button onClick={() => setOpen(isOpen ? null : kind)} className="flex w-full items-center justify-between px-3 py-2 text-left">
                <span className="flex items-center gap-2 text-sm font-medium">
                  <Icon className={cn("h-4 w-4", m.tone)} />
                  {m.word}s
                  <span className="text-xs text-muted-foreground">{ids.filter((i) => sel.has(i)).length} selected</span>
                </span>
                <Badge variant="secondary" className="text-[10px]">{single ? "single (FK)" : "multi (M2M)"}</Badge>
              </button>
              {isOpen && (
                <div className="border-t border-border p-2 space-y-1">
                  {ids.map((id) => {
                    const n = byId(id); const on = sel.has(id);
                    return (
                      <button key={id} onClick={() => toggleIn(setter, id, single)} className={cn("flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm", on ? "bg-accent" : "hover:bg-muted")}>
                        <span className="flex items-center gap-2">
                          <span className={cn("flex h-4 w-4 items-center justify-center border", single ? "rounded-full" : "rounded", on ? "bg-primary border-primary text-primary-foreground" : "border-border")}>
                            {on && <Check className="h-3 w-3" />}
                          </span>
                          {n.label}{n.sub && <span className="text-[10px] text-muted-foreground">{n.sub}</span>}
                        </span>
                      </button>
                    );
                  })}
                  <button className="flex w-full items-center gap-2 rounded-md border border-dashed border-border px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:border-primary/40">
                    <Plus className="h-3.5 w-3.5" /> Create a new {m.word.toLowerCase()}… <span className="ml-auto text-[10px] opacity-70">inline quick-add</span>
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="rounded-lg border border-border bg-card p-3 space-y-2">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {mode === "assignment" ? "Result" : "Active context for this work"}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <NodeChip id={ORG.id} />
          {[...picked].map((id) => <NodeChip key={id} id={id} onRemove={() => {
            setScopes((p) => { const n = new Set(p); n.delete(id); return n; });
            setProjectsSel((p) => { const n = new Set(p); n.delete(id); return n; });
            setTasksSel((p) => { const n = new Set(p); n.delete(id); return n; });
          }} />)}
          {[...derived].map((id) => <NodeChip key={id} id={id} derived />)}
          {picked.size === 0 && <span className="text-xs italic text-muted-foreground">Nothing yet — opting out is allowed.</span>}
        </div>
        {suggestions.length > 0 && (
          <div className="pt-1">
            <div className="mb-1 flex items-center gap-1 text-[11px] text-muted-foreground"><Wand2 className="h-3 w-3" /> Suggested lateral links (one click — never auto-written):</div>
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map((id) => (
                <button key={id} onClick={() => setProjectsSel((p) => new Set(p).add(id))} className="inline-flex items-center gap-1 rounded-full border border-dashed border-amber-400/60 px-2 py-1 text-xs text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/40">
                  <Plus className="h-3 w-3" /> {byId(id).label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   UI 2 — Assign a resource to a context ITEM (typed reference value)
   ════════════════════════════════════════════════════════════════════════ */

function ItemAssignmentUI({ era }: { era: Era }) {
  const future = era === "future";
  const items = ["it_opagreement", "it_engagement", "it_industry"];
  const [item, setItem] = useState("it_opagreement");
  const [scope, setScope] = useState("sc_acme");
  const [assigned, setAssigned] = useState(false);
  const itemNode = byId(item);
  const isFileSlot = itemNode.valueType === "file";
  const derivedSpine = useMemo(() => [scope, ...spine(scope)], [scope]);
  const lateral = lateralOf(scope);

  if (!future) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 rounded-lg border border-border bg-card p-3">
          <Ban className="h-5 w-5 text-rose-500" />
          <div className="text-sm">Today, a context item value is <b>text / number / json</b> only.</div>
        </div>
        <div className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
          The best you can do is paste a URL string into the &quot;Operating Agreement&quot; text field. The file isn&apos;t
          <i> linked</i>, there&apos;s no cascade, and nothing knows the value IS a resource. This whole interaction doesn&apos;t exist yet.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {["sc_acme", "sc_globex"].map((s) => (
          <button key={s} onClick={() => { setScope(s); setAssigned(false); }} className={cn("rounded-md border px-3 py-1.5 text-sm", scope === s ? "border-primary bg-accent" : "border-border")}>{byId(s).label}</button>
        ))}
      </div>
      <div className="flex flex-col gap-1.5">
        {items.map((i) => {
          const n = byId(i);
          return (
            <button key={i} onClick={() => { setItem(i); setAssigned(false); }} className={cn("flex items-center justify-between rounded-md border px-3 py-1.5 text-sm", item === i ? "border-primary bg-accent" : "border-border")}>
              <span className="flex items-center gap-2"><ListChecks className="h-3.5 w-3.5 text-emerald-600" />{n.label}</span>
              <Badge variant="outline" className="text-[10px]">{n.valueType}</Badge>
            </button>
          );
        })}
      </div>
      <Button size="sm" disabled={!isFileSlot} onClick={() => setAssigned(true)} className="w-full">
        <FileText className="h-4 w-4 mr-1.5" />
        {isFileSlot ? `Set this PDF as ${byId(scope).label}'s ${itemNode.label}` : "Pick a file-type slot to drop the PDF"}
      </Button>
      {!isFileSlot && <Note tone="warn">&quot;{itemNode.label}&quot; is a <b>{itemNode.valueType}</b> slot — the PDF can&apos;t be its value. The slot&apos;s <i>type</i> decides what you can drop.</Note>}
      {assigned && (
        <div className="rounded-lg border border-border bg-card p-3 space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-300"><Check className="h-4 w-4" /> The file <b>is</b> {byId(scope).label}&apos;s {itemNode.label}.</div>
          <div className="text-xs text-muted-foreground">Auto-derived vertical spine (stored once, computed upward):</div>
          <div className="space-y-1.5">
            {derivedSpine.map((id, idx) => (
              <div key={id} className="flex items-center gap-2" style={{ paddingLeft: idx * 14 }}>
                {idx > 0 && <CornerDownRight className="h-3 w-3 text-muted-foreground" />}
                <NodeChip id={id} derived={idx > 0} />
              </div>
            ))}
          </div>
          {lateral.length > 0 && (
            <div className="pt-1">
              <div className="mb-1 flex items-center gap-1 text-[11px] text-amber-700 dark:text-amber-300"><Wand2 className="h-3 w-3" /> {byId(scope).label} is linked to a project — attach the file too?</div>
              {lateral.map((id) => <span key={id} className="inline-flex items-center gap-1 rounded-full border border-dashed border-amber-400/60 px-2 py-1 text-xs text-amber-700 dark:text-amber-300"><Plus className="h-3 w-3" /> {byId(id).label} <span className="opacity-60">(suggested)</span></span>)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   UI 3 — Active Context vs Durable Association (the §6 distinction)
   ════════════════════════════════════════════════════════════════════════ */

function ActiveVsDurableUI() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div className="rounded-lg border border-border p-3 space-y-2">
        <div className="flex items-center gap-2 text-sm font-semibold"><MessageSquare className="h-4 w-4 text-violet-500" /> Chat composer</div>
        <div className="flex flex-wrap gap-1.5"><NodeChip id="sc_acme" /><NodeChip id="pr_acme_lit" /></div>
        <div className="rounded bg-muted/60 px-2 py-1 text-[10px] font-mono text-muted-foreground">appContextSlice / ctx_user_active_context</div>
        <div className="text-[11px] text-muted-foreground">Ephemeral. &quot;My current work is relevant to these.&quot; Feeds the AI. Cleared when you switch context.</div>
      </div>
      <div className="rounded-lg border border-border p-3 space-y-2">
        <div className="flex items-center gap-2 text-sm font-semibold"><FileText className="h-4 w-4 text-rose-500" /> File assignment</div>
        <div className="flex flex-wrap gap-1.5"><NodeChip id="sc_acme" /><NodeChip id="pr_acme_lit" /></div>
        <div className="rounded bg-muted/60 px-2 py-1 text-[10px] font-mono text-muted-foreground">ctx_associations (durable row)</div>
        <div className="text-[11px] text-muted-foreground">Permanent. &quot;This file belongs to these.&quot; Survives forever, independent of where you&apos;re working.</div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   UI 4 — The actual DB rows (see the data THROUGH the UI)
   ════════════════════════════════════════════════════════════════════════ */

function Row({ children }: { children: React.ReactNode }) {
  return <div className="rounded-md border border-border bg-card px-3 py-2 font-mono text-[11px] leading-relaxed">{children}</div>;
}

function DataShapeUI({ era }: { era: Era }) {
  if (era === "today") {
    return (
      <div className="space-y-2">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Scattered across tables</div>
        <Row><span className="text-rose-500">user_files</span>.project_id = <span className="text-amber-500">pr_acme_lit</span>  <span className="text-muted-foreground">— single FK, only ONE project possible</span></Row>
        <Row><span className="text-sky-500">ctx_scope_assignments</span>(entity=&apos;file&apos;, scope=<span className="text-violet-500">sc_acme</span>)</Row>
        <Row><span className="text-sky-500">ctx_task_associations</span>(entity=&apos;file&apos;, task=<span className="text-rose-500">tk_motion</span>)  <span className="text-muted-foreground">— separate table again</span></Row>
        <div className="text-[11px] text-muted-foreground">3 tables, 2 shapes, 1 FK ceiling. No row says &quot;this also lives in the matter.&quot;</div>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">One polymorphic table</div>
      <Row><span className="text-emerald-500">ctx_associations</span>(entity=&apos;user_file&apos;:f1, target=&apos;scope&apos;:<span className="text-violet-500">sc_acme</span>)</Row>
      <Row><span className="text-emerald-500">ctx_associations</span>(entity=&apos;user_file&apos;:f1, target=&apos;project&apos;:<span className="text-amber-500">pr_acme_lit</span>)</Row>
      <Row><span className="text-emerald-500">ctx_associations</span>(entity=&apos;user_file&apos;:f1, target=&apos;task&apos;:<span className="text-rose-500">tk_motion</span>)</Row>
      <div className="pt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">…or the single strongest row (assign-to-item)</div>
      <Row><span className="text-emerald-500">ctx_context_item_values</span>(scope=<span className="text-violet-500">sc_acme</span>, item=opagreement, <span className="text-emerald-500">value_kind=&apos;reference&apos;</span>, ref_entity_type=&apos;user_file&apos;, ref_entity_id=f1)</Row>
      <div className="text-[11px] text-muted-foreground">org stays the tenancy owner FK (<span className="font-mono">user_files.organization_id</span>) — never an association.</div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   The 3-mechanism taxonomy (§0) — the mental model, rendered as a legend
   ════════════════════════════════════════════════════════════════════════ */

const MECHANISMS: { icon: LucideIcon; name: string; expresses: string; storage: string; mult: string; tone: string }[] = [
  { icon: Lock, name: "Ownership / containment", expresses: "“you belong / live inside”", storage: "hard FK (the spine)", mult: "single-parent", tone: "text-slate-600 dark:text-slate-300" },
  { icon: Network, name: "Loose membership", expresses: "“filed under / tagged to”", storage: "ctx_associations", mult: "many-to-many · no role", tone: "text-emerald-600 dark:text-emerald-400" },
  { icon: ListChecks, name: "Typed slot", expresses: "“X’s «role» IS Y” (maybe required)", storage: "ctx_context_item_values", mult: "per-item cardinality", tone: "text-violet-600 dark:text-violet-400" },
];

function TaxonomyLegend() {
  return (
    <div className="rounded-xl border-2 border-border overflow-hidden">
      <div className="bg-muted/40 border-b-2 border-border px-5 py-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Every relationship is exactly one of these three (§0)</h2>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-border">
        {MECHANISMS.map((m) => {
          const Icon = m.icon;
          return (
            <div key={m.name} className="p-4 space-y-1.5">
              <div className={cn("flex items-center gap-2 text-sm font-semibold", m.tone)}><Icon className="h-4 w-4" />{m.name}</div>
              <div className="text-xs text-foreground">{m.expresses}</div>
              <div className="text-[11px] text-muted-foreground font-mono">{m.storage}</div>
              <Badge variant="secondary" className="text-[10px]">{m.mult}</Badge>
            </div>
          );
        })}
      </div>
      <div className="border-t-2 border-border bg-card/40 px-5 py-2 text-[11px] text-muted-foreground">
        Orthogonal to all three: <b>Audit + tenancy</b> (fixed columns, org owner) and <b>Active Context</b> (runtime, feeds the agent). Store explicit, derive the rest.
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   UI 5 — Scope-as-value: the relational graph (§3.5, the breakthrough)
   ════════════════════════════════════════════════════════════════════════ */

const REL_ITEMS: { key: string; label: string; targets: string[]; multi: boolean }[] = [
  { key: "client", label: "client", targets: ["sc_acme"], multi: false },
  { key: "opposing_counsel", label: "opposing_counsel", targets: ["sc_oppcounsel"], multi: false },
  { key: "experts", label: "experts", targets: ["sc_expert_a", "sc_expert_b"], multi: true },
];

function ScopeAsValueUI({ era }: { era: Era }) {
  const [focus, setFocus] = useState("sc_expert_a");
  if (era !== "future") {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border bg-card p-3">
        <Ban className="h-5 w-5 text-rose-500" />
        <div className="text-sm">Today scopes can&apos;t reference each other — there&apos;s no typed-reference value. No relational graph exists.</div>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border bg-card p-3">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold"><CircleDot className="h-4 w-4 text-violet-500" />Case 12345 <span className="text-[11px] font-normal text-muted-foreground">(a Matter scope)</span></div>
        <div className="space-y-1.5">
          {REL_ITEMS.map((it) => (
            <div key={it.key} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-mono text-[11px] text-emerald-600 dark:text-emerald-400 w-36 shrink-0">.{it.label}</span>
              <ArrowRight className="h-3 w-3 text-muted-foreground" />
              {it.targets.map((t) => <NodeChip key={t} id={t} />)}
              <Badge variant="outline" className="text-[10px]">{it.multi ? "multi" : "single"} · ref→scope</Badge>
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-lg border border-dashed border-border p-3">
        <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Reverse lookup (derived, never stored)</div>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {["sc_expert_a", "sc_expert_b", "sc_oppcounsel"].map((id) => (
            <button key={id} onClick={() => setFocus(id)} className={cn("rounded-md border px-2 py-1 text-xs", focus === id ? "border-primary bg-accent" : "border-border")}>{byId(id).label}</button>
          ))}
        </div>
        <div className="text-sm flex items-center gap-2">
          <span className="text-muted-foreground text-xs">“Which matters name</span>
          <NodeChip id={focus} />
          <span className="text-muted-foreground text-xs">?” →</span>
          <NodeChip id="sc_case" />
        </div>
        <div className="mt-1.5 text-[11px] text-muted-foreground">Computed from the <span className="font-mono">(ref_entity_type, ref_entity_id)</span> index — the reference lives once, on Case 12345; the reverse is free.</div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   UI 6 — Required slots → surface-as-gaps (§3.4)
   ════════════════════════════════════════════════════════════════════════ */

function RequiredSlotsUI() {
  const required = { item: "communication_agent", type: "agent", onType: "Clients" };
  const rows = [
    { scope: "Acme Corp", filled: "Acme Intake Agent" },
    { scope: "Globex", filled: null },
    { scope: "Initech", filled: null },
  ];
  const filled = rows.filter((r) => r.filled).length;
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border bg-card p-3">
        <div className="flex items-center gap-2 text-sm">
          <ShieldCheck className="h-4 w-4 text-emerald-500" />
          <span>Required item <span className="font-mono text-[12px] text-emerald-600 dark:text-emerald-400">{required.item}</span> <span className="text-muted-foreground text-xs">(type: {required.type})</span> on every <b>{required.onType}</b> scope</span>
        </div>
      </div>
      <div className="space-y-1.5">
        {rows.map((r) => (
          <div key={r.scope} className={cn("flex items-center justify-between rounded-md border px-3 py-2 text-sm", r.filled ? "border-border" : "border-amber-300/60 bg-amber-50/50 dark:bg-amber-950/30")}>
            <span className="flex items-center gap-2"><CircleDot className="h-3.5 w-3.5 text-violet-500" />{r.scope}</span>
            {r.filled ? (
              <span className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400"><Check className="h-3.5 w-3.5" />{r.filled}</span>
            ) : (
              <span className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-300"><ShieldAlert className="h-3.5 w-3.5" />Gap — <button className="underline">assign one</button></span>
            )}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-emerald-500" style={{ width: `${(filled / rows.length) * 100}%` }} />
        </div>
        <span className="text-xs text-muted-foreground">{filled}/{rows.length} compliant</span>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   UI 7 — Context Hints: the sanctioned Active→Durable bridge (§6)
   ════════════════════════════════════════════════════════════════════════ */

function ContextHintsUI() {
  const [decided, setDecided] = useState<null | "added" | "dismissed">(null);
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs">
        <span className="text-muted-foreground">Active context right now:</span>{" "}
        <span className="font-medium">Titanium Marketing</span> · <span className="font-medium">SEO department</span>
      </div>
      <div className="rounded-lg border border-border bg-card p-3 text-sm">You just created an <b>agent</b>. It is <i>not</i> auto-filed anywhere.</div>
      {decided === null ? (
        <div className="rounded-lg border-2 border-dashed border-sky-300/70 bg-sky-50 dark:bg-sky-950/40 p-3 space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-sky-800 dark:text-sky-200"><Bell className="h-4 w-4" />A nudge — never an auto-write</div>
          <div className="text-xs text-sky-900/80 dark:text-sky-200/80">You&apos;re working in the SEO department. Add this agent to its corpus?</div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => setDecided("added")}><Plus className="h-3.5 w-3.5 mr-1" />Add to SEO department</Button>
            <Button size="sm" variant="outline" onClick={() => setDecided("dismissed")}>Not now</Button>
          </div>
        </div>
      ) : (
        <div className={cn("rounded-lg border p-3 text-sm", decided === "added" ? "border-emerald-300/60 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200" : "border-border text-muted-foreground")}>
          {decided === "added" ? <span className="flex items-center gap-2"><Check className="h-4 w-4" />Durable association written — by your explicit choice.</span> : "Dismissed. Nothing was written. Active context stayed ephemeral."}
          <button className="ml-2 underline text-xs" onClick={() => setDecided(null)}>reset</button>
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   PAGE
   ════════════════════════════════════════════════════════════════════════ */

export default function ContextLabPage() {
  const [era, setEra] = useState<Era>("future");
  const [mode, setMode] = useState<"assignment" | "active">("assignment");

  return (
    <div className="min-h-dvh bg-textured">
      <div className="mx-auto max-w-[1600px] p-5 lg:p-8 space-y-7">
        {/* Header + global playground controls */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-primary"><Sparkles className="h-3.5 w-3.5" /> Context Lab · non-DB playground · for Arman</div>
            <h1 className="text-3xl font-bold">The ctx system — playground</h1>
            <p className="max-w-3xl text-sm text-muted-foreground">Faked local state, no DB. Flip the era to watch the <b>ctx_associations</b> overhaul reshape the UI. Every block separates the <b>real UI that ships</b> from the <b>notes</b>.</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="inline-flex rounded-lg border-2 border-border bg-card p-0.5">
              <button onClick={() => setEra("today")} className={cn("rounded-md px-4 py-1.5 text-sm font-semibold", era === "today" ? "bg-rose-500 text-white" : "text-muted-foreground")}>Today (FK)</button>
              <button onClick={() => setEra("future")} className={cn("rounded-md px-4 py-1.5 text-sm font-semibold", era === "future" ? "bg-emerald-600 text-white" : "text-muted-foreground")}>Future (ctx_associations)</button>
            </div>
            <div className="inline-flex rounded-md border border-border bg-card p-0.5">
              <button onClick={() => setMode("assignment")} className={cn("rounded px-3 py-1 text-xs font-medium", mode === "assignment" ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>Assignment</button>
              <button onClick={() => setMode("active")} className={cn("rounded px-3 py-1 text-xs font-medium", mode === "active" ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>Active context</button>
            </div>
          </div>
        </div>

        <TaxonomyLegend />

        <ConceptBlock
          icon={Layers}
          kicker="The missing primitive"
          title="ContextAssignmentField"
          intro={<>One component for org/scope/project/task, multi-select with inline <b>+ create</b>. Flip the era toggle: Today it&apos;s a scope-tagger glued next to single-FK project/task dropdowns; Future it&apos;s one uniform multi-everything field with cascade.</>}
          ui={<AssignmentFieldUI era={era} mode={mode} />}
          notes={<>
            <Note><b>The whole game.</b> This is the component that doesn&apos;t exist yet. The inline <b>+ create</b> is what gets brand-new users to opt in — they never leave the flow to make a first scope.</Note>
            <Note tone="good"><b>One prop flips meaning.</b> <i>Assignment</i> → <code>ctx_associations</code>. <i>Active</i> → <code>appContextSlice</code>. Same UI, different contract — that&apos;s how surfaces stop guessing. Toggle &quot;Active context&quot; above.</Note>
            <Note tone="warn"><b>Org is locked, both eras.</b> Single owning FK (tenancy/RLS/billing). The brief confirms: org is never an association.</Note>
          </>}
        />

        <ConceptBlock
          icon={ArrowRight}
          kicker="The flagship interaction"
          title="Assign a resource to a context ITEM"
          intro={<>A context item like <b>Operating Agreement</b> (type: file) is a typed slot. Dropping the PDF in fills the scope&apos;s value AND cascades. This is the new <code>value_kind=&apos;reference&apos;</code> from the brief — it doesn&apos;t exist Today (flip the toggle to see the dead end).</>}
          ui={<ItemAssignmentUI era={era} />}
          notes={<>
            <Note tone="good"><b>Scope values and resource tagging become one act.</b> The file <i>is</i> the agreement (structured data) and it&apos;s the most-specific node, so it cascades the furthest.</Note>
            <Note><b>Store explicit, derive ancestors.</b> Only the one item-value row is written; item→scope→type→org is computed at read time. No materialized ancestors = no edit contradictions.</Note>
            <Note tone="warn"><b>Lateral edges are suggested, not auto-written.</b> A scope can sit in many projects — never silently attach the file to all of them.</Note>
          </>}
        />

        <ConceptBlock
          icon={MessageSquare}
          kicker="The §6 distinction (known agent failure mode)"
          title="Active Context vs Durable Association"
          intro={<>They look identical and that&apos;s the trap. Same chips, totally different lifetimes and tables. Conflating them is exactly what the brief flags as the thing to never do.</>}
          ui={<ActiveVsDurableUI />}
          notes={<>
            <Note tone="warn"><b>The failure mode:</b> a picker that &quot;helpfully&quot; writes your chat&apos;s active selection into a durable file tag — or vice-versa. One <code>mode</code> prop on the shared field prevents it structurally.</Note>
            <Note><b>Where each lives:</b> Active = chat composer, the sidebar context picker. Durable = note save, file upload, agent edit, the item-value drop above.</Note>
          </>}
        />

        <ConceptBlock
          icon={Database}
          kicker="See the data through the UI"
          title="What actually gets written"
          intro={<>Since you read UI before data — here are the literal rows for the same file, Today vs Future. Flip the toggle.</>}
          ui={<DataShapeUI era={era} />}
          notes={<>
            <Note><b>Compat-views strategy</b> (from the brief): readers keep working through views over <code>ctx_associations</code>; only writers repoint. End users see zero change during migration.</Note>
            <Note tone="good"><b>One table, one picker, one mental model.</b> The 3-tables-2-shapes mess on the left is the whole reason the UI has been impossible to get right.</Note>
          </>}
        />

        <ConceptBlock
          icon={GitBranch}
          kicker="The breakthrough (§3.5)"
          title="Scope-as-value — scopes reference scopes"
          intro={<>A scope can be the typed value of another scope&apos;s item. <code>Case 12345.opposing_counsel → «Dewey &amp; Cheatem»</code>. The scope set becomes a real, typed, directional entity-relationship graph — and the reverse direction is free.</>}
          ui={<ScopeAsValueUI era={era} />}
          notes={<>
            <Note tone="good"><b>Directional by construction.</b> The reference lives once, on the source scope&apos;s item. &quot;Which matters name expert X?&quot; is <i>derived</i> from the <code>(ref_entity_type, ref_entity_id)</code> index — never stored twice.</Note>
            <Note><b>The item key IS the role.</b> No <code>relationship_kind</code> column anywhere — &quot;client&quot;, &quot;opposing_counsel&quot;, &quot;experts&quot; are the typed, named, directional relationships.</Note>
            <Note tone="warn"><b>Cardinality (open §7.2):</b> client = single, experts = many — maps onto the item&apos;s <code>max_assignments_per_entity</code>. My vote: make it per-item, not per-type.</Note>
          </>}
        />

        <ConceptBlock
          icon={ShieldCheck}
          kicker="Enforceable structure (§3.4)"
          title="Required slots → surface as gaps"
          intro={<>An item can be <b>required</b>: every Client must have a <code>communication_agent</code>. That converts loose options into org-admin-enforceable structure — shown as a compliance/gaps view, not a hard block.</>}
          ui={<RequiredSlotsUI />}
          notes={<>
            <Note tone="good"><b>Surface-as-gaps, never block-on-write (open §7.3 — my strong vote).</b> Hard-blocking writes in a knowledge system creates dead-ends and kills adoption. Show what&apos;s missing; let admins chase it.</Note>
            <Note><b>This is structure we have zero of today.</b> &quot;Every client needs a dedicated agent&quot; becomes a measurable, fillable checklist instead of tribal knowledge.</Note>
          </>}
        />

        <ConceptBlock
          icon={Bell}
          kicker="The sanctioned bridge (§6)"
          title="Context Hints — Active seeds Durable, never auto-writes"
          intro={<>Active Context may <b>suggest</b> durable associations — but a human always confirms. This is the exact line coding agents keep crossing; here it&apos;s a nudge with an explicit Add.</>}
          ui={<ContextHintsUI />}
          notes={<>
            <Note tone="warn"><b>The forbidden move:</b> silently turning your chat&apos;s active selection into a permanent file/agent tag. The hint makes the helpfulness available <i>without</i> the data corruption.</Note>
            <Note><b>Why it&apos;s safe:</b> dismiss writes nothing; Add writes one explicit row. Active context stays ephemeral either way.</Note>
          </>}
        />

        {/* Bottom line — informative, intentionally OUTSIDE the concept frames */}
        <Card className="p-5 border-primary/30 bg-primary/[0.03]">
          <div className="mb-2 flex items-center gap-2"><Lightbulb className="h-5 w-5 text-primary" /><h2 className="text-lg font-bold">Where this is going (matches the migration brief)</h2></div>
          <ol className="max-w-3xl list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
            <li><b>One <code>ctx_associations</code> table</b> folds in scope + task assignments and the dropped project/task FK litter.</li>
            <li><b>Org stays the tenancy owner FK</b> — backfilled, NOT NULL, never an association.</li>
            <li><b><code>ctx_context_item_values</code> gains <code>value_kind</code> + <code>ref_entity_type/id</code></b> → the &quot;assign a resource to a typed slot&quot; flagship.</li>
            <li><b>FK spine = containment stays</b> (task in project); the polymorphic table is the resource↔node M2M.</li>
            <li><b>Active Context (<code>ctx_user_active_context</code>) stays separate</b> from durable associations — the one <code>mode</code> prop keeps the UI honest.</li>
            <li><b>Build-new + backfill + compat-views first; drop columns later.</b> Zero end-user behavior change throughout.</li>
          </ol>
        </Card>
      </div>
    </div>
  );
}
