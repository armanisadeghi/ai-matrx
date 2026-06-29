import type { Metadata } from "next";
import { EduToolComingSoon } from "@/features/education/components/EduToolComingSoon";
import { toolMetadata } from "@/features/education/route-helpers";

export const metadata: Metadata = toolMetadata("flashcards");

export default function FlashcardsToolPage() {
  return <EduToolComingSoon slug="flashcards" />;
}
