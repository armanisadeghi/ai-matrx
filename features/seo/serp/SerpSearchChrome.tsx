import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * SerpSearchChrome — the Google results-page chrome: the search box, the
 * All / Images / Videos / News / Maps tab row, and the "About N results" line.
 *
 * Wraps `SerpResult`(s) to make a stack of results read as a real Google
 * search-results page. Reused by the calculator page's "Search Preview" card
 * and the SEO tool-call overlay. Purely presentational.
 */

const TABS = ["All", "Images", "Videos", "News", "Maps"] as const;

export interface SerpSearchChromeProps {
  /** Text shown in the search box (usually the title being previewed). */
  query?: string;
  /** Faux results count, e.g. "About 600,000,000 results (0.54 seconds)". */
  resultsLabel?: string;
  placeholder?: string;
  className?: string;
}

export function SerpSearchChrome({
  query,
  resultsLabel = "About 600,000,000 results (0.54 seconds)",
  placeholder = "Paste your meta title to preview…",
  className,
}: SerpSearchChromeProps) {
  return (
    <div className={cn("max-w-[640px] space-y-3", className)}>
      <div className="flex items-center gap-3 rounded-full border border-border px-5 py-2.5 shadow-sm">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="flex-1 truncate text-sm text-foreground">
          {query?.trim() ? query : <span className="text-muted-foreground">{placeholder}</span>}
        </span>
      </div>
      <div className="flex gap-5 border-b border-border pb-0 text-xs">
        {TABS.map((tab, i) => (
          <span
            key={tab}
            className={cn(
              "border-b-2 pb-2.5",
              i === 0
                ? "border-primary font-medium text-primary"
                : "border-transparent text-muted-foreground",
            )}
          >
            {tab}
          </span>
        ))}
      </div>
      <p className="text-[10px] text-muted-foreground">{resultsLabel}</p>
    </div>
  );
}
