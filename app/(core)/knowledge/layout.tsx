import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/knowledge", {
  title: "Knowledge System",
  description:
    "Source to knowledge to answer — the Matrx seven-phase knowledge pipeline.",
  letter: "Kn",
});

export default function KnowledgeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
