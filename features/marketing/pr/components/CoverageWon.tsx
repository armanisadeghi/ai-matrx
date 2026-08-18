"use client";

/**
 * Coverage won — what actually landed, tied back to the angle that produced it.
 *
 * `seo.coverage_mention` has NO foreign key to `seo.story_angle`. The tie lives
 * in `metadata.story_angle_id`, read in exactly one place (`angleIdFromMention`
 * in data.ts). When it is present the row carries a door back to the angle;
 * when it is absent the row SAYS the link is not recorded rather than quietly
 * rendering nothing — a missing relationship the user can see is a relationship
 * somebody can go and fix.
 *
 * Every author is a `crm.party` when the discovery pipeline resolved one
 * (`author_party_id`), so the journalist who wrote about you is one click from
 * the piece they wrote. When it did not, the author is an unresolved reference
 * carrying its own "add to CRM" fix (THE DOOR LAW).
 */

import { ArrowUpRight, ExternalLink, Link2, Link2Off } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatDateOnly } from "@/features/marketing/components/shared/MarketingUi";
import { JournalistRef } from "@/features/marketing/pr/components/JournalistRef";
import { angleIdFromMention } from "@/features/marketing/pr/data";
import type {
  CoverageMention,
  StoryAngle,
} from "@/features/marketing/pr/types";

export function CoverageWon({
  coverage,
  angles,
  onOpenAngle,
  focusedId,
}: {
  coverage: readonly CoverageMention[];
  angles: readonly StoryAngle[];
  onOpenAngle: (angleId: string) => void;
  /** The coverage row named in the URL, so a deep link lands somewhere visible. */
  focusedId: string | null;
}) {
  const angleById = new Map(angles.map((angle) => [angle.id, angle]));

  return (
    <section className="min-w-0 rounded-lg border border-border bg-card">
      <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-border px-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Coverage won
        </h2>
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {coverage.length} in the last 180 days
        </span>
      </div>

      {coverage.length === 0 ? (
        <div className="px-3 py-8 text-center">
          <p className="text-xs font-medium text-foreground">
            No coverage recorded yet
          </p>
          <p className="mx-auto mt-1 max-w-md text-[11px] leading-4 text-muted-foreground">
            When a piece mentioning you is published, it is discovered, captured
            and shown here beside the angle that produced it. Pitching an angle
            above is what starts that.
          </p>
        </div>
      ) : (
        <ul className="min-w-0">
          {coverage.map((mention) => {
            const angleId = angleIdFromMention(mention);
            const angle = angleId ? (angleById.get(angleId) ?? null) : null;
            return (
              <li
                key={mention.id}
                data-coverage-id={mention.id}
                className={cn(
                  "flex min-w-0 items-start gap-3 border-b border-border px-3 py-2 last:border-b-0",
                  focusedId === mention.id &&
                    "scroll-mt-4 bg-primary/5 ring-1 ring-inset ring-primary/30",
                )}
              >
                <span className="w-16 shrink-0 pt-0.5 text-[11px] tabular-nums text-muted-foreground">
                  {formatDateOnly(mention.published_at)}
                </span>
                <span className="min-w-0 flex-1">
                  <a
                    href={mention.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-w-0 max-w-full items-center gap-1 text-xs font-medium text-foreground hover:text-primary hover:underline"
                  >
                    <span className="truncate">
                      {mention.title ?? mention.normalized_url}
                    </span>
                    <ExternalLink className="h-3 w-3 shrink-0 opacity-60" />
                  </a>
                  <span className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                    <span className="shrink-0 font-medium text-foreground">
                      {mention.domain}
                    </span>
                    <JournalistRef
                      name={mention.author_name}
                      partyId={mention.author_party_id}
                      emptyLabel="No author named"
                      compact
                      className="shrink-0"
                    />
                    {angle ? (
                      <button
                        type="button"
                        onClick={() => onOpenAngle(angle.id)}
                        className="inline-flex min-w-0 shrink items-center gap-1 text-primary hover:underline"
                      >
                        <ArrowUpRight className="h-3 w-3 shrink-0" aria-hidden />
                        <span className="truncate">From: {angle.headline}</span>
                      </button>
                    ) : (
                      <span
                        className="shrink-0 text-muted-foreground/80"
                        title="coverage_mention has no foreign key to story_angle; the tie lives in metadata.story_angle_id and none was recorded here."
                      >
                        No angle recorded for this piece
                      </span>
                    )}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5 pt-0.5">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 text-[11px]",
                      mention.links_to_site
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-muted-foreground",
                    )}
                    title={
                      mention.links_to_site
                        ? "This piece links back to your site"
                        : "This piece names you but does not link to your site"
                    }
                  >
                    {mention.links_to_site ? (
                      <Link2 className="h-3.5 w-3.5" aria-hidden />
                    ) : (
                      <Link2Off className="h-3.5 w-3.5" aria-hidden />
                    )}
                  </span>
                  {mention.prominence ? (
                    <Badge variant="outline" className="text-[10px] capitalize">
                      {mention.prominence}
                    </Badge>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
