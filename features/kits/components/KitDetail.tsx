"use client";

// KitDetail — one kit, before and after install: what it teaches, how it works
// (drawn), every table with its example rows, the agent it forks and which of its
// variables get connected, the workflow, the guide — and the install rail.

import { variableLabel } from "@/features/templates/format";
import { useScopedTemplateKnobs } from "@/features/templates/knobs";
import Link from "next/link";
import { ArrowRight, Link2, Workflow } from "lucide-react";
import type { ReactNode } from "react";
import PageHeader from "@/features/shell/components/header/PageHeader";
import HeaderStructured from "@/features/shell/components/header/variants/variants/HeaderStructured";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { KIT_ROUTES, KIT_WORD } from "../constants";
import { useOrgFilterParam } from "@/lib/entity-list/orgFilterUrl";
import { useKitInstall } from "../hooks/useKitInstall";
import { useRouter } from "next/navigation";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { useOpenSaveKitDialog } from "@/features/overlays/openers/saveKitDialog";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { toast } from "@/lib/toast";
import { unpublishKit } from "../publish";
import type { HeaderAction } from "@/features/shell/components/header/variants/types";
import type { KitEntry, KitManifest } from "../types";
import { describeBinding, HowItWorks } from "./HowItWorks";
import { InstallPanel } from "./InstallPanel";
import { KitIcon } from "./KitIcon";
import { WhatYouGet } from "./KitCard";
import { TablePreview } from "./TablePreview";
import { AGENT_ICON } from "@/components/icons/domain-icons";

export interface SourceAgentFacts {
  id: string;
  name: string;
  description: string | null;
}

function Section({ id, title, children, aside }: { id?: string; title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        {aside && <div className="ml-auto">{aside}</div>}
      </div>
      {children}
    </section>
  );
}

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
            <div className="flex items-center gap-2">
              <AGENT_ICON className="h-4 w-4 shrink-0 text-primary" />
              <h3 className="min-w-0 truncate text-sm font-semibold text-foreground">{a.name}</h3>
            </div>
            <p className="mt-1 text-sm text-foreground">{a.description}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
              <span>Copy of</span>
              <EntityRef token="agent" id={a.source_agent_id} name={src?.name ?? null} className="text-xs" />
            </div>
            {a.bindings.length > 0 && (
              <div className="mt-3 space-y-1.5 border-t border-border pt-3">
                {a.bindings.map((b) => {
                  const table = manifest.tables.find((t) => t.key === b.binding.table_key);
                  return (
                    <div key={b.variable} className="flex flex-wrap items-center gap-1.5 text-xs">
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[11.5px] font-medium text-foreground">{variableLabel(b.variable)}</span>
                      <Link2 className="h-3 w-3 text-muted-foreground" />
                      <span className="font-medium text-foreground">{table?.name ?? "—"}</span>
                      <span className="text-foreground">· {describeBinding(b.binding, (k) => table?.fields.find((f) => f.key === k)?.label ?? k).toLowerCase()}</span>
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
  // The organization filter (?org_filter=) names where a new install goes; none = the active organization.
  const api = useKitInstall(m, useOrgFilterParam()[0]);
  const kitKnobs = useScopedTemplateKnobs(api.organizationId);
  const installed = api.install?.status === "installed";
  const router = useRouter();
  const userId = useAppSelector(selectUserId);
  const openSave = useOpenSaveKitDialog();
  // A kit an organization saved is its creator's to edit or take down (RLS agrees).
  const mine = !!userId && kit.createdBy === userId && kit.organizationId !== null && kit.key.includes(".");
  const ownerActions: HeaderAction[] = mine
    ? [
        { icon: "Pencil", label: `Edit this ${KIT_WORD.oneLower}`, onPress: () => openSave({ editKitKey: kit.key }) },
        {
          icon: "EyeOff",
          label: `Unpublish this ${KIT_WORD.oneLower}`,
          destructive: true,
          onPress: () => {
            void (async () => {
              const ok = await confirm({
                title: `Unpublish "${m.name}"?`,
                description: `No one can install it from the gallery anymore. Existing installs keep working.`,
                confirmLabel: "Unpublish",
                variant: "destructive",
              });
              if (!ok) return;
              try {
                await unpublishKit(kit.key);
                toast.success(`"${m.name}" is unpublished.`);
                router.push(KIT_ROUTES.gallery);
              } catch (err) {
                toast.error(err instanceof Error ? err.message : String(err));
              }
            })();
          },
        },
      ]
    : [];

  return (
    <>
      <PageHeader>
        <HeaderStructured
          back
          title={m.name}
          context={<span className="text-xs text-muted-foreground">{KIT_WORD.one} · {m.category}</span>}
          {...(ownerActions.length > 0 ? { actions: ownerActions } : {})}
        />
      </PageHeader>
      <div className="h-full overflow-y-auto bg-textured">
        <div className="mx-auto w-full max-w-6xl px-4 pb-20 pt-[calc(var(--shell-header-h)+1.25rem)] sm:px-6">
          {/* Phone order: who it is → install → how it works. Wide: install rail on the right. */}
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="min-w-0 lg:col-start-1 lg:row-start-1">
              {/* Identity: only the title row sits beside the icon; everything else runs full width. */}
              <header>
                <div className="flex items-center gap-3">
                  <KitIcon name={m.icon} tintKey={kit.key} />
                  <h1 className="min-w-0 text-2xl font-semibold tracking-tight text-foreground">{m.name}</h1>
                </div>
                <p className="mt-3 max-w-3xl text-base text-foreground">{m.description || m.tagline}</p>
                <WhatYouGet kit={kit} className="mt-2" />
                {m.teaches.length > 0 && (
                  <div className="mt-6">
                    <h2 className="text-base font-semibold text-foreground">What you&rsquo;ll learn</h2>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-foreground marker:text-muted-foreground">
                      {m.teaches.map((t) => (
                        <li key={t}>{t}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </header>
            </div>

            <aside className="lg:sticky lg:top-[calc(var(--shell-header-h)+1.25rem)] lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start">
              <InstallPanel manifest={m} api={api} />
            </aside>

            <div className="min-w-0 space-y-10 lg:col-start-1 lg:row-start-2">
              <Section title="How it works">
                <HowItWorks manifest={m} />
              </Section>

              <Section title={m.tables.length === 1 ? "The table" : "The tables"}>
                <div className="space-y-3">
                  {m.tables.map((t) => (
                    <TablePreview key={t.key} table={t} refNames={refNames} previewRows={kitKnobs.previewRows} />
                  ))}
                </div>
              </Section>

              {m.agents.length > 0 && (
                <Section title={m.agents.length === 1 ? "The agent" : "The agents"}>
                  <KitAgentsSection manifest={m} sourceAgents={sourceAgents} />
                </Section>
              )}

              {m.workflows.length > 0 && (
                <Section title={m.workflows.length === 1 ? "The workflow" : "The workflows"}>
                  <div className="space-y-3">
                    {m.workflows.map((w) => {
                      const steps = workflowSteps(w.definition);
                      return (
                        <div key={w.key} className="rounded-xl border border-border bg-card p-4">
                          <div className="flex items-center gap-2">
                            <Workflow className="h-4 w-4 shrink-0 text-chart-3" />
                            <h3 className="min-w-0 truncate text-sm font-semibold text-foreground">{w.name}</h3>
                          </div>
                          <p className="mt-1 text-sm text-foreground">{w.description}</p>
                          {steps.length > 0 && (
                            <ol className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-foreground">
                              {steps.map((s, i) => (
                                <li key={`${s}-${i}`} className="flex items-center gap-1.5">
                                  <span>
                                    <span className="mr-1 tabular-nums text-muted-foreground">{i + 1}.</span>
                                    {s}
                                  </span>
                                  {i < steps.length - 1 && <ArrowRight className="h-3 w-3 text-muted-foreground" aria-hidden />}
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
                <Section title="Walkthrough">
                  <ol className="divide-y divide-border rounded-xl border border-border bg-card">
                    {m.guide.map((g, i) => (
                      <li key={g.title} className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-foreground text-[11px] font-semibold tabular-nums text-background">
                            {i + 1}
                          </span>
                          <h3 className="min-w-0 text-sm font-semibold text-foreground">{g.title}</h3>
                        </div>
                        <p className="mt-1 text-sm text-foreground">{g.body}</p>
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

          </div>
        </div>
      </div>
    </>
  );
}
