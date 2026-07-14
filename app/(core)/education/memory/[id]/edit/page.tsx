import type { Metadata } from "next";
import { toolMetadata } from "@/features/education/route-helpers";
import { requireAccess } from "@/utils/permissions/requireAccess";
import { MemoryDetail } from "@/features/education/memory/components/MemoryDetail";

export const metadata: Metadata = toolMetadata("memory");

// Authoring surface (regenerate / delete / share). EDIT-gated on the SERVER via
// requireAccess (P7, ROUTING.md §2) — a view-only sharee is redirected to the
// read-only `[id]` view rather than dropped into an editor whose RLS writes
// silently fail. RLS stays the boundary; this is the UX redirect. Mirrors
// mind-maps/[id]/edit (memory aids are `study_media` rows too).
export default async function MemoryEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireAccess("study_media", id, "edit", {
    redirectTo: `/education/memory/${id}`,
  });
  return <MemoryDetail mediaId={id} />;
}
