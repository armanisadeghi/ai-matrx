import type { Metadata } from "next";
import { EduToolComingSoon } from "@/features/education/components/EduToolComingSoon";
import { toolMetadata } from "@/features/education/route-helpers";

export const metadata: Metadata = toolMetadata("audio-study");

// Player — the shareable URL. Gated by the audio item's view access.
export default function AudioStudyPlayerPage() {
  return <EduToolComingSoon slug="audio-study" surface={{ label: "Listen", gate: "view" }} />;
}
