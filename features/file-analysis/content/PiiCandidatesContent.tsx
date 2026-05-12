/**
 * PiiCandidatesContent — sortable list of PII pattern matches across tiers,
 * with pattern badge, masked preview (no PII echo), page + jump.
 *
 * Drives the "200 PII matches found, here they are" UX. Includes a tier
 * toggle (low / medium / high) and pattern filter.
 */

"use client";

import { useMemo, useState } from "react";
import { Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useLabelCatalog } from "@/features/file-analysis/hooks/useLabelCatalog";
import {
  allResults,
  asObject,
  type PiiCandidateSpan,
  type PiiCandidatesPayload,
} from "./utils";
import type { FileAnalysisResultRow } from "@/features/file-analysis/api/file-analysis";

interface Props {
  results: FileAnalysisResultRow[];
  onJumpToPage?: (pageNumber: number) => void;
  initialTier?: "low" | "medium" | "high";
}

export function PiiCandidatesContent({ results, onJumpToPage, initialTier = "medium" }: Props) {
  const [tier, setTier] = useState<"low" | "medium" | "high">(initialTier);
  const [patternFilter, setPatternFilter] = useState<string | null>(null);
  const { byId } = useLabelCatalog();

  const allRows = allResults(results, "redaction_candidates");
  const row = allRows.find((r) => r.confidence_tier === tier) ?? allRows[0];
  const spans: PiiCandidateSpan[] = useMemo(() => {
    const payload = asObject<PiiCandidatesPayload>(row?.payload);
    return payload?.spans ?? [];
  }, [row]);

  const patternCounts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const s of spans) {
      out[s.pattern_id] = (out[s.pattern_id] ?? 0) + 1;
    }
    return out;
  }, [spans]);

  const visibleSpans = useMemo(() => {
    if (!patternFilter) return spans;
    return spans.filter((s) => s.pattern_id === patternFilter);
  }, [spans, patternFilter]);

  if (!allRows.length) {
    return (
      <EmptyHint message="PII candidate detection hasn't finished yet." />
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-card/40 px-3 py-2">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Tier
        </span>
        {(["low", "medium", "high"] as const).map((t) => {
          const trow = allRows.find((r) => r.confidence_tier === t);
          const count =
            ((asObject<PiiCandidatesPayload>(trow?.payload))?.spans ?? []).length;
          return (
            <button
              key={t}
              type="button"
              onClick={() => setTier(t)}
              className={cn(
                "rounded-full border px-2 py-0.5 text-[10px] capitalize transition-colors",
                tier === t
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:bg-accent",
              )}
            >
              {t} · {count}
            </button>
          );
        })}
        <div className="ml-auto flex items-center gap-1">
          <Filter className="h-3 w-3 text-muted-foreground" />
          <select
            value={patternFilter ?? ""}
            onChange={(e) => setPatternFilter(e.target.value || null)}
            className="h-7 rounded border border-border bg-background px-1.5 text-[10px]"
          >
            <option value="">All patterns ({spans.length})</option>
            {Object.entries(patternCounts)
              .sort(([, a], [, b]) => b - a)
              .map(([pid, n]) => {
                const meta = byId.get(pid);
                return (
                  <option key={pid} value={pid}>
                    {meta?.display_name ?? pid} ({n})
                  </option>
                );
              })}
          </select>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {!visibleSpans.length ? (
          <div className="px-3 py-6 text-center text-xs text-muted-foreground">
            No matches at the <strong>{tier}</strong> tier{" "}
            {patternFilter ? `for ${patternFilter}` : ""}. Try a lower tier or a
            different pattern.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {visibleSpans.slice(0, 500).map((s, idx) => {
              const meta = byId.get(s.pattern_id);
              return (
                <li
                  key={`${s.pattern_id}-${s.page_number}-${idx}`}
                  className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-accent/30"
                >
                  <span className="rounded bg-muted px-1.5 py-px text-[9px] uppercase tracking-wider text-muted-foreground">
                    {meta?.display_name ?? s.pattern_id}
                  </span>
                  <span className="font-mono text-[11px]">
                    {s.masked_preview}
                  </span>
                  {!s.validator_passed ? (
                    <span className="rounded bg-amber-500/15 px-1 py-px text-[9px] uppercase text-amber-700 dark:text-amber-300">
                      heuristic
                    </span>
                  ) : null}
                  <span className="ml-auto rounded bg-muted px-1 py-px text-[9px] uppercase tracking-wider text-muted-foreground">
                    p{s.page_number}
                  </span>
                  {onJumpToPage ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onJumpToPage(s.page_number)}
                      className="h-6 text-[10px]"
                    >
                      Open
                    </Button>
                  ) : null}
                </li>
              );
            })}
            {visibleSpans.length > 500 ? (
              <li className="px-3 py-2 text-center text-[10px] italic text-muted-foreground">
                Showing first 500 of {visibleSpans.length} matches. Filter by
                pattern to narrow.
              </li>
            ) : null}
          </ul>
        )}
      </div>
    </div>
  );
}

function EmptyHint({ message }: { message: string }) {
  return (
    <div className="px-3 py-6 text-center text-xs text-muted-foreground">
      {message}
    </div>
  );
}
