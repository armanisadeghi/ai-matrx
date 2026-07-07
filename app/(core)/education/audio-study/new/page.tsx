import type { Metadata } from "next";
import { toolMetadata } from "@/features/education/route-helpers";
import { AudioStudyNew } from "@/features/education/media/audio/components/AudioStudyNew";

export const metadata: Metadata = toolMetadata("audio-study");

export default function AudioStudyNewPage() {
  return <AudioStudyNew />;
}
