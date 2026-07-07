import type { Metadata } from "next";
import { toolMetadata } from "@/features/education/route-helpers";
import { MindMapDetail } from "@/features/education/media/mindmap/components/MindMapDetail";

export const metadata: Metadata = toolMetadata("mind-maps");

// Authoring surface (regenerate / delete / share). Owner controls live inside
// MindMapDetail; non-owners see the read-only map.
export default async function MindMapEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <MindMapDetail mediaId={id} />;
}
