import type { Metadata } from "next";
import { EduToolComingSoon } from "@/features/education/components/EduToolComingSoon";
import { toolMetadata } from "@/features/education/route-helpers";

export const metadata: Metadata = toolMetadata("notes");

export default function NotesToolPage() {
  return <EduToolComingSoon slug="notes" />;
}
