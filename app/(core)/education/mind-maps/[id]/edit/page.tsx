import type { Metadata } from "next";
import { toolMetadata } from "@/features/education/route-helpers";
import { requireAccess } from "@/utils/permissions/requireAccess";
import { MindMapDetail } from "@/features/education/media/mindmap/components/MindMapDetail";

export const metadata: Metadata = toolMetadata("mind-maps");

// Authoring surface (regenerate / delete / share). EDIT-gated on the SERVER via
// requireAccess (P7, ROUTING.md §2) — a view-only sharee is redirected to the
// read-only `[id]` view rather than dropped into an editor whose RLS writes
// silently fail. RLS stays the boundary; this is the UX redirect. Mirrors
// quizzes/[id]/edit — the canonical pattern. (Mind maps are `study_media` rows.)
export default async function MindMapEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireAccess("study_media", id, "edit", {
    redirectTo: `/education/mind-maps/${id}`,
  });
  return <MindMapDetail mediaId={id} />;
}
