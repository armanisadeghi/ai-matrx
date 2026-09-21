import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/podcast", {
  titlePrefix: "Run",
  title: "Podcasts",
  description: "Podcast studio production run.",
  letter: "PR",
});

export default function PodcastStudioRunVariantLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
