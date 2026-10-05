"use client";

// InstalledTemplate — a template as it now exists in the organization it was installed in:
// the tables in the canonical records grid, "What the agent sees" for every bound variable of
// every copied agent (the server's own rendering, through the shared CustomDataBindingPreview),
// and Try it per agent in the agent run window.
//
// Moved from the retired kits installed page (Kits → Template merge, 2026-10-05). It reads only
// the install's `made` (custom.template_install) and the copied agents' own variable
// definitions — the bindings ARE the truth, never a manifest copy of them.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowUpRight, Eye, Play, Table2 } from "lucide-react";
import { Grid, RecordsMount, personActor, recordsDataSource } from "@ai-matrx/records-ui";
import type { CustomDataBinding } from "@ai-matrx/chat/agents/types/agent-definition.types";
import { Button } from "@/components/ui/button";
import { InfoHint } from "@/components/official/InfoHint";
import { RECORDS_NOTIFY } from "@/features/unified-data/recordsNotify";
import { createRecordsRealtimePort } from "@/features/unified-data/realtime/recordsRealtimePort";
import { useOpenAgentRunWindow } from "@/features/overlays/openers/agentRunWindow";
import { CustomDataBindingPreview } from "@/features/agents/components/variables-management/custom-data/CustomDataBindingPreview";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { createClient } from "@/utils/supabase/client";
import { AGENT_ICON } from "@/components/icons/domain-icons";
import { variableLabel } from "../format";

export interface InstalledMade {
  kind: string;
  id: string | null;
  title: string | null;
}

export interface TemplateTryIt {
  userInput?: string;
  variables?: Record<string, string>;
}

/**
 * A titled block. `bare` drops the frame for a child that carries its own (the records Grid) —
 * a host frame is the chrome or has none, never both.
 */
function Panel({
  icon,
  title,
  children,
  aside,
  bare,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  aside?: React.ReactNode;
  bare?: boolean;
}) {
  const heading = (
    <div className={bare ? "mb-2 flex items-center gap-2" : "flex items-center gap-2 border-b border-border px-4 py-2.5"}>
      {icon}
      <h3 className="min-w-0 truncate text-sm font-semibold text-foreground">{title}</h3>
      {aside && <div className="ml-auto flex shrink-0 items-center gap-2">{aside}</div>}
    </div>
  );
  if (bare)
    return (
      <section>
        {heading}
        {children}
      </section>
    );
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      {heading}
      {children}
    </section>
  );
}

interface AgentFacts {
  name: string;
  bindings: Array<{ variable: string; binding: CustomDataBinding }>;
}

function isMergeField(b: unknown): b is CustomDataBinding {
  return typeof b === "object" && b !== null && (b as { kind?: unknown }).kind === "merge_field";
}

/** The copied agents' REAL names and their merge-field bindings, read as the person (RLS). */
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
          facts[row.id] = {
            name: row.name,
            bindings: defs
              .filter((d) => isMergeField(d?.binding))
              .map((d) => ({ variable: String(d.name ?? ""), binding: d.binding as CustomDataBinding })),
          };
        }
        setState({ facts, error: null });
      });
    return () => {
      cancelled = true;
    };
  }, [key]);
  return state;
}

// The run opens in the agent run WINDOW, not inline: an answer may be a SHAPED job, and the
// window renders it through the ONE pipeline, streams live, and the person can keep talking.
function TryIt({ agentId, agentName, tryIt }: { agentId: string; agentName: string; tryIt: TemplateTryIt | null }) {
  const openRunWindow = useOpenAgentRunWindow();
  const vars = Object.entries(tryIt?.variables ?? {});
  const run = () =>
    openRunWindow({
      initialAgentId: agentId,
      initialAgentName: agentName,
      ...(tryIt?.userInput ? { initialDraftText: tryIt.userInput } : {}),
      ...(vars.length > 0 ? { initialVariableValues: tryIt?.variables ?? null } : {}),
      initialAutoRun: Boolean(tryIt?.userInput),
    });
  return (
    <div className="space-y-2 border-t border-border p-4" data-template-try-it={agentId}>
      <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
        <Play className="h-3.5 w-3.5 text-primary" />
        Try it
      </p>
      {tryIt?.userInput && <p className="text-sm text-foreground">{tryIt.userInput}</p>}
      {vars.map(([k, v]) => (
        <div key={k}>
          <p className="text-xs font-medium text-muted-foreground">{variableLabel(k)}</p>
          <p className="text-sm text-foreground">{v}</p>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-3 pt-1">
        <Button size="sm" onClick={run}>
          <Play className="mr-1.5 h-3.5 w-3.5" />
          {tryIt?.userInput ? "Run it once" : "Open"}
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
}: {
  /** The organization the install lives in — never the active one. */
  organizationId: string;
  made: InstalledMade[];
  /** Try-it prompts by agent title, from the template. */
  tryIts: Record<string, TemplateTryIt>;
}) {
  const router = useRouter();
  const userId = useAppSelector(selectUserId);
  const [dataSource] = useState(() => recordsDataSource(createClient()));
  const tables = made.filter((m): m is InstalledMade & { id: string } => m.kind === "table" && Boolean(m.id));
  const agents = made.filter((m): m is InstalledMade & { id: string } => m.kind === "agent" && Boolean(m.id));
  const { facts, error } = useAgentFacts(agents.map((a) => a.id));

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_420px]" data-template-installed={organizationId}>
      <div className="min-w-0 space-y-6">
        <RecordsMount
          key={organizationId}
          letTheStoreDecideRights
          config={{
            dataSource,
            actor: personActor(userId),
            organizationId,
            realtime: createRecordsRealtimePort(organizationId),
          }}
          host={{ Link, density: "condensed", notify: RECORDS_NOTIFY }}
        >
          {tables.map((t) => (
            <Panel
              key={t.id}
              icon={<Table2 className="h-4 w-4 shrink-0 text-chart-2" />}
              title={t.title ?? "Table"}
              bare
              aside={
                <Link href={`/data/${encodeURIComponent(t.id)}`} className="inline-flex items-center gap-0.5 text-xs font-medium text-primary hover:underline">
                  Open in Data
                  <ArrowUpRight className="h-3 w-3" />
                </Link>
              }
            >
              <Grid
                tableId={t.id}
                pageSize={50}
                onOpenRecord={(recordId) => router.push(`/data/${encodeURIComponent(t.id)}?record=${encodeURIComponent(recordId)}`)}
              />
            </Panel>
          ))}
        </RecordsMount>
      </div>

      <div className="min-w-0 space-y-6">
        {error ? <p className="text-sm text-destructive">{`The agents could not be read: ${error}`}</p> : null}
        {agents.map((a) => {
          const f = facts[a.id];
          const name = f?.name ?? a.title ?? "Agent";
          return (
            <Panel
              key={a.id}
              icon={<AGENT_ICON className="h-4 w-4 shrink-0 text-primary" />}
              title={name}
              aside={
                <Link href={`/agents/${encodeURIComponent(a.id)}`} className="inline-flex items-center gap-0.5 text-xs font-medium text-primary hover:underline">
                  Open agent
                  <ArrowUpRight className="h-3 w-3" />
                </Link>
              }
            >
              {f && f.bindings.length > 0 ? (
                <>
                  <p className="flex items-center gap-1.5 px-4 pt-3 text-sm font-semibold text-foreground">
                    <Eye className="h-3.5 w-3.5 text-primary" />
                    What it sees
                    <InfoHint text="The exact text your tables become on each run." />
                  </p>
                  <div className="divide-y divide-border">
                    {f.bindings.map((b) => (
                      <div key={b.variable} className="space-y-1 px-4 py-3" data-template-sees={b.variable}>
                        <p className="text-xs font-medium text-muted-foreground">{variableLabel(b.variable)}</p>
                        <CustomDataBindingPreview binding={b.binding} variableName={b.variable} />
                      </div>
                    ))}
                  </div>
                </>
              ) : null}
              <TryIt agentId={a.id} agentName={name} tryIt={tryIts[a.title ?? ""] ?? null} />
            </Panel>
          );
        })}
      </div>
    </div>
  );
}
