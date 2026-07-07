import type { Metadata } from "next";
import { toolMetadata } from "@/features/education/route-helpers";
import { MindMapDetail } from "@/features/education/media/mindmap/components/MindMapDetail";

export const metadata: Metadata = toolMetadata("mind-maps");

// View the map — the shareable URL. Access enforced by RLS + the study_media
// view gate; owner controls render only for the owner.
export default async function MindMapViewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <MindMapDetail mediaId={id} />;
}
