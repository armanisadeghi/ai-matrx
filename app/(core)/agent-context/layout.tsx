import ContextLayoutClient from "./ContextLayoutClient";
import { createCustomFaviconMetadata } from "@/utils/favicon-utils";
import { siteConfig } from "@/config/extras/site";
import ContextLanding from "@/features/auth/components/module-landing/landings/ContextLanding";
import { getServerAuth } from "@/utils/supabase/getServerAuth";

const title = "SSR | Context";
const description = "SSR agent context and hierarchy selection playground.";
const socialTitle = `${title} | AI Matrx`;

export const metadata = createCustomFaviconMetadata(
  { color: "#be123c", letter: "Cx" },
  {
    title,
    description,
    openGraph: {
      title: socialTitle,
      description,
      type: "website",
      siteName: "AI Matrx",
      images: [
        {
          url: siteConfig.ogImage,
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: socialTitle,
      description,
      images: [siteConfig.ogImage],
    },
  },
);

/**
 * Server-side auth branch keeps the `"use client"` Context shell (and
 * its scope-resolution Redux bundle) from shipping to guests. Guests
 * see the marketing landing; authed users get the live client shell.
 */
export default async function ContextLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) return <ContextLanding />;
  return <ContextLayoutClient>{children}</ContextLayoutClient>;
}
