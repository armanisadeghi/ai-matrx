import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/rag", {
  title: "Knowledge",
  description:
    "RAG hub — data stores, document library, semantic search, and repositories.",
  letter: "Rg",
});

export default function RagLayout({ children }: { children: React.ReactNode }) {
  return children;
}
