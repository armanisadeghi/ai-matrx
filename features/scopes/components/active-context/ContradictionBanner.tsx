// features/scopes/components/active-context/ContradictionBanner.tsx
//
// Non-blocking warning shown when global active scopes contradict local
// entity-tagged scopes for the SAME scope_type_id. Renders nothing when
// there are no contradictions. The signal is "the user is doing something
// odd — 95% of their agents will misfire" (see features/scopes/FEATURE.md
// §"Contradiction warnings").
//
// This component is a pure presenter. The caller decides which local-context
// source feeds it (a note's tags, a task's tags, the picker UX, etc.) and
// uses `makeSelectResolvedContext()` to compute the contradictions.

"use client";

import { AlertTriangle, X } from "lucide-react";
import type { ScopeContradiction } from "@/features/scopes/types";

interface ContradictionBannerProps {
  contradictions: ScopeContradiction[];
  /** Resolves a scope_id to its display name. Caller supplies a memoized lookup. */
  scopeNameById: (scopeId: string) => string | null;
  /** Resolves a scope_type_id to its singular label (Client, Department, …). */
  scopeTypeLabelById: (scopeTypeId: string) => string | null;
  /** Optional dismiss handler — when omitted the X button is hidden. */
  onDismiss?: () => void;
  /** Optional click handler on a row — e.g., to open the global picker. */
  onClickResolve?: () => void;
  className?: string;
}

export function ContradictionBanner({
  contradictions,
  scopeNameById,
  scopeTypeLabelById,
  onDismiss,
  onClickResolve,
  className,
}: ContradictionBannerProps) {
  if (contradictions.length === 0) return null;

  return (
    <div
      role="alert"
      className={
        "rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning-foreground " +
        (className ?? "")
      }
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-warning" />
        <div className="flex-1 space-y-1">
          <div className="font-medium">
            Scope contradiction — local context wins for this action
          </div>
          <ul className="space-y-0.5 text-muted-foreground">
            {contradictions.map((c) => {
              const typeLabel =
                scopeTypeLabelById(c.scope_type_id) ?? "scope type";
              const globalName =
                scopeNameById(c.global_scope_id) ?? c.global_scope_id;
              const localName =
                scopeNameById(c.local_scope_id) ?? c.local_scope_id;
              return (
                <li key={c.scope_type_id}>
                  <span className="text-foreground">{typeLabel}:</span> global{" "}
                  <span className="font-medium">{globalName}</span> ≠ local{" "}
                  <span className="font-medium">{localName}</span>
                </li>
              );
            })}
          </ul>
          {onClickResolve && (
            <button
              onClick={onClickResolve}
              className="text-[11px] underline-offset-2 hover:underline text-warning"
            >
              Open active-scope picker
            </button>
          )}
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
            aria-label="Dismiss"
            className="text-muted-foreground/60 hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}

export type { ContradictionBannerProps };
