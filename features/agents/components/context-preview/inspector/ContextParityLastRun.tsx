"use client";

/**
 * "Last parity: <date>, <n> defects" — the standing context-parity guard's answer, read from
 * server state (lane PARITY-NIGHTLY, 2026-09-25).
 *
 * The guard (aidream `context_parity_nightly`) runs two labeled checks — seat parity through the
 * real doors as the two test accounts, and raw copy parity over the context follow's own
 * read-only connection for every copied organization — and stamps its one-line answer on its
 * own scheduler task row (`scheduler.sch_task.metadata.last_parity`), whether the run came from
 * the nightly schedule or by hand. Each defect is a row in System errors (kind
 * `context_parity`); this line links there.
 *
 * Honest in every state: loading says so, an unreadable row says why, a guard that has never
 * run says that, and a schedule that is switched off says so with the one place to turn it on.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePageCaptureContribution } from "@/components/agent-copy/page-capture/usePageCapture";
import { ShieldCheck, ShieldAlert } from "lucide-react";

import { supabase } from "@/utils/supabase/client";
import { schedulerDb } from "@/utils/supabase/schedulerDb";

/** Seeded by matrx-frontend/migrations/campaign/paritynightly_*.sql. */
export const CONTEXT_PARITY_TASK_ID = "a7c1e2d3-0000-4e5f-9a00-000000000973";
export const CONTEXT_PARITY_ROWS_HREF = "/administration/utilities/system-errors?kind=context_parity&hours=720";
export const SYSTEM_JOBS_HREF = "/administration/automation/scheduling/system-jobs";

export interface LastParity {
  ran_at: string;
  trigger: string;
  defects: number;
  seat_defects: number | null;
  raw_defects: number | null;
  refused: number;
  complete: boolean;
  organizations: number;
  types: number;
}

type State =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "ready"; enabled: boolean; last: LastParity | null };

function readLast(metadata: unknown): LastParity | null {
  if (!metadata || typeof metadata !== "object") return null;
  const raw = (metadata as Record<string, unknown>).last_parity;
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.ran_at !== "string" || typeof r.defects !== "number") return null;
  return {
    ran_at: r.ran_at,
    trigger: typeof r.trigger === "string" ? r.trigger : "unknown",
    defects: r.defects,
    seat_defects: typeof r.seat_defects === "number" ? r.seat_defects : null,
    raw_defects: typeof r.raw_defects === "number" ? r.raw_defects : null,
    refused: typeof r.refused === "number" ? r.refused : 0,
    complete: r.complete !== false,
    organizations: typeof r.organizations === "number" ? r.organizations : 0,
    types: typeof r.types === "number" ? r.types : 0,
  };
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function ContextParityLine({ state }: { state: State }) {
  if (state.phase === "loading") {
    return <p className="text-sm text-muted-foreground">Reading the last context parity run…</p>;
  }
  if (state.phase === "error") {
    return (
      <p className="text-sm text-destructive">
        The last context parity run could not be read: {state.message}
      </p>
    );
  }
  const { last, enabled } = state;
  const schedule = enabled ? null : (
    <span className="text-muted-foreground">
      {" "}
      The nightly schedule is off —{" "}
      <Link href={SYSTEM_JOBS_HREF} className="underline underline-offset-2">
        turn it on in Scheduled system jobs
      </Link>
      .
    </span>
  );
  if (!last) {
    return (
      <p className="text-sm text-muted-foreground">
        Last parity: never run.{schedule}
      </p>
    );
  }
  const clean = last.defects === 0 && last.complete;
  const Icon = clean ? ShieldCheck : ShieldAlert;
  return (
    <p className="flex flex-wrap items-center gap-x-1.5 text-sm">
      <Icon
        className={clean ? "h-4 w-4 text-emerald-600 dark:text-emerald-400" : "h-4 w-4 text-amber-600 dark:text-amber-400"}
        aria-hidden
      />
      <span className="font-medium">
        Last parity: {formatWhen(last.ran_at)}, {last.defects} defect{last.defects === 1 ? "" : "s"}
      </span>
      <span className="text-muted-foreground">
        (seat {last.seat_defects ?? "—"}, raw copy {last.raw_defects ?? "—"} · {last.organizations} organizations,{" "}
        {last.types} scope types · {last.trigger})
        {last.refused > 0 ? ` · ${last.refused} part${last.refused === 1 ? "" : "s"} could not run` : ""}
      </span>
      <Link href={CONTEXT_PARITY_ROWS_HREF} className="underline underline-offset-2">
        See the rows
      </Link>
      {schedule}
    </p>
  );
}

export function ContextParityLastRun() {
  const [state, setState] = useState<State>({ phase: "loading" });
  useEffect(() => {
    let live = true;
    void (async () => {
      const { data, error } = await schedulerDb(supabase)
        .from("sch_task")
        .select("enabled, metadata")
        .eq("id", CONTEXT_PARITY_TASK_ID)
        .maybeSingle();
      if (!live) return;
      if (error) {
        setState({ phase: "error", message: error.message });
        return;
      }
      if (!data) {
        setState({ phase: "error", message: "the guard's scheduler task is not visible to this account" });
        return;
      }
      setState({ phase: "ready", enabled: Boolean(data.enabled), last: readLast(data.metadata) });
    })();
    return () => {
      live = false;
    };
  }, []);
  // The alchemy capture: the parity guard's last run, as this card shows it.
  usePageCaptureContribution(
    "context-parity-last-run",
    () => [{ id: "context-parity", title: "Context parity guard", role: "data", value: state }],
    JSON.stringify(state),
  );
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <ContextParityLine state={state} />
    </div>
  );
}
