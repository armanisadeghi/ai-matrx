"use client";

/**
 * KnowledgeAssetPanel — the Knowledge Asset Builder surface.
 *
 * Runs the six premium "derivation" operations over an extracted document and
 * shows them with significantly more detail than a terminal: a live
 * representation rollup (one animated KPI tile per representation, counts
 * climbing as work lands), per-card build / rebuild / cancel controls, and a
 * rich live-activity strip per running op (label, {current}/{total} unit,
 * latest message, animated progress, elapsed, cancel).
 *
 * Mounted as a drawer / tab everywhere PDFs live (all consume only {id, name,
 * totalPages?}):
 *   - LibraryPreviewPage — "Knowledge Assets" drawer (also lights up the
 *     /files Knowledge tab, which embeds LibraryPreviewPage)
 *   - PdfStudioShell — toolbar-opened drawer (doc stays visible behind it)
 *   - LibraryDocDetailSheet — the "Knowledge Asset" tab (wide sheet)
 *
 * Reality: on open it fetches /rag/library/{id}/estimate so each card shows how
 * many runs + the cost BEFORE the user spends. Results: each built card expands
 * to the actual chunks (DerivativeChunkList) with page-number provenance.
 *
 * Backend contract: features/rag/api/derivations.ts. State: useKnowledgeAssetRunner.
 */

import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import {
  Table,
  Image as ImageIcon,
  Layers,
  FileText,
  MessagesSquare,
  ShieldCheck,
  FileStack,
  Sparkles,
  RefreshCw,
  Play,
  X as XIcon,
  Loader2,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { cn } from "@/lib/utils";
import { AnimatedKpiCard, type KpiTone } from "./AnimatedKpiCard";
import { DerivativeChunkList } from "./ChunkList";
import {
  DERIVE_KINDS,
  fetchEstimate,
  type DeriveKind,
  type DerivationRollup,
  type DerivationsEstimate,
  type DeriveEstimate,
} from "@/features/rag/api/derivations";
import {
  useKnowledgeAssetRunner,
  type OpState,
} from "@/features/rag/hooks/useKnowledgeAssetRunner";
import { ProcessingUnitsBadge } from "@/components/processing-units/ProcessingUnitsBadge";
import {
  costToUnits,
  formatUnits,
  sumCostToUnits,
} from "@/lib/processing-units/units";

// ---------------------------------------------------------------------------
// Per-kind presentation metadata
// ---------------------------------------------------------------------------

interface KindMeta {
  label: string;
  /** Short noun for the rollup tile (figures, rows, …). */
  shortLabel: string;
  icon: LucideIcon;
  /** Unit for the "{n}/{total} unit" live readout. */
  unit: string;
  tone: KpiTone;
  /** One-line description shown on the card. */
  blurb: string;
}

export const KIND_META: Record<DeriveKind, KindMeta> = {
  page_verification: {
    label: "Page verification",
    shortLabel: "Verified pages",
    icon: ShieldCheck,
    unit: "pages",
    tone: "info",
    blurb: "Quality-check every page before deriving from it.",
  },
  table_row: {
    label: "Table rows",
    shortLabel: "Table rows",
    icon: Table,
    unit: "rows",
    tone: "primary",
    blurb: "Extract structured tables into row-level retrievable units.",
  },
  multigranularity: {
    label: "Multi-granularity",
    shortLabel: "Coarse + fine",
    icon: Layers,
    unit: "granularities",
    tone: "primary",
    blurb: "Coarse + fine segment views for precision and recall.",
  },
  page_image_caption: {
    label: "Figure captions",
    shortLabel: "Figure captions",
    icon: ImageIcon,
    unit: "figures",
    tone: "info",
    blurb: "Vision-caption every figure so images become searchable.",
  },
  section_summary: {
    label: "Section summaries",
    shortLabel: "Summaries",
    icon: FileText,
    unit: "sections",
    tone: "success",
    blurb: "Summarize each section for high-level retrieval.",
  },
  synthetic_qa: {
    label: "Synthetic Q&A",
    shortLabel: "Q&A pairs",
    icon: MessagesSquare,
    unit: "Q&A pairs",
    tone: "warning",
    blurb: "Generate question/answer pairs that match how users ask.",
  },
};

/** "cleaned base" — read-only representation that the derive kinds build from.
 *  It's the parent extract, NOT a derivation kind, so it has no Build button. */
const BASE_KIND = "initial_extract";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface KnowledgeAssetDoc {
  id: string;
  name: string;
  totalPages?: number | null;
}

export function KnowledgeAssetPanel({ doc }: { doc: KnowledgeAssetDoc }) {
  const runner = useKnowledgeAssetRunner(doc.id);
  const {
    derivations,
    operations,
    loading,
    loadError,
    anyRunning,
    buildingAll,
    run,
    runAll,
    cancel,
  } = runner;

  // Reality estimate — how many runs + what it costs, scanned live from the
  // doc on open (a few seconds: it does a PDF scan for tables/figures).
  const estimate = useDerivationsEstimate(doc.id);

  // Map rollup rows by kind for quick lookup of live chunk counts.
  const countByKind = useMemo(() => {
    const map = new Map<string, DerivationRollup>();
    for (const d of derivations) map.set(d.derivation_kind, d);
    return map;
  }, [derivations]);

  // Live activity = ops currently running (most-recent first by startedAt).
  const liveOps = useMemo(
    () =>
      DERIVE_KINDS.map((k) => operations[k]).filter(
        (op) => op.status === "running",
      ),
    [operations],
  );

  const builtCount = derivations.filter((d) =>
    (DERIVE_KINDS as readonly string[]).includes(d.derivation_kind),
  ).length;

  // Total Processing Units to build everything — the pre-flight cost shown
  // before "Build all" so nothing expensive is ever triggered blind.
  const totalBuildUnits = useMemo(() => {
    const est = estimate.data?.estimates;
    if (!est) return null;
    return sumCostToUnits(DERIVE_KINDS.map((k) => est[k]?.cost_usd));
  }, [estimate.data]);

  const handleRunAll = async () => {
    const costNote =
      totalBuildUnits && totalBuildUnits > 0
        ? ` Estimated cost: about ${formatUnits(totalBuildUnits)}.`
        : "";
    const ok = await confirm({
      title: "Build all knowledge assets?",
      description: `Runs page verification, tables, multi-granularity, figure captions, section summaries, and synthetic Q&A in sequence.${costNote} Each is idempotent — existing output is replaced.`,
      confirmLabel: "Build all",
    });
    if (ok) void runAll();
  };

  return (
    <div className="flex flex-col gap-4 p-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <Sparkles className="h-4 w-4 text-primary shrink-0" />
            <h3 className="text-sm font-semibold leading-tight truncate">
              Knowledge Asset Builder
            </h3>
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground leading-snug">
            Build premium representations from{" "}
            <span className="font-medium text-foreground">{doc.name}</span>.
            {builtCount > 0 && (
              <>
                {" "}
                {builtCount} of {DERIVE_KINDS.length} built.
              </>
            )}
          </p>
          {/* Doc reality summary — "137 pages · 25 sections · 12 tables · 8
              figure pages" — so the user grasps the scope before building. */}
          <DocSummaryLine estimate={estimate} fallbackPages={doc.totalPages} />
          {totalBuildUnits != null && totalBuildUnits > 0 && (
            <div className="mt-1 flex items-center gap-1.5">
              <ProcessingUnitsBadge units={totalBuildUnits} />
              <span className="text-[10px] text-muted-foreground">
                to build everything
              </span>
            </div>
          )}
        </div>
        <Button
          size="sm"
          onClick={handleRunAll}
          disabled={buildingAll || anyRunning || loading}
          className="h-8 shrink-0"
        >
          {buildingAll ? (
            <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5 mr-1" />
          )}
          {buildingAll ? "Building…" : "Build all"}
        </Button>
      </div>

      {/* Overall progress during Build All */}
      {buildingAll && <BuildAllProgress operations={operations} />}

      {/* Load error (non-blocking) */}
      {loadError && (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-2.5 text-[11px]">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <span className="text-amber-700 dark:text-amber-400">
            Couldn&apos;t load existing representations ({loadError}). You can
            still build — counts refresh after each run.
          </span>
        </div>
      )}

      {/* Representation rollup */}
      <section className="space-y-2">
        <SectionLabel>Representations</SectionLabel>
        {loading ? (
          <RollupSkeleton />
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {/* Cleaned base — read-only */}
            <BaseRepresentationCard
              count={countByKind.get(BASE_KIND)?.chunk_count}
              totalPages={doc.totalPages ?? null}
            />
            {DERIVE_KINDS.map((kind) => (
              <RepresentationCard
                key={kind}
                kind={kind}
                rollup={countByKind.get(kind)}
                op={operations[kind]}
                estimate={estimate.data?.estimates?.[kind]}
                estimating={estimate.loading}
                onRun={() => void run(kind)}
                onRebuild={() => void handleRebuild(kind, run)}
                onCancel={() => cancel(kind)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Live activity — the "better than a terminal" view */}
      {liveOps.length > 0 && (
        <section className="space-y-2">
          <SectionLabel>
            <span className="inline-flex items-center gap-1.5">
              <span className="relative inline-flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
              </span>
              Live activity
            </span>
          </SectionLabel>
          <div className="space-y-2">
            {liveOps.map((op) => (
              <LiveActivityRow
                key={op.kind}
                op={op}
                onCancel={() => cancel(op.kind)}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

async function handleRebuild(
  kind: DeriveKind,
  run: (k: DeriveKind) => Promise<unknown>,
) {
  const meta = KIND_META[kind];
  const ok = await confirm({
    title: `Rebuild ${meta.label.toLowerCase()}?`,
    description:
      "This replaces the existing output for this representation. The operation is idempotent.",
    confirmLabel: "Rebuild",
  });
  if (ok) void run(kind);
}

// ---------------------------------------------------------------------------
// Representation card — one per derivation kind
// ---------------------------------------------------------------------------

function RepresentationCard({
  kind,
  rollup,
  op,
  estimate,
  estimating,
  onRun,
  onRebuild,
  onCancel,
}: {
  kind: DeriveKind;
  rollup: DerivationRollup | undefined;
  op: OpState;
  estimate: DeriveEstimate | undefined;
  estimating: boolean;
  onRun: () => void;
  onRebuild: () => void;
  onCancel: () => void;
}) {
  const meta = KIND_META[kind];
  const Icon = meta.icon;
  const chunkCount = rollup?.chunk_count ?? 0;
  const built = chunkCount > 0;
  const running = op.status === "running";
  const failed = op.status === "failed";
  const derivativeId = rollup?.derivative_id ?? null;

  // Results expander — only meaningful once content exists.
  const [expanded, setExpanded] = useState(false);

  const pct =
    op.total > 0 ? Math.min(100, Math.round((op.current / op.total) * 100)) : 0;

  return (
    <div
      className={cn(
        "relative flex flex-col rounded-xl border p-3 transition-colors",
        running
          ? "border-primary/40 bg-primary/[0.03]"
          : built
            ? "border-border bg-card"
            : "border-dashed border-border bg-muted/20",
      )}
    >
      {/* Top row: icon + label + count */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-md shrink-0",
                built || running
                  ? "bg-primary/10 text-primary"
                  : "bg-muted text-muted-foreground",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
            </span>
            <span
              className={cn(
                "text-[11px] font-medium leading-tight truncate",
                built || running
                  ? "text-foreground"
                  : "text-muted-foreground",
              )}
              title={meta.label}
            >
              {meta.shortLabel}
            </span>
          </div>
        </div>
        <CountUpInline value={chunkCount} muted={!built} />
      </div>

      {/* Blurb / status line */}
      <p className="mt-1.5 text-[10px] leading-snug text-muted-foreground line-clamp-2 min-h-[26px]">
        {running
          ? op.message || "Working…"
          : failed
            ? op.error || "Failed — try again."
            : meta.blurb}
      </p>

      {/* Reality line — the live "how many runs + cost" from /estimate, so the
          user sees what Build will actually do BEFORE clicking. Hidden while
          running (the live progress takes over). */}
      {!running && (
        <RealityLine estimate={estimate} loading={estimating} unit={meta.unit} />
      )}

      {/* Live progress (only while running) */}
      {running && (
        <div className="mt-1.5 space-y-1">
          <Progress value={op.total > 0 ? pct : undefined} className="h-1.5" />
          <div className="flex items-center justify-between text-[9px] tabular-nums text-muted-foreground">
            <span>
              {op.total > 0
                ? `${op.current.toLocaleString()} / ${op.total.toLocaleString()} ${meta.unit}`
                : `${op.current.toLocaleString()} ${meta.unit}`}
            </span>
            {op.total > 0 && <span>{pct}%</span>}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="mt-2 flex items-center gap-1.5">
        {running ? (
          <Button
            size="sm"
            variant="outline"
            onClick={onCancel}
            className="h-7 flex-1 text-[10px]"
          >
            <XIcon className="h-3 w-3 mr-1" />
            Cancel
          </Button>
        ) : built ? (
          <Button
            size="sm"
            variant="outline"
            onClick={onRebuild}
            className="h-7 flex-1 text-[10px]"
          >
            <RefreshCw className="h-3 w-3 mr-1" />
            Rebuild
          </Button>
        ) : (
          <Button size="sm" onClick={onRun} className="h-7 flex-1 text-[10px]">
            <Play className="h-3 w-3 mr-1" />
            Build
          </Button>
        )}
      </div>

      {/* Results expander — the KEY fix. "Table rows: 62" → click to SEE the 62
          rows and WHERE they came from (page numbers on each ChunkCard). */}
      {built && derivativeId && (
        <>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="mt-2 flex items-center gap-1 text-[10px] font-medium text-primary hover:underline"
            aria-expanded={expanded}
          >
            {expanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            {expanded
              ? "Hide results"
              : `View ${chunkCount.toLocaleString()} ${meta.unit}`}
          </button>
          {expanded && (
            <div className="mt-2 max-h-72 overflow-y-auto rounded-md border border-border/60 bg-muted/20 p-1.5">
              <DerivativeChunkList
                derivativeId={derivativeId}
                expectedTotal={chunkCount}
              />
            </div>
          )}
        </>
      )}

      {/* Failed badge */}
      {failed && !running && (
        <Badge
          variant="error"
          className="absolute -top-1.5 -right-1.5 h-4 px-1.5 text-[9px]"
        >
          failed
        </Badge>
      )}
    </div>
  );
}

/** The "25 sections → 25 Gemini runs · ~$0.05" reality line. Uses the
 *  estimate's own `note` verbatim plus a runs/cost tail. */
function RealityLine({
  estimate,
  loading,
  unit,
}: {
  estimate: DeriveEstimate | undefined;
  loading: boolean;
  unit: string;
}) {
  if (loading && !estimate) {
    return (
      <div className="mt-1.5 flex items-center gap-1 text-[10px] leading-snug text-muted-foreground">
        <Loader2 className="h-2.5 w-2.5 shrink-0 animate-spin text-primary/70" />
        <span>Scanning document to estimate processing…</span>
      </div>
    );
  }
  if (!estimate) return null;

  const runsLabel =
    estimate.runs > 0
      ? `${estimate.runs.toLocaleString()} run${estimate.runs === 1 ? "" : "s"}`
      : "deterministic";
  const units = costToUnits(estimate.cost_usd);

  return (
    <div className="mt-1.5 flex items-start gap-1 text-[10px] leading-snug text-muted-foreground">
      <Sparkles className="mt-[1px] h-2.5 w-2.5 shrink-0 text-primary/70" />
      <span className="min-w-0">
        <span className="font-medium text-foreground/80">
          {estimate.items.toLocaleString()} {estimate.unit || unit}
        </span>{" "}
        → {runsLabel}
        {units > 0 && (
          <>
            {" · "}
            <span className="font-medium text-foreground/70">
              {formatUnits(units)}
            </span>
          </>
        )}
        {estimate.note && (
          <span className="block text-muted-foreground/80">
            {estimate.note}
          </span>
        )}
      </span>
    </div>
  );
}

/** Cleaned-base representation — read-only (parent extract, not a derive kind). */
function BaseRepresentationCard({
  count,
  totalPages,
}: {
  count: number | undefined;
  totalPages: number | null;
}) {
  return (
    <AnimatedKpiCard
      icon={<FileStack className="h-3.5 w-3.5" />}
      label="Cleaned base"
      value={count ?? totalPages ?? 0}
      tone="neutral"
      detail={count != null ? "segments" : "from extraction"}
    />
  );
}

// ---------------------------------------------------------------------------
// Live activity row — rich, per-op detail strip
// ---------------------------------------------------------------------------

function LiveActivityRow({
  op,
  onCancel,
}: {
  op: OpState;
  onCancel: () => void;
}) {
  const meta = KIND_META[op.kind];
  const Icon = meta.icon;
  const pct =
    op.total > 0 ? Math.min(100, Math.round((op.current / op.total) * 100)) : 0;
  const elapsed = useElapsed(op.startedAt, op.status === "running");

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-lg border border-primary/30 bg-card overflow-hidden"
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary shrink-0">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold leading-tight truncate">
              {meta.label}
            </span>
            <span className="text-[10px] tabular-nums text-muted-foreground shrink-0">
              {op.total > 0
                ? `${op.current.toLocaleString()} / ${op.total.toLocaleString()} ${meta.unit}`
                : `${op.current.toLocaleString()} ${meta.unit}`}
            </span>
          </div>
          <p className="text-[11px] text-foreground/80 truncate">
            {op.message || "Working…"}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] tabular-nums text-muted-foreground">
            {elapsed}
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={onCancel}
            className="h-7 text-[10px]"
          >
            <XIcon className="h-3 w-3 mr-1" />
            Cancel
          </Button>
        </div>
      </div>
      {/* Bottom progress bar — determinate when we have a total, else an
          indeterminate sweep so the user always sees motion. */}
      {op.total > 0 ? (
        <div className="h-1.5 w-full bg-muted relative overflow-hidden">
          <motion.div
            className="absolute inset-y-0 left-0 bg-primary"
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          />
        </div>
      ) : (
        <div className="h-1.5 w-full bg-muted relative overflow-hidden">
          <motion.div
            className="absolute inset-y-0 w-1/3 bg-primary/60"
            initial={{ x: "-100%" }}
            animate={{ x: "300%" }}
            transition={{ duration: 1.4, repeat: Infinity, ease: "linear" }}
          />
        </div>
      )}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Build-All overall progress
// ---------------------------------------------------------------------------

function BuildAllProgress({
  operations,
}: {
  operations: Record<DeriveKind, OpState>;
}) {
  const done = DERIVE_KINDS.filter(
    (k) => operations[k].status === "completed",
  ).length;
  const failed = DERIVE_KINDS.filter(
    (k) => operations[k].status === "failed",
  ).length;
  const total = DERIVE_KINDS.length;
  const pct = Math.round(((done + failed) / total) * 100);

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/[0.03] p-2.5">
      <div className="mb-1.5 flex items-center justify-between text-[11px]">
        <span className="font-medium">Building all representations</span>
        <span className="tabular-nums text-muted-foreground">
          {done + failed} / {total}
          {failed > 0 && (
            <span className="text-destructive"> · {failed} failed</span>
          )}
        </span>
      </div>
      <Progress value={pct} className="h-1.5" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small pieces
// ---------------------------------------------------------------------------

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reality estimate — fetched once on open (PDF scan, a few seconds)
// ---------------------------------------------------------------------------

interface EstimateState {
  data: DerivationsEstimate | null;
  loading: boolean;
  error: string | null;
}

function useDerivationsEstimate(docId: string | null): EstimateState {
  const [state, setState] = useState<EstimateState>({
    data: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    if (!docId) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    let cancelled = false;
    const ac = new AbortController();
    setState({ data: null, loading: true, error: null });
    fetchEstimate(docId, ac.signal)
      .then((data) => {
        if (!cancelled) setState({ data, loading: false, error: null });
      })
      .catch((err) => {
        if (cancelled || ac.signal.aborted) return;
        setState({
          data: null,
          loading: false,
          error: err instanceof Error ? err.message : "Failed to estimate",
        });
      });
    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [docId]);

  return state;
}

/** "137 pages · 25 sections · 12 tables · 8 figure pages" — the doc's reality
 *  scope, so the per-card run/cost numbers have context. */
function DocSummaryLine({
  estimate,
  fallbackPages,
}: {
  estimate: EstimateState;
  fallbackPages?: number | null;
}) {
  if (estimate.loading && !estimate.data) {
    return <Skeleton className="mt-1 h-3 w-56" />;
  }
  const d = estimate.data?.doc;
  if (!d) {
    // Estimate failed — still show what we know (pages) so the line isn't blank.
    if (fallbackPages && fallbackPages > 0) {
      return (
        <p className="mt-1 text-[10px] tabular-nums text-muted-foreground">
          {fallbackPages.toLocaleString()} pages
          {estimate.error && (
            <span className="text-amber-600 dark:text-amber-400">
              {" "}
              · scope estimate unavailable
            </span>
          )}
        </p>
      );
    }
    return null;
  }

  const parts: string[] = [`${d.pages.toLocaleString()} pages`];
  if (d.sections > 0) parts.push(`${d.sections.toLocaleString()} sections`);
  if (d.tables > 0) parts.push(`${d.tables.toLocaleString()} tables`);
  if (d.rows > 0) parts.push(`${d.rows.toLocaleString()} rows`);
  if (d.figure_pages > 0)
    parts.push(`${d.figure_pages.toLocaleString()} figure pages`);

  return (
    <p className="mt-1 text-[10px] tabular-nums text-muted-foreground">
      {parts.join(" · ")}
    </p>
  );
}

/** Compact count display with a green flash on increase — same idea as
 *  AnimatedKpiCard's CountUp but inline + smaller for the card corner. */
function CountUpInline({ value, muted }: { value: number; muted?: boolean }) {
  const [flash, setFlash] = useState(false);
  const [display, setDisplay] = useState(value);
  useEffect(() => {
    if (value > display) {
      setFlash(true);
      const t = window.setTimeout(() => setFlash(false), 700);
      setDisplay(value);
      return () => window.clearTimeout(t);
    }
    setDisplay(value);
  }, [value, display]);
  return (
    <span
      className={cn(
        "text-base font-semibold tabular-nums leading-none transition-colors",
        flash
          ? "text-emerald-500"
          : muted
            ? "text-muted-foreground"
            : "text-foreground",
      )}
    >
      {display.toLocaleString()}
    </span>
  );
}

function RollupSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 7 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-border p-3">
          <div className="flex items-center justify-between">
            <Skeleton className="h-6 w-6 rounded-md" />
            <Skeleton className="h-5 w-8" />
          </div>
          <Skeleton className="mt-2 h-3 w-20" />
          <Skeleton className="mt-3 h-7 w-full rounded-md" />
        </div>
      ))}
    </div>
  );
}

function useElapsed(startedAt: number | null, running: boolean): string {
  const [, force] = useState(0);
  useEffect(() => {
    if (!running) return;
    const t = window.setInterval(() => force((n) => n + 1), 1000);
    return () => window.clearInterval(t);
  }, [running]);
  if (!startedAt) return "0s";
  const sec = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}
