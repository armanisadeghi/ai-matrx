import type { Metadata } from "next";
import { EduToolComingSoon } from "@/features/education/components/EduToolComingSoon";
import { toolMetadata } from "@/features/education/route-helpers";

export const metadata: Metadata = toolMetadata("audio-study");

export default function AudioStudyNewPage() {
  return <EduToolComingSoon slug="audio-study" surface={{ label: "Generate audio", gate: "auth" }} />;
}
