// features/scheduling/components/detail/SuspensionCard.tsx
//
// The repeat guard's verdict on this schedule, from server state, with the
// fix beside it. Renders NOTHING when the row carries no suspension record,
// no suspension history and no recorded approval — an "all clear" strip is
// how the next alarm gets missed.
//
// THE DEFECT THIS EXISTS FOR (2026-09-11): aidream's repeat guard writes
// `sch_task.metadata.auto_suspended` (why, when, which run, and — when the
// task carries a human approval — that it is OVERRIDING that approval, in
// those words). Nothing on a screen rendered it, so an approved nightly sat
// switched off for seventeen days. This is the render aidream's FEATURE.md
// names as the frontend's half: reason + approval + the one action that
// restores it. Re-enabling is NOT a new approval
// (common-docs/policies/no-unapproved-schedules.md § "an approval may not be
// silently revoked"); the card says so and the server records the restore.
//
// The action here is the SAME control as the header's Enable — one handler,
// one confirm, rendered where the problem is named (no-dead-ends: ship the
// fix beside the complaint). It is never a second write path.

"use client";

import { useState } from "react";
import {
  AlertOctagon,
  ChevronDown,
  ChevronRight,
  History,
  Power,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CalloutBanner } from "@/components/official/CalloutBanner";
import { TextWithDoors } from "@/components/official/entity-ref/TextWithDoors";
import { humanizeRelative } from "../../utils/triggerHumanize";
import type { AgendaTask, AutoSuspendedBlock } from "../../types";

interface Props {
  task: AgendaTask;
  /**
   * The page's one enable control (the header's Enable/Pause handler). Absent
   * when the viewer may not flip this schedule — the card then states the
   * verdict without a dead button.
   */
  onRestore?: () => void;
  restoring?: boolean;
}

function formatWhen(iso: string | undefined): string {
  if (!iso) return "an unknown time";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.toISOString().slice(0, 16).replace("T", " ")} UTC (${humanizeRelative(iso)})`;
}

/** The recorded human approval of a system schedule, as one sentence. */
export function approvalSentence(task: AgendaTask): string | null {
  const m = task.metadata;
  const parts: string[] = [];
  if (m.approval) parts.push(m.approval);
  if (m.approved_by) {
    parts.push(
      `approved by ${m.approved_by}${m.approved_at ? ` on ${m.approved_at}` : ""}`,
    );
  }
  if (m.approved_interval && !m.approval?.includes(m.approved_interval)) {
    parts.push(`interval ${m.approved_interval}`);
  }
  return parts.length > 0 ? parts.join("; ") : null;
}

export function SuspensionCard({ task, onRestore, restoring }: Props) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const suspended = task.metadata.auto_suspended;
  const history = task.metadata.auto_suspended_history ?? [];
  const approval = approvalSentence(task);

  const isSuspendedNow = Boolean(suspended) && !task.enabled;
  if (!suspended && history.length === 0 && !approval) return null;

  return (
    <div className="space-y-3" data-surface-value="schedule_suspension">
      {suspended && (
        <CalloutBanner
          tone={isSuspendedNow ? "destructive" : "warning"}
          icon={AlertOctagon}
          title={
            isSuspendedNow
              ? suspended.overriding_approval
                ? "Switched off by the repeat guard — overriding a human approval"
                : "Switched off by the repeat guard"
              : "Re-enabled, but the guard's suspension record was never closed"
          }
          description={
            <div className="space-y-2">
              <p>
                {isSuspendedNow
                  ? "Nothing will run until a person turns it back on."
                  : "It is on and will fire, but the row still says the guard suspended it. Re-enabling from this page records the restore properly."}{" "}
                Suspended {formatWhen(suspended.at)}
                {typeof suspended.consecutive_failures === "number"
                  ? ` after ${suspended.consecutive_failures} consecutive failures`
                  : ""}
                {suspended.failure_signature
                  ? ` (signature ${suspended.failure_signature})`
                  : ""}
                .
              </p>
              {suspended.reason && (
                <p className="text-foreground" data-surface-value="suspension_reason">
                  <TextWithDoors text={suspended.reason} defaultToken="sch_task" />
                </p>
              )}
              {suspended.run_id && (
                <p>
                  The run that tipped it:{" "}
                  <a
                    href={`#run-${suspended.run_id}`}
                    className="font-mono text-xs underline underline-offset-2"
                  >
                    {suspended.run_id.slice(0, 8)}…
                  </a>{" "}
                  in the history below.
                </p>
              )}
              {suspended.override_notice && (
                <p className="font-medium">{suspended.override_notice}</p>
              )}
            </div>
          }
          actions={
            onRestore ? (
              <Button
                size="sm"
                variant={isSuspendedNow ? "destructive" : "outline"}
                onClick={onRestore}
                disabled={restoring}
              >
                <Power className="mr-1.5 h-3.5 w-3.5" />
                {isSuspendedNow
                  ? approval
                    ? "Re-enable and restore its approval"
                    : "Re-enable"
                  : "Close the suspension record"}
              </Button>
            ) : undefined
          }
        />
      )}

      {approval && (
        <CalloutBanner
          tone="info"
          icon={ShieldCheck}
          title="Approved schedule"
          description={
            <p data-surface-value="schedule_approval">
              {approval}
              {isSuspendedNow && (
                <>
                  {" "}
                  Re-enabling restores this approval — it is not a new schedule and
                  needs no new sign-off.
                </>
              )}
            </p>
          }
        />
      )}

      {history.length > 0 && (
        <div className="rounded-md border border-border bg-card text-sm">
          <button
            type="button"
            onClick={() => setHistoryOpen((o) => !o)}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-muted-foreground hover:text-foreground"
            aria-expanded={historyOpen}
          >
            {historyOpen ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
            <History className="h-3.5 w-3.5" />
            <span>
              Suspended {history.length} {history.length === 1 ? "time" : "times"} before
            </span>
          </button>
          {historyOpen && (
            <ol className="divide-y divide-border border-t border-border">
              {history.map((entry, i) => (
                <HistoryEntry key={`${entry.at ?? "?"}-${i}`} entry={entry} />
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}

function HistoryEntry({ entry }: { entry: AutoSuspendedBlock }) {
  return (
    <li className="space-y-1 px-3 py-2">
      <p>
        <span className="font-medium">Suspended {formatWhen(entry.at)}</span>
        {typeof entry.consecutive_failures === "number"
          ? ` after ${entry.consecutive_failures} failures`
          : ""}
        {entry.overriding_approval ? " — overriding a human approval" : ""}
      </p>
      {entry.reason && (
        <p className="text-muted-foreground">
          <TextWithDoors text={entry.reason} defaultToken="sch_task" />
        </p>
      )}
      {entry.restored ? (
        <p className="text-success">
          Restored {formatWhen(entry.restored.at)}
          {entry.restored.by ? ` by ${entry.restored.by}` : ""}
          {entry.restored.restored_approval
            ? ` — restoring: ${entry.restored.restored_approval}`
            : ""}
        </p>
      ) : (
        <p className="text-muted-foreground">
          No restore was recorded for this one — it was superseded by a later
          suspension, or it was put back outside this page.
        </p>
      )}
    </li>
  );
}
