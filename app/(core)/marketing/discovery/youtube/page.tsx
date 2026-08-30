import { permanentRedirect } from "next/navigation";
import { marketingRoutes } from "@/features/marketing/lib/routes";

/** Legacy address — YouTube research is an agency tool now. */
export default function YouTubeDiscoveryShim() {
  permanentRedirect(marketingRoutes.youtubeDiscovery());
}
