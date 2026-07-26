"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Loader2, Search } from "lucide-react";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { useKeywordResearch } from "@/features/marketing/seo/keyword-research/useKeywordResearch";
import KeywordResearchLauncher from "@/features/marketing/seo/keyword-research/components/KeywordResearchLauncher";
import {
  KeywordCompetitionBadge,
  KeywordIntentChip,
  KeywordTrendSparkline,
  formatCpc,
  formatSearchVolume,
} from "@/features/marketing/seo/keyword-research/components/KeywordMetrics";
import { normalizeMonthlySearches } from "@/features/marketing/seo/keyword-research/types";
import type {
  KeywordMarketRow,
  KeywordWithMarket,
} from "@/features/marketing/seo/keyword-research/types";

/**
 * KeywordResearchWindow — the canonical keyword research runner in a
 * floating window, openable from ANY surface via
 * `useOpenKeywordResearchWindow({ primaryKeyword, autoRun })`
 * (features/overlays/openers/keywordResearchWindow.tsx).
 *
 * Hosts the shared KeywordResearchLauncher (input → live key-by-key
 * kind-component stream → durable summary) over its own
 * `useKeywordResearch()` instance, plus a compact library explorer that
 * scopes to the run's cluster when one lands. Durable-run rejoin (the
 * hook's sessionStorage contract) works here exactly as on the page — a
 * window reopened mid-run picks the stream back up.
 */
export interface KeywordResearchWindowProps {
  isOpen: boolean;
  onClose: () => void;
  initialKeyword?: string;
  autoRun?: boolean;
}

export default function KeywordResearchWindow({
  isOpen,
  onClose,
  initialKeyword,
  autoRun,
}: KeywordResearchWindowProps) {
  if (!isOpen) return null;
  return (
    <KeywordResearchWindowInner
      onClose={onClose}
      initialKeyword={initialKeyword}
      autoRun={autoRun}
    />
  );
}

function usMarket(row: KeywordWithMarket): KeywordMarketRow | null {
  return (
    row.keyword_market.find((market) => market.location_code === 2840) ??
    row.keyword_market[0] ??
    null
  );
}

function KeywordMiniRow({ row }: { row: KeywordWithMarket }) {
  const market = usMarket(row);
  const points = normalizeMonthlySearches(market?.monthly_searches)
    .slice(0, 12)
    .reverse();
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_4rem_5rem_5.5rem_3.5rem] items-center gap-2 border-b border-border/60 px-2 py-1 text-xs">
      <div className="min-w-0">
        <span className="block truncate font-medium text-foreground">
          {row.phrase}
        </span>
        <KeywordIntentChip intentClass={row.intent_class} className="mt-0.5" />
      </div>
      <span className="text-right tabular-nums text-foreground">
        {formatSearchVolume(market?.search_volume)}
      </span>
      <KeywordTrendSparkline points={points} />
      <KeywordCompetitionBadge
        competition={market?.competition}
        competitionIndex={market?.competition_index}
      />
      <span className="text-right tabular-nums text-foreground">
        {formatCpc(market?.cpc)}
      </span>
    </div>
  );
}

function KeywordResearchWindowInner({
  onClose,
  initialKeyword,
  autoRun,
}: Omit<KeywordResearchWindowProps, "isOpen">) {
  const { clusterPhrases, keywords, loading, search, setSearch, run, runResearch } =
    useKeywordResearch();
  const [explorerOpen, setExplorerOpen] = useState(true);

  // Live keyword mirror for persistence — ref, not state: the window shell
  // must not re-render per keystroke inside the launcher.
  const keywordRef = useRef(initialKeyword ?? "");
  const handleKeywordChange = useCallback((keyword: string) => {
    keywordRef.current = keyword;
  }, []);
  const collectData = useCallback(
    (): Record<string, unknown> => ({
      primaryKeyword: keywordRef.current,
      autoRun: false, // a restored window never re-fires the research
    }),
    [],
  );

  const rows = useMemo(() => {
    const cluster = clusterPhrases ? new Set(clusterPhrases) : null;
    return keywords
      .filter((row) => !cluster || cluster.has(row.normalized_phrase))
      .sort(
        (a, b) =>
          (usMarket(b)?.search_volume ?? -1) - (usMarket(a)?.search_volume ?? -1),
      )
      .slice(0, 100);
  }, [keywords, clusterPhrases]);

  return (
    <WindowPanel
      id="keyword-research-window"
      overlayId="keywordResearchWindow"
      title="Keyword Research"
      onClose={onClose}
      width={760}
      height={720}
      minWidth={480}
      minHeight={420}
      position="center"
      urlSyncKey="keyword_research"
      onCollectData={collectData}
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden"
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="shrink-0 border-b border-border px-3 py-2.5">
          <KeywordResearchLauncher
            run={run}
            runResearch={runResearch}
            initialKeyword={initialKeyword}
            autoRun={autoRun}
            feedMaxHeightClassName="max-h-[45vh]"
            onKeywordChange={handleKeywordChange}
          />
        </div>

        {/* Compact explorer — the run's cluster when one landed, else the
            library, live-filterable. Collapsible so the stream owns the
            window during a run. */}
        <div className="flex min-h-0 flex-1 flex-col">
          <button
            type="button"
            onClick={() => setExplorerOpen((open) => !open)}
            className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground"
          >
            {explorerOpen ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
            {clusterPhrases && run.primaryKeyword
              ? `Cluster: “${run.primaryKeyword}” · ${rows.length}`
              : `Keyword library · ${rows.length}`}
          </button>
          {explorerOpen && (
            <>
              <div className="shrink-0 px-3 py-1.5">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Filter keywords"
                    className="h-8 w-full rounded-md border border-border bg-background pl-8 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    style={{ fontSize: "16px" }}
                  />
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-2">
                {loading ? (
                  <div className="flex justify-center py-6">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                ) : rows.length === 0 ? (
                  <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                    No keywords yet — research one above to seed the universe.
                  </p>
                ) : (
                  rows.map((row) => <KeywordMiniRow key={row.id} row={row} />)
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </WindowPanel>
  );
}
