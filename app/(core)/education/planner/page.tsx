import type { Metadata } from "next";
import { EduToolComingSoon } from "@/features/education/components/EduToolComingSoon";
import { toolMetadata } from "@/features/education/route-helpers";

export const metadata: Metadata = toolMetadata("planner");

export default function PlannerToolPage() {
  return <EduToolComingSoon slug="planner" />;
}
