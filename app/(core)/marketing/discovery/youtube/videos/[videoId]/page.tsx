import { permanentRedirect } from "next/navigation";
import { marketingRoutes } from "@/features/marketing/lib/routes";

/** Legacy address — YouTube research is an agency tool now. */
export default async function YouTubeDiscoveryVideoShim({
  params,
}: {
  params: Promise<{ videoId: string }>;
}) {
  const { videoId } = await params;
  permanentRedirect(marketingRoutes.youtubeVideo(videoId));
}
