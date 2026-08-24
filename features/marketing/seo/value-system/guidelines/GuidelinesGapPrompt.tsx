"use client";

/**
 * "This site has told the AI nothing about itself" — the ONE prompt, mounted
 * wherever the absence actually hurts (KI-031).
 *
 * The document reaches every keyword agent on every run and changes what the
 * model decides; that was built and A/B-proven on 2026-08-21. What was missing
 * was any reason for a person to write one: the screens that USE the document
 * never said it was empty, so 31 of 32 sites carried nothing and every keyword
 * on them was judged on universal signals alone.
 *
 * One component so the sentence, the 90-day line and the door cannot drift
 * apart between the Dimensions screen, the value workbench and the editor
 * itself. It renders NOTHING when the document exists and is current — a
 * healthy site is never nagged, and a green "all good" badge would just be
 * more furniture.
 *
 * Reads through the shared query key, so mounting it beside another consumer
 * costs no extra request and a save anywhere refreshes it everywhere.
 */

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { BookOpenCheck, TriangleAlert } from "lucide-react";
import { cn } from "@/styles/themes/utils";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import {
  getKwGuidelines,
  kwGuidelinesQueryKey,
} from "@/features/marketing/search-console/data-kw-guidelines";
import { GuidelinesDraftButton } from "./GuidelinesDraft";

/** The one staleness line, shared with `seo.gsc_site_meaning_health`. */
export const GUIDELINES_STALE_AFTER_DAYS = 90;

export function daysSinceGuidelinesEdit(iso: string | null | undefined) {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  return Math.floor((Date.now() - then) / 86_400_000);
}

export function GuidelinesGapPrompt({
  siteId,
  brandId,
  className,
}: {
  siteId: string;
  brandId: string | null | undefined;
  className?: string;
}) {
  const stored = useQuery({
    queryKey: kwGuidelinesQueryKey(siteId),
    queryFn: ({ signal }) => getKwGuidelines(siteId, signal),
    staleTime: 5 * 60_000,
  });

  // A failed read is not an absence. Say nothing rather than tell a site with
  // a perfectly good document that it has none.
  if (!stored.data || stored.isError) return null;

  const text = stored.data.guidelines?.trim() ?? "";
  const age = daysSinceGuidelinesEdit(stored.data.updated_at);
  const stale = text.length > 0 && age !== null && age > GUIDELINES_STALE_AFTER_DAYS;
  if (text.length > 0 && !stale) return null;

  const href = marketingRoutes.site(brandId, siteId, "/value/guidelines");

  return (
    <section
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2.5",
        stale
          ? "border-warning/40 bg-warning/5"
          : "border-primary/30 bg-primary/5",
        className,
      )}
    >
      {stale ? (
        <TriangleAlert className="h-4 w-4 shrink-0 text-warning" />
      ) : (
        <BookOpenCheck className="h-4 w-4 shrink-0 text-primary" />
      )}
      <p className="min-w-0 flex-1 text-xs leading-snug text-foreground">
        {stale ? (
          <>
            <span className="font-medium">
              Your business guidelines have not been edited in {age} days.
            </span>{" "}
            The AI still rules on every keyword from that text, so a sentence
            that stopped being true keeps deciding things. Re-read it before
            the next classification sweep.
          </>
        ) : (
          <>
            <span className="font-medium">
              You have told the AI nothing about this business.
            </span>{" "}
            Every AI run reads one plain-text document about what you sell and
            who you serve before it judges a keyword — and yours is empty, so
            every answer comes from universal signals alone.
          </>
        )}
      </p>
      <span className="flex shrink-0 items-center gap-1.5">
        <GuidelinesDraftButton siteId={siteId} hasDocument={stale} />
        <Link
          href={href}
          className="rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          {stale ? "Open it" : "Write it myself"}
        </Link>
      </span>
    </section>
  );
}
