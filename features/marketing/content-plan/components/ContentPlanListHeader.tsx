"use client";

/**
 * Shell-header chrome for the /marketing/content-plan LIST page: the feature
 * title plus the active-context lens chip. The table carries its own search
 * and actions in-body (canonical entry-list shape) — the header stays quiet.
 */
import { ActiveContextLensChip } from "@/features/scopes/components/active-context/ActiveContextLensChip";

export function ContentPlanListHeader() {
  return (
    <div className="flex w-full min-w-0 items-center gap-2">
      <ActiveContextLensChip className="shrink-0" />
      <span className="truncate text-sm font-medium text-foreground">
        Content Plan
      </span>
      <span className="hidden text-xs text-muted-foreground sm:inline">
        Every URL a site should have — pick a site to plan it.
      </span>
    </div>
  );
}
