import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/rag/search", {
  titlePrefix: "Search",
  title: "Knowledge",
  description: "Semantic search across your knowledge bases and data stores.",
  letter: "Rq",
});

export default function RagSearchLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
