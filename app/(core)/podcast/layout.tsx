import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/podcast", {
  title: "Podcasts",
  description: "Browse podcast shows and open the AI podcast studio.",
  letter: "PC",
});

export default function PodcastLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
