import type { Metadata } from "next";
import { toolMetadata } from "@/features/education/route-helpers";
import { MemoryDetail } from "@/features/education/memory/components/MemoryDetail";

export const metadata: Metadata = toolMetadata("memory");

// View the memory aids — the shareable URL. Access enforced by RLS + the
// study_media view gate; owner controls render only for the owner.
export default async function MemoryViewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <MemoryDetail mediaId={id} />;
}
