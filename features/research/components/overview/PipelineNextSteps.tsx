"use client";

import Link from "next/link";
import {
  ArrowRight,
  Loader2,
  Pencil,
  Play,
  RefreshCw,
  ScrollText,
  FileSpreadsheet,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useTopicContext } from "../../context/ResearchContext";
import {
  deriveReadiness,
  hasRunnableWork,
  outstandingStages,
} from "../../readiness";

/**
 * NEXT STEPS — every outstanding decision, stated out loud.
 *
 * The pipeline used to make its most consequential choices invisibly: it
 * skipped a keyword that exceeded a quota, declined to refresh a topic report
 * that no longer reflected all the material, and silently left an assembled
 * document behind its own source report. Nothing told the user, and nothing
 * offered the fix.
 *
 * This card is the answer. It states what is outstanding, what each action
 * will cost in plain language, and — critically — what the run will NOT do, so
 * "Run pipeline" is never mistaken for "and the report refreshes too". It
 * renders nothing at all when the topic is genuinely caught up.
 */
export function PipelineNextSteps({
  onRunAll,
  onUpdateReport,
  onRebuildReport,
  isBusy,
}: {
  onRunAll: () => void | Promise<void>;
  onUpdateReport: () => void | Promise<void>;
  onRebuildReport: () => void | Promise<void>;
  isBusy: boolean;
}) {
  const { topicId, progress } = useTopicContext();
  const readiness = deriveReadiness(progress);

  const runnable = hasRunnableWork(readiness);
  const reportStale = readiness.report.readiness === "stale";
  const documentStale = readiness.document.readiness === "stale";
  if (!runnable && !reportStale && !documentStale) return null;

  const base = `/research/topics/${topicId}`;
  const pending = outstandingStages(readiness).filter(
    (i) => i.stage !== "report" && i.stage !== "document",
  );

  return (
    <section
      className="rounded-2xl border border-amber-500/35 bg-amber-500/[0.04] p-3 space-y-2.5"
      aria-label="Outstanding pipeline work"
    >
      <div className="flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
        <h2 className="text-[10px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">
          Next steps
        </h2>
      </div>

      {/* ── Outstanding pipeline work ─────────────────────────────────── */}
      {runnable && (
        <StepRow
          icon={Play}
          title="Finish the research"
          disabled={isBusy}
          actionLabel="Run pending work"
          onAction={onRunAll}
          busy={isBusy}
        >
          <ul className="space-y-0.5">
            {pending.map((i) => (
              <li key={i.stage} className="capitalize">
                <span className="text-foreground/80">{i.stage}</span>
                <span className="text-muted-foreground"> — {i.reason}</span>
              </li>
            ))}
          </ul>
          {/* The single most important sentence on this surface: the run's own
              gates mean it will NOT touch the report or the document. Saying so
              here is what turns two silent no-ops into a user decision. */}
          <p className="mt-1 text-muted-foreground/85">
            Reuses everything already captured — pages you have read are not
            fetched again and existing analyses are not re-run. It will{" "}
            <strong className="font-medium text-foreground/80">not</strong>{" "}
            rewrite your topic report or document; you will be asked about those
            once it finishes.
          </p>
        </StepRow>
      )}

      {/* ── Topic report older than its inputs ────────────────────────── */}
      {reportStale && (
        <StepRow
          icon={ScrollText}
          title="Your topic report is out of date"
          disabled={isBusy}
          secondary={{
            label: "Rebuild",
            icon: RefreshCw,
            onAction: onRebuildReport,
          }}
          actionLabel="Update"
          actionIcon={Pencil}
          onAction={onUpdateReport}
          busy={isBusy}
        >
          <p>
            It was written before the newest keyword synthesis, so it does not
            reflect all of your research.{" "}
            <strong className="font-medium text-foreground/80">Update</strong>{" "}
            folds the new material into the existing report;{" "}
            <strong className="font-medium text-foreground/80">Rebuild</strong>{" "}
            rewrites it from scratch from every included source.
          </p>
          <p className="mt-1 text-muted-foreground/85">
            Either way your current report is kept — it becomes a previous
            version you can read and restore from{" "}
            <Link
              href={`${base}/synthesis`}
              className="underline underline-offset-2 hover:text-foreground"
            >
              Synthesis
            </Link>
            .
          </p>
        </StepRow>
      )}

      {/* ── Document older than the report it was built from ──────────── */}
      {documentStale && (
        <StepRow
          icon={FileSpreadsheet}
          title="Your document is older than the report"
          disabled={isBusy}
          actionLabel="Open document"
          actionIcon={ArrowRight}
          href={`${base}/document`}
          busy={false}
        >
          <p>
            The assembled document was built from an earlier topic report.
            Regenerating costs a full document-assembly call, so it is your
            call — open the document to review it and regenerate when ready.
          </p>
        </StepRow>
      )}
    </section>
  );
}

/** One outstanding item: what it is, why, and the action that resolves it. */
function StepRow({
  icon: Icon,
  title,
  children,
  actionLabel,
  actionIcon: ActionIcon = Play,
  onAction,
  href,
  secondary,
  disabled,
  busy,
}: {
  icon: typeof Play;
  title: string;
  children: React.ReactNode;
  actionLabel: string;
  actionIcon?: typeof Play;
  onAction?: () => void | Promise<void>;
  href?: string;
  secondary?: {
    label: string;
    icon: typeof Play;
    onAction: () => void | Promise<void>;
  };
  disabled?: boolean;
  busy?: boolean;
}) {
  const actionClass = cn(
    "inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[11px] font-medium shrink-0 transition-all",
    "bg-primary text-primary-foreground hover:bg-primary/90",
    "disabled:opacity-40 disabled:pointer-events-none",
  );

  return (
    <div className="rounded-xl border border-border/50 bg-card/60 p-2.5">
      <div className="flex items-start gap-2">
        <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-amber-500/12 text-amber-600 dark:text-amber-400">
          <Icon className="h-3 w-3" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-foreground">{title}</p>
          <div className="mt-1 text-[11px] leading-snug text-muted-foreground">
            {children}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {secondary && (
            <button
              type="button"
              onClick={() => void secondary.onAction()}
              disabled={disabled}
              className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full matrx-glass-card text-[11px] font-medium text-foreground/80 hover:text-foreground disabled:opacity-40 disabled:pointer-events-none transition-colors"
            >
              <secondary.icon className="h-3 w-3" />
              {secondary.label}
            </button>
          )}
          {href ? (
            <Link href={href} className={actionClass}>
              <ActionIcon className="h-3 w-3" />
              {actionLabel}
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => void onAction?.()}
              disabled={disabled}
              className={actionClass}
            >
              {busy ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <ActionIcon className="h-3 w-3" />
              )}
              {actionLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
