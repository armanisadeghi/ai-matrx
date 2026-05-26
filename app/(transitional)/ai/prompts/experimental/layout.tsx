import { ReactNode } from "react";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/ai/prompts/experimental", {
  titlePrefix: "Experimental",
  title: "Prompts",
  description: "Explore and test cutting-edge prompt engineering tools",
  letter: "Ex",
});

export default function ExperimentalLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <>{children}</>;
}
