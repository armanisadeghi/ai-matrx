import type { Metadata } from "next";
import { toolMetadata } from "@/features/education/route-helpers";
import { MindMapNew } from "@/features/education/media/mindmap/components/MindMapNew";

export const metadata: Metadata = toolMetadata("mind-maps");

export default function MindMapNewPage() {
  return <MindMapNew />;
}
