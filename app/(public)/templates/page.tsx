// app/(public)/templates/page.tsx — THE TEMPLATE GALLERY, one route for everyone (lane CHAIR-GALLERY,
// 2026-10-05; first public in MAKE-HOME wave 4b). Server-rendered from the public catalogue door, so a
// signed-out visitor, a signed-in person and a crawler read the same cards, each with a live thumbnail.

import type { Metadata } from "next";
import { permanentRedirect } from "next/navigation";

import { createRouteMetadata } from "@/utils/route-metadata";
import { PublicGalleryPage } from "@/features/make/gallery/PublicGalleryPage";
import { industryHref, PUBLIC_GALLERY_PATH } from "@/features/make/gallery/publicGallery";
import { readPublicCatalogue } from "@/features/make/gallery/publicCatalogue.server";

export const revalidate = 3600;

export const metadata: Metadata = createRouteMetadata(PUBLIC_GALLERY_PATH, {
  title: "Templates",
  description: "Ready-made tables, forms, booking pages and dashboards for your business, filled with sample data. Pick one and it is yours in seconds.",
  canonicalPath: PUBLIC_GALLERY_PATH,
});

export default async function PublicTemplatesPage({ searchParams }: { searchParams: Promise<{ industry?: string }> }) {
  const { industry } = await searchParams;
  if (industry) permanentRedirect(industryHref(industry));
  const read = await readPublicCatalogue();
  const cards = read.state === "open" ? read.cards : [];
  return <PublicGalleryPage title="Templates" cards={cards} all={cards} grouped state={read.state} />;
}
