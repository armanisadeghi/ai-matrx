import type { Metadata } from "next";
import { EduToolComingSoon } from "@/features/education/components/EduToolComingSoon";
import { toolMetadata } from "@/features/education/route-helpers";

export const metadata: Metadata = toolMetadata("audio-study");

// Authoring surface (title / voices / regenerate) — gated to EDIT permission.
export default function AudioStudyEditPage() {
  return <EduToolComingSoon slug="audio-study" surface={{ label: "Edit audio", gate: "edit" }} />;
}
