"use client";

// Meetings admin › Retention — the platform data-lifecycle rows that decide how
// long Meet data is kept. Nothing here is a Meet-owned retention store: these
// are `platform.retention_policy` rows (read through platform_admin_read on the
// admin lane) and the state of the ONE central sweep that acts on them.
//
// READ-ONLY, AND SAYS SO. The browser is refused every write to
// platform.retention_policy (RLS: retention_policy_client_{insert,update,delete}
// _refused), and the data-lifecycle system exposes no admin write door yet, so
// this panel shows the rows and names where they change instead of offering a
// control that could not save.

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, ShieldCheck } from "lucide-react";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";
import { formatAbsoluteDate } from "@ai-matrx/kit/format";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { isJsonObject } from "@/types/json";
import { supabase } from "@/utils/supabase/client";
import { cn } from "@/lib/utils";
import { fetchMeetRetentionPolicies, type RetentionPolicyRow } from "../service";

/** The one retention sweep (scheduler.sch_task) — see data_lifecycle FEATURE.md. */
const RETENTION_SWEEP_TASK_ID = "a7c1e2d3-0000-4e5f-9a00-000000000431";

const TOKEN_LABEL: Record<string, string> = {
  meet_meeting: "Meetings",
  meet_recording: "Recording records",
  meet_transcript_segment: "Transcripts",
  meet_chat_message: "Meeting chat",
  meet_note: "Meeting notes",
  meet_participant: "Participants",
  meet_invitee: "Invitees",
};

function governs(row: RetentionPolicyRow): string {
  if (row.scope === "global") return "Everything with no rule of its own (platform floor)";
  if (row.entity_token === "file" && isJsonObject(row.custody_selector)) return "Recording files (the video bytes)";
  return TOKEN_LABEL[row.entity_token ?? ""] ?? row.entity_token ?? row.scope;
}

function rule(row: RetentionPolicyRow): string {
  if (!row.enabled) return "Switched off";
  if (row.legal_hold) return "Legal hold — kept";
  if (row.mode === "never") return "Keep forever";
  const clock = row.trigger_kind === "untouched" ? "untouched" : "after deletion";
  const verb = row.mode === "purge" ? "Delete" : "Archive";
  return `${verb} ${row.retention_days ?? "?"} days ${clock}`;
}

const columns: MatrxColumnDef<RetentionPolicyRow>[] = [
  { id: "governs", header: "Governs", accessorFn: governs, width: 260, frozen: true, cell: (row) => <span className="font-medium">{governs(row)}</span> },
  {
    id: "rule",
    header: "Rule",
    accessorFn: rule,
    width: 220,
    cell: (row) => <span className={cn(row.mode === "purge" && row.enabled && !row.legal_hold ? "text-amber-700 dark:text-amber-400" : "text-foreground")}>{rule(row)}</span>,
  },
  { id: "warn", header: "Warns", label: "Days of warning before", accessorFn: (row) => row.warn_days, filter: "number", align: "right", width: 70, cell: (row) => (row.warn_days === null ? "—" : `${row.warn_days}d`) },
  { id: "label", header: "Policy", accessorFn: (row) => row.label ?? "", width: 240, cell: (row) => <span className="truncate" title={row.description ?? row.label ?? undefined}>{row.label ?? "—"}</span> },
  { id: "basis", header: "Basis", accessorFn: (row) => row.basis ?? "", width: 280, cell: (row) => <span className="block truncate text-muted-foreground" title={row.basis ?? undefined}>{row.basis ?? "—"}</span> },
  { id: "set-by", header: "Set by", accessorFn: (row) => row.set_by, filter: "select", width: 70 },
  { id: "effective", header: "In effect from", accessorFn: (row) => row.effective_from, filter: "date", width: 150, cell: (row) => formatAbsoluteDate(row.effective_from, { dateStyle: "medium", timeStyle: "short" }) },
  { id: "review", header: "Review due", accessorFn: (row) => row.review_due ?? "", filter: "date", width: 110, cell: (row) => (row.review_due ? formatAbsoluteDate(row.review_due, { dateStyle: "medium" }) : "—") },
  { id: "id", header: "Policy id", accessorFn: (row) => row.id, width: 290, hidden: true },
];

type SweepState = { enabled: boolean; lastRunAt: string | null } | null;

export function MeetingsRetentionPanel() {
  const [rows, setRows] = useState<RetentionPolicyRow[] | null>(null);
  const [sweep, setSweep] = useState<SweepState | "unknown">(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetchMeetRetentionPolicies().then(
      (next) => live && setRows(next),
      (thrown: unknown) => live && setError(thrown instanceof Error ? thrown.message : String(thrown)),
    );
    void supabase
      .schema("scheduler")
      .from("sch_task")
      .select("enabled, last_run_at")
      .eq("id", RETENTION_SWEEP_TASK_ID)
      .maybeSingle()
      .then(({ data, error: readError }) => {
        if (!live) return;
        setSweep(readError || !data ? "unknown" : { enabled: data.enabled, lastRunAt: data.last_run_at });
      });
    return () => {
      live = false;
    };
  }, []);

  return (
    <div className="flex flex-col gap-2">
      <div className="rounded-md border border-border bg-card p-3 text-sm">
        <div className="flex items-center gap-2 font-medium">
          <ShieldCheck className="h-4 w-4 text-muted-foreground" />
          {sweep === null
            ? "Reading the retention sweep…"
            : sweep === "unknown"
              ? "The state of the retention sweep could not be read."
              : sweep.enabled
                ? `The retention sweep is on${sweep.lastRunAt ? ` — last ran ${formatAbsoluteDate(sweep.lastRunAt, { dateStyle: "medium", timeStyle: "short" })}` : ""}. The rules below are being enforced.`
                : "The retention sweep is switched off, so nothing below is deleted today — the rules take effect only when it is turned on."}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Meet keeps no retention settings of its own: these are rows in the platform data-lifecycle system, the same rules every other kind of data follows.
          They are read-only here — browsers are refused writes to them and the lifecycle system has no admin editing screen yet, so a change is made
          by the platform team through a database change (any rule that would delete data also waits out the settling period before it takes effect).{" "}
          <Link href={`/administration/automation/scheduling/tasks/${RETENTION_SWEEP_TASK_ID}`} className="inline-flex items-center gap-0.5 text-primary underline-offset-2 hover:underline">
            Open the sweep task <ArrowUpRight className="h-3 w-3" />
          </Link>
        </p>
      </div>
      {error ? (
        <div className="relative rounded-md border border-destructive/40 bg-destructive/5 p-3 pr-10 text-sm text-destructive">
          Retention rules could not be read: {error}
          <ErrorAlchemyMenu error={error} operation="Read Meet retention policies" />
        </div>
      ) : null}
      <MatrxDataTable
        tableId="admin-meetings-retention"
        data={rows ?? []}
        columns={columns}
        getRowId={(row) => row.id}
        isLoading={rows === null && error === null}
        density="condensed"
        hidePagination
        coverage={{ noun: "rule", answeredBy: "client", total: rows?.length }}
        toolbar={{ title: "Rules that govern meeting data" }}
      />
    </div>
  );
}
