import { createPodcastStudioRunMetadata } from "@/features/podcasts/utils/podcast-studio-metadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return createPodcastStudioRunMetadata(id, { titlePrefix: "Sharp" });
}

export default function PodcastStudioRunSharpLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
