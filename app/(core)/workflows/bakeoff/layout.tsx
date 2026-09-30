import { createRouteMetadata } from "@/utils/route-metadata";

// One tab of the "Workflows" tab shell — it names itself, so the browser tab and
// its badge change as a person switches tabs (scripts/check-tab-shell-titles.ts).
export const metadata = createRouteMetadata("/workflows/all", {
  titlePrefix: "Bakeoff",
  title: "Workflows",
  letter: "BA",
});

export default function WorkflowsBakeoffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
