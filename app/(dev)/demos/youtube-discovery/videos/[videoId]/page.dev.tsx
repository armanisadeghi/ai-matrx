import { YouTubeVideoPreviewPage } from "@/features/research/youtube-discovery/YouTubeVideoPreviewPage";

export default async function YouTubeDiscoveryVideoPage({
  params,
}: {
  params: Promise<{ videoId: string }>;
}) {
  const { videoId } = await params;
  return <YouTubeVideoPreviewPage videoId={videoId} />;
}
