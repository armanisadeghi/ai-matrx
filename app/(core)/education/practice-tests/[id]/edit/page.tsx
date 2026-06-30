import type { Metadata } from "next";
import { EduToolComingSoon } from "@/features/education/components/EduToolComingSoon";
import { toolMetadata } from "@/features/education/route-helpers";

export const metadata: Metadata = toolMetadata("practice-tests");

// Authoring surface — gated to EDIT permission (see ROUTING.md).
export default function PracticeTestEditPage() {
  return <EduToolComingSoon slug="practice-tests" surface={{ label: "Edit the test", gate: "edit" }} />;
}
