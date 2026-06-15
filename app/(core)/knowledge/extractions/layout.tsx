import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/knowledge/extractions", {
  titlePrefix: "Extractions",
  title: "Knowledge",
  description: "Browse and manage knowledge extractions.",
  letter: "Ke",
});

export default function KnowledgeExtractionsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
