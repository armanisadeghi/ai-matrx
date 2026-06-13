/**
 * Muted footer showing historical (non-drift) usage context — "appeared in N
 * conversations", runs, etc. Lazy-loaded on first expand; counts only, never
 * drift-checked.
 */

"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, History, Loader2 } from "lucide-react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { fetchUsageHistoryCounts } from "@/features/agents/redux/usages/usages.thunks";
import type { AgentUsageHistoryCount } from "@/features/agents/redux/usages/usages.types";

const SOURCE_LABEL: Record<string, string> = {
  conversations: "Conversations",
  requests: "Runs",
  messages: "Messages",
  workflow_runs: "Workflow runs",
  research: "Research items",
  page_extractions: "Page extractions",
  context_access: "Context accesses",
  errors: "Recorded errors",
};

export function UsageHistoricalContext({ agentId }: { agentId: string }) {
  const dispatch = useAppDispatch();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [counts, setCounts] = useState<AgentUsageHistoryCount[] | null>(null);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && counts === null && !loading) {
      setLoading(true);
      try {
        const data = await dispatch(fetchUsageHistoryCounts({ agentId })).unwrap();
        setCounts(data);
      } catch {
        setCounts([]);
      } finally {
        setLoading(false);
      }
    }
  };

  const nonZero = (counts ?? []).filter((c) => c.total > 0);

  return (
    <section className="border-t border-border bg-muted/10">
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-[11px] font-medium text-muted-foreground hover:text-foreground"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <History className="h-3 w-3" aria-hidden />
        Historical usage (context only — not drift-checked)
        {loading && <Loader2 className="ml-1 h-3 w-3 animate-spin" />}
      </button>
      {open && counts !== null && (
        <div className="flex flex-wrap gap-2 px-3 pb-2.5">
          {nonZero.length === 0 ? (
            <span className="text-[11px] text-muted-foreground/70">No historical activity.</span>
          ) : (
            nonZero.map((c) => (
              <span
                key={c.source}
                className="rounded-md border border-border bg-card/60 px-2 py-1 text-[11px] text-muted-foreground"
              >
                {SOURCE_LABEL[c.source] ?? c.source}:{" "}
                <span className="font-medium text-foreground tabular-nums">{c.total.toLocaleString()}</span>
              </span>
            ))
          )}
        </div>
      )}
    </section>
  );
}
