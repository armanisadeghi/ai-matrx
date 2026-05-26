import { ReactNode } from "react";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/ai/prompts", {
  titlePrefix: "Execution",
  title: "Prompts",
  description: "Database-driven AI actions and execution demo",
  letter: "ED",
});

export default function ExecutionDemoLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <>{children}</>;
}
