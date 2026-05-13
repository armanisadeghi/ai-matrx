import HierarchyLayoutClient from "./HierarchyLayoutClient";
import { createCustomFaviconMetadata } from "@/utils/favicon-utils";
import { siteConfig } from "@/config/extras/site";

const title = "Hierarchy | Context";
const description = "SSR hierarchy manager for agent context trees.";
const socialTitle = `${title} | AI Matrx`;

export const metadata = createCustomFaviconMetadata(
  { color: "#86198f", letter: "Hy" },
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

export default function HierarchyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <HierarchyLayoutClient>{children}</HierarchyLayoutClient>;
}
