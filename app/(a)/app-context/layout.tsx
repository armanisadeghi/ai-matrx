import ContextLayoutClient from "./ContextLayoutClient";
import { createCustomFaviconMetadata } from "@/utils/favicon-utils";
import { siteConfig } from "@/config/extras/site";

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

export default function ContextLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ContextLayoutClient>{children}</ContextLayoutClient>;
}
