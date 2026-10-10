"use client";

// InstalledTemplate — a template as it now exists in the organization it was installed in, stacked
// so every part gets the full content width (the records grid needs it):
//   1. Try it — the template's own agent first, asked its scripted question (the one its seed rows
//      answer), then each extra agent with the template's tryIt prefilled. Each card says which of
//      the installed data that agent reads.
//   2. How it works — the template's guide steps.
//   3. The installed tables in the canonical records grid.
//   4. What each agent sees — every bound variable rendered by the server (CustomDataBindingPreview).
// Every other thing the install made (views, forms, dashboards, digests, workflows) is a row that
// opens in the landing list above this view.
//
// Moved from the retired kits installed page (Kits → Template merge, 2026-10-05). It reads only the
// install's answer (`made`, `show`) and the copied agents' own variable definitions.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowUpRight, BookOpen, Database, Eye, Play, Table2 } from "lucide-react";
import { Grid, RecordsMount } from "@ai-matrx/records-ui";
import type { CustomDataBinding } from "@ai-matrx/chat/agents/types/agent-definition.types";
import { Button } from "@/components/ui/button";
import { InfoHint } from "@/components/official/InfoHint";
import { RECORDS_NOTIFY } from "@/features/unified-data/recordsNotify";
import { useOpenAgentRunWindow } from "@/features/overlays/openers/agentRunWindow";
import { CustomDataBindingPreview } from "@/features/agents/components/variables-management/custom-data/CustomDataBindingPreview";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { createClient } from "@/utils/supabase/client";
import { AGENT_ICON } from "@/components/icons/domain-icons";
import { variableLabel } from "../format";
import { useAppRecordsConfig } from "@/features/data-tables/records-ui-host/recordsUiHost";

import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
export interface InstalledMade {
  kind: string;
  id: string | null;
  title: string | null;
}

export interface TemplateTryIt {
  userInput?: string;
  variables?: Record<string, string>;
}

/** What the install answer's `show` block carries (custom._template_answer). */
export interface InstalledShow {
  guide?: Array<{ title: string; body: string }>;
  agent_name?: string;
  agent_question?: string;
  agent_try_it?: TemplateTryIt;
}

function Section({ icon, title, hint, children }: { icon: React.ReactNode; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        {icon}
        {title}
        {hint ? <InfoHint text={hint} /> : null}
      </h3>
      {children}
    </section>
  );
}

interface AgentFacts {
  name: string;
  bindings: Array<{ variable: string; binding: CustomDataBinding }>;
  /** Table ids the agent reads: its merge-field bindings and its Table/Tables variables. */
  tableIds: string[];
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;

function isMergeField(b: unknown): b is CustomDataBinding {
  return typeof b === "object" && b !== null && (b as { kind?: unknown }).kind === "merge_field";
}

/** The copied agents' REAL names, their merge-field bindings and the tables they read (RLS read). */
function useAgentFacts(ids: string[]): { facts: Record<string, AgentFacts>; error: string | null } {
  const key = [...ids].sort().join(",");
  const [state, setState] = useState<{ facts: Record<string, AgentFacts>; error: string | null }>({ facts: {}, error: null });
  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    void createClient()
      .schema("agent")
      .from("definition")
      .select("id, name, variable_definitions")
      .in("id", key.split(","))
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setState({ facts: {}, error: error.message });
          return;
        }
        const facts: Record<string, AgentFacts> = {};
        for (const row of data ?? []) {
          const defs = Array.isArray(row.variable_definitions) ? (row.variable_definitions as Array<Record<string, unknown>>) : [];
          const bindings = defs
            .filter((d) => isMergeField(d?.binding))
            .map((d) => ({ variable: String(d.name ?? ""), binding: d.binding as CustomDataBinding }));
          const tableIds = new Set<string>(bindings.map((b) => b.binding.table_id).filter(Boolean));
          for (const d of defs) {
            const type = (d?.customComponent as { type?: unknown } | undefined)?.type;
            if (type === "table" || type === "tables") for (const id of JSON.stringify(d.defaultValue ?? "").match(UUID) ?? []) tableIds.add(id);
          }
          facts[row.id] = { name: row.name, bindings, tableIds: [...tableIds] };
        }
        setState({ facts, error: null });
      });
    return () => {
      cancelled = true;
    };
  }, [key]);
  return state;
}

// The run opens in the agent run WINDOW: it streams live, renders a shaped answer through the ONE
// pipeline, and the person can keep talking.
function TryItCard({
  agentId,
  agentName,
  tryIt,
  reads,
  primary,
}: {
  agentId: string;
  agentName: string;
  tryIt: TemplateTryIt | null;
  reads: string[];
  primary: boolean;
}) {
  const openRunWindow = useOpenAgentRunWindow();
  const vars = Object.entries(tryIt?.variables ?? {});
  const ask = tryIt?.userInput ?? null;
  const run = () =>
    openRunWindow({
      initialAgentId: agentId,
      initialAgentName: agentName,
      ...(ask ? { initialDraftText: ask } : {}),
      ...(vars.length > 0 ? { initialVariableValues: tryIt?.variables ?? null } : {}),
      initialAutoRun: Boolean(ask),
    });
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-xl border border-border bg-card p-4" data-template-try-it={agentId} data-template-try-it-primary={primary ? "" : undefined}>
      <div className="flex min-w-0 items-center gap-2">
        <AGENT_ICON className="h-4 w-4 shrink-0 text-primary" />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{agentName}</span>
        <Link href={`/agents/${encodeURIComponent(agentId)}`} className="inline-flex shrink-0 items-center gap-0.5 text-xs font-medium text-primary hover:underline">
          Open agent
          <ArrowUpRight className="h-3 w-3" />
        </Link>
      </div>
      {reads.length > 0 ? (
        <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground" data-template-reads="">
          <Database className="h-3 w-3 shrink-0" />
          <span className="truncate">{`Reads ${reads.join(", ")}`}</span>
        </p>
      ) : null}
      {ask ? <p className="text-sm text-foreground">{ask}</p> : null}
      {vars.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">{variableLabel(k)}</p>
          <p className="line-clamp-3 text-sm text-foreground">{v}</p>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-3 pt-1">
        <Button icon={<Play />} variant="primary" onClick={run} data-template-run="">
          {ask ? "Run it once" : "Open"}
        </Button>
        <p className="text-xs text-muted-foreground">Uses AI credits</p>
      </div>
    </div>
  );
}

export function InstalledTemplate({
  organizationId,
  made,
  tryIts,
  show,
}: {
  /** The organization the install lives in — never the active one. */
  organizationId: string;
  made: InstalledMade[];
  /** Try-it prompts by agent title, from the template's extra agents. */
  tryIts: Record<string, TemplateTryIt>;
  show?: InstalledShow | null;
}) {
  const router = useRouter();
  const userId = useAppSelector(selectUserId);
  const recordsConfig = useAppRecordsConfig(organizationId);
  const tables = made.filter((m): m is InstalledMade & { id: string } => m.kind === "table" && Boolean(m.id));
  const agents = made.filter((m): m is InstalledMade & { id: string } => m.kind === "agent" && Boolean(m.id));
  const { facts, error } = useAgentFacts(agents.map((a) => a.id));
  const tableName = (id: string) => tables.find((t) => t.id === id)?.title ?? null;

  // The template's own agent leads, asked the question its seed rows answer.
  const primaryTitle = show?.agent_name ?? null;
  const ordered = [...agents].sort((a, b) => Number(b.title === primaryTitle) - Number(a.title === primaryTitle));
  const tryItOf = (a: InstalledMade): TemplateTryIt | null => {
    if (a.title && a.title === primaryTitle) {
      const own = show?.agent_try_it ?? {};
      return { ...own, ...(own.userInput ? {} : show?.agent_question ? { userInput: show.agent_question } : {}) };
    }
    return tryIts[a.title ?? ""] ?? null;
  };
  const guide = (show?.guide ?? []).filter((s) => s && s.title);

  return (
    <div className="flex min-w-0 flex-col gap-8" data-template-installed={organizationId}>
      {error ? <p className="text-sm text-destructive">{`The agents could not be read: ${error}`}<ErrorAlchemyMenu /></p> : null}

      {ordered.length > 0 ? (
        <Section icon={<Play className="h-4 w-4 text-primary" />} title="Try it" hint="Each agent answers from the data this template installed.">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
            {ordered.map((a) => {
              const f = facts[a.id];
              return (
                <TryItCard
                  key={a.id}
                  agentId={a.id}
                  agentName={f?.name ?? a.title ?? "Agent"}
                  tryIt={tryItOf(a)}
                  reads={(f?.tableIds ?? []).map(tableName).filter((n): n is string => Boolean(n))}
                  primary={a.title === primaryTitle}
                />
              );
            })}
          </div>
        </Section>
      ) : null}

      {guide.length > 0 ? (
        <Section icon={<BookOpen className="h-4 w-4 text-primary" />} title="How it works">
          <ol className="flex flex-col gap-2" data-template-guide={guide.length}>
            {guide.map((s, i) => (
              <li key={`${i}:${s.title}`} className="flex min-w-0 gap-3 rounded-lg border border-border bg-card p-3">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary-ink">{i + 1}</span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-foreground">{s.title}</span>
                  {s.body ? <span className="block text-sm text-muted-foreground">{s.body}</span> : null}
                </span>
              </li>
            ))}
          </ol>
        </Section>
      ) : null}

      <RecordsMount
        key={organizationId}
        letTheStoreDecideRights
        config={recordsConfig}
        host={{ Link, density: "condensed", notify: RECORDS_NOTIFY }}
      >
        {tables.map((t) => (
          <section key={t.id} className="flex min-w-0 flex-col gap-2" data-template-table={t.id}>
            <div className="flex items-center gap-2">
              <Table2 className="h-4 w-4 shrink-0 text-chart-2" />
              <h3 className="min-w-0 truncate text-sm font-semibold text-foreground">{t.title ?? "Table"}</h3>
              <Link href={`/data/${encodeURIComponent(t.id)}`} className="ml-auto inline-flex shrink-0 items-center gap-0.5 text-xs font-medium text-primary hover:underline">
                Open in Data
                <ArrowUpRight className="h-3 w-3" />
              </Link>
            </div>
            <div className="min-w-0 overflow-x-auto">
              <Grid
                tableId={t.id}
                pageSize={50}
                onOpenRecord={(recordId) => router.push(`/data/${encodeURIComponent(t.id)}?record=${encodeURIComponent(recordId)}`)}
              />
            </div>
          </section>
        ))}
      </RecordsMount>

      {ordered.some((a) => (facts[a.id]?.bindings.length ?? 0) > 0) ? (
        <Section icon={<Eye className="h-4 w-4 text-primary" />} title="What each agent sees" hint="The exact text your tables become on each run.">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {ordered.map((a) => {
              const f = facts[a.id];
              if (!f || f.bindings.length === 0) return null;
              return (
                <div key={a.id} className="min-w-0 overflow-hidden rounded-xl border border-border bg-card">
                  <p className="truncate border-b border-border px-4 py-2.5 text-sm font-semibold text-foreground">{f.name}</p>
                  <div className="divide-y divide-border">
                    {f.bindings.map((b) => (
                      <div key={b.variable} className="space-y-1 px-4 py-3" data-template-sees={b.variable}>
                        <p className="text-xs font-medium text-muted-foreground">{variableLabel(b.variable)}</p>
                        <CustomDataBindingPreview binding={b.binding} variableName={b.variable} />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </Section>
      ) : null}
    </div>
  );
}
