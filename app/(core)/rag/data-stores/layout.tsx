import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/knowledge/data-stores", {
  titlePrefix: "Data Stores",
  title: "Knowledge",
  description: "Create and manage vector data stores for Knowledge retrieval.",
  letter: "RDS",
});

export default function RagDataStoresLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
