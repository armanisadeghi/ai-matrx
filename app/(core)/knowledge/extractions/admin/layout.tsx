import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/knowledge/extractions", {
  titlePrefix: "Admin",
  title: "Extractions",
  description: "Knowledge extractions admin map and resources.",
  letter: "Ka",
});

export default function KnowledgeExtractionsAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
