// app/(public)/templates/category/[industry]/page.tsx — every template for one industry (lane CHAIR-GALLERY).

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { INDUSTRY_GROUPS } from "@ai-matrx/records/templates";

import { createRouteMetadata } from "@/utils/route-metadata";
import { wordFor } from "@/features/make/gallery/catalogue";
import { PublicGalleryPage } from "@/features/make/gallery/PublicGalleryPage";
import { industryHref } from "@/features/make/gallery/publicGallery";
import { readPublicCatalogue } from "@/features/make/gallery/publicCatalogue.server";

export const revalidate = 3600;

type Props = { params: Promise<{ industry: string }> };

export function generateStaticParams() {
  return INDUSTRY_GROUPS.map((industry) => ({ industry }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { industry } = await params;
  const word = wordFor("industry", industry);
  return createRouteMetadata(industryHref(industry), {
    title: `${word} templates`,
    description: `Ready-made ${word.toLowerCase()} tables, forms, booking pages and dashboards, filled with sample data. Pick one and it is yours in seconds.`,
    canonicalPath: industryHref(industry),
  });
}

export default async function IndustryTemplatesPage({ params }: Props) {
  const { industry } = await params;
  if (!(INDUSTRY_GROUPS as readonly string[]).includes(industry)) notFound();
  const read = await readPublicCatalogue();
  const all = read.state === "open" ? read.cards : [];
  const cards = all.filter((c) => c.industry === industry);
  return <PublicGalleryPage title={`${wordFor("industry", industry)} templates`} cards={cards} all={all} active={{ industry }} state={read.state} />;
}
