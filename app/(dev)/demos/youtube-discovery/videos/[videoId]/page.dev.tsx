import { redirect } from "next/navigation";

export default async function YouTubeDiscoveryVideoPage({
  params,
}: {
  params: Promise<{ videoId: string }>;
}) {
  const { videoId } = await params;
  redirect(
    `/marketing/discovery/youtube/videos/${encodeURIComponent(videoId)}`,
  );
}
