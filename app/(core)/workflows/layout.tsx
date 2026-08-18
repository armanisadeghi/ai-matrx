import { ReactNode } from "react";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/workflows", {
  title: "Workflows",
  description: "Run your workflows and watch them work, step by step",
  letter: "WF",
});

export default function WorkflowsLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
