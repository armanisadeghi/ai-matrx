import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/knowledge", {
  titlePrefix: "Visualization",
  title: "Knowledge",
  description: "Explore knowledge graph and Knowledge pipeline visualizations.",
  letter: "KV",
});

export default function RagVisualizationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
