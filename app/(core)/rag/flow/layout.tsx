import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/rag", {
  titlePrefix: "Flow",
  title: "Knowledge",
  description: "Visualize and manage RAG ingestion and search flows.",
  letter: "Rf",
});

export default function RagFlowLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
