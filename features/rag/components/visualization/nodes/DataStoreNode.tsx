"use client";

/**
 * DataStoreNode — the centerpiece where both paths converge.
 *
 * Visualized as a stacked "vector index" — three layered discs with a
 * gradient backplate. When `active` is true (i.e. data is flowing in or
 * out) it pulses dramatically; otherwise it has a subtle ambient pulse
 * so the user always knows it's the heart of the system.
 *
 * Two top handles (left + right) accept the converging read/write edges,
 * and a single bottom handle emits the retrieved top-K chunks.
 */

import { memo } from "react";
// eslint-disable-next-line no-restricted-syntax -- inside the RagFlowVisualization/IngestFlowAnimation dynamic(ssr:false) front-door gate; React Flow stays STATIC in-gate per the code-splitting skill (rule 3).
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { motion } from "motion/react";
import { Database } from "lucide-react";
import { cn } from "@/lib/utils";

export interface DataStoreNodeData extends Record<string, unknown> {
  active?: boolean;
  ingesting?: boolean;
  querying?: boolean;
  /** Slimmer body (smaller padding, smaller stacked discs). Independent of handle layout. */
  compact?: boolean;
  /**
   * Use a single centered top handle (id="in") instead of the dual
   * read/write handles. For surfaces that only have one input flow.
   */
  singleTopHandle?: boolean;
  /** All work done — locks into a steady emerald-tinted "indexed" state. */
  done?: boolean;
}

function DataStoreNodeImpl({ data }: NodeProps) {
  const d = data as DataStoreNodeData;
  const isActive = d.active || d.ingesting || d.querying;
  const isDone = !!d.done && !isActive;
  const compact = !!d.compact;
  const singleHandle = !!d.singleTopHandle;

  return (
    <motion.div
      animate={{
        scale: isActive ? 1.05 : 1,
      }}
      transition={{ type: "spring", stiffness: 220, damping: 24 }}
      className="relative"
    >
      {singleHandle ? (
        <Handle
          id="in"
          type="target"
          position={Position.Top}
          className="!w-1 !h-1 !min-w-1 !min-h-1 !border-0 !bg-transparent"
          style={{ top: 0 }}
        />
      ) : (
        <>
          {/* Two top handles for the converging paths */}
          <Handle
            id="in-read"
            type="target"
            position={Position.Top}
            className="!w-1 !h-1 !min-w-1 !min-h-1 !border-0 !bg-transparent"
            style={{ top: 0, left: "30%" }}
          />
          <Handle
            id="in-write"
            type="target"
            position={Position.Top}
            className="!w-1 !h-1 !min-w-1 !min-h-1 !border-0 !bg-transparent"
            style={{ top: 0, left: "70%" }}
          />
        </>
      )}

      {/* Outer ambient glow — pulses softly even when idle */}
      <motion.div
        aria-hidden
        className={cn(
          "absolute inset-0 -m-4 rounded-[28px] blur-2xl",
          isDone
            ? "bg-gradient-to-br from-emerald-500/30 via-emerald-400/20 to-cyan-500/20"
            : "bg-gradient-to-br from-violet-500/30 via-fuchsia-500/20 to-cyan-500/30",
        )}
        animate={{
          opacity: isActive
            ? [0.7, 1, 0.7]
            : isDone
              ? [0.4, 0.55, 0.4]
              : [0.25, 0.4, 0.25],
          scale: isActive ? [1, 1.08, 1] : [1, 1.03, 1],
        }}
        transition={{
          duration: isActive ? 1.4 : 3.2,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />

      {/* Body */}
      <div
        className={cn(
          "relative flex flex-col items-center justify-center gap-2",
          "rounded-2xl border-2 transition-colors duration-300",
          compact ? "px-5 py-3.5 min-w-[200px]" : "px-7 py-5 min-w-[260px]",
          isDone
            ? "bg-gradient-to-br from-background via-background to-emerald-500/5"
            : "bg-gradient-to-br from-background via-background to-violet-500/5",
          isActive
            ? "border-fuchsia-400/80 shadow-[0_0_50px_-8px_rgb(217_70_239_/_0.65)]"
            : isDone
              ? "border-emerald-400/70 shadow-[0_0_30px_-8px_rgb(52_211_153_/_0.55)]"
              : "border-fuchsia-500/30 shadow-[0_0_30px_-10px_rgb(217_70_239_/_0.4)]",
        )}
      >
        {/* Stacked vector layers */}
        <div className={cn("relative", compact ? "h-9 w-24" : "h-12 w-32")}>
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              aria-hidden
              className={cn(
                "absolute inset-x-0 rounded-full",
                compact ? "h-2" : "h-3",
                isDone
                  ? "bg-gradient-to-r from-emerald-500/75 via-emerald-400/75 to-cyan-500/65"
                  : "bg-gradient-to-r from-violet-500/70 via-fuchsia-500/70 to-cyan-500/70",
              )}
              style={{ top: i * (compact ? 11 : 15) }}
              animate={{
                opacity: isActive ? [0.5, 1, 0.5] : [0.35, 0.6, 0.35],
                scaleX: isActive ? [0.92, 1, 0.92] : [0.95, 1, 0.95],
              }}
              transition={{
                duration: 1.6,
                repeat: Infinity,
                ease: "easeInOut",
                delay: i * 0.18,
              }}
            />
          ))}
          <Database
            className={cn(
              "absolute inset-0 m-auto text-foreground/85",
              compact ? "h-4 w-4" : "h-6 w-6",
            )}
            strokeWidth={1.6}
          />
        </div>

        <div className="flex flex-col items-center gap-0.5">
          <span
            className={cn(
              "font-bold tracking-[0.2em] text-foreground/85 uppercase",
              compact ? "text-[10px]" : "text-[11px]",
            )}
          >
            Data Store
          </span>
          <span
            className={cn(
              "text-muted-foreground tracking-wide",
              compact ? "text-[9px]" : "text-[10px]",
            )}
          >
            {isDone ? "indexed" : "vector index"}
          </span>
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-1 !h-1 !min-w-1 !min-h-1 !border-0 !bg-transparent"
        style={{ bottom: 0 }}
      />
    </motion.div>
  );
}

export const DataStoreNode = memo(DataStoreNodeImpl);
