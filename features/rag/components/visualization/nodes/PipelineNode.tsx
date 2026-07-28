"use client";

/**
 * PipelineNode — used for every step in both the READ and WRITE paths.
 *
 * Two visual variants ("read" | "write") drive the accent color so the user
 * can see, at a glance, which side of the pipeline they're looking at:
 *
 *   read   → violet  (the user's question, classification, agent, query embed)
 *   write  → cyan    (file → cloud → raw → clean → chunks → embeddings)
 *
 * The `active` flag is driven by the orchestrator and lights up the node
 * with a glow ring + scale bump when the data is "passing through" it.
 */

import { memo } from "react";
// eslint-disable-next-line no-restricted-syntax -- inside the RagFlowVisualization/IngestFlowAnimation dynamic(ssr:false) front-door gate; React Flow stays STATIC in-gate per the code-splitting skill (rule 3).
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { motion } from "motion/react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export type PipelineNodeVariant = "read" | "write";

export interface PipelineNodeData extends Record<string, unknown> {
  variant: PipelineNodeVariant;
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  /** True when the data is currently passing through this node. Visually beats `complete`. */
  active?: boolean;
  /** True after the data has finished passing through. Shows a check icon + emerald tint. */
  complete?: boolean;
  /** Compact rendering — smaller padding, no subtitle, used for embedded/in-tab UIs. */
  compact?: boolean;
  /** Hide the source handle (e.g. for the bottom-most node that connects to data store via custom edge) */
  hideSource?: boolean;
  hideTarget?: boolean;
}

const VARIANT_STYLES: Record<
  PipelineNodeVariant,
  {
    idleBorder: string;
    activeBorder: string;
    iconBg: string;
    iconColor: string;
    glow: string;
  }
> = {
  read: {
    idleBorder: "border-violet-500/20",
    activeBorder: "border-violet-400/80",
    iconBg: "bg-violet-500/10",
    iconColor: "text-violet-500 dark:text-violet-400",
    glow: "shadow-[0_0_24px_-4px_rgb(139_92_246_/_0.55)]",
  },
  write: {
    idleBorder: "border-cyan-500/20",
    activeBorder: "border-cyan-400/80",
    iconBg: "bg-cyan-500/10",
    iconColor: "text-cyan-500 dark:text-cyan-400",
    glow: "shadow-[0_0_24px_-4px_rgb(34_211_238_/_0.55)]",
  },
};

function PipelineNodeImpl({ data }: NodeProps) {
  const d = data as PipelineNodeData;
  const Icon = d.icon;
  const variant = d.variant;
  const styles = VARIANT_STYLES[variant];
  const compact = !!d.compact;

  // active beats complete; complete beats idle
  const stateMode: "active" | "complete" | "idle" = d.active
    ? "active"
    : d.complete
      ? "complete"
      : "idle";

  const borderClass =
    stateMode === "active"
      ? styles.activeBorder
      : stateMode === "complete"
        ? "border-emerald-500/55"
        : styles.idleBorder;

  const glowClass =
    stateMode === "active"
      ? styles.glow
      : stateMode === "complete"
        ? "shadow-[0_0_14px_-6px_rgb(52_211_153_/_0.5)]"
        : "";

  return (
    <motion.div
      animate={{ scale: stateMode === "active" ? 1.04 : 1 }}
      transition={{ type: "spring", stiffness: 280, damping: 22 }}
      className={cn(
        "relative flex items-center gap-3 rounded-xl border bg-card/80 backdrop-blur",
        compact ? "px-2.5 py-2 min-w-[180px]" : "px-3.5 py-2.5 min-w-[200px]",
        "transition-[border-color,box-shadow] duration-300",
        borderClass,
        glowClass,
      )}
    >
      {!d.hideTarget && (
        <Handle
          type="target"
          position={Position.Top}
          className="!w-1 !h-1 !min-w-1 !min-h-1 !border-0 !bg-transparent"
          style={{ top: 0 }}
        />
      )}

      <div
        className={cn(
          "relative flex items-center justify-center rounded-lg shrink-0",
          compact ? "h-7 w-7" : "h-9 w-9",
          stateMode === "complete"
            ? "bg-emerald-500/10 text-emerald-500 dark:text-emerald-400"
            : `${styles.iconBg} ${styles.iconColor}`,
        )}
      >
        {stateMode === "complete" ? (
          <Check
            className={compact ? "h-3.5 w-3.5" : "h-4 w-4"}
            strokeWidth={2.4}
          />
        ) : (
          <Icon
            className={compact ? "h-3.5 w-3.5" : "h-4.5 w-4.5"}
            strokeWidth={2}
          />
        )}
      </div>

      <div className="flex min-w-0 flex-col gap-0.5 leading-tight">
        <span
          className={cn(
            "font-medium text-foreground truncate",
            compact ? "text-[12.5px]" : "text-sm",
          )}
        >
          {d.title}
        </span>
        {d.subtitle && !compact && (
          <span className="text-[10.5px] text-muted-foreground tracking-wide uppercase">
            {d.subtitle}
          </span>
        )}
      </div>

      {!d.hideSource && (
        <Handle
          type="source"
          position={Position.Bottom}
          className="!w-1 !h-1 !min-w-1 !min-h-1 !border-0 !bg-transparent"
          style={{ bottom: 0 }}
        />
      )}
    </motion.div>
  );
}

export const PipelineNode = memo(PipelineNodeImpl);
