import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/rag/library-catalog", {
  titlePrefix: "Library Catalog",
  title: "Knowledge",
  description:
    "Discover shared knowledge libraries and see what your organization is entitled to.",
  letter: "Lc",
});

export default function RagLibraryCatalogLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
