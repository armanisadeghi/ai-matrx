// Per-creator Open Graph image for /c/[handle]. Reuses the shared branded
// education OG renderer so every AI Matrx share reads as one system. This is a
// standard [handle] segment (not a catch-all), so a file-based opengraph-image
// is valid here (the learn catch-all had to use a route handler instead).
import {
  renderEduOgImage,
  eduOgSize,
  eduOgContentType,
} from "@/features/education/publishing/ogImage";
import { getCreatorPublicPage } from "@/features/education/creators/queries";

export const size = eduOgSize;
export const contentType = eduOgContentType;
export const alt = "AI Matrx creator";

export default async function CreatorOgImage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  const page = await getCreatorPublicPage(handle);
  if (!page) {
    return renderEduOgImage({
      eyebrow: "Creator",
      title: "AI Matrx",
      description: "Free study tools, videos, and classes.",
      letter: "Cr",
    });
  }
  return renderEduOgImage({
    eyebrow: "Creator",
    title: page.displayName,
    description: page.tagline ?? page.bio ?? "Free study tools, videos, and classes.",
    letter: page.displayName.slice(0, 2).toUpperCase(),
  });
}
