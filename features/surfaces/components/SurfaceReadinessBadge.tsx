"use client";

import { Badge } from "@/components/ui/badge";
import {
  readinessBucketOf,
  type SurfaceReadinessBucket,
} from "@/features/surfaces/services/surfaces.service";
import type { UiSurfaceRow } from "@/features/surfaces/services/surfaces.service";

/**
 * Presentation config for each readiness bucket. Semantic-token accents via
 * the outline badge variant — the same emerald/amber treatment the repo
 * already uses for status accents (e.g. Installations, SurfacesListColumn).
 */
export const READINESS_META: Record<
  SurfaceReadinessBucket,
  {
    label: string;
    className: string;
    iconClassName: string;
    description: string;
  }
> = {
  verified: {
    label: "verified",
    className:
      "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    iconClassName: "text-emerald-600 dark:text-emerald-400",
    description: "Verified correct and complete",
  },
  partial: {
    label: "partial",
    className:
      "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400",
    iconClassName: "text-amber-600 dark:text-amber-400",
    description: "Partially done — known gaps remain",
  },
  stub: {
    label: "stub",
    className: "text-muted-foreground",
    iconClassName: "text-muted-foreground",
    description: "Stub — declared but not built out",
  },
  unregistered: {
    label: "unregistered",
    className: "border-destructive/40 bg-destructive/5 text-destructive",
    iconClassName: "text-destructive",
    description: "No code manifest declares this surface",
  },
};

/**
 * Compact readiness badge for a ui_surface row. `readiness_note` (when set)
 * becomes the hover title; otherwise the bucket's generic description.
 */
export function SurfaceReadinessBadge({
  row,
  className,
}: {
  row: Pick<UiSurfaceRow, "readiness" | "readiness_note">;
  className?: string;
}) {
  const bucket = readinessBucketOf(row);
  const meta = READINESS_META[bucket];
  return (
    <Badge
      variant="outline"
      className={`text-[10px] ${meta.className} ${className ?? ""}`}
      title={row.readiness_note ?? meta.description}
    >
      {meta.label}
    </Badge>
  );
}
