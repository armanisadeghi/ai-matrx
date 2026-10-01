"use client";

// KitInstalled — the kit as it now exists in the organization: the tables in the
// canonical records grid, "What the agent sees" rendered by the server, a "Try it"
// run of the forked agent streaming live, and the doors to every created thing.

import { variableLabel } from "../format";
import { InfoHint } from "@/components/official/InfoHint";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  Building2,
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
import { useUserOrganizations } from "@/features/organizations/hooks";
import { EntityOrgFilter } from "@/lib/entity-list/components/EntityOrgFilter";
import { useOrgFilterParam } from "@/lib/entity-list/orgFilterUrl";
import { RECORDS_NOTIFY } from "@/features/unified-data/recordsNotify";
import { createRecordsRealtimePort } from "@/features/unified-data/realtime/recordsRealtimePort";
import { useOpenAgentRunWindow } from "@/features/overlays/openers/agentRunWindow";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { createClient } from "@/utils/supabase/client";
import { KIT_ROUTES, KIT_WORD } from "../constants";
import { useKitInstalls } from "../hooks/useKitInstalls";
import { resolveBinding, stepsFromInstall } from "../installer";
import { previewBinding, type PreviewAnswer } from "../preview";
import type { KitAgent, KitEntry, KitInstallRecord, KitManifest } from "../types";
import { InstallStepper } from "./InstallPanel";
import { ErrorNotice } from "./ErrorNotice";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { KitIcon } from "./KitIcon";
import { AGENT_ICON } from "@/components/icons/domain-icons";

/**
 * A titled block. `bare` drops the frame for a child that carries its own (the
 * records Grid) — a host frame is the chrome or has none, never both.
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
      <h2 className="min-w-0 truncate text-sm font-semibold text-foreground">{title}</h2>
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
    <div className="px-4 py-3">
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="rounded bg-muted px-1.5 py-0.5 text-[11.5px] font-medium text-foreground">{variableLabel(variable)}</span>
        {/* The panel already names the agent; say what this one variable reads. */}
        <span className="text-muted-foreground">reads</span>
        <span className="font-medium text-foreground">
          {spec.binding.semantic_type === "value" && spec.binding.field_key
            ? (table?.fields.find((f) => f.key === spec.binding.field_key)?.label ?? spec.binding.field_key)
            : spec.binding.semantic_type === "reference"
              ? `a whole row of ${table?.name ?? "—"}`
              : (table?.name ?? "—")}
        </span>
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
            Loading…
          </div>
        ) : answer.state === "ok" ? (
          <>
            <div className="mb-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {answer.preview.row_count !== null && spec.binding.semantic_type !== "value" && (
                <span>
                  {/* read-gate-exempt: inside answer.state === "ok" — the preview read succeeded; its failure renders its own branch */}
                  {answer.preview.row_count} {answer.preview.row_count === 1 ? "row" : "rows"} delivered
                  {answer.preview.total_rows !== null && answer.preview.total_rows !== answer.preview.row_count
                    ? ` of ${answer.preview.total_rows}`
                    : ""}
                </span>
              )}
              {answer.preview.truncated && (
                <span className="inline-flex items-center gap-1 rounded bg-warning/15 px-1.5 py-px font-medium text-warning">
                  <Scissors className="h-3 w-3" />
                  Cut short
                </span>
              )}
            </div>
            <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-md bg-muted/50 p-3 font-mono text-[11.5px] leading-relaxed text-foreground">
              {answer.preview.text || "(empty — the table has no rows yet)"}
            </pre>
            {!answer.preview.present && answer.preview.absent_reason && (
              <p className="mt-2 flex items-start gap-1.5 text-xs text-warning">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                <span className="text-foreground">Nothing delivered: {answer.preview.absent_reason}</span>
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
                    <span className="text-foreground">{n}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          answer.state === "not_deployed" ? (
            <p className="flex items-start gap-2 text-xs text-foreground">
              <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0 text-warning" />
              <span>{answer.message}</span>
            </p>
          ) : (
            <ErrorNotice size="inline" title="Preview failed" error={answer.message} onRetry={() => setAttempt((n) => n + 1)} />
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

function TryItBody({ agent, agentId, agentName }: { agent: KitAgent; agentId: string; agentName: string }) {
  const openRunWindow = useOpenAgentRunWindow();
  const tryIt = agent.try_it ?? {};
  const vars = Object.entries(tryIt.variables ?? {});

  const run = () => {
    openRunWindow({
      initialAgentId: agentId,
      initialAgentName: agentName,
      ...(tryIt.user_input ? { initialDraftText: tryIt.user_input } : {}),
      ...(vars.length > 0 ? { initialVariableValues: tryIt.variables } : {}),
      initialAutoRun: true,
    });
  };

  return (
    <div className="space-y-2 border-t border-border p-4">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
        <Play className="h-3.5 w-3.5 text-primary" />
        Try it
      </p>
      {tryIt.user_input && <p className="text-sm text-foreground">{tryIt.user_input}</p>}
      {vars.map(([k, v]) => (
        <div key={k}>
          <p className="text-xs font-medium text-muted-foreground">{variableLabel(k)}</p>
          <p className="text-sm text-foreground">{v}</p>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-3 pt-1">
        <Button size="sm" onClick={run}>
          <Play className="mr-1.5 h-3.5 w-3.5" />
          Run it once
        </Button>
        <p className="text-xs text-muted-foreground">Uses AI credits</p>
      </div>
    </div>
  );
}

/** Names of these agent rows, by id (RLS read as the person). */
function useAgentNames(ids: string[]): Record<string, string> {
  const key = [...ids].sort().join(",");
  const [names, setNames] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    void createClient()
      .schema("agent")
      .from("definition")
      .select("id, name")
      .in("id", key.split(","))
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error("[kits] could not read the installed agents' names", error.message);
          return;
        }
        setNames(Object.fromEntries((data ?? []).map((r) => [r.id, r.name])));
      });
    return () => {
      cancelled = true;
    };
  }, [key]);
  return names;
}

// ─── the page ───────────────────────────────────────────────────────────────

export function KitInstalled({ kit }: { kit: KitEntry }) {
  const m = kit.manifest;
  const router = useRouter();
  const userId = useAppSelector(selectUserId);
  const [dataSource] = useState(() => recordsDataSource(createClient()));
  const [tableVersions, setTableVersions] = useState<Record<string, number>>({});
  const bumpTable = (tableId: string) => setTableVersions((v) => ({ ...v, [tableId]: (v[tableId] ?? 0) + 1 }));

  // THE LIST: installs across ALL the person's organizations (or the one the page's
  // organization filter names, default All). The active organization is never read here.
  const [orgFilter, setOrgFilter] = useOrgFilterParam();
  const { organizations, loading: orgsLoading } = useUserOrganizations();
  const searchIds = orgsLoading ? null : orgFilter ? [orgFilter] : organizations.map((o) => o.id);
  const found = useKitInstalls(m.key, searchIds);
  const [pickedOrg, setPickedOrg] = useState<string | null>(null);
  const selected = found.installs.find((i) => i.organizationId === pickedOrg) ?? found.installs[0] ?? null;
  const install = selected?.install ?? null;
  // What an install shows and does is in ITS OWN organization.
  const orgId = selected?.organizationId ?? null;
  // The copies' REAL names ("My Org Chart 3" when the manifest name was taken), read from the rows.
  const agentNames = useAgentNames(Object.values(install?.steps.agents ?? {}));
  const orgNameOf = (id: string) => organizations.find((o) => o.id === id)?.name ?? "Organization";
  const detailHref = (organizationId: string | null) =>
    `${KIT_ROUTES.detail(m.key)}${organizationId ? `?org_filter=${encodeURIComponent(organizationId)}` : ""}`;

  const header = (
    <PageHeader>
      <HeaderStructured back title={m.name} context={<span className="text-xs text-muted-foreground">Installed {KIT_WORD.oneLower}</span>} />
    </PageHeader>
  );

  let body: React.ReactNode;
  if (found.loading) {
    body = (
      <div className="flex items-center gap-2 text-sm text-muted-foreground" aria-busy="true">
        <Loader2 className="h-4 w-4 animate-spin" />
        Finding installs…
      </div>
    );
  } else if (!selected && found.failures.length > 0) {
    body = (
      <ErrorNotice
        className="max-w-xl"
        title="We could not read the install record."
        error={found.failures.map((f) => `${orgNameOf(f.organizationId)}: ${f.message}`).join(" · ")}
        onRetry={found.retry}
        retryLabel="Check again"
      />
    );
  } else if (!selected || !install) {
    body = (
      <div className="max-w-xl rounded-xl border border-border bg-card p-5">
        <p className="text-sm font-medium text-foreground">
          {orgFilter ? `This ${KIT_WORD.oneLower} is not installed in ${orgNameOf(orgFilter)}.` : `This ${KIT_WORD.oneLower} is not installed yet.`}
        </p>
        <Button asChild size="sm" className="mt-4">
          <Link href={detailHref(orgFilter)}>{`Install ${m.name}`}</Link>
        </Button>
      </div>
    );
  } else if (install.status !== "installed") {
    body = (
      <div className="max-w-xl rounded-xl border border-border bg-card p-5">
        <p className="text-sm font-medium text-foreground">
          {`This ${KIT_WORD.oneLower} is only partly installed in ${orgNameOf(selected.organizationId)}.`}
        </p>
        <div className="mt-3">
          <InstallStepper steps={stepsFromInstall(m, install)} />
        </div>
        <Button asChild size="sm" className="mt-4">
          <Link href={detailHref(selected.organizationId)}>Finish the install</Link>
        </Button>
      </div>
    );
  } else {
    const steps = install.steps;
    body = (
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="min-w-0 space-y-6">
            <RecordsMount
              key={orgId}
              letTheStoreDecideRights
              config={{
                dataSource,
                actor: personActor(userId),
                organizationId: selected.organizationId,
                realtime: createRecordsRealtimePort(selected.organizationId),
              }}
              host={{ Link, density: "condensed", notify: RECORDS_NOTIFY }}
            >
              {m.tables.map((t) => {
                const id = steps.tables?.[t.key];
                if (!id) return null;
                return (
                  <Panel
                    key={t.key}
                    icon={<Table2 className="h-4 w-4 shrink-0 text-chart-2" />}
                    title={t.name}
                    bare
                    aside={
                      <Link href={KIT_ROUTES.table(id)} className="inline-flex items-center gap-0.5 text-xs font-medium text-primary hover:underline">
                        Open in Data
                        <ArrowUpRight className="h-3 w-3" />
                      </Link>
                    }
                  >
                    <TableChangeWatcher tableId={id} onChange={bumpTable} />
                    <Grid
                      tableId={id}
                      pageSize={50}
                      onOpenRecord={(recordId) => router.push(`${KIT_ROUTES.table(id)}?record=${encodeURIComponent(recordId)}`)}
                    />
                  </Panel>
                );
              })}
            </RecordsMount>
          </div>

          <div className="min-w-0 space-y-6">
            {/* ONE PANEL PER AGENT: what it sees (each connected variable, rendered by
                the server) and Try it. When one table feeds several agents, each panel
                reads the same rows — the fan the kit teaches. */}
            {m.agents.map((a) => {
              const id = steps.agents?.[a.key];
              if (!id) return null;
              return (
                <Panel
                  key={a.key}
                  icon={<AGENT_ICON className="h-4 w-4 shrink-0 text-primary" />}
                  title={agentNames[id] ?? a.name}
                  aside={
                    <Link href={KIT_ROUTES.agent(id)} className="inline-flex items-center gap-0.5 text-xs font-medium text-primary hover:underline">
                      Open agent
                      <ArrowUpRight className="h-3 w-3" />
                    </Link>
                  }
                >
                  {a.bindings.length > 0 && (
                    <>
                      <p className="flex items-center gap-1.5 px-4 pt-3 text-sm font-semibold text-foreground">
                        <Eye className="h-3.5 w-3.5 text-primary" />
                        What it sees
                        <InfoHint text="The exact text your table becomes on each run, updated as you edit it." />
                      </p>
                      <div className="divide-y divide-border">
                        {a.bindings.map((b) => (
                          <BindingPreviewCard
                            key={`${a.key}:${b.variable}`}
                            organizationId={selected.organizationId}
                            agent={a}
                            variable={b.variable}
                            install={install}
                            manifest={m}
                            dataVersion={tableVersions[install.steps.tables?.[b.binding.table_key] ?? ""] ?? 0}
                          />
                        ))}
                      </div>
                    </>
                  )}
                  <TryItBody agent={a} agentId={id} agentName={agentNames[id] ?? a.name} />
                </Panel>
              );
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
          <div className="mb-6 flex flex-wrap items-center gap-3">
            <KitIcon name={m.icon} tintKey={kit.key} />
            <h1 className="min-w-0 truncate text-2xl font-semibold tracking-tight text-foreground">{m.name}</h1>
            <div className="ml-auto flex items-center gap-3">
              <Link href={KIT_ROUTES.detail(m.key)} className="text-sm font-medium text-primary hover:underline">
                How it works
              </Link>
              <EntityOrgFilter orgId={orgFilter} onChange={setOrgFilter} />
            </div>
          </div>
          {found.installs.length > 0 && (
            <div className="mb-6 flex flex-wrap items-center gap-2">
              {found.installs.map((i) => (
                <button
                  key={i.organizationId}
                  type="button"
                  aria-pressed={i.organizationId === selected?.organizationId}
                  onClick={() => setPickedOrg(i.organizationId)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground hover:border-primary/40 aria-pressed:border-primary aria-pressed:bg-primary/10"
                >
                  <Building2 className="h-3.5 w-3.5" />
                  {orgNameOf(i.organizationId)}
                  {i.install.status !== "installed" && <span className="rounded bg-warning/15 px-1 text-[10px] text-warning">Partial</span>}
                </button>
              ))}
              {selected && (
                <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-1">
                  {selected.install.status === "installed" &&
                    m.workflows.map((w) => {
                      const id = selected.install.steps.workflows?.[w.key];
                      return id ? (
                        <Link key={w.key} href={KIT_ROUTES.workflow(id)} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                          <Workflow className="h-3.5 w-3.5" />
                          {w.name}
                        </Link>
                      ) : null;
                    })}
                  <Link href={detailHref(selected.organizationId)} className="text-sm font-medium text-primary hover:underline">
                    Update or remove
                  </Link>
                </div>
              )}
            </div>
          )}
          {found.failures.length > 0 && selected && (
            <p className="mb-4 flex items-center gap-1.5 text-xs text-warning">
              <AlertTriangle className="h-3 w-3" />
              {`${found.failures.length} ${found.failures.length === 1 ? "organization" : "organizations"} could not be read.`}
              <ErrorAlchemyMenu error={found.failures.map((f) => f.message).join(" · ")} />
              <button type="button" onClick={found.retry} className="font-medium text-primary hover:underline">
                Check again
              </button>
            </p>
          )}
          {body}
        </div>
      </div>
    </>
  );
}
