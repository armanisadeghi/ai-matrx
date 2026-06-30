import type { Metadata } from "next";
import { EduToolComingSoon } from "@/features/education/components/EduToolComingSoon";
import { toolMetadata } from "@/features/education/route-helpers";

export const metadata: Metadata = toolMetadata("mind-maps");

export default function MindMapNewPage() {
  return <EduToolComingSoon slug="mind-maps" surface={{ label: "Create a mind map", gate: "auth" }} />;
}
