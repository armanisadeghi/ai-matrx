"use client";

/**
 * Shell-header chrome for the /marketing/content-plan LIST page: the feature
 * title plus the active-context lens chip. The table carries its own search
 * and actions in-body (canonical entry-list shape) — the header stays quiet.
 */
import { ActiveContextLensChip } from "@/features/scopes/components/active-context/ActiveContextLensChip";
import { MandateDoorLink } from "@/features/agents/mandates/components/MandateDoorLink";

export function ContentPlanListHeader() {
  return (
    <div className="flex w-full min-w-0 items-center gap-2">
      <ActiveContextLensChip className="shrink-0" />
      {/* THE page heading for this route — the documented (core) convention
        (features/shell/components/header/variants/USAGE.md): a real <h1> in
        the header center, not a <span>. Nine review-queue rejections on this
        feature were "no semantic page heading". */}
      <h1 className="truncate text-sm font-medium text-foreground">
        Content Plan
      </h1>
      <span className="hidden text-xs text-muted-foreground sm:inline">
        Every URL a site should have — pick a site to plan it.
      </span>
      <MandateDoorLink
        feature="content_plan"
        label="Content Plan agents"
        className="ml-auto"
      />
    </div>
  );
}
