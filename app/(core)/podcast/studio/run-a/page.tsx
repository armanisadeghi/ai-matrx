import type { Metadata } from "next";
import { RunViewA } from "./_components/RunViewA";

export const metadata: Metadata = {
  title: "Episode — Podcast Studio",
  description:
    "Your podcast generation — live progress and the finished episode.",
};

export default function StudioRunPageA() {
  return (
    <div className="h-full w-full overflow-y-auto overscroll-contain bg-textured">
      <RunViewA />
    </div>
  );
}
