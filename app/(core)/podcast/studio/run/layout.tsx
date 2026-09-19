import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/podcast", {
  titlePrefix: "Run",
  title: "Podcasts",
  description: "Podcast studio production run.",
  letter: "PSR",
});

export default function PodcastStudioRunVariantLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
