"use client";

// features/education/onboard/components/KitBoard.tsx
//
// The study-kit live board — what the student watches from the second they hit
// "Build my study kit" until every artifact is real.
//
// THE RULE THIS FILE EXISTS TO ENFORCE: the system always says what it is doing
// right now. The kit flow already produced honest progress (byte-accurate
// uploads, per-page extraction, per-target agent phases, podcast stage labels)
// and threw ALL of it away — the board only mounted once ingest had finished, so
// a large PDF spent minutes behind a single unlabelled spinner and read as
// frozen. Every stage here is measured, timed, and named; nothing is a bare
// spinner, and nothing claims work that has not happened.

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  FileText,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectCurrentPhase } from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";
import { TARGET_PRESENTATION } from "@/features/education/convert/targetPresentation";
import type { Phase } from "@/types/python-generated/stream-events";
import type { useKitGeneration } from "../useKitGeneration";
import type { KitTargetState } from "../types";
import { KitAudioRunner } from "./KitAudioRunner";

/** Student-facing words for the agent's stream phase. Never raw enum text. */
const PHASE_COPY: Partial<Record<Phase, string>> = {
  connected: "Connected",
  processing: "Reading your material",
  generating: "Writing",
  using_tools: "Checking your source",
  searching: "Searching your source",
  scraping: "Reading the page",
  analyzing: "Working through it",
  synthesizing: "Putting it together",
  persisting: "Saving",
  retrying: "Retrying",
  executing: "Working",
  complete: "Finishing up",
};

/** A live seconds clock. One interval per mounted board, not per row. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}m ${String(s).padStart(2, "0")}s` : `${s}s`;
}

/** Motion that means "work is happening" when there is no honest percentage. */
function IndeterminateBar({ className }: { className?: string }) {
  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
      <div
        className={cn("h-full w-1/3 animate-[kit-slide_1.4s_ease-in-out_infinite] rounded-full", className)}
      />
      <style>{`@keyframes kit-slide{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}`}</style>
    </div>
  );
}

export function KitBoard({
  kit,
  onReset,
}: {
  kit: ReturnType<typeof useKitGeneration>;
  onReset: () => void;
}) {
  const done = kit.phase === "done";
  const now = useNow(kit.busy);
  const elapsed = kit.startedAt ? (done ? 0 : now - kit.startedAt) : 0;

  const finished = kit.targets.filter(
    (t) => t.status === "success" && !t.stillGenerating,
  ).length;
  const stillWorking = kit.targets.filter(
    (t) => t.status === "running" || (t.status === "success" && t.stillGenerating),
  ).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-foreground">
            {done && stillWorking === 0
              ? "Your study kit is ready"
              : "Building your study kit"}
          </h2>
          <p className="text-xs text-muted-foreground">
            {kit.phase === "ingesting"
              ? "Reading your material — nothing is stuck, you can watch each step below."
              : stillWorking > 0
                ? `${finished} ready · ${stillWorking} still being made — you can open the finished ones now.`
                : `${finished} ready`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {kit.busy && kit.startedAt && (
            <span className="tabular-nums text-xs text-muted-foreground">
              {formatElapsed(elapsed)}
            </span>
          )}
          {done && (
            <Button variant="outline" size="sm" onClick={onReset}>
              Make another
            </Button>
          )}
        </div>
      </div>

      <SourceStage kit={kit} now={now} />

      <div className="space-y-2">
        {kit.targets.map((t) => (
          <TargetRow key={t.targetKind} target={t} now={now} />
        ))}
      </div>
    </div>
  );
}

/** Stage 1 — turning whatever the student handed us into text we can use. */
function SourceStage({
  kit,
  now,
}: {
  kit: ReturnType<typeof useKitGeneration>;
  now: number;
}) {
  const ingesting = kit.phase === "ingesting";
  const p = kit.ingestProgress;
  const pct =
    p?.ratio !== undefined ? Math.round(Math.min(1, p.ratio) * 100) : null;
  const elapsed =
    kit.startedAt !== null
      ? (kit.ingestFinishedAt ?? now) - kit.startedAt
      : 0;

  return (
    <div
      className={cn(
        "rounded-xl border bg-card p-3",
        ingesting ? "border-primary/40" : "border-border",
      )}
    >
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
            ingesting ? "bg-primary/10" : "bg-muted",
          )}
        >
          {ingesting ? (
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          ) : (
            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">
            {ingesting
              ? (p?.message ?? "Getting your material…")
              : (kit.source?.title ?? "Your material")}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {ingesting ? (
              (p?.detail ?? "This can take a moment for big files — it's working.")
            ) : kit.source ? (
              <>
                {kit.source.meta.pages
                  ? `${kit.source.meta.pages} pages · `
                  : ""}
                {kit.source.meta.chars.toLocaleString()} characters read
                {kit.source.meta.truncated ? " · trimmed to fit" : ""}
              </>
            ) : (
              "Ready"
            )}
          </p>
        </div>
        <span className="shrink-0 tabular-nums text-xs text-muted-foreground">
          {pct !== null && ingesting ? `${pct}%` : formatElapsed(elapsed)}
        </span>
      </div>

      {ingesting && (
        <div className="mt-2.5">
          {pct !== null ? (
            <Progress value={pct} className="h-1" />
          ) : (
            <IndeterminateBar className="bg-primary" />
          )}
        </div>
      )}

      {!ingesting && kit.source && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <FileText className="h-3.5 w-3.5 shrink-0" />
          Everything below is written only from this material.
        </p>
      )}
    </div>
  );
}

/** Stage 2 — one row per artifact, in its own colour, saying what it is doing. */
function TargetRow({ target: t, now }: { target: KitTargetState; now: number }) {
  const look = TARGET_PRESENTATION[t.targetKind];
  const Icon = look.icon;
  const running = t.status === "running";
  const producing = t.status === "success" && t.stillGenerating === true;
  const elapsed = t.startedAt ? (t.finishedAt ?? now) - t.startedAt : null;

  const body = (
    <div
      className={cn(
        "rounded-xl border bg-card px-3 py-3 transition-colors",
        t.status === "error"
          ? "border-destructive/30 bg-destructive/5"
          : running || producing
            ? look.activeBorder
            : "border-border hover:bg-muted/50",
      )}
    >
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
            look.chip,
          )}
        >
          <Icon className={cn("h-4 w-4", look.fg)} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">
            {t.title || t.label}
          </p>
          {t.status === "error" ? (
            <p className="truncate text-xs text-destructive">{t.error}</p>
          ) : running ? (
            <RunningLine target={t} />
          ) : t.detail ? (
            <p className="truncate text-xs text-muted-foreground">{t.detail}</p>
          ) : (
            <p className="truncate text-xs text-muted-foreground">
              Waiting its turn
            </p>
          )}
        </div>
        {elapsed !== null && (running || producing) && (
          <span className="shrink-0 tabular-nums text-xs text-muted-foreground">
            {formatElapsed(elapsed)}
          </span>
        )}
        {t.status === "error" && (
          <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
        )}
        {t.status === "success" && !t.stillGenerating && (
          <ArrowRight className={cn("h-4 w-4 shrink-0", look.fg)} />
        )}
      </div>

      {running && (
        <div className="mt-2.5">
          <IndeterminateBar className={look.bar} />
        </div>
      )}

      {producing && t.artifactId && t.targetKind === "audio" && (
        <div className="mt-2.5">
          <KitAudioRunner artifactId={t.artifactId} accentBar={look.bar} />
        </div>
      )}
    </div>
  );

  if (t.status === "success" && t.href && !t.stillGenerating) {
    return (
      <Link href={t.href} className="block">
        {body}
      </Link>
    );
  }
  return body;
}

/** The honest present-tense line for a running generator: its verb + the live
 *  stream phase the agent is actually in (never a bare "Generating…"). */
function RunningLine({ target: t }: { target: KitTargetState }) {
  const look = TARGET_PRESENTATION[t.targetKind];
  const phase = useAppSelector(selectCurrentPhase(t.requestId ?? ""));
  const phaseCopy = phase ? PHASE_COPY[phase] : null;
  return (
    <p className="truncate text-xs text-muted-foreground">
      {look.runningVerb}
      {phaseCopy ? ` · ${phaseCopy}…` : "…"}
    </p>
  );
}
