"use client";

// Billing › Alarms: every spend alarm record, ringing ones first, on the canonical MatrxDataTable
// (views, KPIs, tones). Each row opens its record page; ?id=<alarm> highlights that row.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { Button, SegmentedControl } from "@ai-matrx/design-system/controls";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";
import { readOf } from "@ai-matrx/design-system";
import { useListViewPrefs } from "@/lib/list-views/useListViewPrefs";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { formatAdminUsd } from "@/components/cost/formatAdminCost";
import { SPEND_ALARMS_PATH, fetchSpendAlarms, isRinging, spendAlarmHref, type SpendAlarmRecord } from "./spendAlarms";

type StatusFilter = "ringing" | "snoozed" | "resolved" | "all";

const LEVEL_RANK = { critical: 0, warning: 1, info: 2 } as const;

export function SpendAlarmsBoard() {
  const [rows, setRows] = useState<SpendAlarmRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusFilter>("ringing");
  const [version, setVersion] = useState(0);
  const { prefs: viewPrefs, setPrefs: setViewPrefs } = useListViewPrefs("spend-alarms-admin");
  const focusId = useSearchParams().get("id");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchSpendAlarms()
      .then((r) => alive && (setRows(r), setError(null)))
      .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [version]);

  const visible = rows
    .filter((r) =>
      status === "all" ? true : status === "ringing" ? isRinging(r) : status === "snoozed" ? r.status === "snoozed" && !isRinging(r) : r.status === "resolved",
    )
    .sort((a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level] || b.last_seen_at.localeCompare(a.last_seen_at));

  const columns: MatrxColumnDef<SpendAlarmRecord>[] = [
    {
      id: "level",
      accessorKey: "level",
      header: "Level",
      filter: "select",
      tone: (r) => (r.level === "critical" ? "danger" : r.level === "warning" ? "warning" : "muted"),
      sortValue: (r) => LEVEL_RANK[r.level],
      kpi: [
        { op: "count", id: "critical", label: "Critical", countWhere: (r) => r.level === "critical", tone: (v) => (v > 0 ? "danger" : undefined) },
        { op: "count", id: "warning", label: "To decide", countWhere: (r) => r.level === "warning", tone: (v) => (v > 0 ? "warning" : undefined) },
      ],
    },
    {
      id: "title",
      accessorKey: "title",
      header: "Alarm",
      href: (r) => spendAlarmHref(r.id),
      cell: (r) => (
        <Link href={spendAlarmHref(r.id)} className="text-primary hover:underline">
          {r.title}
        </Link>
      ),
    },
    { id: "kind", accessorKey: "kind", header: "Kind", filter: "select" },
    {
      id: "subject",
      header: "Subject",
      accessorFn: (r) => r.subject_name ?? `${r.subject_type} ${r.subject_id}`,
    },
    { id: "handler", header: "Handler", accessorFn: (r) => r.refs.handler ?? "" },
    {
      id: "occurrence_count",
      accessorKey: "occurrence_count",
      header: "Times",
      tone: (r) => (r.occurrence_count >= 100 ? "danger" : undefined),
      kpi: { op: "sum", label: "Occurrences" },
    },
    { id: "last_seen_at", accessorKey: "last_seen_at", header: "Last seen", cell: (r) => new Date(r.last_seen_at).toLocaleString() },
    {
      id: "status",
      accessorKey: "status",
      header: "Status",
      filter: "select",
      tone: (r) => (r.status === "resolved" ? "success" : r.status === "snoozed" ? "muted" : undefined),
    },
    {
      id: "cost_usd",
      accessorKey: "cost_usd",
      header: "Cost",
      cell: (r) => (r.cost_usd == null ? "—" : formatAdminUsd(r.cost_usd)),
      kpi: { op: "sum", label: "Cost" },
    },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      {error ? (
        <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
          <ErrorAlchemyMenu error={error} />
        </div>
      ) : null}
      <div className="min-h-0 flex-1">
        <MatrxDataTable
          data={visible}
          columns={columns}
          getRowId={(r) => r.id}
          isLoading={loading}
          tableId="spend-alarms-admin"
          viewTabsStore={{ views: viewPrefs.savedViews ?? [], onChange: (savedViews) => setViewPrefs({ savedViews }) }}
          focusRowId={focusId}
          headerWrap="two-lines"
          read={readOf({ loading, error }, { what: "spend alarms" })}
          emptyState={{ title: status === "ringing" ? "No alarms ringing" : "No alarms" }}
          toolbar={{
            title: "Spend alarms",
            search: true,
            searchPlaceholder: "Search alarms, kinds, subjects…",
            actions: (
              <div className="flex items-center gap-2">
                <SegmentedControl<StatusFilter>
                  aria-label="Status"
                  value={status}
                  onValueChange={setStatus}
                  data={[
                    { value: "ringing", label: "Open" },
                    { value: "snoozed", label: "Snoozed" },
                    { value: "resolved", label: "Resolved" },
                    { value: "all", label: "All" },
                  ]}
                />
                <Button variant="outline" onClick={() => setVersion((v) => v + 1)} disabled={loading} aria-label="Refresh">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                </Button>
              </div>
            ),
          }}
          copy={{
            label: "Spend alarm",
            listLabel: "Spend alarms (this view)",
            location: SPEND_ALARMS_PATH,
            rowKind: "spend-alarm",
            listKind: "spend-alarm",
            humanRow: (r) => `${r.level} · ${r.title} · x${r.occurrence_count} · ${spendAlarmHref(r.id)}`,
            agentRow: (r) => ({ ...r, page: spendAlarmHref(r.id) }),
          }}
        />
      </div>
    </div>
  );
}
