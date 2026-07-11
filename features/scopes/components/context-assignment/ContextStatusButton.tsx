"use client";

// features/scopes/components/context-assignment/ContextStatusButton.tsx
//
// The per-entity context nudge: amber when unset, green when set. Clicking
// opens the assignment popover. Built on TapTargetButton so it sits flush in
// shell headers next to other tap buttons (zero gap / padding around it).
//
// Two appearances:
//   • glass (default) — glass pill + status-colored icon (header chrome)
//   • solid — filled amber/green pill when you want the status to pop
//
// Data: by default it reads the entity's scope assignments via the canonical
// per-entity cache (one fetch per entity, Redux-cached). List surfaces that
// already bulk-fetched should pass `knownScopeCount` to suppress the
// per-row fetch entirely (fetch discipline: N rows ≠ N requests).

import React from "react";
import {
  ShieldAlertTapButton,
  ShieldCheckTapButton,
} from "@/components/icons/tap-buttons";
import { useEntityScopes } from "@/features/scopes/hooks/useEntityScopes";
import {
  ContextAssignmentPopover,
  type ContextAssignmentPopoverProps,
} from "./ContextAssignmentPopover";
import type { ContextAssignmentSubject } from "./ContextAssignmentField";

export interface ContextStatusButtonProps extends Omit<
  ContextAssignmentPopoverProps,
  "trigger" | "subject"
> {
  subject: ContextAssignmentSubject;
  /** Provide when the host already knows (bulk fetch / FK fields) — skips the
   *  per-entity fetch. Counts as "has context" when > 0 OR hasOtherContext. */
  knownScopeCount?: number;
  /** Entity has non-scope context (e.g. a note's organization_id/project_id). */
  hasOtherContext?: boolean;
  /**
   * Tap-button appearance.
   * - `glass` (default) — shell chrome; status via icon color
   * - `solid` — filled amber (unset) / green (set) when status should pop
   */
  variant?: "glass" | "solid";
  /** Render scope-count text inside the tap pill (`None` / `N scopes`). */
  showScopeLabel?: boolean;
}

// NOTE: this component's tap geometry is FIXED (TapTargetButton's pill size
// is not configurable by design — see components/icons/TapTargetButton.tsx).
// It only fits shell-header / toolbar chrome. A spot that needs a different
// footprint (a compact metadata-list row, a 24px tab-strip icon, …) should
// NOT force it in here via a size/className override — build a small local
// trigger against `ContextAssignmentPopover` directly instead (see
// PdfStudioPagesMeta.tsx's `PdfFileContextRow` and NoteContextStatusIcon for
// the pattern). Two prior callers did exactly that and it rendered broken.

const SOLID_SET = {
  bgColor: "bg-emerald-500",
  iconColor: "text-white",
  hoverBgColor: "hover:bg-emerald-600",
} as const;

const SOLID_UNSET = {
  bgColor: "bg-amber-500",
  iconColor: "text-white",
  hoverBgColor: "hover:bg-amber-600",
} as const;

export function ContextStatusButton({
  subject,
  knownScopeCount,
  hasOtherContext = false,
  variant = "glass",
  showScopeLabel = false,
  ...popoverProps
}: ContextStatusButtonProps) {
  const skipFetch = knownScopeCount !== undefined;
  const entityScopes = useEntityScopes({
    entityType: subject.entityType,
    entityId: skipFetch ? null : subject.entityId,
  });
  const scopeCount = skipFetch ? knownScopeCount : entityScopes.scopeIds.length;
  const hasContext = (scopeCount ?? 0) > 0 || hasOtherContext;

  const scopeLabel =
    (scopeCount ?? 0) === 0
      ? "None"
      : `${scopeCount} scope${scopeCount === 1 ? "" : "s"}`;

  const ariaLabel = hasContext
    ? "Context is set — click to review or change"
    : "No context set — click to assign";

  const label = showScopeLabel ? scopeLabel : undefined;

  const solidProps = hasContext ? SOLID_SET : SOLID_UNSET;
  const glassClassName = hasContext
    ? "text-emerald-600 dark:text-emerald-400"
    : "text-amber-600 dark:text-amber-400";

  const shared = {
    ariaLabel,
    tooltip: ariaLabel,
    label,
    ...(variant === "solid" ? solidProps : { className: glassClassName }),
  } as const;

  const trigger = hasContext ? (
    <ShieldCheckTapButton variant={variant} {...shared} />
  ) : (
    <ShieldAlertTapButton variant={variant} {...shared} />
  );

  return (
    <ContextAssignmentPopover
      {...popoverProps}
      subject={subject}
      trigger={trigger}
    />
  );
}
