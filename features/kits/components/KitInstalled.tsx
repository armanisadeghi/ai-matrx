"use client";

// KitInstalled — the kit as it now exists in the organization: the tables in the
// canonical records grid, "What the agent sees" rendered by the server, a "Try it"
// run of the forked agent streaming live, and the doors to every created thing.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  BrainCircuit,
  Eye,
  Loader2,
  Play,
  RotateCw,
  Scissors,
  Table2,
  Workflow,
} from "lucide-react";
import { Grid, RecordsMount, personActor, recordsDataSource } from "@ai-matrx/records-ui";
import { useRecords } from "@ai-matrx/records/react";
import { Button } from "@/components/ui/button";
import PageHeader from "@/features/shell/components/header/PageHeader";
import HeaderStructured from "@/features/shell/components/header/variants/variants/HeaderStructured";
import { OrganizationContextNotice } from "@/features/organizations/components/OrganizationRequiredNotice";
import { UnifiedDataSwitchNotice } from "@/features/unified-data/components/UnifiedDataSwitchNotice";
import { RECORDS_NOTIFY } from "@/features/unified-data/recordsNotify";
import { createRecordsRealtimePort } from "@/features/unified-data/realtime/recordsRealtimePort";
import { useOpenAgentRunWindow } from "@/features/overlays/openers/agentRunWindow";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { createClient } from "@/utils/supabase/client";
import { KIT_ROUTES, KIT_WORD } from "../constants";
import { useKitInstall } from "../hooks/useKitInstall";
import { resolveBinding } from "../installer";
import { previewBinding, type PreviewAnswer } from "../preview";
import type { KitAgent, KitEntry, KitInstallRecord, KitManifest } from "../types";
import { InstallStepper } from "./InstallPanel";
import { ErrorNotice } from "./ErrorNotice";
import { KitIcon } from "./KitIcon";

function Panel({ icon, title, children, aside }: { icon: React.ReactNode; title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <span className="text-muted-foreground">{icon}</span>
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {aside && <div className="ml-auto flex items-center gap-2">{aside}</div>}
      </div>
      {children}
    </section>
  );
}

// ─── What the agent sees ────────────────────────────────────────────────────

/**
 * Mounted beside each table's grid, inside the records provider: the live list
 * (realtime-aware) re-reads when any row of the table changes, and this tells
 * the page so the "What the agent sees" preview re-reads too — no polling.
 */
function TableChangeWatcher({ tableId, onChange }: { tableId: string; onChange: (tableId: string) => void }) {
  const live = useRecords(tableId, { pageSize: 50 });
  const rows = live.data?.rows;
  const seen = useRef<typeof rows>(undefined);
  useEffect(() => {
    if (!rows) return;
    if (seen.current && seen.current !== rows) onChange(tableId);
    seen.current = rows;
  }, [rows, tableId, onChange]);
  return null;
}

function BindingPreviewCard({
  organizationId,
  agent,
  variable,
  install,
  manifest,
  dataVersion,
}: {
  organizationId: string;
  agent: KitAgent;
  variable: string;
  install: KitInstallRecord;
  manifest: KitManifest;
  /** Bumps whenever a row of the bound table changes on this page. */
  dataVersion: number;
}) {
  const dispatch = useAppDispatch();
  const [answer, setAnswer] = useState<PreviewAnswer | null>(null);
  const [attempt, setAttempt] = useState(0);
  const spec = agent.bindings.find((b) => b.variable === variable)!;
  const table = manifest.tables.find((t) => t.key === spec.binding.table_key);

  useEffect(() => {
    let cancelled = false;
    setAnswer(null);
    let binding;
    try {
      binding = resolveBinding(spec.binding, install.steps);
    } catch (err) {
      setAnswer({ state: "error", message: err instanceof Error ? err.message : String(err) });
      return;
    }
    void dispatch(previewBinding(organizationId, binding, variable)).then((a) => {
      if (!cancelled) setAnswer(a);
    });
    return () => {
      cancelled = true;
    };
  }, [dispatch, organizationId, spec, variable, install.steps, attempt, dataVersion]);

  // Re-read when the person comes back to this page (after editing elsewhere) —
  // event-driven, never polling. Refresh stays for "now".
  useEffect(() => {
    const again = () => {
      if (document.visibilityState === "visible") setAttempt((n) => n + 1);
    };
    window.addEventListener("focus", again);
    document.addEventListener("visibilitychange", again);
    return () => {
      window.removeEventListener("focus", again);
      document.removeEventListener("visibilitychange", again);
    };
  }, []);

  return (
    <div className="p-4">
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11.5px] font-medium text-foreground">{`{{${variable}}}`}</code>
        <span className="text-muted-foreground">in</span>
        <span className="font-medium text-foreground">{agent.name}</span>
        <span className="text-muted-foreground">reads</span>
        <span className="font-medium text-foreground">{table?.name ?? spec.binding.table_key}</span>
        <button
          type="button"
          onClick={() => setAttempt((n) => n + 1)}
          className="ml-auto inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <RotateCw className="h-3 w-3" />
          Refresh
        </button>
      </div>

      <div className="mt-2">
        {answer === null ? (
          <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground" aria-busy="true">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Asking the server what the agent will read…
          </div>
        ) : answer.state === "ok" ? (
          <>
            <div className="mb-1.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              {answer.preview.row_count !== null && (
                <span>
                  {answer.preview.row_count} {answer.preview.row_count === 1 ? "row" : "rows"} delivered
                  {answer.preview.total_rows !== null && answer.preview.total_rows !== answer.preview.row_count
                    ? ` of ${answer.preview.total_rows}`
                    : ""}
                </span>
              )}
              {answer.preview.truncated && (
                <span className="inline-flex items-center gap-1 rounded bg-warning/15 px-1.5 py-px font-medium text-warning">
                  <Scissors className="h-3 w-3" />
                  Cut short — only the first rows are included
                </span>
              )}
            </div>
            <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-muted/40 p-3 font-mono text-[11.5px] leading-relaxed text-foreground">
              {answer.preview.text || "(empty — the table has no rows yet)"}
            </pre>
            {!answer.preview.present && answer.preview.absent_reason && (
              <p className="mt-2 flex items-start gap-1.5 text-xs text-warning">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                <span className="text-foreground/80">Nothing delivered: {answer.preview.absent_reason}</span>
              </p>
            )}
            {answer.preview.withheld.length > 0 && (
              <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-warning" />
                <span>Hidden from you, so not shown here: {answer.preview.withheld.join(", ")}</span>
              </p>
            )}
            {answer.preview.notes.length > 0 && (
              <ul className="mt-2 space-y-1">
                {answer.preview.notes.map((n) => (
                  <li key={n} className="flex items-start gap-1.5 text-xs text-warning">
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                    <span className="text-foreground/80">{n}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          answer.state === "not_deployed" ? (
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <p className="flex items-start gap-2 text-xs text-foreground">
                <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0 text-warning" />
                <span>{answer.message}</span>
              </p>
            </div>
          ) : (
            <ErrorNotice title="The preview could not be shown." error={answer.message} onRetry={() => setAttempt((n) => n + 1)} />
          )
        )}
      </div>
    </div>
  );
}

// ─── Try it ─────────────────────────────────────────────────────────────────
//
// The run opens in the agent run WINDOW, not inline: a builder's answer is a SHAPED
// job (e.g. a "create agent definition" directive), and a headless-for-text run
// flattens it into a string (the runtime says so: "do NOT run a shaped job
// headless-for-text"). The window renders it through the ONE pipeline, streams
// live, survives navigation, and the person can keep talking.

function TryItPanel({ agent, agentId }: { agent: KitAgent; agentId: string }) {
  const openRunWindow = useOpenAgentRunWindow();
  const tryIt = agent.try_it ?? {};
  const vars = Object.entries(tryIt.variables ?? {});

  const run = () => {
    openRunWindow({
      initialAgentId: agentId,
      initialAgentName: agent.name,
      ...(tryIt.user_input ? { initialDraftText: tryIt.user_input } : {}),
      ...(vars.length > 0 ? { initialVariableValues: tryIt.variables } : {}),
      initialAutoRun: true,
    });
  };

  return (
    <Panel
      icon={<Play className="h-3.5 w-3.5" />}
      title={`Try ${agent.name}`}
      aside={
        <Link href={KIT_ROUTES.agent(agentId)} className="inline-flex items-center gap-0.5 text-xs font-medium text-primary hover:underline">
          Open agent
          <ArrowUpRight className="h-3 w-3" />
        </Link>
      }
    >
      <div className="space-y-3 p-4">
        {(tryIt.user_input || vars.length > 0) && (
          <div className="space-y-1.5">
            {tryIt.user_input && (
              <p className="rounded-lg bg-muted/40 p-2.5 text-xs leading-relaxed text-foreground/85">{tryIt.user_input}</p>
            )}
            {vars.map(([k, v]) => (
              <div key={k} className="rounded-lg bg-muted/40 p-2.5">
                <code className="font-mono text-[10.5px] text-muted-foreground">{`{{${k}}}`}</code>
                <p className="mt-0.5 text-xs leading-relaxed text-foreground/85">{v}</p>
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm" onClick={run}>
            <Play className="mr-1.5 h-3.5 w-3.5" />
            Run it once
          </Button>
          <p className="text-[11px] text-muted-foreground">
            Opens a window and runs your copy once with the example above — it uses AI credits like any run, and you can keep talking to it there.
          </p>
        </div>
      </div>
    </Panel>
  );
}

// ─── the page ───────────────────────────────────────────────────────────────

export function KitInstalled({ kit }: { kit: KitEntry }) {
  const m = kit.manifest;
  const api = useKitInstall(m);
  const router = useRouter();
  const userId = useAppSelector(selectUserId);
  const [dataSource] = useState(() => recordsDataSource(createClient()));
  const [tableVersions, setTableVersions] = useState<Record<string, number>>({});
  const bumpTable = (tableId: string) => setTableVersions((v) => ({ ...v, [tableId]: (v[tableId] ?? 0) + 1 }));
  const install = api.install;
  const orgId = api.organizationId;

  const header = (
    <PageHeader>
      <HeaderStructured back title={m.name} context={<span className="text-xs text-muted-foreground">Installed {KIT_WORD.oneLower}</span>} />
    </PageHeader>
  );

  let body: React.ReactNode;
  if (api.organizationState !== "ready" || !orgId) {
    body = <OrganizationContextNotice state={api.organizationState} what={`Your installed ${KIT_WORD.oneLower}`} />;
  } else if (api.store.state !== "on") {
    body = <UnifiedDataSwitchNotice gate={api.store} what="Data records" />;
  } else if (api.phase === "loading") {
    body = (
      <div className="flex items-center gap-2 text-sm text-muted-foreground" aria-busy="true">
        <Loader2 className="h-4 w-4 animate-spin" />
        Reading what this {KIT_WORD.oneLower} installed here…
      </div>
    );
  } else if (api.readError) {
    body = (
      <ErrorNotice
        className="max-w-xl"
        title="We could not read the install record."
        error={api.readError}
        onRetry={api.retryRead}
        retryLabel="Check again"
      />
    );
  } else if (!install || install.status !== "installed") {
    body = (
      <div className="max-w-xl rounded-xl border border-border bg-card p-5">
        <p className="text-sm font-medium text-foreground">
          {install ? `This ${KIT_WORD.oneLower} is only partly installed here.` : `This ${KIT_WORD.oneLower} is not installed in this organization yet.`}
        </p>
        {install && (
          <div className="mt-3">
            <InstallStepper steps={api.steps} />
          </div>
        )}
        <Button asChild size="sm" className="mt-4">
          <Link href={KIT_ROUTES.detail(m.key)}>{install ? "Finish the install" : `Install ${m.name}`}</Link>
        </Button>
      </div>
    );
  } else {
    const steps = install.steps;
    body = (
      <div className="space-y-6">
        {/* Doors to everything the install made */}
        <div className="flex flex-wrap gap-2">
          {m.tables.map((t) => {
            const id = steps.tables?.[t.key];
            return id ? (
              <Link key={t.key} href={KIT_ROUTES.table(id)} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground hover:border-primary/40">
                <Table2 className="h-3.5 w-3.5 text-chart-2" />
                {t.name}
                <ArrowUpRight className="h-3 w-3 text-muted-foreground" />
              </Link>
            ) : null;
          })}
          {m.agents.map((a) => {
            const id = steps.agents?.[a.key];
            return id ? (
              <Link key={a.key} href={KIT_ROUTES.agent(id)} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground hover:border-primary/40">
                <BrainCircuit className="h-3.5 w-3.5 text-primary" />
                {a.name}
                <ArrowUpRight className="h-3 w-3 text-muted-foreground" />
              </Link>
            ) : null;
          })}
          {m.workflows.map((w) => {
            const id = steps.workflows?.[w.key];
            return id ? (
              <Link key={w.key} href={KIT_ROUTES.workflow(id)} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground hover:border-primary/40">
                <Workflow className="h-3.5 w-3.5 text-chart-3" />
                {w.name}
                <ArrowUpRight className="h-3 w-3 text-muted-foreground" />
              </Link>
            ) : null;
          })}
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="min-w-0 space-y-6">
            <RecordsMount
              letTheStoreDecideRights
              config={{
                dataSource,
                actor: personActor(userId),
                organizationId: orgId,
                realtime: createRecordsRealtimePort(orgId),
              }}
              host={{ Link, density: "condensed", notify: RECORDS_NOTIFY }}
            >
              {m.tables.map((t) => {
                const id = steps.tables?.[t.key];
                if (!id) return null;
                return (
                  <Panel
                    key={t.key}
                    icon={<Table2 className="h-3.5 w-3.5" />}
                    title={t.name}
                    aside={
                      <Link href={KIT_ROUTES.table(id)} className="inline-flex items-center gap-0.5 text-xs font-medium text-primary hover:underline">
                        Open in Data
                        <ArrowUpRight className="h-3 w-3" />
                      </Link>
                    }
                  >
                    <div className="p-2">
                      <TableChangeWatcher tableId={id} onChange={bumpTable} />
                      <Grid
                        tableId={id}
                        pageSize={50}
                        onOpenRecord={(recordId) => router.push(`${KIT_ROUTES.table(id)}?record=${encodeURIComponent(recordId)}`)}
                      />
                    </div>
                  </Panel>
                );
              })}
            </RecordsMount>
          </div>

          <div className="min-w-0 space-y-6">
            {m.agents.some((a) => a.bindings.length > 0) && (
              <Panel icon={<Eye className="h-3.5 w-3.5" />} title="What the agent sees">
                <p className="border-b border-border px-4 py-2 text-xs text-muted-foreground">
                  Exactly the text your data turns into when the agent runs. It updates as you edit the table and when you come back to this page.
                </p>
                <div className="divide-y divide-border">
                  {m.agents.flatMap((a) =>
                    a.bindings.map((b) => (
                      <BindingPreviewCard
                        key={`${a.key}:${b.variable}`}
                        organizationId={orgId}
                        agent={a}
                        variable={b.variable}
                        install={install}
                        manifest={m}
                        dataVersion={tableVersions[install.steps.tables?.[b.binding.table_key] ?? ""] ?? 0}
                      />
                    )),
                  )}
                </div>
              </Panel>
            )}
            {m.agents.map((a) => {
              const id = steps.agents?.[a.key];
              return id ? <TryItPanel key={a.key} agent={a} agentId={id} /> : null;
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {header}
      <div className="h-full overflow-y-auto bg-textured">
        <div className="mx-auto w-full max-w-7xl px-4 pb-20 pt-[calc(var(--shell-header-h)+1.25rem)] sm:px-6">
          <div className="mb-6 flex items-center gap-3">
            <KitIcon name={m.icon} tintKey={kit.key} />
            <div className="min-w-0">
              <h1 className="truncate text-xl font-semibold tracking-tight text-foreground">{m.name}</h1>
              <Link href={KIT_ROUTES.detail(m.key)} className="text-xs text-muted-foreground hover:text-foreground">
                How this {KIT_WORD.oneLower} works
              </Link>
            </div>
          </div>
          {body}
        </div>
      </div>
    </>
  );
}
