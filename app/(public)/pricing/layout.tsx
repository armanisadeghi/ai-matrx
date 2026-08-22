import type { ReactNode } from "react";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/pricing", {
  title: "Pricing",
  description:
    "Simple, honest pricing for AI Matrx study tools. A generous free tier, limits visible up front, one-click cancel, and no silent charges — ever.",
  canonicalPath: "/pricing",
  additionalMetadata: {
    openGraph: {
      title: "Pricing | AI Matrx",
      description:
        "A generous free tier, limits visible up front, one-click cancel, and no silent charges — ever.",
      url: "/pricing",
      type: "website",
    },
  },
});

export default function PricingLayout({ children }: { children: ReactNode }) {
  return children;
}
