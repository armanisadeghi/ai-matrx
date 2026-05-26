import { ReactNode } from "react";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/ai/prompts", {
  titlePrefix: "Lab Builder",
  title: "Prompts",
  description:
    "Experimental advanced prompt construction with structured components",
  letter: "EB",
});

export default function BuilderLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
