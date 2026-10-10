"use client";

// Meetings admin › Usage — platform totals for a period plus the same numbers
// per organization. One read: communication.meet_admin_usage (admin lane).
// A row opens that organization's meetings in the History tab.

import { useEffect, useState } from "react";
import { Radio } from "lucide-react";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";
import { formatCount, formatDurationMinutes, formatFileSize } from "@ai-matrx/kit/format";
import { Button } from "@/components/ui/button";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { cn } from "@/lib/utils";
import { fetchMeetUsage, type MeetUsageOrgRow, type MeetUsageReport } from "../service";

import { readOf } from "@ai-matrx/design-system";
const PERIODS = [7, 30, 90] as const;
type Period = (typeof PERIODS)[number];

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "live" }) {
  return (
    <div className="min-w-0 border-r border-border px-3 py-1.5 last:border-r-0" title={hint}>
      <div className="truncate text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("text-lg font-semibold tabular-nums", tone === "live" && "text-emerald-600 dark:text-emerald-400")}>{value}</div>
    </div>
  );
}

const minutes = (value: number) => (value > 0 ? formatDurationMinutes(value, { style: "compact" }) : "0");

const columns: MatrxColumnDef<MeetUsageOrgRow>[] = [
  {
    id: "organization",
    header: "Organization",
    accessorFn: (row) => row.organization_name ?? row.organization_id,
    frozen: true,
    width: 240,
    cell: (row) => <EntityRef token="organization" id={row.organization_id} name={row.organization_name} openInNewTab />,
  },
  { id: "meetings", header: "Meetings", accessorFn: (row) => row.meetings_held, filter: "number", align: "right", width: 90, cell: (row) => formatCount(row.meetings_held) },
  { id: "minutes", header: "Minutes", accessorFn: (row) => row.meeting_minutes, filter: "number", align: "right", width: 100, cell: (row) => minutes(row.meeting_minutes) },
  { id: "participants", header: "People", label: "Unique signed-in participants", accessorFn: (row) => row.unique_participants, filter: "number", align: "right", width: 80 },
  { id: "guests", header: "Guests", accessorFn: (row) => row.guests, filter: "number", align: "right", width: 80 },
  { id: "recordings", header: "Recordings", accessorFn: (row) => row.recordings, filter: "number", align: "right", width: 100 },
  { id: "storage", header: "Storage", label: "Recording storage", accessorFn: (row) => row.recording_bytes, filter: "number", align: "right", width: 100, cell: (row) => formatFileSize(row.recording_bytes) },
  { id: "segments", header: "Transcript lines", accessorFn: (row) => row.transcript_segments, filter: "number", align: "right", width: 120, cell: (row) => formatCount(row.transcript_segments) },
  {
    id: "live",
    header: "Live now",
    accessorFn: (row) => row.live_now,
    filter: "number",
    align: "right",
    width: 90,
    cell: (row) => (row.live_now > 0 ? <span className="font-medium text-emerald-600 dark:text-emerald-400">{row.live_now}</span> : <span className="text-muted-foreground">0</span>),
  },
];

export function MeetingsUsagePanel({ onOpenOrganization }: { onOpenOrganization: (organizationId: string) => void }) {
  const [period, setPeriod] = useState<Period>(30);
  const [nonce, setNonce] = useState(0);
  const [state, setState] = useState<{ period: Period; report: MeetUsageReport | null; error: string | null; loading: boolean }>({ period: 30, report: null, error: null, loading: true });

  useEffect(() => {
    let live = true;
    const to = new Date();
    const from = new Date(to.getTime() - period * 86_400_000);
    setState((current) => ({ ...current, loading: true }));
    fetchMeetUsage(from, to).then(
      (report) => live && setState({ period, report, error: null, loading: false }),
      (error: unknown) => live && setState({ period, report: null, error: error instanceof Error ? error.message : String(error), loading: false }),
    );
    return () => {
      live = false;
    };
  }, [period, nonce]);

  const totals = state.report?.totals;
  const dash = state.loading && !totals ? "…" : "—";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-md border border-border p-0.5" role="group" aria-label="Period">
          {PERIODS.map((days) => (
            <button
              key={days}
              type="button"
              onClick={() => setPeriod(days)}
              aria-pressed={period === days}
              className={cn("rounded px-2.5 py-0.5 text-xs", period === days ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
            >
              {days} days
            </button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground">Started in the last {period} days · all organizations</span>
        <Button variant="quiet" className="ml-auto" onClick={() => setNonce((n) => n + 1)}>Refresh</Button>
      </div>

      {state.error ? (
        <div className="relative rounded-md border border-destructive/40 bg-destructive/5 p-3 pr-10 text-sm text-destructive-ink">
          Usage could not be read: {state.error}
          <ErrorAlchemyMenu error={state.error} operation="Read platform meeting usage" />
        </div>
      ) : null}

      <div className="grid grid-cols-2 rounded-md border border-border bg-card sm:grid-cols-4 xl:grid-cols-8">
        <Stat label="Meetings held" value={totals ? formatCount(totals.meetings_held) : dash} />
        <Stat label="Meeting time" value={totals ? minutes(totals.meeting_minutes) : dash} hint="Sum of start to end (or last activity) over the period" />
        <Stat label="People" value={totals ? formatCount(totals.unique_participants) : dash} hint="Unique signed-in people who joined; AI participants excluded" />
        <Stat label="Guests" value={totals ? formatCount(totals.guests) : dash} hint="Unique joined identities with no account; AI participants excluded" />
        <Stat label="Recordings" value={totals ? formatCount(totals.recordings) : dash} />
        <Stat label="Recording storage" value={totals ? formatFileSize(totals.recording_bytes) : dash} hint="Size of the recording files in the file store" />
        <Stat label="Transcript lines" value={totals ? formatCount(totals.transcript_segments) : dash} />
        <Stat label="Live now" value={totals ? formatCount(totals.live_now) : dash} tone="live" hint="Meetings with someone in the room right now" />
      </div>

      <div className="min-h-0 flex-1">
        <MatrxDataTable
          tableId="admin-meetings-usage-by-org"
          data={state.report?.byOrg ?? []}
          columns={[...(columns), { id: "custom-actions", header: "Actions", sortable: false, filter: false, customActions: (row) => (
            <Button variant="quiet" onClick={() => onOpenOrganization(row.organization_id)}>
              Meetings
            </Button>
          ) }]}
          getRowId={(row) => row.organization_id}
          isLoading={state.loading && !state.report}
          stickyHeader
          density="condensed"
          defaultSort={{ id: "meetings", direction: "desc" }}
          onRowOpen={(row) => onOpenOrganization(row.organization_id)}

          coverage={{ noun: "organization", answeredBy: "client", total: state.report?.byOrg.length }}
          toolbar={{ title: "By organization", search: true }}
          read={readOf({ loading: state.loading, error: state.error }, { what: "meeting usage" })}
          emptyState={{
            icon: <Radio className="h-5 w-5" />,
            title: `No meetings in the last ${period} days`,
            description: "No organization started a meeting, recorded, or transcribed in this period. Pick a longer period above.",
          }}
        />
      </div>
    </div>
  );
}
