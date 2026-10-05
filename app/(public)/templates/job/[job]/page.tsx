// app/(public)/templates/job/[job]/page.tsx — every template that does one job (lane CHAIR-GALLERY).

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TEMPLATE_JOBS } from "@ai-matrx/records/templates";

import { createRouteMetadata } from "@/utils/route-metadata";
import { wordFor } from "@/features/make/gallery/catalogue";
import { PublicGalleryPage } from "@/features/make/gallery/PublicGalleryPage";
import { jobHref } from "@/features/make/gallery/publicGallery";
import { readPublicCatalogue } from "@/features/make/gallery/publicCatalogue.server";

export const revalidate = 3600;

type Props = { params: Promise<{ job: string }> };

export function generateStaticParams() {
  return TEMPLATE_JOBS.map((job) => ({ job }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { job } = await params;
  const word = wordFor("job", job);
  return createRouteMetadata(jobHref(job), {
    title: `${word} templates`,
    description: `Ready-made templates for ${word.toLowerCase()}: tables, forms, booking pages and dashboards with sample data, for every kind of business.`,
    canonicalPath: jobHref(job),
  });
}

export default async function JobTemplatesPage({ params }: Props) {
  const { job } = await params;
  if (!(TEMPLATE_JOBS as readonly string[]).includes(job)) notFound();
  const read = await readPublicCatalogue();
  const all = read.state === "open" ? read.cards : [];
  const cards = all.filter((c) => c.job === job);
  return <PublicGalleryPage title={`${wordFor("job", job)} templates`} cards={cards} all={all} active={{ job }} state={read.state} />;
}
