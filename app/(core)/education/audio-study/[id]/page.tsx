import type { Metadata } from "next";
import { toolMetadata } from "@/features/education/route-helpers";
import { AudioStudyDetail } from "@/features/education/media/audio/components/AudioStudyDetail";

export const metadata: Metadata = toolMetadata("audio-study");

// Player + live generation — the shareable URL. Access is enforced by RLS + the
// study_media view gate; the component shows owner controls only to the owner.
export default async function AudioStudyPlayerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AudioStudyDetail mediaId={id} />;
}
