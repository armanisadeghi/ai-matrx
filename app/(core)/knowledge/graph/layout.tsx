import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/knowledge", {
  titlePrefix: "Graph",
  title: "Knowledge",
  description:
    "Explore scope and context relationships in the knowledge graph.",
  letter: "KGR",
});

export default function KnowledgeGraphLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
