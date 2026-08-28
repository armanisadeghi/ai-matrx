"use client";

/**
 * RunControlBar — the run's own controls, on the run page (census #34).
 *
 * The verbs were already built and typed against the generated OpenAPI paths
 * (`useWorkflowRunControls`: pause / resumePaused / cancel). Until this bar
 * nothing on the shipped run page called them, so a run that went sideways
 * could only be abandoned — the tab closed, the work left running on a server
 * nobody was watching.
 *
 * Two rules, both from `run-controls.ts`:
 *
 *  · **Disabled with its reason, never hidden.** A verb the current status
 *    forbids stays on screen, greyed, carrying the plain-language why. A
 *    control that vanishes teaches nothing.
 *  · **Stopping is confirmed.** Stop and Cancel now both end the run; a run is
 *    minutes of somebody's work and real money, so both ask first through the
 *    canonical `confirm({...})` — never a browser dialog.
 *
 * Stop vs Cancel now: the same endpoint, the two modes it takes. "Stop" is
 * `graceful` — let the step that is running finish, then stand down, so its
 * output is kept. "Cancel now" is `immediate` — drop everything. Naming them
 * for what they do to the reader's work is the point; `graceful`/`immediate`
 * is engine vocabulary and never reaches the screen.
 */

import { useState } from "react";
import { CirclePause, CirclePlay, Loader2, OctagonX, Square } from "lucide-react";

import { useAppSelector } from "@/lib/redux/hooks";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { cn } from "@/lib/utils";

import { useWorkflowRunControls } from "../../hooks/useWorkflowRunControls";
import { selectRunStatus } from "../../redux/workflow-runs.selectors";
import {
  isParked,
  runStateLabel,
  verbAvailability,
  type RunControlVerb,
} from "./run-controls";

function ControlButton({
  label,
  icon,
  verb,
  enabled,
  reason,
  busy,
  onClick,
  tone = "default",
}: {
  label: string;
  icon: React.ReactNode;
  verb: RunControlVerb;
  enabled: boolean;
  reason: string | null;
  busy: boolean;
  onClick: () => void;
  tone?: "default" | "destructive";
}) {
  return (
    <button
      type="button"
      data-run-verb={verb}
      data-run-verb-enabled={enabled ? "true" : "false"}
      disabled={!enabled || busy}
      title={reason ?? label}
      aria-label={reason ? `${label} — ${reason}` : label}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors",
        tone === "destructive"
          ? "border-destructive/40 text-destructive hover:bg-destructive/10"
          : "border-border text-foreground hover:bg-accent/60",
        (!enabled || busy) && "cursor-not-allowed opacity-45 hover:bg-transparent",
      )}
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : icon}
      {label}
    </button>
  );
}

export function RunControlBar({ runId }: { runId: string }) {
  const status = useAppSelector(selectRunStatus(runId));
  const { pause, resumePaused, cancel } = useWorkflowRunControls();
  const [busy, setBusy] = useState<RunControlVerb | null>(null);

  const run = async (verb: RunControlVerb, action: () => Promise<boolean>) => {
    setBusy(verb);
    try {
      await action();
    } finally {
      setBusy(null);
    }
  };

  const stopWith = async (
    verb: "stop" | "cancel",
    mode: "graceful" | "immediate",
  ) => {
    const ok = await confirm({
      title: mode === "graceful" ? "Stop this run?" : "Cancel this run now?",
      description:
        mode === "graceful"
          ? "It will finish the step it is on, then stand down. Everything already produced is kept."
          : "It stops immediately. The step it is on is dropped, and whatever that step was making is lost.",
      confirmLabel: mode === "graceful" ? "Stop it" : "Cancel now",
      variant: "destructive",
    });
    if (!ok) return;
    await run(verb, () => cancel(runId, mode));
  };

  const pauseState = verbAvailability("pause", status);
  const resumeState = verbAvailability("resume", status);
  const stopState = verbAvailability("stop", status);
  const cancelState = verbAvailability("cancel", status);

  return (
    <div
      data-run-controls={runId}
      data-run-status={status ?? "pending-report"}
      className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card/60 px-3 py-2"
    >
      <span
        className={cn(
          "mr-auto min-w-0 truncate text-xs font-medium",
          isParked(status) ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground",
        )}
      >
        {runStateLabel(status)}
      </span>

      <ControlButton
        label="Pause"
        verb="pause"
        icon={<CirclePause className="h-3.5 w-3.5" />}
        enabled={pauseState.enabled}
        reason={pauseState.reason}
        busy={busy === "pause"}
        onClick={() => void run("pause", () => pause(runId))}
      />
      <ControlButton
        label="Resume"
        verb="resume"
        icon={<CirclePlay className="h-3.5 w-3.5" />}
        enabled={resumeState.enabled}
        reason={resumeState.reason}
        busy={busy === "resume"}
        onClick={() => void run("resume", () => resumePaused(runId))}
      />
      <ControlButton
        label="Stop"
        verb="stop"
        tone="destructive"
        icon={<Square className="h-3.5 w-3.5" />}
        enabled={stopState.enabled}
        reason={stopState.reason}
        busy={busy === "stop"}
        onClick={() => void stopWith("stop", "graceful")}
      />
      <ControlButton
        label="Cancel now"
        verb="cancel"
        tone="destructive"
        icon={<OctagonX className="h-3.5 w-3.5" />}
        enabled={cancelState.enabled}
        reason={cancelState.reason}
        busy={busy === "cancel"}
        onClick={() => void stopWith("cancel", "immediate")}
      />
    </div>
  );
}

export default RunControlBar;
