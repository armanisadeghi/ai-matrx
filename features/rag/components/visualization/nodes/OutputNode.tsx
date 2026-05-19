"use client";

/**
 * OutputNode — the final "Agent completes task" node.
 *
 * Sits below the data store. When active, gets a celebratory glow.
 */

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { motion } from "motion/react";
import { Zap } from "lucide-react";
import { cn } from "@/lib/utils";

export interface OutputNodeData extends Record<string, unknown> {
  active?: boolean;
}

function OutputNodeImpl({ data }: NodeProps) {
  const d = data as OutputNodeData;

  return (
    <motion.div
      animate={{
        scale: d.active ? 1.05 : 1,
      }}
      transition={{ type: "spring", stiffness: 240, damping: 22 }}
      className={cn(
        "relative flex items-center gap-3 rounded-xl border-2 px-4 py-3 min-w-[240px]",
        "bg-gradient-to-r from-emerald-500/5 via-background to-emerald-500/5",
        "transition-[border-color,box-shadow] duration-300",
        d.active
          ? "border-emerald-400/80 shadow-[0_0_28px_-4px_rgb(52_211_153_/_0.6)]"
          : "border-emerald-500/25",
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!w-1 !h-1 !min-w-1 !min-h-1 !border-0 !bg-transparent"
        style={{ top: 0 }}
      />

      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500 dark:text-emerald-400">
        <Zap className="h-5 w-5" strokeWidth={2} />
      </div>

      <div className="flex flex-col gap-0.5 leading-tight">
        <span className="text-sm font-semibold text-foreground">
          Agent completes task
        </span>
        <span className="text-[10.5px] text-muted-foreground tracking-wide uppercase">
          grounded in retrieved context
        </span>
      </div>
    </motion.div>
  );
}

export const OutputNode = memo(OutputNodeImpl);
