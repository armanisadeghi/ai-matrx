// features/make/gallery/PublicGalleryPage.tsx — lane CHAIR-GALLERY, 2026-10-05.
//
// THE GALLERY'S PAGES at /templates, /templates/category/<industry> and /templates/job/<job>: one
// server-rendered layout (heading, industry and job links, the cards with their live thumbnails).
// The index groups the catalogue by industry; a category or job page lists every template in it.

import Link from "next/link";

import { signUpHref } from "@/utils/auth/auth-destination";
import { cn } from "@/lib/utils";

import { facetValues, wordFor, type GalleryCard } from "./catalogue";
import { TemplateCardGrid } from "./TemplateCards";
import { industryHref, jobHref, PUBLIC_GALLERY_PATH, publicTemplateHref } from "./publicGallery";

/** Cards per industry on the index; the industry's own page lists them all. */
const PER_GROUP_ON_INDEX = 6;

export function PublicGalleryPage({
  title,
  cards,
  all,
  active,
  grouped = false,
  state,
}: {
  title: string;
  cards: readonly GalleryCard[];
  /** The whole catalogue, for the industry and job links. */
  all: readonly GalleryCard[];
  active?: { industry?: string; job?: string };
  grouped?: boolean;
  state: string;
}) {
  const industries = facetValues(all, "industry");
  const jobs = facetValues(all, "job");
  return (
    <div className="bg-textured" data-public-templates={state}>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-10 sm:px-6 lg:px-8">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            {active ? (
              <Link href={PUBLIC_GALLERY_PATH} className="type-body text-muted-foreground hover:text-foreground">
                All templates
              </Link>
            ) : null}
            <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
            <span className="type-body text-muted-foreground tabular-nums">{cards.length} templates</span>
          </div>
          <Link
            href={signUpHref(PUBLIC_GALLERY_PATH)}
            className="inline-flex h-9 items-center rounded-md bg-primary px-4 type-title text-primary-foreground hover:bg-primary/90"
            data-public-templates-signup=""
          >
            Sign up free
          </Link>
        </header>

        {industries.length > 1 ? (
          <nav aria-label="Industry" className="flex flex-wrap gap-2 type-body" data-public-templates-industries="">
            {industries.map((v) => (
              <FacetLink key={v} href={industryHref(v)} active={active?.industry === v}>
                {wordFor("industry", v)}
              </FacetLink>
            ))}
          </nav>
        ) : null}
        {jobs.length > 1 ? (
          <nav aria-label="Job" className="flex flex-wrap gap-2 type-body" data-public-templates-jobs="">
            {jobs.map((v) => (
              <FacetLink key={v} href={jobHref(v)} active={active?.job === v}>
                {wordFor("job", v)}
              </FacetLink>
            ))}
          </nav>
        ) : null}

        {cards.length === 0 ? (
          <p className="type-body text-muted-foreground" data-public-templates-empty="">
            No public templates yet
          </p>
        ) : grouped ? (
          industries.map((industry) => {
            const inGroup = cards.filter((c) => c.industry === industry);
            if (!inGroup.length) return null;
            return (
              <section key={industry} className="flex flex-col gap-3" aria-labelledby={`templates-${industry}`}>
                <div className="flex items-baseline justify-between gap-3">
                  <h2 id={`templates-${industry}`} className="text-lg font-semibold tracking-tight">
                    {wordFor("industry", industry)}
                  </h2>
                  <Link href={industryHref(industry)} className="type-body text-primary hover:underline">
                    All {inGroup.length}
                  </Link>
                </div>
                <TemplateCardGrid cards={inGroup.slice(0, PER_GROUP_ON_INDEX)} hrefFor={(c) => publicTemplateHref(c)} attr="data-public-templates-cards" />
              </section>
            );
          })
        ) : (
          <TemplateCardGrid cards={cards} hrefFor={(c) => publicTemplateHref(c)} attr="data-public-templates-cards" />
        )}
      </div>
    </div>
  );
}

function FacetLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "rounded-full border px-3 py-1",
        active ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </Link>
  );
}
