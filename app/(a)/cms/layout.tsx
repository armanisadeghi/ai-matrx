import { createCustomFaviconMetadata } from "@/utils/favicon-utils";
import { siteConfig } from "@/config/extras/site";

const title = "SSR | Content";
const description = "Manage your websites, pages, and content (SSR shell).";
const socialTitle = `${title} | AI Matrx`;

export const metadata = createCustomFaviconMetadata(
  { color: "#0f766e", letter: "Cn" },
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

export default function ContentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
