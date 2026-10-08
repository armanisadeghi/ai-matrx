"use client";

/**
 * One agent / mandate: its numbers, flags and every run (cost, turns, model, tokens,
 * who paid, which organization, the conversation — or "Unsaved" when the run left none).
 * seat="admin": every organization; seat="org": that organization only.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, ExternalLink, Loader2 } from "lucide-react";
import { Badge, SegmentedControl } from "@ai-matrx/design-system/controls";
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
import {
  AGENT_SPEND_ADMIN_PATH,
  agentSpendFlags,
  fetchAgentSpendRuns,
  orgAgentSpendPath,
  type AgentSpendRun,
  type SpendSeat,
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
  agentId,
  mandateKey,
  seat,
  orgSlug,
}: {
  orgId: string | null;
  days: SpendWindowDays;
  agentId: string | null;
  mandateKey: string | null;
  seat: SpendSeat;
  orgSlug?: string;
}) {
  const { format } = useCostDisplay();
  const [runs, setRuns] = useState<AgentSpendRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError(null);
    fetchAgentSpendRuns(orgId, days, agentId, mandateKey)
      .then((r) => live && setRuns(r))
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [orgId, days, agentId, mandateKey]);

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
      cell: (r) => <Cost usd={r.cost} className={`tabular-nums text-xs ${r.cost > 1 ? "font-semibold text-red-600" : ""}`} />,
    },
    {
      id: "turns",
      accessorKey: "turns",
      header: "Turns",
      filter: "number",
      width: 70,
      cell: (r) => <span className={`tabular-nums text-xs ${r.turns > 20 ? "font-semibold text-red-600" : ""}`}>{r.turns}</span>,
    },
    {
      id: "models",
      header: "Model",
      accessorFn: (r) => r.models.join(", "),
      filter: "text",
      width: 150,
      cell: (r) => <ModelList models={r.models} premium={[]} />,
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
  return (
    <MatrxDataTable
      data={runs}
      columns={columns}
      getRowId={(r) => r.run_key}
      isLoading={loading}
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
  );
}

export function AgentSpendDetail({
  orgId,
  seat,
  orgSlug,
  agentId,
  mandateKey,
  days,
  onDaysChange,
}: {
  orgId: string | null;
  seat: SpendSeat;
  orgSlug?: string;
  agentId: string | null;
  mandateKey: string | null;
  days: SpendWindowDays;
  onDaysChange: (d: SpendWindowDays) => void;
}) {
  const { rows, loading, error } = useAgentSpend(orgId, days);
  const { format } = useCostDisplay();
  const row = rows.find((r) => rowKey(r) === rowKey({ agent_id: agentId, mandate_key: mandateKey }));
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
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading spend
        </div>
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
        </>
      )}
      <RunsTable orgId={orgId} days={days} agentId={agentId} mandateKey={mandateKey} seat={seat} orgSlug={orgSlug} />
    </div>
  );
}
