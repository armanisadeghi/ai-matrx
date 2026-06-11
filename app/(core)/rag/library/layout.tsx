import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/rag/library", {
  titlePrefix: "Library",
  title: "Knowledge",
  description: "Browse ingested documents and knowledge library entries.",
  letter: "Rl",
});

export default function RagLibraryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
