import type { Metadata } from "next";
import { toolMetadata } from "@/features/education/route-helpers";
import { StudyGuideReader } from "@/features/education/study-guides/components/StudyGuideReader";
import { readLayoutCookie } from "@/features/resizable-panels/readLayoutCookie";

export const metadata: Metadata = toolMetadata("study-guides");

export default async function StudyGuidesPage() {
  const defaultLayout = await readLayoutCookie("panels:study-guide-reader");
  return <StudyGuideReader defaultLayout={defaultLayout} />;
}
