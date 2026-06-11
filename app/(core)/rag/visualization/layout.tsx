import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/rag", {
  titlePrefix: "Visualization",
  title: "Knowledge",
  description: "Explore knowledge graph and RAG pipeline visualizations.",
  letter: "Rv",
});

export default function RagVisualizationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
