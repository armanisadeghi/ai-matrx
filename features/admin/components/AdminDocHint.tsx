"use client";

/**
 * AdminDocHint — an admin-only pointer from the UI to the doc that owns a
 * planned feature.
 *
 * Arman's pattern (2026-08-24, on the design-vision placeholder): when a
 * surface carries a Coming Soon, a SYSTEM ADMIN hovering it should see exactly
 * where the plan lives — "common-docs, blah blah" — so he can jump from the
 * live UI to the truth without asking anyone. Non-admins see nothing at all:
 * the component renders null unless the session is super-admin.
 *
 * Reusable anywhere: pass the doc path (repo-rooted, e.g.
 * `common-docs/projects/content-engine/STATE.md §4.3.3`) and optionally a one
 * line note. Renders a small book icon with a hover tooltip carrying the path
 * in monospace.
 */
import { BookOpen } from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsSuperAdmin } from "@/lib/redux/selectors/userSelectors";
import { cn } from "@/lib/utils";

export function AdminDocHint({
  docPath,
  note,
  className,
}: {
  /** Where the plan/vision for this surface lives, repo-rooted. */
  docPath: string;
  /** Optional one-liner of what the doc holds. */
  note?: string;
  className?: string;
}) {
  const isSuperAdmin = useAppSelector(selectIsSuperAdmin);
  if (!isSuperAdmin) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "inline-flex cursor-help items-center text-muted-foreground/70",
            className,
          )}
          aria-label={`Admin: plan lives at ${docPath}`}
        >
          <BookOpen className="h-3 w-3" aria-hidden />
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-sm space-y-1">
        <p className="text-[11px] font-medium text-popover-foreground">
          Admin only — where this is planned
        </p>
        <p className="font-mono text-[11px] text-muted-foreground">{docPath}</p>
        {note ? <p className="text-[11px] text-muted-foreground">{note}</p> : null}
      </TooltipContent>
    </Tooltip>
  );
}
