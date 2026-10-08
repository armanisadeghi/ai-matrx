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
  Package,
} from "lucide-react";
import { kitHref } from "@/features/education/kits/kitService";
import { educationEntityStudyHref } from "@/features/education/data/entityRoutes";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectCurrentPhase } from "@ai-matrx/chat/agents/redux/execution-system/active-requests/active-requests.selectors";
import { TARGET_PRESENTATION } from "@/features/education/convert/targetPresentation";
import type { Phase } from "@ai-matrx/agents/generated/stream-events";
import type { useKitGeneration } from "../useKitGeneration";
import type { KitTargetState } from "../types";
import { KitAudioRunner } from "./KitAudioRunner";
import { formatElapsed } from "./elapsed";
import { ErrorNotice } from "@/components/errors/ErrorNotice";
import { describeFailure } from "@/lib/failure/transport";
import { Input } from "@ai-matrx/design-system";

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

/** Motion that means "work is happening" when there is no honest percentage. */
function IndeterminateBar({ className }: { className?: string }) {
  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
      <div
        className={cn(
          "h-full w-1/3 animate-[kit-slide_1.4s_ease-in-out_infinite] rounded-full",
          className,
        )}
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

  const finished = kit.targets.filter(
    (t) => t.status === "success" && !t.stillGenerating,
  ).length;
  const stillWorking = kit.targets.filter(
    (t) =>
      t.status === "running" || (t.status === "success" && t.stillGenerating),
  ).length;
  const failed = kit.targets.filter((t) => t.status === "error").length;
  const studyNotes = kit.targets.find(
    (target) => target.targetKind === "notes" && target.status === "success" && target.artifactId && !target.stillGenerating,
  );
  const studyNotesHref = studyNotes?.artifactId
    ? educationEntityStudyHref("note", studyNotes.artifactId) ?? studyNotes.href
    : null;

  // Keep ticking while ANY target is still producing — the fan-out can be
  // "done" while a streamed target (audio) is minutes from finishing, and a
  // frozen clock beside live work reads as a hang.
  const now = useNow(kit.busy || stillWorking > 0);
  const elapsed = kit.startedAt ? (done ? 0 : now - kit.startedAt) : 0;

  // Say the TRUE state, measured — never a promise about time. "This takes a
  // minute or two" sat beside a 14-minute build (2026-10-03). The line counts
  // what is ready and the sections done across every output; the clock beside
  // it says how long it has been.
  const headline = kitHeadline(kit.phase, kit.targets, { finished, stillWorking, failed });
  const kitId = kit.source?.ref?.kitId;
  const fileId = kit.source?.ref?.fileId;
  const openKitHref = kitId
    ? kitHref("scope", kitId)
    : done && finished > 0 && fileId
      ? kitHref("file", fileId)
      : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          {kit.kitTitle ? (
            <KitTitleField
              title={kit.kitTitle.title}
              onRename={(t) => kit.renameTitle(t)}
            />
          ) : (
            <h2 className="text-lg font-semibold text-foreground">
              {kit.continued ? "Continuing your study kit" : "Building your study kit"}
            </h2>
          )}
          <p className="text-xs tabular-nums text-muted-foreground">{headline}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
          {kit.busy && kit.startedAt && (
            <span className="tabular-nums text-xs text-muted-foreground">
              {formatElapsed(elapsed)}
            </span>
          )}
          {studyNotesHref && (
            <Button asChild variant="outline">
              <Link href={studyNotesHref}>
                <FileText className="h-4 w-4" />
                Read study guide
              </Link>
            </Button>
          )}
          {/* THE KIT'S OWN DOOR. Without this the kit dies with the tab: the
              artifacts persist but the THING the learner made — one subject,
              everything for it — was reachable from nowhere afterwards. */}
          {/* The door opens the moment the kit exists (2026-10-08) — never
              only at the end of a multi-minute build. While it builds, the
              kit opens in a new tab: this tab holds the run (useKitGeneration
              is tab-bound), so leaving it would stop the merge and save. */}
          {openKitHref && (
            <Button variant={done && finished > 0 ? "primary" : "outline"} asChild>
              <Link
                href={openKitHref}
                {...(done ? {} : { target: "_blank", rel: "noopener" })}
              >
                <Package className="h-4 w-4" />
                Open your kit
              </Link>
            </Button>
          )}
          {done && (
            <Button variant="outline" onClick={onReset}>
              Make another
            </Button>
          )}
        </div>
      </div>

      {kit.sourcesNotFiled.length > 0 && (
        <ErrorNotice
          size="inline"
          title="Sources not added to the kit"
          message={`${kit.sourcesNotFiled.join(", ")} — add them from the kit page.`}
          error={kit.sourcesNotFiled.join(", ")}
          operation="Add sources to a study kit"
        />
      )}

      <SourceStage kit={kit} now={now} />

      <div className="space-y-2">
        {kit.targets.map((t) => (
          <TargetRow
            key={t.targetKind}
            target={t}
            now={now}
            onReady={() => kit.markTargetReady(t.targetKind)}
          />
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
    kit.startedAt !== null ? (kit.ingestFinishedAt ?? now) - kit.startedAt : 0;

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
              (p?.detail ?? null)
            ) : kit.source ? (
              <>
                {kit.source.meta.sourceCount > 1
                  ? `${kit.source.meta.sourceCount} sources · `
                  : ""}
                {kit.source.meta.pages
                  ? `${kit.source.meta.pages} pages · `
                  : ""}
                {kit.source.meta.chars.toLocaleString()} characters read
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

      {/* Every stand-in announces itself: a Source left out, a raw fallback. */}
      {!ingesting &&
        kit.source?.meta.notes.map((note) => (
          <p
            key={note}
            className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground"
          >
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{note}</span>
          </p>
        ))}

      {/* A document we could not read all of is a WARNING, not a footnote. The
          student is deciding whether to trust this kit as complete; "trimmed to
          fit" appended to a character count is not enough to make that call. */}
      {!ingesting && kit.source?.meta.truncated && (
        <p className="mt-2 flex items-start gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-xs text-amber-700 dark:text-amber-400">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            This kit covers only the first{" "}
            {kit.source.meta.chars.toLocaleString()} characters. Put the rest in
            a second kit.
          </span>
        </p>
      )}
    </div>
  );
}

/** Stage 2 — one row per artifact, in its own colour, saying what it is doing. */
function TargetRow({
  target: t,
  now,
  onReady,
}: {
  target: KitTargetState;
  now: number;
  onReady: () => void;
}) {
  const look = TARGET_PRESENTATION[t.targetKind];
  const Icon = look.icon;
  const running = t.status === "running";
  const producing = t.status === "success" && t.stillGenerating === true;
  // A "successful" streamed target (audio) is still WORKING, so its clock must
  // keep running — freezing it at the generator's return time made a live run
  // look finished and stuck at the same moment.
  const elapsed = t.startedAt
    ? (producing ? now : (t.finishedAt ?? now)) - t.startedAt
    : null;

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
            <ErrorNotice
              size="inline"
              message={
                describeFailure(t.errorCause ?? t.error, {
                  action: `make the ${t.label.toLowerCase()}`,
                  fallback: t.error,
                }).sentence
              }
              error={t.errorCause ?? t.error}
              operation={`Make ${t.label}`}
              className="text-xs"
            />
          ) : running ? (
            <RunningLine target={t} />
          ) : producing ? (
            // The live runner below is the truth for a streamed target; the
            // generator's parting "Starting…" line would contradict it.
            <p className="truncate text-xs text-muted-foreground">
              {look.runningVerb}…
            </p>
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
          {t.coverage && t.coverage.total > 1 ? (
            // Real, measured progress: sections settled out of sections planned.
            // An indeterminate bar for a run we can measure is a lie of omission.
            <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn("h-full rounded-full transition-all", look.bar)}
                style={{
                  width: `${Math.max(
                    3,
                    Math.round((t.coverage.done / t.coverage.total) * 100),
                  )}%`,
                }}
              />
            </div>
          ) : (
            <IndeterminateBar className={look.bar} />
          )}
        </div>
      )}

      {producing && t.artifactId && t.targetKind === "audio" && (
        <div className="mt-2.5">
          <KitAudioRunner
            artifactId={t.artifactId}
            accentBar={look.bar}
            onReady={onReady}
          />
        </div>
      )}
    </div>
  );

  if (t.status === "success" && t.href && !t.stillGenerating) {
    const href = t.targetKind === "notes" && t.artifactId
      ? educationEntityStudyHref("note", t.artifactId) ?? t.href
      : t.href;
    return (
      <Link href={href} className="block">
        {body}
      </Link>
    );
  }
  return body;
}

/** Sections done and planned across every output still measuring sections. */
export function kitSectionTotals(targets: readonly KitTargetState[]): { done: number; total: number } {
  let done = 0;
  let total = 0;
  for (const t of targets) {
    if (!t.coverage || t.coverage.total <= 1) continue;
    total += t.coverage.total;
    done += t.status === "running" ? t.coverage.done : t.coverage.total;
  }
  return { done, total };
}

/** The board's one status line — counts only, never a time promise. */
export function kitHeadline(
  phase: string,
  targets: readonly KitTargetState[],
  counts: { finished: number; stillWorking: number; failed: number },
): string {
  if (phase === "ingesting") return "Reading your material";
  const { finished, stillWorking, failed } = counts;
  const parts: string[] = [`${finished} of ${targets.length} ready`];
  if (stillWorking > 0) {
    const sections = kitSectionTotals(targets);
    if (sections.total > 0) parts.push(`${sections.done} of ${sections.total} sections`);
  }
  if (failed > 0) parts.push(`${failed} failed`);
  return parts.join(" · ");
}

/** The kit's name — derived from the material, and the person's to change. */
function KitTitleField({
  title,
  onRename,
}: {
  title: string;
  onRename: (title: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState(title);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState<unknown>(null);
  const [seen, setSeen] = useState(title);
  if (seen !== title) {
    setSeen(title);
    setDraft(title);
  }
  const commit = async () => {
    const next = draft.trim();
    if (!next || next === title) {
      setDraft(title);
      return;
    }
    setSaving(true);
    setFailed(null);
    try {
      await onRename(next);
    } catch (e) {
      setFailed(e);
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="min-w-0">
      <Input
        aria-label="Kit name"
        value={draft}
        disabled={saving}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") setDraft(title);
        }}
        className="h-9 border-transparent bg-transparent px-1 text-base font-semibold text-foreground shadow-none hover:border-border focus-visible:border-border sm:text-lg"
      />
      {failed ? (
        <ErrorNotice
          size="inline"
          message={describeFailure(failed, { action: "rename the kit" }).sentence}
          error={failed}
          operation="Rename a study kit"
          className="text-xs"
        />
      ) : null}
    </div>
  );
}

/** The honest present-tense line for a running generator.
 *
 *  COVERAGE WINS. A segmented generation (`convert/coverage.ts`) knows exactly
 *  which part of the student's material it is on and how much it has produced,
 *  and that is a far better answer to "what is happening" than a stream phase.
 *  The phase line stays for single-pass runs, which have no sections to report. */
function RunningLine({ target: t }: { target: KitTargetState }) {
  const look = TARGET_PRESENTATION[t.targetKind];
  const phase = useAppSelector(selectCurrentPhase(t.requestId ?? ""));
  const phaseCopy = phase ? PHASE_COPY[phase] : null;
  const cov = t.coverage;
  if (cov && cov.total > 1) {
    return (
      <p className="truncate text-xs tabular-nums text-muted-foreground">
        {cov.done} of {cov.total} sections
        {cov.items > 0 ? ` · ${cov.items} so far` : ""}
        {cov.label ? ` · ${cov.label}` : ""}
      </p>
    );
  }
  return (
    <p className="truncate text-xs text-muted-foreground">
      {look.runningVerb}
      {phaseCopy ? ` · ${phaseCopy}…` : "…"}
    </p>
  );
}
