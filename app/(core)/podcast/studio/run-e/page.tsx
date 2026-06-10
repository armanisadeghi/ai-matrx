import type { Metadata } from "next";
import { RunConsole } from "./_components/RunConsole";

export const metadata: Metadata = {
  title: "Producing — Podcast Studio",
  description:
    "Your podcast is being produced — live stage-by-stage progress, then the finished episode.",
};

// Variation E — the live production console.
export default function StudioRunPageE() {
  return (
    <div className="h-page w-full overflow-hidden bg-textured">
      <RunConsole />
    </div>
  );
}
