import type { Metadata } from "next";
import { toolMetadata } from "@/features/education/route-helpers";
import { AudioStudyHome } from "@/features/education/media/audio/components/AudioStudyHome";

export const metadata: Metadata = toolMetadata("audio-study");

export default function AudioStudyToolPage() {
  return <AudioStudyHome />;
}
