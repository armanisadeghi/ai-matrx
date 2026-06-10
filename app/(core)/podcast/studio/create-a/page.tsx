import type { Metadata } from "next";
import { CreateViewA } from "./_components/CreateViewA";

export const metadata: Metadata = {
  title: "Create Episode — Podcast Studio",
  description:
    "Generate a fully produced two-host podcast episode from a topic, document, or notes — live.",
};

export default function CreateEpisodePageA() {
  return (
    <div className="h-full w-full overflow-y-auto overscroll-contain bg-textured">
      <CreateViewA />
    </div>
  );
}
