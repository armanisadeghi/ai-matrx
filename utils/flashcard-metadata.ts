import type { Metadata } from "next";
import { siteConfig } from "@/config/extras/site";
import { createCustomFaviconMetadata } from "@/utils/favicon-utils";
import { DESCRIPTION_LIMITS } from "@/features/marketing/seo/serp/metrics";

/** Teal-amber accent — distinct from primary nav palette; flashcards have no nav favicon entry. */
const FLASHCARD_FAVICON_COLOR = "#b45309";

/**
 * Metadata + favicon for `/flashcard/*` routes (no favicon-route-data entry).
 */
export function createFlashcardRouteMetadata(
  composedTitle: string,
  description: string,
  letter: string,
): Metadata {
  const socialTitle = `${composedTitle} | AI Matrx`;
  const desc = description.slice(0, DESCRIPTION_LIMITS.maxChars);
  return createCustomFaviconMetadata(
    { color: FLASHCARD_FAVICON_COLOR, letter },
    {
      title: composedTitle,
      description: desc,
      openGraph: {
        title: socialTitle,
        description: desc || siteConfig.description,
        type: "website",
        siteName: "AI Matrx",
        images: [
          {
            url: siteConfig.ogImage,
            width: 1200,
            height: 630,
            alt: composedTitle,
          },
        ],
      },
      twitter: {
        card: "summary_large_image",
        title: socialTitle,
        description: desc || siteConfig.description,
        images: [siteConfig.ogImage],
      },
    },
  );
}
