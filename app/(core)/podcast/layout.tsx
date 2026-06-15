import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/podcast", {
  title: "Podcasts",
  description: "Browse podcast shows and open the AI podcast studio.",
  letter: "J",
});

export default function PodcastLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
