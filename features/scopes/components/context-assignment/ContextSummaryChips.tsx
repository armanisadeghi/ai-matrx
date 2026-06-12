"use client";

// features/scopes/components/context-assignment/ContextSummaryChips.tsx
//
// THE display component for a context selection — used wherever a surface
// shows "what context is set" (transcripts cleanup sidebar, chat header,
// file rows, note footers). Readability rules (product decisions):
//
//   • A scope renders as "TypeLabel: ScopeName" in the scope type's color —
//     never a bare name the user has to decode.
//   • An organization chip appears ONLY when the org is explicitly part of
//     the selection. Selecting a scope does NOT imply its organization.
//   • Nothing selected renders an honest muted "No context" (or custom text).
//
// Pure display — no fetching beyond the Redux tree (names resolve from the
// boot-loaded scope tree; project/task names resolve from the names carried
// in the selection summary input or fall back to ids).

import React from "react";
import { Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useScopeTree } from "@/features/scopes/hooks/useScopeTree";
import { resolveColor } from "@/features/scope-system/constants/scope-colors";

export interface ContextSummaryInput {
  organizationId?: string | null;
  organizationName?: string | null;
  scopeIds?: string[];
  projectId?: string | null;
  projectName?: string | null;
  taskId?: string | null;
  taskName?: string | null;
}

export interface ContextSummaryChipsProps {
  value: ContextSummaryInput;
  /** Text when nothing is set. Default "No context". */
  emptyText?: string;
  /** Compact = smaller chips for tight rows/headers. */
  size?: "sm" | "default";
  className?: string;
}

export function ContextSummaryChips({
  value,
  emptyText = "No context",
  size = "default",
  className,
}: ContextSummaryChipsProps) {
  const { organizations } = useScopeTree();
  const allTypes = organizations.flatMap((o) => o.scope_types);
  const chipCls = size === "sm" ? "px-1.5 py-0.5 text-[11px]" : "px-2 py-1 text-xs";

  const scopeChips = (value.scopeIds ?? []).map((id) => {
    const type = allTypes.find((t) => t.scopes.some((s) => s.id === id));
    const scope = type?.scopes.find((s) => s.id === id);
    const c = type ? resolveColor(type) : undefined;
    return {
      id,
      label: type && scope ? `${type.label_singular}: ${scope.name}` : id.slice(0, 8),
      fg: c?.fg,
      border: c?.border,
    };
  });

  const orgName = value.organizationId
    ? value.organizationName ?? organizations.find((o) => o.id === value.organizationId)?.name ?? "Organization"
    : null;

  const empty = !orgName && scopeChips.length === 0 && !value.projectId && !value.taskId;
  if (empty) {
    return <span className={cn("text-muted-foreground", size === "sm" ? "text-[11px]" : "text-xs", className)}>{emptyText}</span>;
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-1", className)}>
      {orgName && (
        <span className={cn("inline-flex items-center gap-1 rounded-md border border-border bg-transparent font-medium text-foreground", chipCls)}>
          <Building2 className="h-3 w-3 shrink-0 text-muted-foreground" />
          <span className="max-w-[140px] truncate">{orgName}</span>
        </span>
      )}
      {scopeChips.map((s) => (
        <span key={s.id} className={cn("inline-flex items-center rounded-md border bg-transparent font-medium", s.fg ?? "text-foreground", s.border ?? "border-border", chipCls)}>
          <span className="max-w-[160px] truncate">{s.label}</span>
        </span>
      ))}
      {value.projectId && (
        <span className={cn("inline-flex items-center rounded-md border border-border bg-transparent font-medium text-foreground", chipCls)}>
          <span className="max-w-[140px] truncate">{value.projectName ?? "Project"}</span>
        </span>
      )}
      {value.taskId && (
        <span className={cn("inline-flex items-center rounded-md border border-border bg-transparent font-medium text-foreground", chipCls)}>
          <span className="max-w-[140px] truncate">{value.taskName ?? "Task"}</span>
        </span>
      )}
    </div>
  );
}
