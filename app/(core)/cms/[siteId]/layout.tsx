import React from "react";
import SiteLayoutClient from "./SiteLayoutClient";
import { createCustomFaviconMetadata } from "@/utils/favicon-utils";
import { siteConfig } from "@/config/extras/site";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ siteId: string }>;
}) {
  const { siteId } = await params;
  const shortLabel = siteId.length > 16 ? `${siteId.slice(0, 10)}…` : siteId;
  const composedTitle = `${shortLabel} | Content`;
  const description =
    "Manage pages, components, and settings for this CMS site.".slice(0, 120);
  const socialTitle = `${composedTitle} | AI Matrx`;

  return createCustomFaviconMetadata(
    { color: "#0e7490", letter: "Si" },
    {
      title: composedTitle,
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
            alt: composedTitle,
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
}

export default function SiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SiteLayoutClient>{children}</SiteLayoutClient>;
}
