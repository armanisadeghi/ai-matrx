"use client";

/**
 * StageStatusPills — visualizes the 6 stable stages of a RAG document
 * and provides a clickable action to (re-)run the stage that produces
 * each one.
 *
 *   [Cloud File] -> [Raw Text] -> [Clean Text] -> [Chunks] -> [Vectors] -> [In Stores]
 *                  Extract        Clean           Chunk        Embed
 *
 * Each pill shows:
 *   - Color: green (done), yellow (partial), gray (missing).
 *   - Counts: e.g. "586/586 pages" or "1843/1843".
 *   - On click: opens an action panel that runs the matching stage with
 *     live progress + heartbeats. Cloud File and In Stores have
 *     non-action click behaviors (open file detail / open data stores).
 */

import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Cloud,
  Database,
  FileText,
  Layers,
  Loader2,
  Play,
  Stars,
  Zap,
  X as XIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { RAG_VOCAB } from "@/features/rag/constants/vocabulary";
import { useStageAction } from "@/features/rag/hooks/useStageAction";
import { useStagesStatus } from "@/features/rag/hooks/useStagesStatus";
import type {
  StageName,
  StagePillName,
  StageStatus,
} from "@/features/rag/api/stages";

// ---------------------------------------------------------------------------
// Pill definitions (label + icon + which stage action drives it)
// ---------------------------------------------------------------------------

interface PillDef {
  pill: StagePillName;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  /** Action that takes this pill from missing -> done. null = no direct action. */
  action: StageName | null;
  actionLabel: string | null;
  /** Singular noun for the counter ("page" / "chunk" / etc.). */
  unit: string | null;
}

const PILLS: PillDef[] = [
  {
    pill: "cloud_file",
    label: "Cloud File",
    Icon: Cloud,
    action: null,
    actionLabel: null,
    unit: null,
  },
  {
    pill: "raw_text",
    label: "Raw Text",
    Icon: FileText,
    action: "extract",
    actionLabel: "Extract",
    unit: "page",
  },
  {
    pill: "clean_text",
    label: "Clean Text",
    Icon: Zap,
    action: "clean",
    actionLabel: "Clean",
    unit: "page",
  },
  {
    pill: "chunks",
    label: RAG_VOCAB.segmentsShort,
    Icon: Layers,
    action: "chunk",
    actionLabel: RAG_VOCAB.segmentShort,
    unit: RAG_VOCAB.segmentShort.toLowerCase(),
  },
  {
    pill: "vectors",
    label: "Vectors",
    Icon: Stars,
    action: "embed",
    actionLabel: "Embed",
    unit: "vector",
  },
  {
    pill: "stores",
    label: "In Stores",
    Icon: Database,
    action: null,
    actionLabel: null,
    unit: "store",
  },
];

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

export interface StageStatusPillsProps {
  processedDocumentId: string | null;
  /** Compact mode: smaller pills for the table row. */
  compact?: boolean;
  /** Called when any stage action completes successfully (so the parent
   *  can refresh other dependent state — counts, library list, etc.). */
  onMutated?: () => void;
  /** Optional — when provided, clicking a pill opens this full-screen
   *  runner instead of the small in-popover panel. The callback receives
   *  the StageName ("extract" | "clean" | "chunk" | "embed"). When omitted,
   *  the pills fall back to the inline popover with a Run button. */
  onRequestRun?: (stage: StageName) => void;
  /** Document title to render in the dialog header (when delegating). */
  documentName?: string;
}

export function StageStatusPills({
  processedDocumentId,
  compact = false,
  onMutated,
  onRequestRun,
  documentName,
}: StageStatusPillsProps) {
  const { status, loading, reload } = useStagesStatus(processedDocumentId);
  // Auto-refresh status whenever a stage action completes — the parent
  // can also trigger this via the onMutated callback.
  const handleMutated = () => {
    reload();
    onMutated?.();
  };

  const byPill = useMemo(() => {
    const m = new Map<StagePillName, StageStatus>();
    if (status) for (const s of status.stages) m.set(s.stage, s);
    return m;
  }, [status]);

  return (
    <div
      className={cn(
        "flex flex-wrap items-center",
        compact ? "gap-1" : "gap-1.5",
      )}
    >
      {PILLS.map((def) => (
        <StagePill
          key={def.pill}
          def={def}
          status={byPill.get(def.pill) ?? null}
          loading={loading}
          processedDocumentId={processedDocumentId}
          compact={compact}
          onMutated={handleMutated}
          onRequestRun={onRequestRun}
          documentName={documentName}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Individual pill — renders state + (optional) click-to-run popover
// ---------------------------------------------------------------------------

function StagePill({
  def,
  status,
  loading,
  processedDocumentId,
  compact,
  onMutated,
  onRequestRun,
  documentName: _documentName,
}: {
  def: PillDef;
  status: StageStatus | null;
  loading: boolean;
  processedDocumentId: string | null;
  compact: boolean;
  onMutated: () => void;
  onRequestRun?: (stage: StageName) => void;
  documentName?: string;
}) {
  const state = status?.state ?? "missing";
  const current = status?.current ?? 0;
  const total = status?.total ?? 0;

  const tone = stateTone(state);
  const Icon = def.Icon;

  const pillBody = (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-md border whitespace-nowrap select-none",
        compact ? "px-1.5 py-0.5 text-[11px]" : "px-2 py-1 text-xs",
        tone.cls,
        def.action ? "cursor-pointer hover:brightness-105" : "cursor-default",
      )}
      title={tooltipFor(def, state, current, total, status?.detail)}
    >
      <Icon className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
      <span className="font-medium">{def.label}</span>
      <span className="tabular-nums opacity-80">
        {summary(state, current, total)}
      </span>
    </div>
  );

  // Pills that don't have an action are display-only.
  if (!def.action) {
    return pillBody;
  }

  // Delegated mode — caller manages a single page-level dialog. One click
  // opens it. No popover, no per-row action runner.
  if (onRequestRun) {
    return (
      <button
        type="button"
        onClick={() => onRequestRun(def.action!)}
        className="appearance-none border-0 bg-transparent p-0 m-0"
      >
        {pillBody}
      </button>
    );
  }

  // Standalone mode — popover with an inline action runner.
  return (
    <Popover>
      <PopoverTrigger asChild>{pillBody}</PopoverTrigger>
      <PopoverContent side="bottom" align="start" className="w-[420px] p-0">
        <StageActionPanel
          def={def}
          status={status}
          processedDocumentId={processedDocumentId}
          onMutated={onMutated}
        />
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// Action panel inside the popover — runs the stage with live progress
// ---------------------------------------------------------------------------

function StageActionPanel({
  def,
  status,
  processedDocumentId,
  onMutated,
}: {
  def: PillDef;
  status: StageStatus | null;
  processedDocumentId: string | null;
  onMutated: () => void;
}) {
  const action = useStageAction(processedDocumentId, def.action!, {
    onComplete: onMutated,
  });
  const [closed, setClosed] = useState(false);
  // When the user runs once, leave the result visible until they click
  // anywhere again — handy for verifying the run succeeded.
  useEffect(() => {
    if (action.running) setClosed(false);
  }, [action.running]);

  const pct =
    action.progress?.total && action.progress.total > 0
      ? Math.min(
          100,
          Math.round((action.progress.current / action.progress.total) * 100),
        )
      : null;

  const elapsed = action.progress?.lastUpdate
    ? Math.max(0, Math.round((Date.now() - action.progress.lastUpdate) / 1000))
    : 0;

  return (
    <div className="space-y-3 p-3">
      <header className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold">{def.actionLabel}</div>
          <div className="text-xs text-muted-foreground">
            {actionDescription(def)}
          </div>
        </div>
        {action.running && (
          <Button size="sm" variant="ghost" onClick={action.cancel}>
            <XIcon className="h-3.5 w-3.5 mr-1" />
            Stop
          </Button>
        )}
      </header>

      {/* Current state line */}
      <div className="flex items-center gap-2 text-xs">
        <Badge variant="outline">
          {status
            ? `${status.current.toLocaleString()} / ${status.total.toLocaleString()} ${def.unit ?? ""}`
            : "—"}
        </Badge>
        <span className="text-muted-foreground">
          {status?.state === "done"
            ? "Already complete — re-running will refresh."
            : status?.state === "partial"
              ? "Partial — running will fill in the rest."
              : "Not yet run."}
        </span>
      </div>

      {/* Action button + progress */}
      {!action.running && !action.error && !action.result && (
        <Button
          size="sm"
          className="w-full"
          onClick={action.start}
          disabled={!processedDocumentId}
        >
          <Play className="h-3.5 w-3.5 mr-1" />
          Run {def.actionLabel}
        </Button>
      )}

      {action.running && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
            <span className="font-medium">
              {action.progress?.message ?? "Working…"}
            </span>
          </div>
          {pct !== null && <Progress value={pct} className="h-2" />}
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>
              {action.progress?.current.toLocaleString() ?? 0} /{" "}
              {action.progress?.total.toLocaleString() ?? 0}
            </span>
            <span>
              {pct !== null ? `${pct}%` : "—"}
              {elapsed > 0 ? ` · last update ${elapsed}s ago` : ""}
            </span>
          </div>
        </div>
      )}

      {action.error && !closed && (
        <div className="rounded-md border border-destructive/50 bg-destructive/5 p-2 text-xs text-destructive">
          <div className="font-medium">Action failed</div>
          <div className="break-words">{action.error}</div>
          <Button
            size="sm"
            variant="outline"
            className="mt-2"
            onClick={() => {
              action.reset();
              action.start();
            }}
          >
            Retry
          </Button>
        </div>
      )}

      {action.result && !action.running && (
        <div className="rounded-md border border-green-500/40 bg-green-500/5 p-2 text-xs">
          <div className="flex items-center gap-1 font-medium text-green-700 dark:text-green-400">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Done
          </div>
          <div className="text-muted-foreground mt-1">
            {summarizeResult(def, action.result)}
          </div>
          <Button
            size="sm"
            variant="outline"
            className="mt-2"
            onClick={() => action.reset()}
          >
            Run again
          </Button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cosmetics
// ---------------------------------------------------------------------------

function stateTone(state: StageStatus["state"]) {
  switch (state) {
    case "done":
      return {
        cls: "border-green-500/40 bg-green-500/10 text-green-800 dark:text-green-300",
      };
    case "partial":
      return {
        cls: "border-yellow-500/40 bg-yellow-500/10 text-yellow-800 dark:text-yellow-300",
      };
    case "missing":
    default:
      return {
        cls: "border-border bg-muted/40 text-muted-foreground",
      };
  }
}

function summary(state: string, current: number, total: number): string {
  if (state === "done" && total > 0) return `${current.toLocaleString()}`;
  if (total > 0)
    return `${current.toLocaleString()} / ${total.toLocaleString()}`;
  if (state === "missing") return "—";
  return "";
}

function tooltipFor(
  def: PillDef,
  state: string,
  current: number,
  total: number,
  detail: string | null | undefined,
): string {
  const head = `${def.label}: ${state}`;
  const counts =
    total > 0
      ? `\n${current.toLocaleString()} / ${total.toLocaleString()}${def.unit ? ` ${def.unit}${total === 1 ? "" : "s"}` : ""}`
      : "";
  const det = detail ? `\n${detail}` : "";
  return head + counts + det;
}

function actionDescription(def: PillDef): string {
  switch (def.action) {
    case "extract":
      return "Read raw text from the source PDF, page by page. Replaces existing pages.";
    case "clean":
      return "LLM cleanup + section classification per page. Replaces existing cleaned text.";
    case "chunk":
      return `Page-aware hierarchical ${RAG_VOCAB.segmentation.toLowerCase()}. Replaces existing ${RAG_VOCAB.segmentsShort.toLowerCase()} (embeddings will be cleared too — re-embed afterwards).`;
    case "embed":
      return `Embed any ${RAG_VOCAB.segmentsShort.toLowerCase()} missing a vector for the current model. Idempotent — only fills in what's missing.`;
    case "run_all":
      return `Run extract → clean → ${RAG_VOCAB.segmentStage} → embed in sequence.`;
    default:
      return "";
  }
}

function summarizeResult(def: PillDef, r: Record<string, unknown>): string {
  switch (def.action) {
    case "extract":
      return `Extracted ${num(r.pages_count)} pages, ${num(r.raw_chars)} chars (${num(r.ocr_pages)} via OCR).`;
    case "clean":
      return `Cleaned ${num(r.pages_cleaned)} pages, ${num(r.cleaned_chars)} chars.`;
    case "chunk":
      return `Wrote ${num(r.chunks_written)} ${RAG_VOCAB.segmentsShort.toLowerCase()} (${num(r.parents)} parents, ${num(r.children)} children).`;
    case "embed":
      return `Embedded ${num(r.chunks_embedded)} new vectors. ${num(r.chunks_already_embedded)} were already done.`;
    default:
      return "";
  }
}

function num(v: unknown): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return "0";
  return v.toLocaleString();
}
