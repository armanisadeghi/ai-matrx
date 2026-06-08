import type { Metadata } from "next";
import { CreateView } from "@/features/podcasts/studio/components/CreateView";

export const metadata: Metadata = {
  title: "Create Episode — Podcast Studio",
  description:
    "Generate a fully produced two-host podcast episode from a topic, document, or notes — live.",
};

export default function CreateEpisodePage() {
  return (
    <div className="h-full w-full overflow-y-auto overscroll-contain bg-textured">
      <CreateView />
    </div>
  );
}
