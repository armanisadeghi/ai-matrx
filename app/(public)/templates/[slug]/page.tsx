// app/(public)/templates/[slug]/page.tsx — ONE TEMPLATE'S PAGE, the same for everyone (lane CHAIR-GALLERY,
// 2026-10-05). Arman: "a nice page with a good url, the nice description it has and then showing the
// actual 'Stuff' that comes out of it." The address is the template's readable slug; a catalogue id or
// a version id answers with a permanent redirect to it. The body is the template SHOWN — its tables
// with their sample rows, its views, forms, booking page and dashboards — rendered on the server from
// the spec. "Use this template" installs for a signed-in person, and leads a guest through sign-up.

import type { Metadata } from "next";
import Link from "next/link";
import { permanentRedirect } from "next/navigation";
import { Suspense } from "react";

import { siteConfig } from "@/config/extras/site";
import { createRouteMetadata } from "@/utils/route-metadata";
import { footprintLine, wordFor, type GalleryCard } from "@/features/make/gallery/catalogue";
import { TemplateCardGrid, TemplateChip } from "@/features/make/gallery/TemplateCards";
import { TemplateShowcase } from "@/features/make/gallery/TemplateShowcase";
import { OwnTemplateFallback, TemplateUseAction } from "@/features/make/gallery/TemplateUseAction";
import {
  industryHref,
  jobHref,
  PUBLIC_GALLERY_PATH,
  publicTemplateHref,
  templateDescription,
  templateSignUpHref,
} from "@/features/make/gallery/publicGallery";
import { readPublicCatalogue, readTemplatePage } from "@/features/make/gallery/publicCatalogue.server";

export const revalidate = 3600;

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

const RELATED = 6;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = await readTemplatePage(decodeURIComponent(slug));
  if (!page) return { title: "Template", robots: { index: false, follow: true } };
  const { card, spec } = page;
  const path = publicTemplateHref(card);
  return createRouteMetadata(path, {
    title: card.name,
    titlePrefix: "Template",
    description: templateDescription(card),
    canonicalPath: path,
    keywords: [card.vertical, wordFor("industry", card.industry ?? ""), wordFor("job", card.job ?? ""), ...spec.tables.map((t) => t.name), "template"].filter(
      (k): k is string => Boolean(k),
    ),
  });
}

function relatedTo(card: GalleryCard, all: readonly GalleryCard[]): GalleryCard[] {
  const score = (c: GalleryCard) => (c.industry === card.industry ? 2 : 0) + (c.job === card.job ? 1 : 0);
  return all
    .filter((c) => c.catalogue_id !== card.catalogue_id && score(c) > 0)
    .sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name))
    .slice(0, RELATED);
}

export default async function PublicTemplatePage({ params, searchParams }: Props) {
  const { slug: raw } = await params;
  const key = decodeURIComponent(raw);
  const page = await readTemplatePage(key);

  if (!page) {
    // Not a published platform template: an organization's own saved template opens here signed in.
    return (
      <div className="bg-textured">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-10 sm:px-6">
          <Link href={PUBLIC_GALLERY_PATH} className="self-start text-sm text-muted-foreground hover:text-foreground">
            All templates
          </Link>
          <OwnTemplateFallback templateId={key} />
        </div>
      </div>
    );
  }

  const { card, spec } = page;
  if (card.slug && key !== card.slug) {
    const query = new URLSearchParams();
    for (const [k, v] of Object.entries(await searchParams)) if (typeof v === "string") query.set(k, v);
    const q = query.toString();
    permanentRedirect(`${publicTemplateHref(card)}${q ? `?${q}` : ""}`);
  }

  const read = await readPublicCatalogue();
  const related = relatedTo(card, read.state === "open" ? read.cards : []);
  const url = `${siteConfig.url}${publicTemplateHref(card)}`;
  const today = new Date().toISOString().slice(0, 10);
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "CreativeWork",
      name: card.name,
      headline: card.name,
      description: templateDescription(card),
      url,
      genre: card.industry ? wordFor("industry", card.industry) : undefined,
      about: card.vertical ?? undefined,
      keywords: spec.tables.map((t) => t.name).join(", "),
      isAccessibleForFree: true,
      dateModified: page.updatedAt ?? undefined,
      publisher: { "@type": "Organization", name: "AI Matrx", url: siteConfig.url },
      isPartOf: { "@type": "SoftwareApplication", name: "AI Matrx", applicationCategory: "BusinessApplication", operatingSystem: "Web", url: siteConfig.url },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Templates", item: `${siteConfig.url}${PUBLIC_GALLERY_PATH}` },
        ...(card.industry
          ? [{ "@type": "ListItem", position: 2, name: wordFor("industry", card.industry), item: `${siteConfig.url}${industryHref(card.industry)}` }]
          : []),
        { "@type": "ListItem", position: card.industry ? 3 : 2, name: card.name, item: url },
      ],
    },
  ];

  return (
    <div className="bg-textured" data-public-template={card.slug ?? card.catalogue_id}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-10 sm:px-6 lg:px-8">
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
          <Link href={PUBLIC_GALLERY_PATH} className="hover:text-foreground">
            Templates
          </Link>
          {card.industry ? (
            <>
              <span aria-hidden="true">/</span>
              <Link href={industryHref(card.industry)} className="hover:text-foreground">
                {wordFor("industry", card.industry)}
              </Link>
            </>
          ) : null}
        </nav>

        <header className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">{card.name}</h1>
            <p className="text-sm text-muted-foreground">
              {[spec.business?.name, card.vertical, [spec.business?.address?.city, spec.business?.address?.region].filter(Boolean).join(", ")]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          {card.persona ? <p className="max-w-3xl text-base text-foreground">{card.persona}</p> : null}
          <div className="flex flex-wrap gap-1.5 text-xs">
            {card.industry ? (
              <Link href={industryHref(card.industry)}>
                <TemplateChip>{wordFor("industry", card.industry)}</TemplateChip>
              </Link>
            ) : null}
            {card.job ? (
              <Link href={jobHref(card.job)}>
                <TemplateChip>{wordFor("job", card.job)}</TemplateChip>
              </Link>
            ) : null}
            {card.teaches ? <TemplateChip>{wordFor("teaches", card.teaches)}</TemplateChip> : null}
            <TemplateChip>{footprintLine(card.footprint)}</TemplateChip>
          </div>
          <Suspense
            fallback={
              <Link
                href={templateSignUpHref(card)}
                className="inline-flex h-10 items-center self-start rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground"
              >
                Use this template
              </Link>
            }
          >
            <TemplateUseAction templateId={card.id} signUpHref={templateSignUpHref(card)} />
          </Suspense>
        </header>

        <TemplateShowcase spec={spec} today={today} />

        {related.length ? (
          <section className="flex flex-col gap-3" aria-labelledby="template-related">
            <h2 id="template-related" className="text-lg font-semibold tracking-tight">
              Related templates
            </h2>
            <TemplateCardGrid cards={related} hrefFor={(c) => publicTemplateHref(c)} attr="data-public-template-related" />
          </section>
        ) : null}
      </div>
    </div>
  );
}
