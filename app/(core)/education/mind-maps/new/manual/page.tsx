import type { Metadata } from "next";
import { toolMetadata } from "@/features/education/route-helpers";
import { MindMapEditor } from "@/features/education/media/mindmap/components/MindMapEditor";

export const metadata: Metadata = toolMetadata("mind-maps");

export default function ManualMindMapPage() {
  return <MindMapEditor />;
}
