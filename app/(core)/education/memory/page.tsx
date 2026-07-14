import type { Metadata } from "next";
import { toolMetadata } from "@/features/education/route-helpers";
import { MemoryHome } from "@/features/education/memory/components/MemoryHome";

export const metadata: Metadata = toolMetadata("memory");

export default function MemoryToolPage() {
  return <MemoryHome />;
}
