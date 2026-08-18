import { ReactNode } from "react";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/workflows/all", {
  title: "Workflows",
  description: "Every workflow you can run, design, and watch work",
  letter: "WF",
});

export default function WorkflowsListLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <>{children}</>;
}
