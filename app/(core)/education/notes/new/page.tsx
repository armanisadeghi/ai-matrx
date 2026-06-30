import type { Metadata } from "next";
import { EduToolComingSoon } from "@/features/education/components/EduToolComingSoon";
import { toolMetadata } from "@/features/education/route-helpers";

export const metadata: Metadata = toolMetadata("notes");

export default function NoteNewPage() {
  return <EduToolComingSoon slug="notes" surface={{ label: "New note", gate: "auth" }} />;
}
