"use client";

/**
 * COVERAGE AUDIT — the pipeline's persisted "did we actually GET what the
 * intent needs?" verdict, surfaced on the topic overview (wave 4, D6: the
 * audit was write-only — persisted to `rs_topic.metadata.coverage_audit` and
 * streamed once, with no surface ever reading it back).
 *
 * The audit BODY renders through the registered `research_coverage_audit`
 * kind component via `KindInstanceRender` (a pure builder mirrors the
 * persisted JSON into the kind value — `coverage-values.ts`). The action rail
 * below it is bespoke: each gap's `suggested_queries` become one-click
 * "Add as keyword" actions wired into the topic's quota-gated add-keyword
 * flow — the exact recovery the server performs automatically on `auto`
 * topics (research/recovery.py); here it is the user's click, which is what
 * semi/manual autonomy means.
 */

import { useMemo, useState } from "react";
import { Check, Loader2, Plus, ScanSearch } from "lucide-react";
import { cn } from "@/lib/utils";
import KindInstanceRender from "@/features/content-ir/studio/components/KindInstanceRender";
import {
  RESEARCH_COVERAGE_AUDIT_KIND,
  coverageAuditValue,
  parseCoverageAudit,
  type CoverageGapSeverity,
} from "./coverage-values";

const SEVERITY_STYLES: Record<CoverageGapSeverity, string> = {
  critical:
    "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30",
  important:
    "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30",
  minor:
    "bg-muted/60 text-muted-foreground border-border/60",
};

export function CoverageAuditCard({
  metadata,
  onAddKeyword,
  disabled,
}: {
  /** The topic's raw `metadata` JSON — the card parses defensively and
   *  renders nothing when no usable audit is stored. */
  metadata: unknown;
  /** Quota-gated add-keyword flow (the topic page's own — never a second
   *  insert path). May open the quota dialog instead of adding. */
  onAddKeyword: (keyword: string) => Promise<void>;
  /** True while a run streams or an add is already in flight upstream. */
  disabled?: boolean;
}) {
  const audit = useMemo(() => parseCoverageAudit(metadata), [metadata]);
  const value = useMemo(
    () => (audit ? coverageAuditValue(audit) : null),
    [audit],
  );
  const [pending, setPending] = useState<string | null>(null);
  const [added, setAdded] = useState<ReadonlySet<string>>(new Set());

  if (!audit || !value) return null;

  const add = async (query: string) => {
    if (pending !== null) return;
    setPending(query);
    try {
      await onAddKeyword(query);
      setAdded((prev) => new Set(prev).add(query));
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="rounded-xl border border-border/60 bg-card/60 backdrop-blur-sm overflow-hidden">
      <div className="flex items-start gap-2 px-3 py-2.5 border-b border-border/50">
        <ScanSearch className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
        <div className="min-w-0">
          <div className="text-xs font-medium text-foreground">
            Coverage audit
          </div>
          <div className="text-[11px] text-muted-foreground">
            After reading, the pipeline judges whether the captured evidence
            covers what this research needs — and names what is missing.
          </div>
        </div>
      </div>

      {/* The canonical kind render — the same component this audit gets
          anywhere else it appears as a `__kind` block. */}
      <div className="p-3">
        <KindInstanceRender
          kind={RESEARCH_COVERAGE_AUDIT_KIND}
          value={value}
          variant="bare"
          showRoutingNote={false}
        />
      </div>

      {/* Bespoke action rail — the promised per-gap recovery click. */}
      {audit.gaps.length > 0 && (
        <div className="border-t border-border/50 px-3 py-2.5 space-y-2">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Close the gaps — add a suggested search as a keyword
          </div>
          {audit.gaps.map((gap, i) => (
            <div key={i} className="space-y-1">
              <div className="flex items-center gap-1.5 min-w-0">
                <span
                  className={cn(
                    "shrink-0 rounded border px-1 py-px text-[9px] font-medium uppercase",
                    SEVERITY_STYLES[gap.severity],
                  )}
                >
                  {gap.severity}
                </span>
                <span className="truncate text-[11px] text-foreground/85">
                  {gap.missing}
                </span>
              </div>
              {gap.suggested_queries.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pl-1">
                  {gap.suggested_queries.map((query) => {
                    const isAdded = added.has(query);
                    const isPending = pending === query;
                    return (
                      <button
                        key={query}
                        type="button"
                        disabled={disabled || isAdded || pending !== null}
                        onClick={() => void add(query)}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition-colors",
                          isAdded
                            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                            : "border-border/60 bg-background/40 text-foreground/80 hover:bg-accent/50 disabled:opacity-50",
                        )}
                        title={
                          isAdded
                            ? "Added to this topic's keywords"
                            : "Add as keyword"
                        }
                      >
                        {isPending ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : isAdded ? (
                          <Check className="h-3 w-3" />
                        ) : (
                          <Plus className="h-3 w-3" />
                        )}
                        <span className="max-w-64 truncate">{query}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
