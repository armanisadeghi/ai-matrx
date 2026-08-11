"use client";

/**
 * ProcessingView — full-screen live status page shown the moment the
 * user hits Save. Replaces the old "everything piled onto the context
 * prompt" experience.
 *
 * Step signals:
 * 1. Build   — from-images stream info events (crop/combine/convert).
 * 2. OCR     — stream `scan_pdf_extract` info; done at the terminal
 *              data event (raw text is real — a peek renders).
 * 3. AI clean— the model's ACTUAL cleaned text, page by page, as the
 *              detached server pipeline writes it (THE FLOATING LAW: a
 *              count is not output). The per-page ledger and the progress
 *              bar sit UNDER that, as context — never instead of it.
 * 4. Entities— DB poll: pipeline completion + entity/chunk totals.
 *
 * Navigation happens in the surface once processing completes AND the
 * clean content passes the verified-fetch gate (3×2s retries with
 * console.error on each miss).
 */

import React, { useEffect, useRef } from "react";
import {
  Check,
  FileStack,
  Loader2,
  ScanLine,
  ScanText,
  SpellCheck,
  Tags,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { ProcessingStatus } from "../processing";

export type ProcessingStepId = "build" | "ocr" | "clean" | "entities";

/**
 * One row of the live page ledger. Born when the extraction stream emits
 * the page's raw text (chars/method/preview), enriched by the clean-step
 * poll with the AI's section title/kind and cleaned flag.
 */
export interface ProcessingPageRow {
  page: number;
  chars: number;
  method: string; // "native" | "ocr"
  preview?: string;
  title: string | null;
  kind: string | null;
  cleaned: boolean;
}

/** One page of the AI's real cleaned output, in the order the model finished it. */
export interface CleanedPageOutput {
  pageNumber: number;
  title: string | null;
  text: string;
}

export interface ProcessingState {
  /** Highest step currently in progress. */
  active: ProcessingStepId | "done";
  buildDetail: string | null;
  ocrDetail: string | null;
  pageCount: number | null;
  rawPreview: string | null;
  status: ProcessingStatus | null;
  pages: ProcessingPageRow[];
  /**
   * The AI's actual cleaned text, appended page by page as the clean pipeline
   * writes it. THE FLOATING LAW — the expensive step shows its output.
   */
  cleanedPages: CleanedPageOutput[];
  /** Set while the verified fetch gate runs after completion. */
  finalizing: boolean;
}

interface ProcessingViewProps {
  label: string;
  state: ProcessingState;
  onAssignContext: () => void;
}

const STEP_ORDER: ProcessingStepId[] = ["build", "ocr", "clean", "entities"];

function stepPhase(
  step: ProcessingStepId,
  active: ProcessingState["active"],
): "pending" | "active" | "done" {
  if (active === "done") return "done";
  const a = STEP_ORDER.indexOf(active);
  const s = STEP_ORDER.indexOf(step);
  if (s < a) return "done";
  if (s === a) return "active";
  return "pending";
}

export function ProcessingView({
  label,
  state,
  onAssignContext,
}: ProcessingViewProps) {
  const { status } = state;
  const cleanPct =
    status && status.pagesTotal > 0
      ? Math.round((status.pagesCleaned / status.pagesTotal) * 100)
      : 0;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="mx-auto flex w-full max-w-md min-h-0 flex-1 flex-col px-6">
        {/* Hero */}
        <div className="flex flex-col items-center pb-6 pt-12">
          <div className="relative flex h-20 w-20 items-center justify-center">
            <span
              className={cn(
                "absolute inset-0 rounded-full bg-primary/10",
                state.active !== "done" && "animate-ping [animation-duration:2.2s]",
              )}
            />
            <span className="absolute inset-1.5 rounded-full bg-primary/10" />
            {state.active === "done" ? (
              <Check className="relative h-9 w-9 text-primary animate-in zoom-in-50 duration-300" />
            ) : (
              <ScanLine className="relative h-9 w-9 text-primary" />
            )}
          </div>
          <h1 className="mt-4 max-w-full truncate text-base font-semibold">
            {label}
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {state.active === "done"
              ? state.finalizing
                ? "Opening your document…"
                : "Everything is ready"
              : "Turning your scan into a searchable document"}
          </p>
        </div>

        {/* Steps */}
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
          <StepRow
            phase={stepPhase("build", state.active)}
            icon={FileStack}
            title="Crop, combine & convert"
            detail={state.buildDetail}
            doneDetail="One PDF assembled"
          />
          <StepRow
            phase={stepPhase("ocr", state.active)}
            icon={ScanText}
            title="Read every page"
            detail={state.ocrDetail}
            doneDetail={
              state.pageCount
                ? `${state.pageCount} page${state.pageCount === 1 ? "" : "s"} read`
                : "Text extracted"
            }
          >
            {state.rawPreview && (
              <div className="mt-2 rounded-md border border-border bg-muted/40 p-2 animate-in fade-in slide-in-from-bottom-1 duration-500">
                <p className="line-clamp-3 font-mono text-[10px] leading-relaxed text-muted-foreground">
                  {state.rawPreview}
                </p>
              </div>
            )}
          </StepRow>
          <StepRow
            phase={stepPhase("clean", state.active)}
            icon={SpellCheck}
            title="AI cleanup & page analysis"
            detail={
              status && status.pagesTotal > 0
                ? status.pagesCleaned > 0
                  ? `Cleaned ${status.pagesCleaned} of ${status.pagesTotal} pages`
                  : `Rewriting ${status.pagesTotal} page${status.pagesTotal === 1 ? "" : "s"} with AI…`
                : "Preparing AI cleanup…"
            }
            doneDetail={
              status
                ? `${status.pagesTotal} page${status.pagesTotal === 1 ? "" : "s"} polished`
                : "Content cleaned"
            }
          >
            {state.cleanedPages.length > 0 && (
              <CleanedOutputFeed pages={state.cleanedPages} />
            )}
            {stepPhase("clean", state.active) === "active" && (
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    "h-full rounded-full bg-gradient-to-r from-primary/60 via-primary to-primary/60 transition-all duration-700",
                    cleanPct === 0 && "w-1/4 animate-pulse",
                  )}
                  style={cleanPct > 0 ? { width: `${cleanPct}%` } : undefined}
                />
              </div>
            )}
          </StepRow>
          {state.pages.length > 0 && (
            <div className="rounded-lg border border-border/70 bg-card/50 px-3 py-2 animate-in fade-in duration-500">
              <p className="pb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Pages
              </p>
              <div className="max-h-44 space-y-0.5 overflow-y-auto">
                {state.pages.map((row) => (
                  <PageLedgerRow
                    key={row.page}
                    row={row}
                    cleanActive={stepPhase("clean", state.active) === "active"}
                  />
                ))}
              </div>
            </div>
          )}
          <StepRow
            phase={stepPhase("entities", state.active)}
            icon={Tags}
            title="Identify names, dates & entities"
            detail="Indexing for search and knowledge…"
            doneDetail={
              status && (status.entities ?? 0) + (status.chunks ?? 0) > 0
                ? [
                    status.entities ? `${status.entities} entities` : null,
                    status.chunks
                      ? `${status.chunks} searchable chunk${status.chunks === 1 ? "" : "s"}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : "Indexed"
            }
          />
        </div>

        {/* Footer */}
        <div className="shrink-0 space-y-2 pb-safe pt-4">
          <Button
            variant="outline"
            className="h-11 w-full"
            onClick={onAssignContext}
          >
            Assign to a client, matter or project
          </Button>
          <p className="pb-3 text-center text-[11px] text-muted-foreground">
            You&apos;ll land in the extractor the moment everything is ready.
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * The AI's cleaned output as it lands — the clean step's real content.
 *
 * Plain text in a fixed-height, auto-following pane: this is the model's
 * rewrite of the user's own scan, and it must be readable while it grows. It
 * deliberately does NOT go through MarkdownStream — there is no requestId
 * here (the clean pipeline is detached server-side, see processing.ts), and
 * hand-feeding a renderer is banned. Plain text is the honest surface until
 * aidream exposes a stream for this pipeline.
 */
function CleanedOutputFeed({ pages }: { pages: CleanedPageOutput[] }) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const latest = pages[pages.length - 1];

  // Follow the newest page in, the way a stream follows its own tail.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [latest?.pageNumber]);

  return (
    <div className="mt-2 rounded-md border border-primary/25 bg-primary/[0.03] animate-in fade-in duration-500">
      <div className="flex items-center justify-between gap-2 border-b border-primary/15 px-2.5 py-1.5">
        <p className="text-[10px] font-medium uppercase tracking-wide text-primary/80">
          What the AI is writing
        </p>
        <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
          page {latest?.pageNumber}
        </span>
      </div>
      <div
        ref={scrollRef}
        className="max-h-48 space-y-2.5 overflow-y-auto px-2.5 py-2"
      >
        {pages.map((page) => (
          <div key={page.pageNumber}>
            {page.title && (
              <p className="text-[11px] font-medium leading-tight">
                {page.title}
              </p>
            )}
            <p className="whitespace-pre-wrap text-[11px] leading-relaxed text-foreground/85">
              {page.text}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * One page in the live ledger. Shows raw-extraction facts the moment the
 * page streams in; swaps to the AI's section title (rich per-page
 * metadata) as the clean pipeline finishes each page.
 */
function PageLedgerRow({
  row,
  cleanActive,
}: {
  row: ProcessingPageRow;
  cleanActive: boolean;
}) {
  return (
    <div className="flex items-center gap-2 rounded px-1 py-1 animate-in fade-in slide-in-from-bottom-1 duration-300">
      <span className="flex h-5 w-7 shrink-0 items-center justify-center rounded bg-muted text-[10px] font-medium tabular-nums text-muted-foreground">
        {row.page}
      </span>
      <div className="min-w-0 flex-1">
        {row.title ? (
          <p className="truncate text-[12px] font-medium leading-tight animate-in fade-in duration-500">
            {row.title}
          </p>
        ) : (
          <p className="truncate text-[12px] leading-tight text-muted-foreground">
            {row.chars.toLocaleString()} characters
            {row.method === "ocr" ? " · OCR" : ""}
          </p>
        )}
        {row.title && row.kind && (
          <p className="truncate text-[10px] capitalize text-muted-foreground">
            {row.kind.replace(/_/g, " ")}
          </p>
        )}
      </div>
      <span className="shrink-0">
        {row.cleaned ? (
          <Check className="h-3.5 w-3.5 text-emerald-600 animate-in zoom-in-50 duration-300 dark:text-emerald-400" />
        ) : cleanActive ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground/60" />
        ) : (
          <span className="block h-1.5 w-1.5 rounded-full bg-muted-foreground/30" />
        )}
      </span>
    </div>
  );
}

function StepRow({
  phase,
  icon: Icon,
  title,
  detail,
  doneDetail,
  children,
}: {
  phase: "pending" | "active" | "done";
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  detail?: string | null;
  doneDetail?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-2.5 transition-colors duration-500",
        phase === "active" && "border-primary/40 bg-primary/[0.04]",
        phase === "done" && "border-border bg-muted/30",
        phase === "pending" && "border-border/60 opacity-55",
      )}
    >
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors duration-500",
            phase === "done"
              ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
              : phase === "active"
                ? "bg-primary/15 text-primary"
                : "bg-muted text-muted-foreground",
          )}
        >
          {phase === "done" ? (
            <Check className="h-4 w-4 animate-in zoom-in-50 duration-300" />
          ) : phase === "active" ? (
            <span className="relative flex items-center justify-center">
              <Loader2 className="absolute h-7 w-7 animate-spin opacity-40" />
              <Icon className="h-4 w-4" />
            </span>
          ) : (
            <Icon className="h-4 w-4" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium leading-tight">{title}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {phase === "done" ? doneDetail : phase === "active" ? detail : " "}
          </p>
        </div>
      </div>
      {phase !== "pending" && children}
    </div>
  );
}
