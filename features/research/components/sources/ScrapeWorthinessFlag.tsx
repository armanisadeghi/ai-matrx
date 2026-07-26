"use client";

import { Ban } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { isLowScrapeWorthiness } from "../../constants";

interface ScrapeWorthinessFlagProps {
  scrapeWorthiness: number | null;
  className?: string;
}

/**
 * Compact "why wasn't this fetched" flag for sources with a confidently LOW
 * predicted `scrape_worthiness` (< 20) — paywall / login wall / JS-only shell /
 * aggregator stub. These are now silently skipped by the scraper, so without
 * this flag a source just looks stuck at "Pending" forever with no
 * explanation. Muted amber, never red — this is a prediction, not a failure.
 * Renders nothing when not assessed (null) or the score is fine — NULL is
 * "not assessed", never treated as a low score.
 */
export function ScrapeWorthinessFlag({
  scrapeWorthiness,
  className,
}: ScrapeWorthinessFlagProps) {
  if (!isLowScrapeWorthiness(scrapeWorthiness)) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/[0.06] px-1.5 py-px text-[10px] font-medium whitespace-nowrap text-amber-700 dark:text-amber-400/90",
            className,
          )}
        >
          <Ban className="h-2.5 w-2.5 shrink-0" />
          Low fetch odds
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <p className="text-xs font-semibold">
          Scrape worthiness: {Math.round(scrapeWorthiness as number)}/100
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Predicted unlikely to return usable article text (paywall, login
          wall, JS-only page, or an aggregator stub) — not a judgment on
          quality. The scraper skips sources below 20 automatically.
        </p>
      </TooltipContent>
    </Tooltip>
  );
}
