import type { Metadata } from "next";
import { EduToolComingSoon } from "@/features/education/components/EduToolComingSoon";
import { toolMetadata } from "@/features/education/route-helpers";

export const metadata: Metadata = toolMetadata("notes");

// Read a note — the shareable URL. Gated by the note's view access.
export default function NoteReadPage() {
  return <EduToolComingSoon slug="notes" surface={{ label: "Read a note", gate: "view" }} />;
}
