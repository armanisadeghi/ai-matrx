// app/(public)/templates/page.tsx — THE PUBLIC TEMPLATE GALLERY (lane MAKE-HOME, wave 4b).
// Arman 2026-10-02: public and indexed. Server-rendered from the catalogue door as a signed-out
// visitor sees it; the cards are the same component /make draws (features/make/gallery/TemplateCards).

import type { Metadata } from "next";
import Link from "next/link";

import { createRouteMetadata } from "@/utils/route-metadata";
import { signUpHref } from "@/utils/auth/auth-destination";
import { facetValues, wordFor } from "@/features/make/gallery/catalogue";
import { TemplateCardGrid } from "@/features/make/gallery/TemplateCards";
import { PUBLIC_GALLERY_PATH, publicTemplateHref } from "@/features/make/gallery/publicGallery";
import { readPublicCatalogue } from "@/features/make/gallery/publicCatalogue.server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = createRouteMetadata(PUBLIC_GALLERY_PATH, {
  title: "Templates",
  description: "Ready-made tables, forms and booking pages for your business. Pick one, sign up, and it is yours in seconds.",
  canonicalPath: PUBLIC_GALLERY_PATH,
});

export default async function PublicTemplatesPage({ searchParams }: { searchParams: Promise<{ industry?: string }> }) {
  const { industry } = await searchParams;
  const read = await readPublicCatalogue();
  const cards = read.state === "open" ? read.cards : [];
  const industries = facetValues(cards, "industry");
  const shown = industry ? cards.filter((c) => c.industry === industry) : cards;

  return (
    <div className="bg-textured" data-public-templates={read.state}>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-10 sm:px-6 lg:px-8">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-3xl font-semibold tracking-tight">Templates</h1>
          <Link
            href={signUpHref("/make")}
            className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Sign up free
          </Link>
        </header>

        {industries.length > 1 ? (
          <nav aria-label="Industry" className="flex flex-wrap gap-2 text-sm" data-public-templates-industries="">
            <IndustryLink href={PUBLIC_GALLERY_PATH} active={!industry}>
              All
            </IndustryLink>
            {industries.map((v) => (
              <IndustryLink key={v} href={`${PUBLIC_GALLERY_PATH}?industry=${encodeURIComponent(v)}`} active={industry === v}>
                {wordFor("industry", v)}
              </IndustryLink>
            ))}
          </nav>
        ) : null}

        {shown.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-public-templates-empty="">
            {industry && cards.length > 0 ? "No template for this industry yet" : "No public templates yet"}
          </p>
        ) : (
          <TemplateCardGrid cards={shown} hrefFor={(c) => publicTemplateHref(c.catalogue_id)} attr="data-public-templates-cards" />
        )}
      </div>
    </div>
  );
}

function IndustryLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
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
