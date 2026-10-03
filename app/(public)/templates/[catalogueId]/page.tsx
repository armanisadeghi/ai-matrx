// app/(public)/templates/[catalogueId]/page.tsx — ONE TEMPLATE'S PUBLIC PAGE (lane MAKE-HOME, wave 4b).
// Server-rendered and indexable: title, description and social card come from the template's own card.
// "Use this template" leads through sign-up to /make/templates/<id>, where the install runs.

import type { Metadata } from "next";
import Link from "next/link";

import { createRouteMetadata } from "@/utils/route-metadata";
import { TemplateSummary } from "@/features/make/gallery/TemplateCards";
import { PUBLIC_GALLERY_PATH, publicTemplateHref, templateDescription, templateSignUpHref } from "@/features/make/gallery/publicGallery";
import { readPublicCatalogue } from "@/features/make/gallery/publicCatalogue.server";

type Props = { params: Promise<{ catalogueId: string }> };

async function findCard(catalogueId: string) {
  const read = await readPublicCatalogue();
  return read.state === "open" ? (read.cards.find((c) => c.catalogue_id === catalogueId) ?? null) : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { catalogueId } = await params;
  const id = decodeURIComponent(catalogueId);
  const card = await findCard(id);
  if (!card) {
    return { title: "Template", robots: { index: false, follow: true } };
  }
  const path = publicTemplateHref(card.catalogue_id);
  return createRouteMetadata(path, {
    title: card.name,
    titlePrefix: "Template",
    description: templateDescription(card),
    canonicalPath: path,
  });
}

export default async function PublicTemplatePage({ params }: Props) {
  const { catalogueId } = await params;
  const card = await findCard(decodeURIComponent(catalogueId));

  return (
    <div className="bg-textured">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-10 sm:px-6">
        <Link href={PUBLIC_GALLERY_PATH} className="self-start text-sm text-muted-foreground hover:text-foreground">
          All templates
        </Link>
        {card ? (
          <div className="flex flex-col gap-6" data-public-template={card.catalogue_id}>
            <TemplateSummary card={card} />
            <Link
              href={templateSignUpHref(card)}
              data-public-template-use=""
              className="inline-flex h-10 items-center self-start rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Use this template
            </Link>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground" data-public-template-missing="">
            This template is not in the gallery
          </p>
        )}
      </div>
    </div>
  );
}
