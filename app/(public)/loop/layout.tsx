import type { ReactNode } from "react";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/loop", {
  title: "The Loop",
  description:
    "Research, to written pages, to real results — and back again. Twelve steps you can run yourself, hand to an AI agent, or leave alone.",
  canonicalPath: "/loop",
  additionalMetadata: {
    openGraph: {
      title: "The Loop | AI Matrx",
      description: "A site that improves itself. Twelve steps, one loop.",
      url: "/loop",
      type: "website",
    },
  },
});

export default function LoopLayout({ children }: { children: ReactNode }) {
  return children;
}
