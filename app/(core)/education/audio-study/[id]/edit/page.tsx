import type { Metadata } from "next";
import { toolMetadata } from "@/features/education/route-helpers";
import { AudioStudyDetail } from "@/features/education/media/audio/components/AudioStudyDetail";

export const metadata: Metadata = toolMetadata("audio-study");

// Authoring surface (regenerate / rename / delete / share). The owner controls
// live inside AudioStudyDetail; non-owners see the read-only player.
export default async function AudioStudyEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AudioStudyDetail mediaId={id} />;
}
