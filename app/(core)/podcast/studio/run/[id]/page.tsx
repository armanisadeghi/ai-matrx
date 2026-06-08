import type { Metadata } from "next";
import { StudioRunView } from "@/features/podcasts/studio/components/StudioRunView";

export const metadata: Metadata = {
  title: "Episode — Podcast Studio",
  description: "Your podcast generation — live progress and the finished episode.",
};

export default async function StudioRunPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="h-full w-full overflow-y-auto overscroll-contain bg-textured">
      <StudioRunView runId={id} />
    </div>
  );
}
