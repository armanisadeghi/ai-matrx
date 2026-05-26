import { ReactNode } from "react";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/ai/prompts", {
  titlePrefix: "Controls",
  title: "Prompts",
  description: "Configure and manage prompt testing parameters",
  letter: "CT",
});

export default function TestControlsLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <>{children}</>;
}
