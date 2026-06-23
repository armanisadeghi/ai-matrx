"use client";

import { CheckCircle, AlertTriangle, FileText } from "lucide-react";
import { CopyButton } from "@/components/matrx/buttons/CopyButton";
import { cn } from "@/lib/utils";
import { SerpResult } from "@/features/seo/serp/SerpResult";
import { SerpFieldChips } from "@/features/seo/serp/SerpValidation";
import type { SerpEntry } from "@/features/seo/serp/types";

/**
 * Shared inline renderer for every SEO meta check. Brings the agent's output
 * to life as a stack of real simulated Google results — the same `SerpResult`
 * primitive the calculator page uses — with a thin validation footer per row.
 *
 * The three SEO tool entry points (tags / titles / descriptions) normalize
 * their server payload to `SerpEntry[]` and delegate here, so there is exactly
 * one inline implementation instead of three near-identical copies.
 */

const MAX_INLINE = 6;

function titleCase(noun: string): string {
  return noun.replace(/\b\w/g, (c) => c.toUpperCase());
}

function plural(n: number, noun: string): string {
  return `${noun}${n === 1 ? "" : "s"}`;
}

export interface SerpToolInlineProps {
  entries: SerpEntry[];
  /** Singular, lowercase noun for this check, e.g. "meta tag" / "title". */
  noun: string;
  /** Stand-in title when an entry has none. `null` omits the title line. */
  titlePlaceholder?: string | null;
  /** Stand-in description when an entry has none. `null` omits it. */
  descriptionPlaceholder?: string | null;
  onOpenOverlay?: (initialTab?: string) => void;
  toolGroupId?: string;
}

export function SerpToolInline({
  entries,
  noun,
  titlePlaceholder,
  descriptionPlaceholder,
  onOpenOverlay,
  toolGroupId = "default",
}: SerpToolInlineProps) {
  if (!entries.length) return null;

  const passed = entries.filter((e) => e.overallOk).length;
  const failed = entries.length - passed;
  const shown = entries.slice(0, MAX_INLINE);
  const hasMore = entries.length > shown.length;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground/90">
        <FileText className="h-4 w-4 text-primary" />
        <span>
          {entries.length} {plural(entries.length, titleCase(noun))} Analyzed
        </span>
      </div>

      <div className="flex items-center gap-3 text-xs">
        <div className="flex items-center gap-1.5 text-success">
          <CheckCircle className="h-4 w-4" />
          <span className="font-medium">{passed} passed</span>
        </div>
        {failed > 0 ? (
          <div className="flex items-center gap-1.5 text-warning">
            <AlertTriangle className="h-4 w-4" />
            <span className="font-medium">{failed} need attention</span>
          </div>
        ) : null}
      </div>

      <div className="space-y-2">
        {shown.map((entry, i) => (
          <div
            key={i}
            className={cn(
              // ONE surface (bg-card) — status is a thin left accent + the
              // footer chips, never a full background tint (that two-toned
              // against the white SERP block).
              "animate-in fade-in slide-in-from-left rounded-lg border border-border border-l-[3px] bg-card p-3",
              entry.overallOk ? "border-l-success" : "border-l-warning",
            )}
            style={{
              animationDelay: `${i * 50}ms`,
              animationDuration: "200ms",
              animationFillMode: "backwards",
            }}
          >
            <SerpResult
              device="desktop"
              density="compact"
              title={entry.title}
              description={entry.description}
              placeholderTitle={titlePlaceholder}
              placeholderDescription={descriptionPlaceholder}
            />
            <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-border pt-2">
              <div className="flex items-center gap-2">
                {entry.overallOk ? (
                  <CheckCircle className="h-3.5 w-3.5 shrink-0 text-success" />
                ) : (
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning" />
                )}
                {entry.title !== undefined ? (
                  <SerpFieldChips
                    prefix="T:"
                    chars={entry.titleChars ?? 0}
                    pixels={entry.titlePixels ?? 0}
                    ok={entry.titleOk ?? false}
                  />
                ) : null}
                {entry.description !== undefined ? (
                  <SerpFieldChips
                    prefix="D:"
                    chars={entry.descriptionChars ?? 0}
                    pixels={entry.descriptionPixels ?? 0}
                    ok={entry.descriptionOk ?? false}
                  />
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {entry.title ? (
                  <CopyButton
                    content={entry.title}
                    size="icon"
                    tooltip="Copy title"
                  />
                ) : null}
                {entry.description ? (
                  <CopyButton
                    content={entry.description}
                    size="icon"
                    tooltip="Copy description"
                  />
                ) : null}
              </div>
            </div>
          </div>
        ))}
      </div>

      {onOpenOverlay ? (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onOpenOverlay(`tool-group-${toolGroupId}`);
          }}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-muted/40 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        >
          <FileText className="h-4 w-4" />
          <span>
            {hasMore
              ? `View all ${entries.length} ${plural(entries.length, noun)} in Google view`
              : `Open Google results view`}
          </span>
        </button>
      ) : null}
    </div>
  );
}
