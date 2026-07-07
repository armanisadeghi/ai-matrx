import type { Metadata } from "next";
import { toolMetadata } from "@/features/education/route-helpers";
import { MindMapHome } from "@/features/education/media/mindmap/components/MindMapHome";

export const metadata: Metadata = toolMetadata("mind-maps");

export default function MindMapsToolPage() {
  return <MindMapHome />;
}
