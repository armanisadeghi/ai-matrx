"use client";

// KitDetail — one kit, before and after install: what it teaches, how it works
// (drawn), every table with its example rows, the agent it forks and which of its
// variables get connected, the workflow, the guide — and the install rail.

import Link from "next/link";
import { BrainCircuit, Lightbulb, Link2, ListOrdered, Table2, Workflow } from "lucide-react";
import type { ReactNode } from "react";
import PageHeader from "@/features/shell/components/header/PageHeader";
import HeaderStructured from "@/features/shell/components/header/variants/variants/HeaderStructured";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { KIT_ROUTES, KIT_WORD } from "../constants";
import { useKitInstall } from "../hooks/useKitInstall";
import type { KitEntry, KitHighlightKind, KitManifest } from "../types";
import { describeBinding, HowItWorks } from "./HowItWorks";
import { InstallPanel } from "./InstallPanel";
import { KitIcon } from "./KitIcon";
import { WhatYouGet } from "./KitCard";
import { TablePreview } from "./TablePreview";

export interface SourceAgentFacts {
  id: string;
  name: string;
  description: string | null;
}

function Section({ id, icon, title, children, aside }: { id?: string; icon: ReactNode; title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-muted-foreground">{icon}</span>
        <h2 className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>
        {aside && <div className="ml-auto">{aside}</div>}
      </div>
      {children}
    </section>
  );
}

const HIGHLIGHT_WORD: Record<KitHighlightKind, string> = {
  table: "Table",
  agent: "Agent",
  workflow: "Workflow",
  binding: "Connection",
};

function workflowSteps(definition: unknown): string[] {
  if (!definition || typeof definition !== "object") return [];
  const d = definition as { nodes?: { id?: string; data?: { label?: string } }[]; entry_nodes?: string[]; edges?: { source?: string; target?: string }[] };
  const nodes = d.nodes ?? [];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const edges = d.edges ?? [];
  const order: string[] = [];
  let cur = d.entry_nodes?.[0] ?? nodes[0]?.id;
  const seen = new Set<string>();
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    const n = byId.get(cur);
    if (n?.data?.label) order.push(n.data.label);
    cur = edges.find((e) => e.source === cur)?.target;
  }
  return order.length > 0 ? order : nodes.map((n) => n.data?.label).filter((x): x is string => !!x);
}

export function KitAgentsSection({ manifest, sourceAgents }: { manifest: KitManifest; sourceAgents: Record<string, SourceAgentFacts> }) {
  return (
    <div className="space-y-3">
      {manifest.agents.map((a) => {
        const src = sourceAgents[a.source_agent_id];
        return (
          <div key={a.key} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <BrainCircuit className="h-4.5 w-4.5" />
              </span>
              <div className="min-w-0 flex-1">
                <h4 className="text-sm font-semibold text-foreground">{a.name}</h4>
                <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{a.description}</p>
                <div className="mt-2 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                  <span>A copy of</span>
                  <EntityRef token="agent" id={a.source_agent_id} name={src?.name ?? null} className="text-xs" />
                  <span>— the original is never changed.</span>
                </div>
              </div>
            </div>
            {a.bindings.length > 0 && (
              <div className="mt-3 space-y-1.5 border-t border-border pt-3">
                {a.bindings.map((b) => {
                  const table = manifest.tables.find((t) => t.key === b.binding.table_key);
                  return (
                    <div key={b.variable} className="flex flex-wrap items-center gap-1.5 text-xs">
                      <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11.5px] text-foreground">{`{{${b.variable}}}`}</code>
                      <Link2 className="h-3 w-3 text-muted-foreground" />
                      <span className="font-medium text-foreground">{table?.name ?? b.binding.table_key}</span>
                      <span className="text-muted-foreground">· {describeBinding(b.binding).toLowerCase()}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function KitDetail({
  kit,
  sourceAgents,
  refNames,
}: {
  kit: KitEntry;
  sourceAgents: Record<string, SourceAgentFacts>;
  refNames: Record<string, string>;
}) {
  const m = kit.manifest;
  const api = useKitInstall(m);
  const installed = api.install?.status === "installed";

  return (
    <>
      <PageHeader>
        <HeaderStructured back title={m.name} context={<span className="text-xs text-muted-foreground">{KIT_WORD.one} · {m.category}</span>} />
      </PageHeader>
      <div className="h-full overflow-y-auto bg-textured">
        <div className="mx-auto w-full max-w-6xl px-4 pb-20 pt-[calc(var(--shell-header-h)+1.25rem)] sm:px-6">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="min-w-0 space-y-10">
              {/* Identity */}
              <header>
                <div className="flex items-start gap-4">
                  <KitIcon name={m.icon} tintKey={kit.key} size="lg" />
                  <div className="min-w-0 flex-1">
                    <Link href={KIT_ROUTES.gallery} className="text-xs font-medium text-muted-foreground hover:text-foreground">
                      {KIT_WORD.many}
                    </Link>
                    <h1 className="mt-0.5 text-2xl font-semibold tracking-tight text-foreground">{m.name}</h1>
                    <p className="mt-1 text-[15px] leading-relaxed text-foreground/80">{m.tagline}</p>
                    <WhatYouGet kit={kit} className="mt-3 flex flex-wrap items-center gap-1.5" />
                  </div>
                </div>
                {m.description && <p className="mt-5 max-w-3xl text-sm leading-relaxed text-muted-foreground">{m.description}</p>}
                {m.teaches.length > 0 && (
                  <ul className="mt-5 grid gap-2 sm:grid-cols-3">
                    {m.teaches.map((t) => (
                      <li key={t} className="flex gap-2 rounded-lg border border-border bg-card p-3">
                        <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
                        <span className="text-xs leading-relaxed text-foreground/85">{t}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </header>

              <Section icon={<Link2 className="h-3.5 w-3.5" />} title="How it works">
                <HowItWorks manifest={m} />
              </Section>

              <Section icon={<Table2 className="h-3.5 w-3.5" />} title={m.tables.length === 1 ? "The table" : "The tables"}>
                <div className="space-y-3">
                  {m.tables.map((t) => (
                    <TablePreview key={t.key} table={t} kitKey={kit.key} refNames={refNames} />
                  ))}
                </div>
              </Section>

              {m.agents.length > 0 && (
                <Section icon={<BrainCircuit className="h-3.5 w-3.5" />} title={m.agents.length === 1 ? "The agent" : "The agents"}>
                  <KitAgentsSection manifest={m} sourceAgents={sourceAgents} />
                </Section>
              )}

              {m.workflows.length > 0 && (
                <Section icon={<Workflow className="h-3.5 w-3.5" />} title={m.workflows.length === 1 ? "The workflow" : "The workflows"}>
                  <div className="space-y-3">
                    {m.workflows.map((w) => {
                      const steps = workflowSteps(w.definition);
                      return (
                        <div key={w.key} className="rounded-xl border border-border bg-card p-4">
                          <h4 className="text-sm font-semibold text-foreground">{w.name}</h4>
                          <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{w.description}</p>
                          {steps.length > 0 && (
                            <ol className="mt-3 flex flex-wrap items-center gap-1.5">
                              {steps.map((s, i) => (
                                <li key={`${s}-${i}`} className="flex items-center gap-1.5">
                                  <span className="rounded-md border border-border bg-muted/40 px-2 py-1 text-[11px] font-medium text-foreground">
                                    <span className="mr-1 text-muted-foreground">{i + 1}</span>
                                    {s}
                                  </span>
                                  {i < steps.length - 1 && <span className="text-muted-foreground/60">→</span>}
                                </li>
                              ))}
                            </ol>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </Section>
              )}

              {m.guide.length > 0 && (
                <Section icon={<ListOrdered className="h-3.5 w-3.5" />} title="Walkthrough">
                  <ol className="space-y-2">
                    {m.guide.map((g, i) => (
                      <li key={g.title} className="flex gap-3 rounded-xl border border-border bg-card p-4">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-foreground text-[11px] font-semibold text-background">
                          {i + 1}
                        </span>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="text-sm font-semibold text-foreground">{g.title}</h4>
                            {g.highlight && (
                              <span className="rounded-full bg-muted px-1.5 py-px text-[10px] font-medium text-muted-foreground">
                                {HIGHLIGHT_WORD[g.highlight.kind]}
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{g.body}</p>
                        </div>
                      </li>
                    ))}
                  </ol>
                  {installed && (
                    <Link
                      href={KIT_ROUTES.installed(m.key)}
                      className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                    >
                      Follow along in your installed {KIT_WORD.oneLower} →
                    </Link>
                  )}
                </Section>
              )}
            </div>

            <aside className="order-first lg:order-none lg:sticky lg:top-[calc(var(--shell-header-h)+1.25rem)] lg:self-start">
              <InstallPanel manifest={m} api={api} />
            </aside>
          </div>
        </div>
      </div>
    </>
  );
}
