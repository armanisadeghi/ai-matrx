"use client";

import { useState, useMemo } from "react";
import { CheckCircle, AlertTriangle, FileText, Filter, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { SerpResult } from "@/features/seo/serp/SerpResult";
import { SerpSearchChrome } from "@/features/seo/serp/SerpSearchChrome";
import {
  SerpFieldBars,
  type SerpFieldMetrics,
} from "@/features/seo/serp/SerpValidation";
import { TITLE_LIMITS, DESCRIPTION_LIMITS } from "@/features/seo/serp/metrics";
import type { SerpEntry } from "@/features/seo/serp/types";

/**
 * Shared overlay renderer for every SEO meta check — the agent's results
 * staged as a real Google search-results page: search chrome on top, then a
 * stack of full-size simulated results, each with its pixel/character
 * validation underneath. Pass/fail filter mirrors the inline summary.
 *
 * The universal ToolGroupTab header supplies the title + passed/failed stats
 * (via getHeaderExtras in the registry), so this body renders no header.
 */

function entryTitleField(entry: SerpEntry): SerpFieldMetrics | null {
  if (entry.title === undefined) return null;
  return {
    label: "Title tag",
    chars: entry.titleChars ?? 0,
    charLimit: TITLE_LIMITS.maxChars,
    pixels: entry.titlePixels ?? 0,
    pixelLimit: TITLE_LIMITS.displayPx,
    ok: entry.titleOk ?? false,
    desktopOk: entry.titleDesktopOk,
    mobileOk: entry.titleMobileOk,
  };
}

function entryDescriptionField(entry: SerpEntry): SerpFieldMetrics | null {
  if (entry.description === undefined) return null;
  return {
    label: "Meta description",
    chars: entry.descriptionChars ?? 0,
    charLimit: DESCRIPTION_LIMITS.maxChars,
    pixels: entry.descriptionPixels ?? 0,
    pixelLimit: DESCRIPTION_LIMITS.displayPx,
    ok: entry.descriptionOk ?? false,
    desktopOk: entry.descriptionDesktopOk,
    mobileOk: entry.descriptionMobileOk,
  };
}

export interface SerpToolOverlayProps {
  entries: SerpEntry[];
  /** Singular, lowercase noun for this check, e.g. "meta tag" / "title". */
  noun: string;
  titlePlaceholder?: string | null;
  descriptionPlaceholder?: string | null;
}

type FilterStatus = "all" | "passed" | "failed";

export function SerpToolOverlay({
  entries,
  noun,
  titlePlaceholder,
  descriptionPlaceholder,
}: SerpToolOverlayProps) {
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");

  const passedCount = useMemo(
    () => entries.filter((e) => e.overallOk).length,
    [entries],
  );
  const failedCount = entries.length - passedCount;

  const filtered = useMemo(() => {
    if (filterStatus === "passed") return entries.filter((e) => e.overallOk);
    if (filterStatus === "failed") return entries.filter((e) => !e.overallOk);
    return entries;
  }, [entries, filterStatus]);

  if (!entries.length) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        No SEO data available
      </div>
    );
  }

  const checksTitle = entries.some((e) => e.title !== undefined);
  const checksDescription = entries.some((e) => e.description !== undefined);

  return (
    <div className="h-full w-full overflow-y-auto bg-muted/30 p-4">
      {/* Best-practices info — limits from the shared source of truth */}
      <div className="mb-4 rounded-lg border border-border bg-card p-4">
        <div className="flex items-start gap-2">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div className="text-sm text-foreground">
            <p className="mb-1 font-semibold">SEO best practices</p>
            <ul className="space-y-1 text-xs text-muted-foreground">
              {checksTitle ? (
                <li>
                  <strong className="text-foreground">Title:</strong> ≤
                  {TITLE_LIMITS.maxChars} characters · ≤{TITLE_LIMITS.desktopPx}px
                  desktop · ≤{TITLE_LIMITS.mobilePx}px mobile
                </li>
              ) : null}
              {checksDescription ? (
                <li>
                  <strong className="text-foreground">Description:</strong> ≤
                  {DESCRIPTION_LIMITS.maxChars} characters · ≤
                  {DESCRIPTION_LIMITS.desktopPx}px desktop · ≤
                  {DESCRIPTION_LIMITS.mobilePx}px mobile
                </li>
              ) : null}
            </ul>
          </div>
        </div>
      </div>

      {/* Search-results chrome — makes the stack read as a real Google page */}
      <div className="mb-4 rounded-lg border border-border bg-card px-5 py-4">
        <SerpSearchChrome
          query={entries[0]?.title}
          placeholder={`Previewing ${entries.length} ${noun}${entries.length === 1 ? "" : "s"}…`}
          resultsLabel={`${entries.length} ${noun}${entries.length === 1 ? "" : "s"} analyzed · ${passedCount} passing`}
        />
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-3">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <Button
          variant={filterStatus === "all" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilterStatus("all")}
        >
          All ({entries.length})
        </Button>
        <Button
          variant={filterStatus === "passed" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilterStatus("passed")}
        >
          Passed ({passedCount})
        </Button>
        {failedCount > 0 ? (
          <Button
            variant={filterStatus === "failed" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterStatus("failed")}
          >
            Needs attention ({failedCount})
          </Button>
        ) : null}
      </div>

      {/* Results */}
      <div className="space-y-4">
        {filtered.map((entry, index) => {
          const titleField = entryTitleField(entry);
          const descriptionField = entryDescriptionField(entry);
          const issues = [
            ...(entry.titleIssues ?? []),
            ...(entry.descriptionIssues ?? []),
          ];
          return (
            <div
              key={index}
              className={cn(
                "overflow-hidden rounded-xl border-2 bg-card",
                entry.overallOk ? "border-success/40" : "border-warning/40",
              )}
            >
              <div className="flex items-center justify-between gap-2 border-b border-border px-5 py-3">
                {entry.overallOk ? (
                  <Badge className="gap-1 bg-success/15 text-success hover:bg-success/15">
                    <CheckCircle className="h-3.5 w-3.5" />
                    Optimized
                  </Badge>
                ) : (
                  <Badge className="gap-1 bg-warning/15 text-warning hover:bg-warning/15">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Needs optimization
                  </Badge>
                )}
                <span className="text-sm text-muted-foreground">#{index + 1}</span>
              </div>

              {/* The real thing — the simulated Google result */}
              <div className="px-6 py-5">
                <SerpResult
                  device="desktop"
                  density="full"
                  title={entry.title}
                  description={entry.description}
                  placeholderTitle={titlePlaceholder}
                  placeholderDescription={descriptionPlaceholder}
                />
              </div>

              {/* Validation detail */}
              <div className="space-y-5 border-t border-border bg-muted/30 px-6 py-5">
                {titleField ? <SerpFieldBars field={titleField} /> : null}
                {descriptionField ? <SerpFieldBars field={descriptionField} /> : null}
                {issues.length ? (
                  <ul className="space-y-1.5">
                    {issues.map((issue) => (
                      <li
                        key={issue}
                        className="flex items-start gap-2 text-xs text-warning"
                      >
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span>{issue}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <div className="py-12 text-center">
          <FileText className="mx-auto mb-4 h-16 w-16 text-muted-foreground/40" />
          <p className="text-muted-foreground">No results match the selected filter</p>
        </div>
      ) : null}
    </div>
  );
}
