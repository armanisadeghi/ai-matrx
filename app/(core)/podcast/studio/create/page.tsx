import type { Metadata } from "next";
import { PodcastGenerator } from "@/features/podcasts/generator/components/PodcastGenerator";

export const metadata: Metadata = {
  title: "Create Episode — Podcast Studio",
  description:
    "Generate a fully produced two-host podcast episode from a topic, document, or notes — live.",
};

export default function CreateEpisodePage() {
  return (
    <div className="h-full w-full overflow-y-auto overscroll-contain bg-textured">
      <PodcastGenerator />
    </div>
  );
}
