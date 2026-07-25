"use client";

/**
 * Shared inline BODY for every SEO meta check. Brings the agent's output to
 * life as a stack of real simulated Google results — the same `SerpResult`
 * primitive the public calculator page and the marketing workspace render —
 * with a thin validation footer per row.
 *
 * Body only: the `seo` renderer wraps this in the canonical `ToolResultCard`,
 * whose header carries the count and the passed/needs-attention summary. This
 * component must never draw its own title or repeat that summary.
 */

import { AlertTriangle, CheckCircle, FileText } from "lucide-react";

import { CopyButton } from "@/components/matrx/buttons/CopyButton";
import { cn } from "@/lib/utils";
import { SerpResult } from "@/features/marketing/seo/serp/SerpResult";
import { SerpFieldChips } from "@/features/marketing/seo/serp/SerpValidation";
import type { SerpEntry } from "@/features/marketing/seo/serp/types";

const MAX_INLINE = 6;

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
  /** Opens the full Google-results view. Omitted -> the footer link is hidden. */
  onOpenFullView?: () => void;
}

export function SerpToolInline({
  entries,
  noun,
  titlePlaceholder,
  descriptionPlaceholder,
  onOpenFullView,
}: SerpToolInlineProps) {
  if (!entries.length) return null;

  const shown = entries.slice(0, MAX_INLINE);
  const hidden = entries.length - shown.length;

  return (
    <div>
      <div className="space-y-2 p-3">
        {shown.map((entry, i) => (
          <div
            key={i}
            className={cn(
              // ONE surface (bg-card) — status is a thin left accent + the
              // footer chips, never a full background tint (that two-toned
              // against the white SERP block).
              "animate-in fade-in slide-in-from-left rounded-lg border border-border border-l-[3px] bg-card px-3 py-2",
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
            <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-border pt-1">
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
                  <CopyButton content={entry.title} size="icon" tooltip="Copy title" />
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

      {onOpenFullView ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenFullView();
          }}
          className="flex w-full items-center justify-center gap-2 border-t border-border/60 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
        >
          <FileText className="h-3.5 w-3.5" />
          {hidden > 0
            ? `${hidden} more ${plural(hidden, noun)} — open Google view`
            : "Open Google view"}
        </button>
      ) : null}
    </div>
  );
}
