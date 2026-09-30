import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/knowledge", {
  titlePrefix: "Flow",
  title: "Knowledge",
  description: "Visualize and manage Knowledge ingestion and search flows.",
  letter: "KF",
});

export default function RagFlowLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
