import type { Metadata } from "next";
import { toolMetadata } from "@/features/education/route-helpers";
import { MemoryNew } from "@/features/education/memory/components/MemoryNew";

export const metadata: Metadata = toolMetadata("memory");

export default function MemoryNewPage() {
  return <MemoryNew />;
}
