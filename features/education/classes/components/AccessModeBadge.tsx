"use client";

// features/education/classes/components/AccessModeBadge.tsx
//
// The ONE visual for a class's access mode (open | closed | paid). Reused on the
// class hub header, ClassesHome rows, and the roster panel. Lucide only, semantic
// colors. The label/copy source is ACCESS_MODES (constants.ts).

import { Globe, Lock, CreditCard, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AccessMode } from "../types";

const ICONS: Record<AccessMode, LucideIcon> = {
  open: Globe,
  closed: Lock,
  paid: CreditCard,
};

const LABELS: Record<AccessMode, string> = {
  open: "Open",
  closed: "Closed",
  paid: "Paid",
};

const TONE: Record<AccessMode, string> = {
  open: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  closed: "bg-muted text-muted-foreground",
  paid: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
};

export function AccessModeBadge({
  mode,
  className,
}: {
  mode: AccessMode;
  className?: string;
}) {
  const Icon = ICONS[mode];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
        TONE[mode],
        className,
      )}
    >
      <Icon className="h-3 w-3" />
      {LABELS[mode]}
    </span>
  );
}

export { ICONS as ACCESS_MODE_ICONS, LABELS as ACCESS_MODE_LABELS };
