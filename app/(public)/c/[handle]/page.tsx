import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCreatorPublicPage } from "@/features/education/creators/queries";
import { CreatorLandingPage } from "@/features/education/creators/components/CreatorLandingPage";
import { EDU_ORIGIN } from "@/features/education/constants";

/**
 * `/c/[handle]` — the public, SEO-first creator landing page (Convergence C
 * growth lever). Handle-addressed and INDEXABLE; a creator's own creator_public
 * flag is the authorization (anon read via the creator_public_page RPC). An
 * unknown / unpublished handle 404s. Server-rendered on every request so an edit
 * shows immediately and crawlers always see the full content (view-source has it).
 */
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ handle: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { handle } = await params;
  const page = await getCreatorPublicPage(handle);
  // `metadataBase` is pinned to EDU_ORIGIN (not inherited from the root
  // layout's siteConfig.url) so the canonical, OG url, and the file-based
  // opengraph-image route below all resolve against the configured public
  // education origin — aimatrx.com by default, learn.aimatrx.com once
  // NEXT_PUBLIC_EDU_ORIGIN is set. See features/education/constants.ts#EDU_ORIGIN.
  const metadataBase = new URL(EDU_ORIGIN);
  if (!page) {
    return { title: "Creator not found · AI Matrx", robots: { index: false }, metadataBase };
  }
  const description =
    page.tagline ??
    page.bio ??
    `${page.displayName}'s free study tools, videos, and classes on AI Matrx.`;
  const canonical = `/c/${page.handle}`;
  return {
    title: `${page.displayName} · AI Matrx`,
    description,
    alternates: { canonical },
    robots: { index: true, follow: true },
    metadataBase,
    openGraph: {
      title: page.displayName,
      description,
      url: canonical,
      type: "profile",
    },
    twitter: { card: "summary_large_image", title: page.displayName, description },
  };
}

export default async function CreatorPage({ params }: PageProps) {
  const { handle } = await params;
  const page = await getCreatorPublicPage(handle);
  if (!page) notFound();
  return <CreatorLandingPage page={page} />;
}
