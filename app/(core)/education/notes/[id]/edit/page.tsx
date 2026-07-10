// /education/notes/[id]/edit — the editor surface. Same workspace as the detail
// route (the reused notes editor is always editable for owners/editors and
// read-only-gated for viewers), kept as a distinct URL per the education routing
// convention.
import type { Metadata } from "next";
import { toolMetadata } from "@/features/education/route-helpers";
import { requireAccess } from "@/utils/permissions/requireAccess";
import { EduNoteWorkspace } from "@/features/education/notes/EduNoteWorkspace";

export const metadata: Metadata = toolMetadata("notes");

// EDIT-gated on the SERVER via requireAccess (P7, ROUTING.md §2) — a view-only
// sharee is redirected to the read-only `[id]` view rather than dropped into an
// editor whose RLS writes silently fail. RLS stays the boundary; this is the UX
// redirect. Mirrors quizzes/[id]/edit. (Education notes are `note` rows.)
export default async function NoteEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireAccess("note", id, "edit", {
    redirectTo: `/education/notes/${id}`,
  });
  return <EduNoteWorkspace noteId={id} />;
}
