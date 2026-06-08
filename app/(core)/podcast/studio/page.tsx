import type { Metadata } from "next";
import { StudioDashboard } from "@/features/podcasts/studio/components/StudioDashboard";

export const metadata: Metadata = {
  title: "Podcast Studio",
  description: "Create and manage AI-produced podcast episodes.",
};

export default function PodcastStudioPage() {
  return (
    <div className="h-full w-full overflow-y-auto overscroll-contain bg-textured">
      <StudioDashboard />
    </div>
  );
}
