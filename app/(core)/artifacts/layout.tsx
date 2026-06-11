import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/artifacts", {
  title: "Artifacts",
  description: "Browse and manage CMS content artifacts and reusable blocks.",
  letter: "Ar",
});

export default function ArtifactsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
