import type { Metadata } from "next";
import { EduToolComingSoon } from "@/features/education/components/EduToolComingSoon";
import { toolMetadata } from "@/features/education/route-helpers";

export const metadata: Metadata = toolMetadata("mind-maps");

// Authoring surface — gated to EDIT permission (see ROUTING.md).
export default function MindMapEditPage() {
  return <EduToolComingSoon slug="mind-maps" surface={{ label: "Edit the map", gate: "edit" }} />;
}
