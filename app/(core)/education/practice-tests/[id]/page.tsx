import type { Metadata } from "next";
import { EduToolComingSoon } from "@/features/education/components/EduToolComingSoon";
import { toolMetadata } from "@/features/education/route-helpers";

export const metadata: Metadata = toolMetadata("practice-tests");

// View/use surface — the shareable URL. Gated by the test's view access.
export default function PracticeTestTakePage() {
  return <EduToolComingSoon slug="practice-tests" surface={{ label: "Take the test", gate: "view" }} />;
}
