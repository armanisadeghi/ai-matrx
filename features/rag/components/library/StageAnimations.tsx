"use client";

/**
 * StageAnimations — large, unique, content-aware animated visuals for each
 * pipeline stage. Replaces the "everything is a spinner" pattern.
 *
 * Each animation is a self-contained ~280px-tall hero panel that reads the
 * job's live frame (current / total / fraction / preview) and renders an
 * animation that *represents the actual work being done*:
 *
 *   - <ExtractAnimation/>   — pages stack with a sweeping scan line
 *   - <CleanAnimation/>     — wand polishes raw text into clean text
 *   - <ChunkAnimation/>     — a long document strip slices into chunks
 *   - <EmbedAnimation/>     — a vector grid lights up wave-by-wave
 *
 * <StageHero/> picks the right animation for the active stage and mounts it
 * with a smooth crossfade when the stage transitions.
 *
 * Pure CSS + framer-motion — no canvas / SVG complexity.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CheckCircle2, FileText, Layers, Stars, Zap } from "lucide-react";
import { RAG_VOCAB } from "@/features/rag/constants/vocabulary";
import { cn } from "@/lib/utils";
import type {
  ProcessingFrame,
  ProcessingStageId,
  StagePreview,
} from "./ProcessingProgressDialog";

// ---------------------------------------------------------------------------
// StageHero — picks the right animation per stage
// ---------------------------------------------------------------------------

export interface StageHeroProps {
  frame: ProcessingFrame;
  className?: string;
}

export function StageHero({ frame, className }: StageHeroProps) {
  const activeStage = frame.activeStage ?? "extract";
  const stageMeta = STAGE_META[activeStage];
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border bg-card",
        "min-h-[260px]",
        className,
      )}
    >
      {/* Stage-tinted gradient backdrop, fades in on stage change. Rendered
          as a plain keyed motion.div (NOT an AnimatePresence `mode="sync"`
          swap): with React Compiler enabled the exiting child often never
          completes, which would stack stale `absolute inset-0` stage tints on
          top of each other. The `key` remount still plays the enter fade;
          the old tint unmounts instantly. */}
      <motion.div
        key={activeStage}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6 }}
        className={cn(
          "pointer-events-none absolute inset-0 bg-gradient-to-br",
          stageMeta.bgFrom,
          stageMeta.bgTo,
        )}
      />

      {/* Stage label + count, top-left over the animation */}
      <div className="absolute top-3 left-4 z-10 flex items-center gap-2 pointer-events-none">
        <div
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-md backdrop-blur-sm border",
            stageMeta.chipBg,
            stageMeta.chipBorder,
          )}
        >
          <stageMeta.Icon className={cn("h-3.5 w-3.5", stageMeta.iconClass)} />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            Stage
          </div>
          <div
            className={cn(
              "text-sm font-semibold leading-tight",
              stageMeta.titleClass,
            )}
          >
            {stageMeta.label}
          </div>
        </div>
      </div>

      {/* Big counter, top-right */}
      <div className="absolute top-3 right-4 z-10 text-right pointer-events-none">
        <BigCount frame={frame} stageId={activeStage} />
      </div>

      {/* The animation itself — fills the panel */}
      <div className="absolute inset-0 flex items-end justify-center pt-14 pb-3">
        {/* Per-stage hero animation. Plain keyed motion.div (NOT an
            AnimatePresence `mode="sync"` swap) — same React-Compiler exit-stall
            reason as the backdrop above; a stuck exit would leave the previous
            stage's full-panel animation layered over the current one. */}
        <motion.div
          key={activeStage}
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="w-full h-full flex items-center justify-center"
        >
          {activeStage === "extract" && <ExtractAnimation frame={frame} />}
          {activeStage === "clean" && <CleanAnimation frame={frame} />}
          {activeStage === "chunk" && <ChunkAnimation frame={frame} />}
          {activeStage === "embed" && <EmbedAnimation frame={frame} />}
        </motion.div>
      </div>

      {/* Heartbeat dot, bottom-right */}
      <Heartbeat lastUpdate={frame.lastUpdate} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stage 1 — Extract: stack of pages, scan-bar sweeps, top page slides off
// ---------------------------------------------------------------------------

function ExtractAnimation({ frame }: { frame: ProcessingFrame }) {
  // Show 5 page rectangles. The "current" page is the top one being scanned.
  const pageNum = Math.max(1, frame.current);
  // Use the doc-name preview if available to get page text
  const pagePreview =
    frame.latestPreview?.kind === "page_text" ? frame.latestPreview : null;

  return (
    <div className="relative w-full h-full flex items-center justify-center px-4">
      {/* Page stack */}
      <div className="relative w-[180px] h-[200px]">
        {[0, 1, 2, 3, 4].map((i) => {
          const z = 5 - i;
          const offset = i * 6;
          return (
            <motion.div
              key={`${pageNum}-${i}`}
              initial={
                i === 0 ? { y: -60, opacity: 0 } : { y: offset, opacity: 1 }
              }
              animate={{ y: offset, opacity: 1 - i * 0.18 }}
              transition={{
                duration: 0.5,
                ease: [0.22, 1, 0.36, 1],
                delay: i === 0 ? 0 : 0,
              }}
              className={cn(
                "absolute left-1/2 -translate-x-1/2 rounded-md border bg-background/95 backdrop-blur-sm shadow-sm",
                "w-[160px] h-[180px] overflow-hidden",
              )}
              style={{ zIndex: z, top: `${offset}px` }}
            >
              {/* Faux page lines */}
              <div className="p-3 space-y-1.5">
                {Array.from({ length: 8 }).map((_, lineIdx) => (
                  <div
                    key={lineIdx}
                    className="h-1 rounded-sm bg-muted-foreground/15"
                    style={{
                      width: `${65 + ((i + lineIdx) % 4) * 10}%`,
                    }}
                  />
                ))}
              </div>
              {/* Scan bar — only on the top page */}
              {i === 0 && (
                <motion.div
                  className="absolute left-0 right-0 h-[3px] pointer-events-none"
                  style={{
                    background:
                      "linear-gradient(90deg, transparent, rgb(56 189 248) 20%, rgb(56 189 248) 80%, transparent)",
                    boxShadow:
                      "0 0 12px 2px rgb(56 189 248 / 0.7), 0 0 24px 4px rgb(56 189 248 / 0.35)",
                  }}
                  initial={{ top: 0 }}
                  animate={{ top: "100%" }}
                  transition={{
                    duration: 1.6,
                    ease: "easeInOut",
                    repeat: Infinity,
                    repeatType: "loop",
                  }}
                />
              )}
            </motion.div>
          );
        })}
      </div>

      {/* Page text excerpt to the right */}
      {pagePreview && pagePreview.text && (
        <motion.div
          key={pagePreview.text.slice(0, 30)}
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.35 }}
          className="ml-6 hidden sm:block flex-1 max-w-[300px]"
        >
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5 font-semibold">
            Just extracted
          </div>
          <div className="text-xs leading-relaxed text-foreground/85 line-clamp-6 font-mono">
            {pagePreview.text.slice(0, 320)}
            {pagePreview.text.length > 320 && "…"}
          </div>
        </motion.div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stage 2 — Clean: messy text on left, polished text on right, wand sweeps
// ---------------------------------------------------------------------------

function CleanAnimation({ frame }: { frame: ProcessingFrame }) {
  const cleanPreview =
    frame.latestPreview?.kind === "page_clean" ? frame.latestPreview : null;

  // Default: render fake messy → clean lines if no live preview yet
  const rawSample =
    cleanPreview?.raw_text ??
    "Page  47\n\nINTRODUCTION\n  the  quick brown fox\n\n[Figure 3.2]\nx_y_z = encoded\n\n  page  break  ";
  const cleanedSample =
    cleanPreview?.cleaned_text ??
    "## Introduction\n\nThe quick brown fox jumps over the lazy dog. Each page is normalized, whitespace collapsed, and reading order restored.";

  return (
    <div className="relative w-full h-full flex items-stretch justify-center gap-3 px-4 pb-1">
      {/* Raw column */}
      <div className="relative flex-1 min-w-0 max-w-[210px]">
        <div className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1 font-semibold">
          Raw
        </div>
        <div className="relative h-[170px] rounded-md border border-violet-500/20 bg-background/70 backdrop-blur-sm overflow-hidden">
          <pre className="absolute inset-0 p-2 text-[10px] leading-snug font-mono whitespace-pre-wrap break-words text-muted-foreground/80 overflow-hidden">
            {rawSample.slice(0, 280)}
          </pre>
        </div>
      </div>

      {/* Wand traveling between columns */}
      <div className="relative flex flex-col items-center justify-center w-10 shrink-0">
        <motion.div
          animate={{
            y: [0, 130, 0],
            rotate: [-8, 8, -8],
          }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
          className="relative"
        >
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 shadow-[0_0_20px_4px_rgba(168,85,247,0.55)]">
            <Zap className="h-3.5 w-3.5 text-white" />
          </div>
        </motion.div>
        {/* Sparkle trail */}
        {[0, 1, 2, 3].map((i) => (
          <motion.span
            key={i}
            className="absolute h-1 w-1 rounded-full bg-violet-400"
            style={{ top: "50%", left: "50%" }}
            animate={{
              y: [0, 30, 60, 90],
              x: [(i - 1.5) * 4, (i - 1.5) * 6, (i - 1.5) * 8, (i - 1.5) * 10],
              opacity: [0.9, 0.6, 0.3, 0],
              scale: [1, 0.8, 0.6, 0.3],
            }}
            transition={{
              duration: 1.2,
              repeat: Infinity,
              delay: i * 0.18,
              ease: "easeOut",
            }}
          />
        ))}
      </div>

      {/* Cleaned column */}
      <div className="relative flex-1 min-w-0 max-w-[210px]">
        <div className="text-[9px] uppercase tracking-wider text-emerald-700 dark:text-emerald-400 mb-1 font-semibold flex items-center gap-1">
          Cleaned
          <CheckCircle2 className="h-3 w-3" />
        </div>
        <div className="relative h-[170px] rounded-md border border-emerald-500/30 bg-emerald-500/5 backdrop-blur-sm overflow-hidden">
          <pre className="absolute inset-0 p-2 text-[10px] leading-snug font-mono whitespace-pre-wrap break-words text-foreground/90 overflow-hidden">
            {cleanedSample.slice(0, 280)}
          </pre>
          {/* Shimmer sweep over the cleaned panel */}
          <motion.div
            className="absolute inset-y-0 w-12 pointer-events-none"
            style={{
              background:
                "linear-gradient(90deg, transparent, rgba(16,185,129,0.18), transparent)",
            }}
            animate={{ left: ["-15%", "115%"] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
          />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stage 3 — Chunk: long document strip with knife slices, chunks fly out
// ---------------------------------------------------------------------------

function ChunkAnimation({ frame }: { frame: ProcessingFrame }) {
  const total = Math.max(frame.total, 1);
  const current = Math.min(frame.current, total);

  // Fake "document strip" of 14 lines, with slice marks every ~3 lines.
  const lines = useMemo(() => {
    return Array.from({ length: 14 }).map((_, i) => 60 + ((i * 13) % 35));
  }, []);

  // Drive the slicing animation: increment a "slice index" every 1.4s.
  const [sliceIndex, setSliceIndex] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setSliceIndex((s) => (s + 1) % 5), 1400);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="relative w-full h-full flex items-center justify-center gap-4 px-4 pb-2">
      {/* Document strip */}
      <div className="relative w-[180px] h-[200px] rounded-md border bg-background/80 backdrop-blur-sm overflow-hidden">
        <div className="flex flex-col gap-1.5 p-3">
          {lines.map((w, i) => (
            <div
              key={i}
              className="h-1.5 rounded-sm bg-amber-500/30"
              style={{ width: `${w}%` }}
            />
          ))}
        </div>

        {/* Slice marks (4 horizontal lines crossing the doc) */}
        {[0, 1, 2, 3].map((i) => {
          const top = `${(i + 1) * 19}%`;
          const isActive = sliceIndex === i;
          return (
            <div key={i} className="absolute left-0 right-0" style={{ top }}>
              <motion.div
                className="h-px w-full"
                style={{
                  background:
                    "linear-gradient(90deg, transparent, rgb(245 158 11), transparent)",
                  boxShadow: isActive
                    ? "0 0 8px 1px rgb(245 158 11 / 0.7)"
                    : "0 0 4px 0px rgb(245 158 11 / 0.3)",
                }}
                animate={isActive ? { scaleX: [0, 1, 1] } : { scaleX: 1 }}
                transition={{ duration: 0.4 }}
              />
            </div>
          );
        })}

        {/* Sweeping knife */}
        <motion.div
          className="absolute left-0 right-0 h-[2px] pointer-events-none"
          style={{
            background:
              "linear-gradient(90deg, transparent, rgb(245 158 11), transparent)",
            boxShadow: "0 0 12px 2px rgb(245 158 11 / 0.6)",
          }}
          animate={{ top: ["10%", "92%"] }}
          transition={{
            duration: 1.4,
            repeat: Infinity,
            ease: "linear",
          }}
        />
      </div>

      {/* Chunks flying out */}
      <div className="relative h-[200px] w-[160px]">
        <AnimatePresence>
          {[0, 1, 2].map((i) => {
            const offset = i * 60;
            return (
              <motion.div
                key={`chunk-${sliceIndex}-${i}`}
                initial={{ x: -40, y: 60 + offset, opacity: 0, scale: 0.85 }}
                animate={{ x: 0, opacity: 1, scale: 1 }}
                exit={{ x: 30, opacity: 0 }}
                transition={{
                  duration: 0.5,
                  delay: i * 0.12,
                  ease: [0.22, 1, 0.36, 1],
                }}
                className="absolute rounded-md border border-amber-500/40 bg-amber-500/10 backdrop-blur-sm px-2 py-1.5"
                style={{ top: `${10 + offset}px`, width: "150px" }}
              >
                <div className="flex items-center justify-between text-[9px] mb-1">
                  <span className="font-semibold text-amber-700 dark:text-amber-400">
                    chunk #{Math.max(1, current - 2 + i).toLocaleString()}
                  </span>
                  <span className="text-muted-foreground tabular-nums">
                    {180 + i * 23}t
                  </span>
                </div>
                <div className="space-y-1">
                  {[0, 1, 2].map((j) => (
                    <div
                      key={j}
                      className="h-0.5 rounded-sm bg-amber-500/25"
                      style={{ width: `${70 - j * 15}%` }}
                    />
                  ))}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stage 4 — Embed: vector grid lights up wave-by-wave
// ---------------------------------------------------------------------------

function EmbedAnimation({ frame }: { frame: ProcessingFrame }) {
  const total = Math.max(frame.total, 1);
  const current = Math.min(frame.current, total);
  const fraction = total > 0 ? current / total : 0;

  // 12x6 = 72 dots. The fraction of dots "lit" matches progress fraction.
  const cols = 18;
  const rows = 7;
  const dotCount = cols * rows;
  const litCount = Math.max(0, Math.floor(fraction * dotCount));

  return (
    <div className="relative w-full h-full flex items-center justify-center px-4 pb-2">
      <div
        className="grid gap-1.5 p-2"
        style={{
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
          maxWidth: "440px",
        }}
      >
        {Array.from({ length: dotCount }).map((_, i) => {
          const lit = i < litCount;
          // Just-lit (within last 12) gets a flash; older lit are steady.
          const justLit = lit && i >= litCount - 12;
          return (
            <motion.div
              key={i}
              initial={false}
              animate={
                lit
                  ? {
                      backgroundColor: justLit
                        ? "rgb(16 185 129)"
                        : "rgb(16 185 129 / 0.55)",
                      boxShadow: justLit
                        ? "0 0 10px 1px rgb(16 185 129 / 0.65)"
                        : "0 0 0 rgb(16 185 129 / 0)",
                      scale: justLit ? 1.25 : 1,
                    }
                  : {
                      backgroundColor: "rgb(148 163 184 / 0.18)",
                      boxShadow: "0 0 0 rgb(0 0 0 / 0)",
                      scale: 1,
                    }
              }
              transition={{
                duration: 0.35,
                ease: "easeOut",
                delay: justLit ? (i - (litCount - 12)) * 0.025 : 0,
              }}
              className="h-2 w-2 rounded-full"
            />
          );
        })}
      </div>

      {/* Live "vector packet" zooming across */}
      <motion.div
        className="absolute pointer-events-none"
        initial={{ x: -40, y: 0, opacity: 0 }}
        animate={{
          x: [-40, 200, 380],
          opacity: [0, 1, 0],
        }}
        transition={{
          duration: 1.6,
          repeat: Infinity,
          ease: "easeOut",
        }}
        style={{ top: "8px", left: "50%" }}
      >
        <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full border border-emerald-500/40 bg-background/80 backdrop-blur-sm text-[9px] font-mono text-emerald-700 dark:text-emerald-400">
          <Stars className="h-2.5 w-2.5" />
          <span className="tabular-nums">[ 0.241, -0.193, 0.482, … ]</span>
        </div>
      </motion.div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Big stage counter — top-right of the hero panel
// ---------------------------------------------------------------------------

function BigCount({
  frame,
  stageId,
}: {
  frame: ProcessingFrame;
  stageId: ProcessingStageId;
}) {
  const meta = STAGE_META[stageId];
  const unit = meta.unit;
  const current = frame.current ?? 0;
  const total = frame.total ?? 0;
  return (
    <div className="flex flex-col items-end">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
        {unit}
      </div>
      <div className="text-2xl sm:text-3xl font-bold tabular-nums leading-none">
        {current.toLocaleString()}
        {total > 0 && (
          <span className="text-base font-medium text-muted-foreground ml-0.5">
            / {total.toLocaleString()}
          </span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Heartbeat pip — confirms the stream is alive
// ---------------------------------------------------------------------------

function Heartbeat({ lastUpdate }: { lastUpdate: number }) {
  // Re-render every second so "Xs ago" label stays current.
  const [, force] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => force((n) => n + 1), 1000);
    return () => window.clearInterval(t);
  }, []);
  const sinceUpdate = lastUpdate
    ? Math.max(0, Math.floor((Date.now() - lastUpdate) / 1000))
    : 0;
  const stale = sinceUpdate > 10;
  return (
    <div className="absolute bottom-2 right-3 z-10 flex items-center gap-1.5 text-[10px] text-muted-foreground pointer-events-none">
      <span className="relative inline-flex h-2 w-2">
        <span
          className={cn(
            "absolute inline-flex h-full w-full rounded-full opacity-75",
            stale
              ? "bg-amber-500 animate-pulse"
              : "bg-emerald-500 animate-ping",
          )}
        />
        <span
          className={cn(
            "relative inline-flex h-2 w-2 rounded-full",
            stale ? "bg-amber-500" : "bg-emerald-500",
          )}
        />
      </span>
      <span className="tabular-nums">
        {sinceUpdate < 2
          ? "live"
          : sinceUpdate < 60
            ? `${sinceUpdate}s ago`
            : `${Math.floor(sinceUpdate / 60)}m ago`}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stage metadata — colors, labels, units, icons
// ---------------------------------------------------------------------------

const STAGE_META: Record<
  ProcessingStageId,
  {
    label: string;
    Icon: React.ComponentType<{ className?: string }>;
    unit: string;
    bgFrom: string;
    bgTo: string;
    chipBg: string;
    chipBorder: string;
    iconClass: string;
    titleClass: string;
  }
> = {
  extract: {
    label: "Extract",
    Icon: FileText,
    unit: "Page",
    bgFrom: "from-sky-500/10",
    bgTo: "to-sky-500/0",
    chipBg: "bg-sky-500/15",
    chipBorder: "border-sky-500/30",
    iconClass: "text-sky-600 dark:text-sky-400",
    titleClass: "text-sky-700 dark:text-sky-300",
  },
  clean: {
    label: "Clean",
    Icon: Zap,
    unit: "Page",
    bgFrom: "from-violet-500/10",
    bgTo: "to-violet-500/0",
    chipBg: "bg-violet-500/15",
    chipBorder: "border-violet-500/30",
    iconClass: "text-violet-600 dark:text-violet-400",
    titleClass: "text-violet-700 dark:text-violet-300",
  },
  chunk: {
    label: RAG_VOCAB.segmentShort,
    Icon: Layers,
    unit: RAG_VOCAB.segmentShort,
    bgFrom: "from-amber-500/10",
    bgTo: "to-amber-500/0",
    chipBg: "bg-amber-500/15",
    chipBorder: "border-amber-500/30",
    iconClass: "text-amber-600 dark:text-amber-400",
    titleClass: "text-amber-700 dark:text-amber-300",
  },
  embed: {
    label: "Embed",
    Icon: Stars,
    unit: "Vector",
    bgFrom: "from-emerald-500/10",
    bgTo: "to-emerald-500/0",
    chipBg: "bg-emerald-500/15",
    chipBorder: "border-emerald-500/30",
    iconClass: "text-emerald-600 dark:text-emerald-400",
    titleClass: "text-emerald-700 dark:text-emerald-300",
  },
};

// Re-export for callers that want the same metadata
export { STAGE_META };
export type { StagePreview };
