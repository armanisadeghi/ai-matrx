import type { Metadata } from "next";
import { EduToolComingSoon } from "@/features/education/components/EduToolComingSoon";
import { toolMetadata } from "@/features/education/route-helpers";

export const metadata: Metadata = toolMetadata("mind-maps");

export default function MindMapsToolPage() {
  return <EduToolComingSoon slug="mind-maps" />;
}
