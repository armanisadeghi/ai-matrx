import type { Metadata } from "next";
import { toolMetadata } from "@/features/education/route-helpers";
import { requireAccess } from "@/utils/permissions/requireAccess";
import { AudioStudyDetail } from "@/features/education/media/audio/components/AudioStudyDetail";

export const metadata: Metadata = toolMetadata("audio-study");

// Authoring surface (regenerate / rename / delete / share). EDIT-gated on the
// SERVER via requireAccess (P7, ROUTING.md §2) — a view-only sharee is
// redirected to the read-only `[id]` player rather than dropped into an editor
// whose RLS writes silently fail. RLS stays the boundary; this is the UX
// redirect. Mirrors quizzes/[id]/edit. (Audio study kits are `study_media` rows.)
export default async function AudioStudyEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireAccess("study_media", id, "edit", {
    redirectTo: `/education/audio-study/${id}`,
  });
  return <AudioStudyDetail mediaId={id} />;
}
