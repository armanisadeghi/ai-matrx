import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/knowledge", {
  titlePrefix: "Graph",
  title: "Knowledge",
  description: "Legacy redirect to the knowledge graph.",
  letter: "Kg",
});

export default function LegacyKnowledgeGraphLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
