import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/knowledge/library-catalog", {
  titlePrefix: "Library Catalog",
  title: "Knowledge",
  description:
    "Discover shared knowledge libraries and see what your organization is entitled to.",
  // favicon-letter-ok: /rag is the compatibility alias of /knowledge until the structural cutover — the same page, so the same badge.
  letter: "LC",
});

export default function RagLibraryCatalogLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
