import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/knowledge", {
  title: "Knowledge",
  description:
    "Knowledge hub — data stores, document library, semantic search, and repositories.",
  letter: "Kn",
});

export default function RagLayout({ children }: { children: React.ReactNode }) {
  return children;
}
