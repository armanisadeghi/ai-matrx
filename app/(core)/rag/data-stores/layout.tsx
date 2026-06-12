import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/rag/data-stores", {
  titlePrefix: "Data Stores",
  title: "Knowledge",
  description: "Create and manage vector data stores for RAG retrieval.",
  letter: "Ds",
});

export default function RagDataStoresLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
