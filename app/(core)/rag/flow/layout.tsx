import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/knowledge", {
  titlePrefix: "Flow",
  title: "Knowledge",
  description: "Visualize and manage Knowledge ingestion and search flows.",
  // favicon-letter-ok: /rag is the compatibility alias of /knowledge until the structural cutover — the same page, so the same badge.
  letter: "KF",
});

export default function RagFlowLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
