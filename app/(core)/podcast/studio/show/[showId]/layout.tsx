import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/podcast", {
  titlePrefix: "Show",
  title: "Podcasts",
  description: "Podcast show studio workspace.",
  letter: "J",
});

export default function PodcastStudioShowLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
