import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/scopes", {
  titlePrefix: "Graph",
  title: "Scopes",
  description: "Visualize scope relationships as a graph.",
  letter: "S",
});

export default function ScopeGraphLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
