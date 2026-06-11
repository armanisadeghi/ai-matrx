import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/rag/repositories", {
  titlePrefix: "Repositories",
  title: "Knowledge",
  description: "Manage document repositories connected to your RAG pipeline.",
  letter: "Rp",
});

export default function RagRepositoriesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
