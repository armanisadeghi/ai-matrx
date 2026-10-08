"use client";

/**
 * AI spend health — every agent and mandate with spend in the window, most expensive
 * first, with the owner's spend-rule red flags. seat="admin": every organization
 * (admin lane). seat="org": one organization (its admins), costs in points.
 * A row's name opens its detail page with every run.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Badge, Button, SegmentedControl } from "@ai-matrx/design-system/controls";
import { adminCostColumns } from "@/components/cost/adminCostColumns";
import { AGENT_FLAG_SET, SpendFlagStrip, spendFlagColumn, type SpendFlagHit } from "@/components/cost/SpendFlagStrip";
import { FirstPlusMore } from "@/components/official/first-plus-more/FirstPlusMore";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { useCostDisplay } from "@/components/cost/useCostDisplay";
import { usageViewHref } from "@/features/admin/usage-drill/usageLinks";
import { RunApprovalCell } from "@/features/admin/spend-approvals/RunApprovalCell";
import { approvalStatusSync } from "@/features/admin/spend-approvals/spendApprovals";
import { orgAdminMemberHref } from "@/features/organizations/admin/routes";
import {
  agentSpendDetailHref,
  agentSpendFlags,
  fetchAgentSpend,
  fetchAgentSpendRawTotal,
  isTestAccount,
  reconciles,
  spendAgentHref,
  spendMandateHref,
  type AgentSpendRow,
  type SpendSeat,
  type SpendSubjectKey,
  type SpendWindowDays,
} from "./agentSpend";

/** `subject` = a detail page: only its rows, and no board total (see fetchAgentSpend). */
export function useAgentSpend(orgId: string | null, days: SpendWindowDays, subject?: SpendSubjectKey) {
  const subjectKey = subject ? `${subject.agent_id ?? ""}|${subject.mandate_key ?? ""}|${subject.source ?? ""}` : "";
  const [rows, setRows] = useState<AgentSpendRow[]>([]);
  const [rawTotal, setRawTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError(null);
    setRawTotal(null);
    Promise.all([
      fetchAgentSpend(orgId, days, subject),
      subject ? Promise.resolve<number | null>(null) : fetchAgentSpendRawTotal(orgId, days),
    ])
      .then(([r, raw]) => {
        if (!live) return;
        setRows(r);
        setRawTotal(raw);
      })
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [orgId, days, tick, subjectKey]);
  return { rows, rawTotal, loading, error, reload: () => setTick((t) => t + 1) };
}

export const rowKey = (r: { agent_id: string | null; mandate_key: string | null; unattributed_source?: string | null }) =>
  `${r.agent_id ?? "-"}:${r.mandate_key ?? "-"}:${r.unattributed_source ?? "-"}`;

/** The agent spend rules' flags as icon-strip hits. */
export function agentFlagHits(row: AgentSpendRow, money: (usd: number) => string): SpendFlagHit[] {
  return agentSpendFlags(row, money).map((f) => ({
    slot: f.id === "parked_on_admin" ? "test_account" : f.id,
    severity: f.severity,
    detail: f.detail,
  }));
}

export function AgentSpendFlagStrip({ row, money }: { row: AgentSpendRow; money: (usd: number) => string }) {
  return <SpendFlagStrip set={AGENT_FLAG_SET} hits={agentFlagHits(row, money)} />;
}

const subjectTitle = (row: AgentSpendRow) =>
  row.unattributed_source
    ? `Unattributed: ${row.unattributed_source}`
    : (row.agent_name ?? row.mandate_label ?? row.mandate_key ?? "Unknown agent");

/** Agent + mandate names, each opening its own page for this seat. */
export function SpendSubject({
  row,
  seat,
  orgSlug,
  days,
}: {
  row: AgentSpendRow;
  seat: SpendSeat;
  orgSlug?: string;
  days: SpendWindowDays;
}) {
  const title = row.unattributed_source
    ? `Unattributed: ${row.unattributed_source}`
    : (row.agent_name ?? row.mandate_label ?? row.mandate_key ?? "Unknown agent");
  const agentHref = seat === "admin" ? spendAgentHref(row) : undefined;
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <Link
        href={agentSpendDetailHref(row, days, seat, orgSlug)}
        className="truncate font-medium text-primary hover:underline"
        title={`${title}: every run`}
      >
        {title}
      </Link>
      <div className="flex min-w-0 flex-col gap-0.5 text-xs">
        {row.agent_id && (
          <EntityRef token="agent" id={row.agent_id} name={row.agent_name ?? "Agent"} href={agentHref ?? undefined} />
        )}
        {row.unattributed_source && (
          <span className="truncate text-muted-foreground">No agent or mandate recorded</span>
        )}
        {row.mandate_key && (
          <EntityRef
            token="mandate"
            id={row.mandate_key}
            name={row.mandate_label ?? row.mandate_key}
            href={spendMandateHref(row.mandate_key, seat, orgSlug)}
            disablePeek
          />
        )}
      </div>
    </div>
  );
}

export function ModelList({ models, premium }: { models: string[]; premium: string[] }) {
  if (models.length === 0) return <span className="text-xs text-muted-foreground">Not recorded</span>;
  return (
    <div className="flex min-w-0 flex-col text-xs">
      {models.map((m) => (
        <span key={m} className={`truncate ${premium.includes(m) ? "font-semibold text-red-600" : ""}`} title={m}>
          {m}
        </span>
      ))}
    </div>
  );
}

/** Who paid: the people and organizations the spend landed on, biggest first. */
export function PaidBy({ row, seat, orgSlug }: { row: AgentSpendRow; seat: SpendSeat; orgSlug?: string }) {
  const top = row.payers.slice(0, 2);
  const org = row.organizations[0];
  return (
    <div className="flex min-w-0 flex-col gap-0.5 text-xs">
      {top.map((p) => {
        const flagged = isTestAccount(p);
        const label = p.email ?? "Unknown person";
        const href = p.person_id
          ? seat === "admin"
            ? usageViewHref("usage_by_person", { person: p.person_id })
            : orgSlug
              ? orgAdminMemberHref(orgSlug, p.person_id)
              : null
          : null;
        return href ? (
          <Link key={p.person_id ?? label} href={href} className={`truncate hover:underline ${flagged ? "text-amber-600" : "text-primary"}`} title={label}>
            {label}
          </Link>
        ) : (
          <span key={label} className="truncate text-muted-foreground">{label}</span>
        );
      })}
      {row.payers.length > 2 && <span className="text-muted-foreground">{`+${row.payers.length - 2} more`}</span>}
      {seat === "admin" && org?.id && (
        <EntityRef token="organization" id={org.id} name={org.name ?? "Organization"} />
      )}
    </div>
  );
}

/** One fixed-height line proving the board adds up to everything the platform recorded. */
export function ReconciliationBar({
  loading,
  board,
  raw,
  unattributed,
  days,
  format,
}: {
  loading: boolean;
  board: number;
  raw: number | null;
  unattributed: number;
  days: SpendWindowDays;
  format: (usd: number) => string;
}) {
  const ok = raw != null && reconciles(board, raw);
  return (
    <div className="flex h-7 shrink-0 items-center gap-3 overflow-hidden whitespace-nowrap text-xs text-muted-foreground">
      {loading || raw == null ? (
        <span>Adding up {days} days of spend</span>
      ) : (
        <>
          <span>
            Board total <span className="font-medium tabular-nums text-foreground">{format(board)}</span>
          </span>
          <span>
            All recorded AI spend <span className="font-medium tabular-nums text-foreground">{format(raw)}</span>
          </span>
          <Badge tone={ok ? "success" : "destructive"}>
            {ok ? "Matches" : `Gap ${format(Math.abs(raw - board))}`}
          </Badge>
          {unattributed > 0 && (
            <span>
              Unattributed <span className="font-medium tabular-nums text-foreground">{format(unattributed)}</span>
            </span>
          )}
        </>
      )}
    </div>
  );
}

export function AgentSpendBoard({
  orgId,
  seat,
  orgSlug,
  days,
  onDaysChange,
}: {
  orgId: string | null;
  seat: SpendSeat;
  orgSlug?: string;
  days: SpendWindowDays;
  onDaysChange: (d: SpendWindowDays) => void;
}) {
  const { rows, rawTotal, loading, error, reload } = useAgentSpend(orgId, days);
  const { format } = useCostDisplay();
  const total = rows.reduce((s, r) => s + r.cost, 0);
  const unattributed = rows.reduce((s, r) => s + (r.unattributed_source ? r.cost : 0), 0);

  const payerHref = (personId: string | null) =>
    personId
      ? seat === "admin"
        ? usageViewHref("usage_by_person", { person: personId })
        : orgSlug
          ? orgAdminMemberHref(orgSlug, personId)
          : null
      : null;
  const hits = (r: AgentSpendRow) => agentFlagHits(r, format);

  const columns: MatrxColumnDef<AgentSpendRow>[] = [
    {
      id: "name",
      header: "Spend on",
      accessorFn: (r) => subjectTitle(r),
      filter: "text",
      width: 220,
      cell: (r) => (
        <Link
          href={agentSpendDetailHref(r, days, seat, orgSlug)}
          className="block truncate font-medium text-primary hover:underline"
          title={`${subjectTitle(r)}: every run`}
        >
          {subjectTitle(r)}
        </Link>
      ),
    },
    {
      id: "mandate",
      header: "Mandate",
      accessorFn: (r) => r.mandate_label ?? r.mandate_key ?? "",
      filter: "text",
      width: 200,
      cell: (r) =>
        r.mandate_key ? (
          <div className="min-w-0 truncate text-xs">
            <EntityRef
              token="mandate"
              id={r.mandate_key}
              name={r.mandate_label ?? r.mandate_key}
              href={spendMandateHref(r.mandate_key, seat, orgSlug)}
              disablePeek
            />
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      id: "agent",
      header: "Agent",
      accessorFn: (r) => r.agent_name ?? "",
      filter: "text",
      width: 180,
      cell: (r) =>
        r.agent_id ? (
          <div className="min-w-0 truncate text-xs">
            <EntityRef
              token="agent"
              id={r.agent_id}
              name={r.agent_name ?? "Agent"}
              href={seat === "admin" ? (spendAgentHref(r) ?? undefined) : undefined}
            />
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      id: "approval",
      header: "Approval status",
      accessorFn: (r) => approvalStatusSync(orgId, [["mandate", r.mandate_key], ["agent", r.agent_id]]),
      filter: "select",
      filterOptions: [
        { value: "waiting", label: "Waiting" },
        { value: "approved", label: "Approved" },
        { value: "rejected", label: "Rejected" },
        { value: "none", label: "None" },
      ],
      width: 120,
      cell: (r) => (
        <RunApprovalCell
          orgId={orgId}
          subjects={[["mandate", r.mandate_key], ["agent", r.agent_id]]}
          maxRunCost={r.max_run_cost}
          thresholdOrgId={r.organizations[0]?.id ?? null}
          seat={seat}
          orgSlug={orgSlug}
        />
      ),
    },
    spendFlagColumn<AgentSpendRow>(AGENT_FLAG_SET, hits),
    {
      id: "models",
      header: "Model",
      accessorFn: (r) => r.models.join(", "),
      filter: "text",
      width: 180,
      cell: (r) => (
        <FirstPlusMore
          items={r.models}
          getKey={(m) => m}
          label="models"
          empty="Not recorded"
          render={(m) => (
            <span className={r.premium_models.includes(m) ? "font-semibold text-destructive" : ""} title={m}>
              {m}
            </span>
          )}
        />
      ),
    },
    { id: "runs", accessorKey: "runs", header: "Runs", filter: "number", align: "right", width: 70 },
    ...adminCostColumns<AgentSpendRow>({ id: "cost", label: "Cost", value: (r) => r.cost }),
    ...adminCostColumns<AgentSpendRow>({ id: "avg_run_cost", label: "Avg cost/run", value: (r) => r.avg_run_cost }),
    ...adminCostColumns<AgentSpendRow>({ id: "max_run_cost", label: "Max cost/run", value: (r) => r.max_run_cost }),
    {
      id: "avg_turns",
      accessorKey: "avg_turns",
      header: "Avg turns",
      filter: "number",
      align: "right",
      width: 85,
      cell: (r) => <span className="tabular-nums text-xs">{r.avg_turns}</span>,
    },
    {
      id: "max_turns",
      accessorKey: "max_turns",
      header: "Max turns",
      filter: "number",
      align: "right",
      width: 85,
      cell: (r) => <span className="tabular-nums text-xs">{r.max_turns}</span>,
    },
    {
      id: "avg_input_per_call",
      accessorKey: "avg_input_per_call",
      header: "In / call",
      filter: "number",
      align: "right",
      width: 90,
      cell: (r) => <span className="tabular-nums text-xs">{Math.round(r.avg_input_per_call).toLocaleString()}</span>,
    },
    {
      id: "avg_output_per_call",
      accessorKey: "avg_output_per_call",
      header: "Out / call",
      filter: "number",
      align: "right",
      width: 90,
      cell: (r) => <span className="tabular-nums text-xs">{Math.round(r.avg_output_per_call).toLocaleString()}</span>,
    },
    {
      id: "automated_share",
      header: "Automated %",
      accessorFn: (r) => (r.runs ? Math.round((r.automated_runs / r.runs) * 100) : 0),
      filter: "number",
      align: "right",
      width: 100,
      cell: (r) => <span className="tabular-nums text-xs">{r.runs ? `${Math.round((r.automated_runs / r.runs) * 100)}%` : "—"}</span>,
    },
    {
      id: "unsaved",
      header: "Unsaved runs",
      accessorFn: (r) => r.unsaved_runs,
      filter: "number",
      align: "right",
      width: 100,
      cell: (r) => <span className={`tabular-nums text-xs ${r.unsaved_runs > 0 ? "" : "text-muted-foreground"}`}>{r.unsaved_runs}</span>,
    },
    {
      id: "paid_by",
      header: "Paid by",
      accessorFn: (r) => r.payers.map((p) => p.email ?? "").join(", "),
      filter: "text",
      width: 200,
      cell: (r) => (
        <FirstPlusMore
          items={r.payers}
          getKey={(p) => p.person_id ?? p.email ?? "?"}
          label="payers"
          render={(p) => {
            const href = payerHref(p.person_id);
            const label = p.email ?? "Unknown person";
            return href ? (
              <Link href={href} className={`hover:underline ${isTestAccount(p) ? "text-warning" : "text-primary"}`} title={label}>
                {label}
              </Link>
            ) : (
              <span className="text-muted-foreground">{label}</span>
            );
          }}
        />
      ),
    },
    {
      id: "organization",
      header: "Organization",
      accessorFn: (r) => r.organizations.map((o) => o.name ?? "").join(", "),
      filter: "text",
      width: 180,
      hidden: seat !== "admin",
      cell: (r) => (
        <FirstPlusMore
          items={r.organizations}
          getKey={(o) => o.id ?? o.name ?? "?"}
          label="organizations"
          render={(o) =>
            seat === "admin" && o.id ? (
              <EntityRef token="organization" id={o.id} name={o.name ?? "Organization"} />
            ) : (
              <span>{o.name ?? "Organization"}</span>
            )
          }
        />
      ),
    },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
          <ErrorAlchemyMenu error={error} />
        </div>
      )}
      <ReconciliationBar
        loading={loading}
        board={total}
        raw={rawTotal}
        unattributed={unattributed}
        days={days}
        format={format}
      />
      <div className="min-h-0 flex-1">
        <MatrxDataTable
          data={rows}
          columns={columns}
          getRowId={rowKey}
          isLoading={loading}
          defaultSort={{ id: "cost", direction: "desc" }}
          emptyState={{ title: `No agent spend in ${days} days` }}
          toolbar={{
            search: true,
            searchPlaceholder: "Search agents and mandates…",
            actions: (
              <div className="flex items-center gap-2">
                <SegmentedControl<"7" | "30">
                  aria-label="Window"
                  value={String(days) as "7" | "30"}
                  onValueChange={(v) => onDaysChange(v === "7" ? 7 : 30)}
                  data={[
                    { value: "7", label: "7d" },
                    { value: "30", label: "30d" },
                  ]}
                />
                <Button variant="outline" onClick={reload} disabled={loading} aria-label="Refresh">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                </Button>
              </div>
            ),
          }}
          copy={{
            label: "Agent spend",
            listLabel: "Agent spend (this view)",
            location: seat === "admin" ? "/administration/usage/agents" : "/organizations/admin/ai-spend",
            rowKind: "agent-spend",
            listKind: "agent-spend",
            humanRow: (r) =>
              [
                `Agent: ${r.agent_name ?? "—"}`,
                r.mandate_key ? `Mandate: ${r.mandate_key}` : null,
                `Models: ${r.models.join(", ") || "not recorded"}`,
                `Runs: ${r.runs}`,
                `Cost: ${format(r.cost)} (avg ${format(r.avg_run_cost)}, max ${format(r.max_run_cost)})`,
                `Turns: avg ${r.avg_turns}, max ${r.max_turns}`,
                `Tokens per call: in ${Math.round(r.avg_input_per_call)}, out ${Math.round(r.avg_output_per_call)}`,
                `Flags: ${agentSpendFlags(r, format).map((f) => f.label).join(", ") || "none"}`,
              ]
                .filter(Boolean)
                .join("\n"),
          }}
        />
      </div>
    </div>
  );
}
