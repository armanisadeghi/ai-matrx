"use client";

import { useRouter } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusBadge } from "../shared/StatusBadge";
import { SourceTypeIcon } from "../shared/SourceTypeIcon";
import { sourceTypeFromDb, type ResearchSource } from "../../types";
import { fmtCount } from "../../format";

/**
 * Shared tabular view of sources for the casual browsing surfaces (keyword
 * home, content page). Core columns the user needs to make sense of a row:
 * rank, the source, that **Search** found it (always — that's why it's here),
 * and the actual **Scrape** outcome. Each row opens the source. The heavy
 * filter/sort/group + batch-action "work" table is a separate surface.
 */
export function SourceResultsTable({
  sources,
  topicId,
  rankFor,
  dataSizeFor,
}: {
  sources: ResearchSource[];
  topicId: string;
  /** Per-row rank to show in the # column (per-keyword rank, importance, …). */
  rankFor: (source: ResearchSource) => number | null;
  /**
   * Optional per-row scraped content size (chars). When provided, a
   * right-aligned "Data" column appears (hidden on narrow screens). Tiny sizes
   * render muted so a thin 600-char "page" stands out from a 45k one.
   */
  dataSizeFor?: (source: ResearchSource) => number | null;
}) {
  const router = useRouter();

  return (
    <div className="overflow-x-auto rounded-lg border border-border/50">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-border/40 text-[10px] uppercase tracking-wider text-muted-foreground">
            <th className="py-1.5 pl-2 pr-1 w-10 font-medium">#</th>
            <th className="py-1.5 px-1 font-medium">Source</th>
            <th className="py-1.5 px-2 font-medium whitespace-nowrap">Search</th>
            <th className="py-1.5 px-2 font-medium whitespace-nowrap">Scrape</th>
            {dataSizeFor && (
              <th className="py-1.5 px-2 font-medium text-right whitespace-nowrap hidden sm:table-cell">
                Data
              </th>
            )}
            <th className="w-7" />
          </tr>
        </thead>
        <tbody>
          {sources.map((src) => {
            const rank = rankFor(src);
            const dataSize = dataSizeFor ? dataSizeFor(src) : null;
            const go = () =>
              router.push(`/research/topics/${topicId}/sources/${src.id}`);
            return (
              <tr
                key={src.id}
                role="button"
                tabIndex={0}
                onClick={go}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    go();
                  }
                }}
                className="group border-b border-border/20 last:border-0 hover:bg-muted/40 cursor-pointer transition-colors"
              >
                <td className="py-2 pl-2 pr-1 align-top font-mono text-[11px] tabular-nums text-muted-foreground">
                  {rank != null ? `#${rank}` : "—"}
                </td>
                <td className="py-2 px-1 align-top">
                  <div className="flex items-start gap-1.5 min-w-0">
                    <SourceTypeIcon type={sourceTypeFromDb(src.source_type)} />
                    <div className="min-w-0">
                      <div className="text-xs font-medium truncate max-w-[20rem]">
                        {src.title || src.hostname || src.url}
                      </div>
                      {src.hostname && (
                        <div className="text-[10px] text-muted-foreground truncate max-w-[20rem]">
                          {src.hostname}
                        </div>
                      )}
                    </div>
                  </div>
                </td>
                <td className="py-2 px-2 align-top">
                  <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-1.5 py-px text-[10px] font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400 whitespace-nowrap">
                    <span className="h-1 w-1 rounded-full bg-green-500" />
                    Found
                  </span>
                </td>
                <td className="py-2 px-2 align-top">
                  <StatusBadge status={src.scrape_status} />
                </td>
                {dataSizeFor && (
                  <td
                    className={cn(
                      "py-2 px-2 align-top text-right font-mono text-[11px] tabular-nums whitespace-nowrap hidden sm:table-cell",
                      dataSize != null && dataSize >= 1000
                        ? "text-muted-foreground"
                        : "text-muted-foreground/50",
                    )}
                    title={
                      dataSize != null
                        ? `${dataSize.toLocaleString()} characters scraped`
                        : "No scraped content recorded"
                    }
                  >
                    {fmtCount(dataSize)}
                  </td>
                )}
                <td className="py-2 pr-2 align-top">
                  <ArrowUpRight className="h-3 w-3 text-muted-foreground/40 group-hover:text-foreground" />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
