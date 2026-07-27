import { YouTubeVideoPreviewPage } from "@/features/marketing/discovery/youtube/YouTubeVideoPreviewPage";

export default async function YouTubeDiscoveryVideoPage({
  params,
}: {
  params: Promise<{ videoId: string }>;
}) {
  const { videoId } = await params;
  return <YouTubeVideoPreviewPage videoId={videoId} />;
}
