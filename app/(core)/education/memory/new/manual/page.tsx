import type { Metadata } from "next";
import { toolMetadata } from "@/features/education/route-helpers";
import { MemoryEditor } from "@/features/education/memory/components/MemoryEditor";

export const metadata: Metadata = toolMetadata("memory");
export default function ManualMemoryPage() { return <MemoryEditor />; }
