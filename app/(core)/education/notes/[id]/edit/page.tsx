import type { Metadata } from "next";
import { EduToolComingSoon } from "@/features/education/components/EduToolComingSoon";
import { toolMetadata } from "@/features/education/route-helpers";

export const metadata: Metadata = toolMetadata("notes");

// Authoring surface — gated to EDIT permission (see ROUTING.md).
export default function NoteEditPage() {
  return <EduToolComingSoon slug="notes" surface={{ label: "Edit note", gate: "edit" }} />;
}
