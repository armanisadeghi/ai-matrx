import type { Metadata } from "next";
import { EduToolComingSoon } from "@/features/education/components/EduToolComingSoon";
import { toolMetadata } from "@/features/education/route-helpers";

export const metadata: Metadata = toolMetadata("mind-maps");

// View the map — the shareable URL. Gated by the map's view access.
export default function MindMapViewPage() {
  return <EduToolComingSoon slug="mind-maps" surface={{ label: "View the map", gate: "view" }} />;
}
