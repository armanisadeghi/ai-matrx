"use client";

/**
 * One agent / mandate: its numbers, flags and every run (cost, turns, model, tokens,
 * who paid, which organization, the conversation — or "Unsaved" when the run left none).
 * seat="admin": every organization; seat="org": that organization only.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { Badge, Button, SegmentedControl } from "@ai-matrx/design-system/controls";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { Cost } from "@/components/cost/Cost";
import { useCostDisplay } from "@/components/cost/useCostDisplay";
import { usageViewHref } from "@/features/admin/usage-drill/usageLinks";
import { orgAdminMemberHref } from "@/features/organizations/admin/routes";
import { conversationHref } from "@/features/scheduling/service/automationCosts";
import { humanizeRelative } from "@/features/scheduling/utils/triggerHumanize";
import { SPEND_FLAG_LIMITS } from "@/features/scheduling/service/automationCosts";
import {
  AGENT_SPEND_ADMIN_PATH,
  SPEND_RUNS_PAGE_SIZE,
  agentSpendDetailHref,
  spendAgentHref,
  agentSpendFlags,
  fetchAgentSpendRuns,
  orgAgentSpendPath,
  type AgentSpendRun,
  type SpendSeat,
  type SpendSubjectKey,
  type SpendWindowDays,
} from "./agentSpend";
import { ModelList, PaidBy, SpendFlagBadges, SpendSubject, rowKey, useAgentSpend } from "./AgentSpendBoard";

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="truncate text-sm font-medium tabular-nums">{children}</div>
    </div>
  );
}

function RunsTable({
  orgId,
  days,
  subject,
  premium,
  seat,
  orgSlug,
}: {
  orgId: string | null;
  days: SpendWindowDays;
  subject: SpendSubjectKey;
  premium: string[];
  seat: SpendSeat;
  orgSlug?: string;
}) {
  const { format } = useCostDisplay();
  const L = SPEND_FLAG_LIMITS;
  const [runs, setRuns] = useState<AgentSpendRun[]>([]);
  const [totals, setTotals] = useState<{ runs: number; cost: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { agent_id: agentId, mandate_key: mandateKey, source } = subject;
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError(null);
    setTotals(null);
    fetchAgentSpendRuns(orgId, days, { agent_id: agentId, mandate_key: mandateKey, source })
      .then((page) => {
        if (!live) return;
        setRuns(page.runs);
        setTotals({ runs: page.totalRuns, cost: page.totalCost });
      })
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [orgId, days, agentId, mandateKey, source]);

  /** Pull the next runs (one page, or everything left) and append them; never silently stop at the first page. */
  const loadMore = async (all: boolean) => {
    setLoadingMore(true);
    setError(null);
    try {
      let acc = runs;
      let total = totals?.runs ?? 0;
      do {
        const page = await fetchAgentSpendRuns(orgId, days, { agent_id: agentId, mandate_key: mandateKey, source }, acc.length, all ? 1000 : SPEND_RUNS_PAGE_SIZE);
        if (page.runs.length === 0) break;
        const seen = new Set(acc.map((r) => r.run_key));
        acc = [...acc, ...page.runs.filter((r) => !seen.has(r.run_key))];
        total = page.totalRuns;
        setRuns(acc);
        setTotals({ runs: page.totalRuns, cost: page.totalCost });
      } while (all && acc.length < total);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingMore(false);
    }
  };

  const columns: MatrxColumnDef<AgentSpendRun>[] = [
    {
      id: "started_at",
      accessorKey: "started_at",
      header: "When",
      filter: "date",
      width: 110,
      cell: (r) => <span className="text-xs" title={r.started_at}>{humanizeRelative(r.started_at)}</span>,
    },
    {
      id: "cost",
      accessorKey: "cost",
      header: "Cost",
      filter: "number",
      width: 100,
      cell: (r) => <Cost usd={r.cost} className={`tabular-nums text-xs ${r.cost > L.runCostUsd ? "font-semibold text-red-600" : ""}`} />,
    },
    {
      id: "turns",
      accessorKey: "turns",
      header: "Turns",
      filter: "number",
      width: 70,
      cell: (r) => <span className={`tabular-nums text-xs ${r.turns > L.maxTurns ? "font-semibold text-red-600" : ""}`}>{r.turns}</span>,
    },
    {
      id: "models",
      header: "Model",
      accessorFn: (r) => r.models.join(", "),
      filter: "text",
      width: 150,
      cell: (r) => <ModelList models={r.models} premium={premium} />,
    },
    {
      id: "tokens_in",
      accessorKey: "tokens_in",
      header: "Tokens in",
      filter: "number",
      width: 90,
      cell: (r) => <span className="tabular-nums text-xs">{r.tokens_in.toLocaleString()}</span>,
    },
    {
      id: "tokens_out",
      accessorKey: "tokens_out",
      header: "Tokens out",
      filter: "number",
      width: 90,
      cell: (r) => <span className="tabular-nums text-xs">{r.tokens_out.toLocaleString()}</span>,
    },
    {
      id: "started_by",
      header: "Started by",
      accessorFn: (r) => (r.automated ? "Automation" : "Person"),
      filter: "select",
      width: 100,
      cell: (r) => <span className="text-xs">{r.automated ? "Automation" : "Person"}</span>,
    },
    {
      id: "paid_by",
      header: "Paid by",
      accessorFn: (r) => `${r.person_email ?? ""} ${r.organization_name ?? ""}`,
      filter: "text",
      width: 200,
      cell: (r) => {
        const personHref = r.person_id
          ? seat === "admin"
            ? usageViewHref("usage_by_person", { person: r.person_id })
            : orgSlug
              ? orgAdminMemberHref(orgSlug, r.person_id)
              : null
          : null;
        return (
          <div className="flex min-w-0 flex-col gap-0.5 text-xs">
            {personHref ? (
              <Link href={personHref} className="truncate text-primary hover:underline">{r.person_email ?? "Person"}</Link>
            ) : (
              <span className="truncate text-muted-foreground">{r.person_email ?? "Unknown person"}</span>
            )}
            {seat === "admin" && r.organization_id && (
              <EntityRef token="organization" id={r.organization_id} name={r.organization_name ?? "Organization"} />
            )}
          </div>
        );
      },
    },
    {
      id: "open",
      header: "Conversation",
      accessorFn: (r) => (r.conversation_id ? "saved" : "unsaved"),
      filter: "select",
      width: 140,
      cell: (r) =>
        r.conversation_id ? (
          seat === "admin" ? (
            <Link href={conversationHref(r.conversation_id, "admin")} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
              <ExternalLink className="h-3 w-3" /> Conversation
            </Link>
          ) : (
            <EntityRef token="conversation" id={r.conversation_id} name="Conversation" />
          )
        ) : (
          <Badge tone="warning" title={r.saved ? "Saved request, no conversation" : "Sent with store off — nothing was saved"}>
            {r.saved ? "No conversation" : "Unsaved"}
          </Badge>
        ),
    },
  ];

  if (error) {
    return (
      <div className="text-sm text-destructive">
        {error}
        <ErrorAlchemyMenu error={error} />
      </div>
    );
  }
  const remaining = totals ? Math.max(totals.runs - runs.length, 0) : 0;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex h-8 items-center gap-3 whitespace-nowrap text-xs text-muted-foreground">
        {totals ? (
          <>
            <span>
              {remaining > 0 ? "Showing " : "All "}
              <span className="font-medium tabular-nums text-foreground">{runs.length.toLocaleString()}</span>
              {remaining > 0 ? " of " : " runs, "}
              {remaining > 0 && <span className="font-medium tabular-nums text-foreground">{totals.runs.toLocaleString()} runs</span>}
              {remaining === 0 && <span className="font-medium tabular-nums text-foreground">{format(totals.cost)}</span>}
            </span>
            {remaining > 0 && (
              <>
                <Button variant="outline" onClick={() => loadMore(false)} disabled={loadingMore}>
                  {`Load ${Math.min(SPEND_RUNS_PAGE_SIZE, remaining).toLocaleString()} more`}
                </Button>
                <Button variant="outline" onClick={() => loadMore(true)} disabled={loadingMore}>
                  {`Load all ${remaining.toLocaleString()} left`}
                </Button>
                <span>{`Total ${format(totals.cost)}`}</span>
              </>
            )}
          </>
        ) : (
          <span>Loading runs</span>
        )}
      </div>
    <MatrxDataTable
      data={runs}
      columns={columns}
      getRowId={(r) => r.run_key}
      isLoading={loading || loadingMore}
      defaultSort={{ id: "started_at", direction: "desc" }}
      emptyState={{ title: `No runs in ${days} days` }}
      frameHeight="content"
      copy={{
        label: "Agent run",
        listLabel: "Agent runs",
        location: seat === "admin" ? AGENT_SPEND_ADMIN_PATH : "/organizations/admin/ai-spend",
        rowKind: "agent-spend-run",
        listKind: "agent-spend-runs",
        humanRow: (r) =>
          [
            `When: ${r.started_at}`,
            `Cost: ${format(r.cost)}`,
            `Turns: ${r.turns}`,
            `Models: ${r.models.join(", ") || "not recorded"}`,
            `Tokens: in ${r.tokens_in}, out ${r.tokens_out}`,
            `Started by: ${r.automated ? "automation" : "a person"}`,
            `Paid by: ${r.person_email ?? "unknown"}${r.organization_name ? ` (${r.organization_name})` : ""}`,
            r.conversation_id ? `Conversation: ${r.conversation_id}` : "Unsaved",
          ].join("\n"),
      }}
    />
    </div>
  );
}

export function AgentSpendDetail({
  orgId,
  seat,
  orgSlug,
  agentId,
  mandateKey,
  source,
  days,
  onDaysChange,
}: {
  orgId: string | null;
  seat: SpendSeat;
  orgSlug?: string;
  agentId: string | null;
  mandateKey: string | null;
  source?: string | null;
  days: SpendWindowDays;
  onDaysChange: (d: SpendWindowDays) => void;
}) {
  const { rows, loading, error } = useAgentSpend(orgId, days);
  const { format } = useCostDisplay();
  const subject: SpendSubjectKey = { agent_id: agentId, mandate_key: mandateKey, source: source ?? null };
  const row = rows.find((r) => rowKey(r) === rowKey({ agent_id: agentId, mandate_key: mandateKey, unattributed_source: source ?? null }));
  // The same mandate run by other agents (and the agentless remainder) — each is its own row with its own runs.
  const siblings = mandateKey ? rows.filter((r) => r.mandate_key === mandateKey && r !== row) : [];
  const backHref = seat === "org" && orgSlug ? orgAgentSpendPath(orgSlug) : AGENT_SPEND_ADMIN_PATH;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <Link href={`${backHref}?days=${days}`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> AI spend health
        </Link>
        <SegmentedControl<"7" | "30">
          aria-label="Window"
          value={String(days) as "7" | "30"}
          onValueChange={(v) => onDaysChange(v === "7" ? 7 : 30)}
          data={[
            { value: "7", label: "7d" },
            { value: "30", label: "30d" },
          ]}
        />
      </div>
      {error ? (
        <div className="text-sm text-destructive">
          {error}
          <ErrorAlchemyMenu error={error} />
        </div>
      ) : loading && !row ? (
        <div className="h-[196px] animate-pulse rounded-md bg-muted/50" aria-label="Loading spend" />
      ) : !row ? (
        <div className="py-4 text-sm text-muted-foreground">{`No spend in ${days} days.`}</div>
      ) : (
        <>
          <SpendSubject row={row} seat={seat} orgSlug={orgSlug} days={days} />
          <SpendFlagBadges flags={agentSpendFlags(row, format)} />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
            <Stat label="Total"><Cost usd={row.cost} /></Stat>
            <Stat label="Runs">{row.runs.toLocaleString()}</Stat>
            <Stat label="Avg / run"><Cost usd={row.avg_run_cost} /></Stat>
            <Stat label="Max / run"><Cost usd={row.max_run_cost} /></Stat>
            <Stat label="Turns avg / max">{`${row.avg_turns} / ${row.max_turns}`}</Stat>
            <Stat label="In / call">{Math.round(row.avg_input_per_call).toLocaleString()}</Stat>
            <Stat label="Out / call">{Math.round(row.avg_output_per_call).toLocaleString()}</Stat>
            <Stat label="Automated">{`${row.automated_runs} / ${row.runs}`}</Stat>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="min-w-0">
              <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">Models</div>
              <ModelList models={row.models} premium={row.premium_models} />
            </div>
            <div className="min-w-0">
              <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">Paid by</div>
              <PaidBy row={row} seat={seat} orgSlug={orgSlug} />
            </div>
            {seat === "admin" && row.agent_id && (
              <div className="min-w-0">
                <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">Usage explorer</div>
                <Link
                  href={usageViewHref("spend_by_model", { agent: row.agent_id }, `${days}d`)}
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <ExternalLink className="h-3 w-3" /> Spend by model
                </Link>
              </div>
            )}
          </div>
          {siblings.length > 0 && (
            <div className="min-w-0">
              <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">This mandate, by agent</div>
              <div className="flex flex-col gap-1">
                {[row, ...siblings].map((r, _i, all) => {
                  // Two agents can share a name (a copy of a builtin): the id
                  // suffix tells them apart, and the agent itself opens.
                  const name = r.agent_name ?? "No agent recorded";
                  const twin = r.agent_id != null && all.some((o) => o !== r && o.agent_name === r.agent_name);
                  const label = twin ? `${name} · ${r.agent_id!.slice(0, 8)}` : name;
                  const agentDoor = seat === "admin" ? spendAgentHref(r) : null;
                  return (
                  <div key={rowKey(r)} className="flex items-center gap-3 text-xs">
                    {r === row ? (
                      <span className="min-w-0 flex-1 truncate font-medium" title={r.agent_id ?? undefined}>{label}</span>
                    ) : (
                      <Link
                        href={agentSpendDetailHref(r, days, seat, orgSlug)}
                        className="min-w-0 flex-1 truncate text-primary hover:underline"
                        title={r.agent_id ?? undefined}
                      >
                        {label}
                      </Link>
                    )}
                    {agentDoor && (
                      <Link href={agentDoor} aria-label={`Open agent ${label}`} className="text-muted-foreground hover:text-primary">
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    )}
                    <span className="tabular-nums text-muted-foreground">{`${r.runs.toLocaleString()} runs`}</span>
                    <Cost usd={r.cost} className="tabular-nums" />
                  </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
      <RunsTable orgId={orgId} days={days} subject={subject} premium={row?.premium_models ?? []} seat={seat} orgSlug={orgSlug} />
    </div>
  );
}
