"use client";

// /demos/scopes/context-lab
//
// A private, NON-DB, fully-faked lab to look at every "ctx" interaction in one
// place and to prototype the proposed entity+M2M model with cascade. Nothing
// here touches Redux or Supabase — it's pure local state with mock data so we
// can see the BEHAVIOR we want before committing to the real wiring.
//
// Built for Arman to evaluate, not for end users. Annotations are inline.

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
  ArrowRight,
  CornerDownRight,
  Lightbulb,
  Lock,
  Sparkles,
  Layers,
  CircleDot,
  Wand2,
  AlertTriangle,
  type LucideIcon,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/* ────────────────────────────────────────────────────────────────────────
   FAKE DATA — a law firm org, modeled the way the REAL ctx system would.
   node kinds: org (owner) · scope_type · scope · context_item · project · task
   ──────────────────────────────────────────────────────────────────────── */

type NodeKind = "org" | "scope_type" | "scope" | "item" | "project" | "task";

interface Node {
  id: string;
  kind: NodeKind;
  label: string;
  sub?: string;
  // vertical-spine parent (unambiguous, auto-cascaded UP)
  parent?: string;
  // lateral links (ambiguous, M2M — only SUGGESTED, never auto-attached)
  lateral?: string[];
  valueType?: "text" | "file" | "number";
}

const ORG: Node = {
  id: "org_castellano",
  kind: "org",
  label: "Castellano & Reyes, LLP",
  sub: "Owning organization",
};

const NODES: Node[] = [
  ORG,
  // scope types
  { id: "st_clients", kind: "scope_type", label: "Clients", parent: ORG.id },
  { id: "st_matters", kind: "scope_type", label: "Matters", parent: ORG.id },
  // scopes (instances)
  { id: "sc_acme", kind: "scope", label: "Acme Corp", sub: "Client", parent: "st_clients", lateral: ["pr_acme_lit"] },
  { id: "sc_globex", kind: "scope", label: "Globex", sub: "Client", parent: "st_clients", lateral: ["pr_globex_ma"] },
  { id: "sc_acme_v_globex", kind: "scope", label: "Acme v. Globex", sub: "Matter", parent: "st_matters", lateral: ["pr_acme_lit"] },
  // context items (typed slots defined on the Clients scope type)
  { id: "it_opagreement", kind: "item", label: "Operating Agreement", sub: "on Clients · file", parent: "st_clients", valueType: "file" },
  { id: "it_engagement", kind: "item", label: "Engagement Letter", sub: "on Clients · file", parent: "st_clients", valueType: "file" },
  { id: "it_industry", kind: "item", label: "Industry", sub: "on Clients · text", parent: "st_clients", valueType: "text" },
  // projects (M2M with scopes via lateral)
  { id: "pr_acme_lit", kind: "project", label: "Acme v. Globex Litigation", parent: ORG.id },
  { id: "pr_globex_ma", kind: "project", label: "Globex M&A", parent: ORG.id },
  // tasks
  { id: "tk_motion", kind: "task", label: "Draft motion to compel", parent: "pr_acme_lit" },
  { id: "tk_discovery", kind: "task", label: "Review discovery", parent: "pr_acme_lit" },
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

/* Walk the unambiguous vertical spine UP from a node (auto-derived ancestors). */
function spine(id: string): string[] {
  const out: string[] = [];
  let cur: Node | undefined = byId(id);
  while (cur?.parent) {
    out.push(cur.parent);
    cur = byId(cur.parent);
  }
  return out;
}

/* Lateral (ambiguous) suggestions for a node — NOT auto-attached. */
function lateralSuggestions(id: string): string[] {
  return byId(id).lateral ?? [];
}

/* ────────────────────────────────────────────────────────────────────────
   Small presentational atoms
   ──────────────────────────────────────────────────────────────────────── */

function NodeChip({
  id,
  derived,
  onRemove,
}: {
  id: string;
  derived?: boolean;
  onRemove?: () => void;
}) {
  const n = byId(id);
  const m = KIND_META[n.kind];
  const Icon = m.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full pl-2 pr-1.5 py-1 text-xs font-medium border",
        derived
          ? "border-dashed border-border bg-muted/40 text-muted-foreground"
          : cn("border-transparent", m.chip),
      )}
      title={derived ? "Derived automatically (vertical spine)" : "Explicitly assigned"}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      {n.label}
      {derived ? (
        <span className="text-[9px] uppercase tracking-wide opacity-70">auto</span>
      ) : onRemove ? (
        <button onClick={onRemove} className="rounded p-0.5 hover:bg-black/10 dark:hover:bg-white/10" aria-label="Remove">
          <X className="h-3 w-3" />
        </button>
      ) : null}
    </span>
  );
}

function SectionHeader({ icon: Icon, title, kicker }: { icon: LucideIcon; title: string; kicker: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 rounded-lg bg-primary/10 p-2 text-primary shrink-0">
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{kicker}</div>
        <h2 className="text-lg font-bold text-foreground leading-tight">{title}</h2>
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

/* ────────────────────────────────────────────────────────────────────────
   PANEL 1 — The unified ContextAssignmentField (the missing primitive)
   ──────────────────────────────────────────────────────────────────────── */

const ASSIGNABLE: { kind: NodeKind; ids: string[] }[] = [
  { kind: "scope", ids: ["sc_acme", "sc_globex", "sc_acme_v_globex"] },
  { kind: "project", ids: ["pr_acme_lit", "pr_globex_ma"] },
  { kind: "task", ids: ["tk_motion", "tk_discovery"] },
];

function AssignmentField({
  mode,
}: {
  mode: "assignment" | "active";
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set(["sc_acme"]));
  const [openKind, setOpenKind] = useState<NodeKind | null>(null);

  const derived = useMemo(() => {
    const s = new Set<string>();
    picked.forEach((id) => spine(id).forEach((p) => s.add(p)));
    // remove any that are also explicitly picked
    picked.forEach((id) => s.delete(id));
    return s;
  }, [picked]);

  const suggestions = useMemo(() => {
    const s = new Set<string>();
    picked.forEach((id) => lateralSuggestions(id).forEach((l) => { if (!picked.has(l)) s.add(l); }));
    return [...s];
  }, [picked]);

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      {/* The "resource" being assigned */}
      <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
        <div className="rounded-md bg-rose-100 dark:bg-rose-950 p-2 text-rose-600 dark:text-rose-400">
          <FileText className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold">Acme_Operating_Agreement_scan.pdf</div>
          <div className="text-xs text-muted-foreground">
            {mode === "assignment"
              ? "Source resource being created — tag it now (writes ctx_scope_assignments)"
              : "Current chat work — what is this relevant to? (writes appContextSlice, no DB tag)"}
          </div>
        </div>
      </div>

      {/* Owner org — always present, never a casual multi-tag */}
      <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2">
        <div className="flex items-center gap-2 text-sm">
          <Lock className="h-3.5 w-3.5 text-muted-foreground" />
          <Building2 className="h-4 w-4 text-slate-500" />
          <span className="font-medium">{ORG.label}</span>
        </div>
        <Badge variant="outline" className="text-[10px]">owning org · single</Badge>
      </div>

      {/* The pickers: scope / project / task — each multi-select with inline + create */}
      <div className="space-y-2">
        {ASSIGNABLE.map(({ kind, ids }) => {
          const m = KIND_META[kind];
          const Icon = m.icon;
          const open = openKind === kind;
          return (
            <div key={kind} className="rounded-lg border border-border">
              <button
                onClick={() => setOpenKind(open ? null : kind)}
                className="flex w-full items-center justify-between px-3 py-2 text-left"
              >
                <span className="flex items-center gap-2 text-sm font-medium">
                  <Icon className={cn("h-4 w-4", m.tone)} />
                  {m.word}s
                  <span className="text-xs text-muted-foreground">
                    {ids.filter((i) => picked.has(i)).length} selected
                  </span>
                </span>
                <Badge variant="secondary" className="text-[10px]">multi</Badge>
              </button>
              {open && (
                <div className="border-t border-border p-2 space-y-1">
                  {ids.map((id) => {
                    const n = byId(id);
                    const on = picked.has(id);
                    return (
                      <button
                        key={id}
                        onClick={() => toggle(id)}
                        className={cn(
                          "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm",
                          on ? "bg-accent" : "hover:bg-muted",
                        )}
                      >
                        <span className="flex items-center gap-2">
                          <span className={cn("flex h-4 w-4 items-center justify-center rounded border", on ? "bg-primary border-primary text-primary-foreground" : "border-border")}>
                            {on && <Check className="h-3 w-3" />}
                          </span>
                          {n.label}
                          {n.sub && <span className="text-[10px] text-muted-foreground">{n.sub}</span>}
                        </span>
                      </button>
                    );
                  })}
                  {/* THE critical affordance: inline create, never leave the flow */}
                  <button className="flex w-full items-center gap-2 rounded-md border border-dashed border-border px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:border-primary/40">
                    <Plus className="h-3.5 w-3.5" />
                    Create a new {m.word.toLowerCase()}…
                    <span className="ml-auto text-[10px] opacity-70">opens 1-line quick-add</span>
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Live result */}
      <div className="rounded-lg border border-border bg-card p-3 space-y-2">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {mode === "assignment" ? "This file is now tagged with" : "Active context for this work"}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <NodeChip id={ORG.id} />
          {[...picked].map((id) => (
            <NodeChip key={id} id={id} onRemove={() => toggle(id)} />
          ))}
          {[...derived].map((id) => (
            <NodeChip key={id} id={id} derived />
          ))}
          {picked.size === 0 && (
            <span className="text-xs text-muted-foreground italic">Nothing yet — opting out is allowed.</span>
          )}
        </div>
        {suggestions.length > 0 && (
          <div className="pt-1">
            <div className="text-[11px] text-muted-foreground mb-1 flex items-center gap-1">
              <Wand2 className="h-3 w-3" /> Suggested lateral links (one click — never auto-attached):
            </div>
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map((id) => (
                <button key={id} onClick={() => toggle(id)} className="inline-flex items-center gap-1 rounded-full border border-dashed border-amber-400/60 px-2 py-1 text-xs text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/40">
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

/* ────────────────────────────────────────────────────────────────────────
   PANEL 2 — Assign to a CONTEXT ITEM (the cascade unlock)
   ──────────────────────────────────────────────────────────────────────── */

function ItemAssignmentDemo() {
  const items = ["it_opagreement", "it_engagement", "it_industry"];
  const scopes = ["sc_acme", "sc_globex"];
  const [item, setItem] = useState<string>("it_opagreement");
  const [scope, setScope] = useState<string>("sc_acme");
  const [assigned, setAssigned] = useState(false);

  const itemNode = byId(item);
  const isFileSlot = itemNode.valueType === "file";

  // assigning to an item for a scope = the most-specific node. Spine derives the rest.
  const derivedSpine = useMemo(() => {
    // anchor at the scope (item belongs to a type; the actual instance is the scope)
    const base = [scope, ...spine(scope)];
    return base;
  }, [scope]);
  const lateral = useMemo(() => lateralSuggestions(scope), [scope]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="space-y-3">
        <div className="space-y-1.5">
          <div className="text-xs font-medium text-muted-foreground">1 · Which scope instance?</div>
          <div className="flex gap-2">
            {scopes.map((s) => (
              <button key={s} onClick={() => { setScope(s); setAssigned(false); }} className={cn("rounded-md border px-3 py-1.5 text-sm", scope === s ? "border-primary bg-accent" : "border-border")}>
                {byId(s).label}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <div className="text-xs font-medium text-muted-foreground">2 · Which typed slot (context item)?</div>
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
        </div>
        <Button
          size="sm"
          disabled={!isFileSlot}
          onClick={() => setAssigned(true)}
          className="w-full"
        >
          <FileText className="h-4 w-4 mr-1.5" />
          {isFileSlot ? `Set this PDF as ${byId(scope).label}'s ${itemNode.label}` : "Pick a file-type slot to drop the PDF"}
        </Button>
        {!isFileSlot && (
          <Note tone="warn">
            “{itemNode.label}” is a <b>{itemNode.valueType}</b> slot, so the PDF can&apos;t be its value — but a text slot could still hold an extracted summary. The slot&apos;s <i>type</i> drives what you can drop.
          </Note>
        )}
      </div>

      {/* Cascade visualization */}
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-3">
          What one assignment sets off
        </div>
        {!assigned ? (
          <div className="text-sm text-muted-foreground italic py-8 text-center">
            Assign the file to a slot to watch the chain light up →
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-300">
              <Check className="h-4 w-4" /> The file <b>is</b> {byId(scope).label}&apos;s {itemNode.label}.
            </div>
            <div className="text-xs text-muted-foreground">Auto-derived vertical spine (stored once, computed upward):</div>
            <div className="space-y-1.5">
              {[item, ...derivedSpine].map((id, idx) => (
                <div key={id} className="flex items-center gap-2" style={{ paddingLeft: idx * 14 }}>
                  {idx > 0 && <CornerDownRight className="h-3 w-3 text-muted-foreground" />}
                  <NodeChip id={id} derived={idx > 0} />
                </div>
              ))}
            </div>
            {lateral.length > 0 && (
              <div className="pt-1">
                <div className="text-[11px] text-amber-700 dark:text-amber-300 flex items-center gap-1 mb-1">
                  <Wand2 className="h-3 w-3" /> {byId(scope).label} is linked to a project — attach the file too?
                </div>
                {lateral.map((id) => (
                  <button key={id} className="inline-flex items-center gap-1 rounded-full border border-dashed border-amber-400/60 px-2 py-1 text-xs text-amber-700 dark:text-amber-300">
                    <Plus className="h-3 w-3" /> {byId(id).label} <span className="opacity-60">(suggested)</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   PANEL 3 — FK vs M2M opinion
   ──────────────────────────────────────────────────────────────────────── */

function ModelCompare() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card className="p-4 border-rose-300/50">
        <div className="flex items-center gap-2 mb-2">
          <Badge variant="outline" className="text-[10px] border-rose-400 text-rose-600">today</Badge>
          <h3 className="font-semibold text-sm">FK for org/project/task, M2M for scopes</h3>
        </div>
        <ul className="text-xs text-muted-foreground space-y-1.5 list-disc pl-4">
          <li>A file gets <b>one</b> project, <b>one</b> task — a lie; real work spans several.</li>
          <li>Two different pickers, two mental models (FK select vs scope tagger).</li>
          <li>No cascade — every link is set by hand.</li>
          <li>Org is an FK — which is actually <b>right</b> (tenancy boundary).</li>
        </ul>
      </Card>
      <Card className="p-4 border-emerald-300/50">
        <div className="flex items-center gap-2 mb-2">
          <Badge variant="outline" className="text-[10px] border-emerald-400 text-emerald-600">proposed</Badge>
          <h3 className="font-semibold text-sm">One M2M for scope/project/task/item · org stays owner</h3>
        </div>
        <ul className="text-xs text-muted-foreground space-y-1.5 list-disc pl-4">
          <li>One <code>context_assignments</code> table; one picker; one mental model.</li>
          <li>Multi-everything is honest about reality.</li>
          <li><b>Cascade:</b> assign the most-specific node, derive the vertical spine.</li>
          <li><b>Guardrail:</b> org stays a single owning FK (RLS / billing / isolation).</li>
          <li><b>Guardrail:</b> lateral edges (scope↔project) are <i>suggested</i>, not auto-written.</li>
          <li><b>Guardrail:</b> store explicit only, derive ancestors — no contradiction on edit.</li>
        </ul>
      </Card>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   PANEL 4 — Where each pattern should live (candidate placements)
   ──────────────────────────────────────────────────────────────────────── */

const PLACEMENTS: { where: string; route: string; pattern: string; mode: string }[] = [
  { where: "Note quick-save", route: "/notes (quick capture dialog)", pattern: "ContextAssignmentField (assignment)", mode: "Force it: source content almost always belongs to a scope." },
  { where: "File upload", route: "/files, /rag library", pattern: "ContextAssignmentField (assignment)", mode: "Show inline on the dropzone; opt-out allowed." },
  { where: "Chat composer", route: "/chat", pattern: "ContextAssignmentField (active)", mode: "Sets appContextSlice — 'this work is relevant to…' feeds the AI. NO db tag." },
  { where: "Agent edit", route: "/agents/[id]", pattern: "ContextAssignmentField (assignment)", mode: "Agent = Utility; multi-scope; auto-set org if none." },
  { where: "Scope value (item)", route: "/organizations/[org]/scopes/[type]/[scope]", pattern: "Item assignment (cascade)", mode: "Drop a resource into a typed slot = fill value + tag + cascade." },
  { where: "Empty org", route: "/organizations/[org]", pattern: "ScopeOnboarding", mode: "Done. Canonical first-run." },
  { where: "View hierarchy", route: "/organizations/[org]/settings?tab=members", pattern: "OrgScopeTree", mode: "Done. Canonical read-only viewer to push everywhere." },
];

function Placements() {
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-xs text-muted-foreground">
          <tr>
            <th className="text-left font-medium px-3 py-2">Where users actually work</th>
            <th className="text-left font-medium px-3 py-2">Route</th>
            <th className="text-left font-medium px-3 py-2">Canonical pattern</th>
            <th className="text-left font-medium px-3 py-2">How it behaves</th>
          </tr>
        </thead>
        <tbody>
          {PLACEMENTS.map((p) => (
            <tr key={p.where} className="border-t border-border">
              <td className="px-3 py-2 font-medium">{p.where}</td>
              <td className="px-3 py-2"><code className="text-[11px] text-muted-foreground">{p.route}</code></td>
              <td className="px-3 py-2"><Badge variant="secondary" className="text-[10px]">{p.pattern}</Badge></td>
              <td className="px-3 py-2 text-xs text-muted-foreground">{p.mode}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   PAGE
   ──────────────────────────────────────────────────────────────────────── */

export default function ContextLabPage() {
  const [mode, setMode] = useState<"assignment" | "active">("assignment");
  return (
    <div className="min-h-dvh bg-textured">
      <div className="mx-auto max-w-[1600px] p-5 lg:p-8 space-y-8">
        {/* Header */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-primary">
            <Sparkles className="h-3.5 w-3.5" /> Context Lab · non-DB prototype · for Arman
          </div>
          <h1 className="text-3xl font-bold">The ctx system, end to end — and where it should go</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Everything here is faked local state — no Redux, no Supabase. It exists so we can see the
            <b> behavior</b> we want (the unified picker, the entity+M2M model, and the cascade) before wiring it for real.
            My opinion is baked into the panels; the short version is at the bottom.
          </p>
        </div>

        {/* Panel 1 */}
        <Card className="p-5 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <SectionHeader
              icon={Layers}
              kicker="The missing primitive"
              title="ContextAssignmentField — one component, two modes"
            />
            <div className="inline-flex rounded-md border border-border bg-card p-0.5">
              <button onClick={() => setMode("assignment")} className={cn("rounded px-3 py-1 text-xs font-medium", mode === "assignment" ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>
                Assignment (Source/Utility)
              </button>
              <button onClick={() => setMode("active")} className={cn("rounded px-3 py-1 text-xs font-medium", mode === "active" ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>
                Active context (Chat)
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-5">
            <AssignmentField mode={mode} />
            <div className="space-y-3">
              <Note>
                <b>The whole game.</b> This is the one component that doesn&apos;t exist yet. Multi-select scope/project/task,
                each with an inline <b>+ create</b> so a brand-new user never has to leave the flow to make their first scope.
                That friction is exactly why people don&apos;t opt in today.
              </Note>
              <Note tone="good">
                <b>One prop flips the meaning.</b> In <i>Assignment</i> mode it writes <code>ctx_scope_assignments</code> (the file
                belongs to these). In <i>Active</i> mode it writes <code>appContextSlice</code> (the chat work is <i>relevant</i> to
                these — feeds the AI, no DB tag). Toggle it above — same UI, different contract. This is how we stop surfaces from
                &quot;doing stupid things&quot; by guessing.
              </Note>
              <Note tone="warn">
                <b>Org is locked.</b> One owning org (tenancy/RLS). Cross-org sharing stays an explicit, audited act — never a casual
                multi-tag. This is my one disagreement with &quot;multiple orgs if you want.&quot;
              </Note>
            </div>
          </div>
        </Card>

        {/* Panel 2 */}
        <Card className="p-5 space-y-4">
          <SectionHeader
            icon={ArrowRight}
            kicker="The unlock you stumbled into"
            title="Assign a resource to a context ITEM — and the chain sets itself"
          />
          <ItemAssignmentDemo />
          <Note tone="good">
            This is the best idea in your message. A context item like <b>Operating Agreement</b> (type: file) is a typed slot.
            Dropping the PDF into it for <b>Acme</b> does two things at once: it <b>fills the scope&apos;s value with a real resource</b>
            (structured data — the file <i>is</i> the agreement) and it&apos;s the <b>most-specific assignment</b>, so it cascades the
            furthest. Scope values and resource tagging become the same act.
          </Note>
        </Card>

        {/* Panel 3 */}
        <Card className="p-5 space-y-4">
          <SectionHeader icon={Scale} kicker="The architecture question" title="FK vs M2M — my recommendation" />
          <ModelCompare />
        </Card>

        {/* Panel 4 */}
        <Card className="p-5 space-y-4">
          <SectionHeader icon={ListChecks} kicker="Rollout map" title="Where each canonical pattern should live" />
          <Placements />
        </Card>

        {/* My bottom line */}
        <Card className="p-5 border-primary/30 bg-primary/[0.03]">
          <div className="flex items-center gap-2 mb-2">
            <Lightbulb className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-bold">My bottom line</h2>
          </div>
          <ol className="text-sm text-muted-foreground space-y-1.5 list-decimal pl-5 max-w-3xl">
            <li><b>Do the M2M unification</b> for scope/project/task/item — it&apos;s honest about reality and collapses 4 pickers into 1.</li>
            <li><b>Keep org as the single owning FK.</b> It&apos;s your tenancy/RLS/billing boundary; multi-org-per-row is an enterprise data-leak.</li>
            <li><b>Store explicit assignments only; derive the vertical spine</b> (item→scope→type→org) at read time. No materialized ancestors = no edit contradictions.</li>
            <li><b>Auto-cascade the spine; suggest lateral edges</b> (scope↔project) with one click — never silently attach a file to 5 projects.</li>
            <li><b>&quot;Assign to a context item&quot; is the flagship interaction.</b> It unifies scope values + resource tagging and triggers the deepest cascade. Build the picker around it.</li>
          </ol>
        </Card>
      </div>
    </div>
  );
}
