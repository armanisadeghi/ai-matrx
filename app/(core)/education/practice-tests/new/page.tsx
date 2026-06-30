import type { Metadata } from "next";
import { EduToolComingSoon } from "@/features/education/components/EduToolComingSoon";
import { toolMetadata } from "@/features/education/route-helpers";

export const metadata: Metadata = toolMetadata("practice-tests");

export default function PracticeTestNewPage() {
  return <EduToolComingSoon slug="practice-tests" surface={{ label: "Configure a practice test", gate: "auth" }} />;
}
