import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/podcast", {
  titlePrefix: "Studio",
  title: "Podcasts",
  description: "Create and manage AI-produced podcast episodes.",
  letter: "Ps",
});

export default function PodcastStudioLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
