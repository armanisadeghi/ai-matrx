// features/education/trust/components/ConfidenceBadge.tsx
//
// The one honest-confidence chip. Consumers render <ConfidenceBadge
// confidence={item.trust?.confidence} /> — it says, at a glance, whether an AI
// output is grounded in the learner's material, inferred from it, or not in it
// at all. Nothing renders when there's no envelope (confidence is undefined).

"use client";

import { ShieldCheck, Lightbulb, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TrustConfidence } from "../types";

const CONFIG: Record<
  TrustConfidence,
  { label: string; icon: typeof ShieldCheck; className: string; title: string }
> = {
  grounded: {
    label: "Grounded",
    icon: ShieldCheck,
    className:
      "border-green-600/30 bg-green-500/10 text-green-700 dark:text-green-400",
    title: "Every claim traces to a cited passage in your material.",
  },
  inferred: {
    label: "Inferred",
    icon: Lightbulb,
    className:
      "border-blue-600/30 bg-blue-500/10 text-blue-700 dark:text-blue-400",
    title: "Reasoned from your material, but not stated there word-for-word.",
  },
  not_in_material: {
    label: "Not in your material",
    icon: AlertTriangle,
    className:
      "border-amber-600/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
    title: "This is not supported by your material.",
  },
};

export interface ConfidenceBadgeProps {
  confidence: TrustConfidence | null | undefined;
  className?: string;
  /** Hide the text label, show only the icon (dense surfaces). */
  iconOnly?: boolean;
}

export function ConfidenceBadge({
  confidence,
  className,
  iconOnly,
}: ConfidenceBadgeProps) {
  if (!confidence) return null;
  const { label, icon: Icon, className: tone, title } = CONFIG[confidence];
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-medium",
        tone,
        className,
      )}
    >
      <Icon className="h-3 w-3 shrink-0" aria-hidden />
      {!iconOnly && <span>{label}</span>}
    </span>
  );
}
