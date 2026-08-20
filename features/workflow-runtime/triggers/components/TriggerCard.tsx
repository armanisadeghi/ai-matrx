"use client";

/**
 * TriggerCard — one way this workflow runs without you, and everything you
 * would want to do about it: read it in plain language, see when it goes next,
 * pause it, run it now, open what it produced, or remove it.
 *
 * The webhook secret is NEVER here. The server excludes it from every read, so
 * the card can only say that one is set — a card that offered to reveal it
 * would be promising something the platform deliberately cannot do.
 */

import { useState } from "react";
import {
  CalendarClock,
  ChevronDown,
  ChevronRight,
  Globe,
  Loader2,
  Play,
  Trash2,
} from "lucide-react";
import Link from "next/link";

import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/utils/cn";

import { describeRecurrence, fromCron } from "../recurrence";
import type { TriggerFire, WorkflowTrigger } from "../types";
import { triggerWebhookUrl } from "../useWorkflowTriggers";
import { CopyableValue } from "./CopyableValue";
import { formatInZone } from "./RecurrenceEditor";
import { TriggerFireHistory } from "./TriggerFireHistory";

export function TriggerCard({
  trigger,
  busy,
  onSetActive,
  onDelete,
  onFireNow,
  loadFires,
}: {
  trigger: WorkflowTrigger;
  busy: boolean;
  onSetActive: (isActive: boolean) => void;
  onDelete: () => void;
  onFireNow: () => void;
  loadFires: (triggerId: string) => Promise<TriggerFire[] | null>;
}) {
  const [open, setOpen] = useState(false);
  const isSchedule = trigger.kind === "cron";
  const plain = trigger.cronExpression
    ? describeRecurrence(fromCron(trigger.cronExpression))
    : null;

  return (
    <div
      className={cn(
        "rounded-xl border bg-card p-3",
        trigger.isActive ? "border-border" : "border-dashed border-border",
      )}
    >
      <div className="flex flex-wrap items-start gap-2">
        <span className="mt-0.5 text-muted-foreground">
          {isSchedule ? (
            <CalendarClock className="h-4 w-4" />
          ) : (
            <Globe className="h-4 w-4" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">
            {trigger.name}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {isSchedule
              ? `${plain ?? "A custom schedule"} · ${trigger.timezone}`
              : "Runs when something calls its address"}
          </p>
          {isSchedule && trigger.isActive && trigger.nextRunAt ? (
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Next: {formatInZone(trigger.nextRunAt, trigger.timezone)}
            </p>
          ) : null}
          {isSchedule && !trigger.isActive ? (
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Paused — it won&apos;t run until you turn it back on.
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : null}
          <Switch
            checked={trigger.isActive}
            disabled={busy}
            aria-label={trigger.isActive ? "Pause this" : "Turn this on"}
            onCheckedChange={(next) => onSetActive(next)}
          />
        </div>
      </div>

      {!isSchedule ? (
        <div className="mt-2.5 space-y-1.5">
          <span className="text-[11px] font-medium text-muted-foreground">
            Its address
          </span>
          <CopyableValue
            value={triggerWebhookUrl(trigger.id)}
            label="Web address"
          />
          <p className="text-[11px] text-muted-foreground">
            Send it a POST request with your password in the{" "}
            <code className="font-mono">X-Matrx-Trigger-Secret</code> header.
            The password was shown once when you created this — if it&apos;s
            lost, remove this and make a new one.
          </p>
        </div>
      ) : null}

      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-border pt-2">
        <span className="text-[11px] text-muted-foreground">
          {trigger.fireCount === 0
            ? "Hasn't run yet"
            : `Ran ${trigger.fireCount} ${trigger.fireCount === 1 ? "time" : "times"}`}
          {trigger.lastFiredAt
            ? ` · last ${formatInZone(trigger.lastFiredAt, trigger.timezone)}`
            : ""}
        </span>

        {/* THE DOOR LAW: the last run is a record with a permalink. */}
        {trigger.lastRunId ? (
          <Link
            href={`/workflows/runs/${trigger.lastRunId}`}
            className="text-[11px] font-medium text-primary hover:underline"
          >
            Open the last run
          </Link>
        ) : null}

        {!isSchedule ? (
          <button
            type="button"
            disabled={busy || !trigger.isActive}
            onClick={onFireNow}
            className="inline-flex min-h-7 items-center gap-1 rounded-md border border-border px-2 text-[11px] text-foreground disabled:opacity-50"
          >
            <Play className="h-3 w-3" />
            Try it now
          </button>
        ) : null}

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex min-h-7 items-center gap-1 rounded-md px-1.5 text-[11px] text-muted-foreground hover:text-foreground"
        >
          {open ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
          Recent runs
        </button>

        <button
          type="button"
          disabled={busy}
          onClick={() => {
            void confirm({
              title: `Remove "${trigger.name}"?`,
              description: isSchedule
                ? "This workflow will stop running on its own. Runs it already produced are kept."
                : "Its address stops working immediately, and the password can't be recovered. Runs it already produced are kept.",
              confirmLabel: "Remove it",
              variant: "destructive",
            }).then((ok) => {
              if (ok) onDelete();
            });
          }}
          className="ml-auto inline-flex min-h-7 items-center gap-1 rounded-md px-1.5 text-[11px] text-muted-foreground hover:text-destructive disabled:opacity-50"
        >
          <Trash2 className="h-3 w-3" />
          Remove
        </button>
      </div>

      {open ? (
        <div className="mt-2 border-t border-border pt-2">
          <TriggerFireHistory
            triggerId={trigger.id}
            timezone={trigger.timezone}
            lastRunId={trigger.lastRunId}
            load={loadFires}
          />
        </div>
      ) : null}
    </div>
  );
}
