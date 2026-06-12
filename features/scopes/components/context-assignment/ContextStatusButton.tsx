"use client";

// features/scopes/components/context-assignment/ContextStatusButton.tsx
//
// The per-entity context nudge: a small icon button that is AMBER (caution)
// when the entity has no context and GREEN (set) when it does. Clicking opens
// the assignment popover for that entity. Drop it on note tabs, file rows,
// preview headers — anywhere an entity's context status must be visible at a
// glance without being subtle.
//
// Data: by default it reads the entity's scope assignments via the canonical
// per-entity cache (one fetch per entity, Redux-cached). List surfaces that
// already bulk-fetched should pass `knownScopeCount` to suppress the
// per-row fetch entirely (fetch discipline: N rows ≠ N requests).

import React from "react";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEntityScopes } from "@/features/scopes/hooks/useEntityScopes";
import {
  ContextAssignmentPopover,
  type ContextAssignmentPopoverProps,
} from "./ContextAssignmentPopover";
import type { ContextAssignmentSubject } from "./ContextAssignmentField";

export interface ContextStatusButtonProps
  extends Omit<ContextAssignmentPopoverProps, "trigger" | "subject"> {
  subject: ContextAssignmentSubject;
  /** Provide when the host already knows (bulk fetch / FK fields) — skips the
   *  per-entity fetch. Counts as "has context" when > 0 OR hasOtherContext. */
  knownScopeCount?: number;
  /** Entity has non-scope context (e.g. a note's organization_id/project_id). */
  hasOtherContext?: boolean;
  size?: "xs" | "sm";
  buttonClassName?: string;
}

export function ContextStatusButton({
  subject,
  knownScopeCount,
  hasOtherContext = false,
  size = "sm",
  buttonClassName,
  ...popoverProps
}: ContextStatusButtonProps) {
  const skipFetch = knownScopeCount !== undefined;
  const entityScopes = useEntityScopes({
    entityType: subject.entityType,
    entityId: skipFetch ? null : subject.entityId,
  });
  const scopeCount = skipFetch ? knownScopeCount : entityScopes.scopeIds.length;
  const hasContext = (scopeCount ?? 0) > 0 || hasOtherContext;

  const iconCls = size === "xs" ? "h-3.5 w-3.5" : "h-4 w-4";

  return (
    <ContextAssignmentPopover
      {...popoverProps}
      subject={subject}
      trigger={
        <button
          type="button"
          title={hasContext ? "Context is set — click to review or change" : "No context set — click to assign"}
          className={cn(
            "inline-flex shrink-0 items-center justify-center rounded p-0.5 transition-colors",
            hasContext
              ? "text-emerald-600 hover:bg-emerald-100 dark:text-emerald-400 dark:hover:bg-emerald-950/50"
              : "text-amber-500 hover:bg-amber-100 dark:text-amber-400 dark:hover:bg-amber-950/50",
            buttonClassName,
          )}
        >
          {hasContext ? <ShieldCheck className={iconCls} /> : <ShieldAlert className={iconCls} />}
        </button>
      }
    />
  );
}
