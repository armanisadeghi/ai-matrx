import type { Metadata } from "next";
import { toolMetadata } from "@/features/education/route-helpers";
import { StudyGuideReader } from "@/features/education/study-guides/components/StudyGuideReader";
import { readLayoutCookie } from "@/features/resizable-panels/readLayoutCookie";

export const metadata: Metadata = toolMetadata("study-guides");

export default async function StudyGuidePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ edit?: string }> }) {
  const [{ id }, query, defaultLayout] = await Promise.all([params, searchParams, readLayoutCookie("panels:study-guide-reader")]);
  return <StudyGuideReader initialGuideId={id} startInEdit={query.edit === "1"} defaultLayout={defaultLayout} />;
}
