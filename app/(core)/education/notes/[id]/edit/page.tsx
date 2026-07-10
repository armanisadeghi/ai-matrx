// /education/notes/[id]/edit — the editor surface. Same workspace as the detail
// route (the reused notes editor is always editable for owners/editors and
// read-only-gated for viewers), kept as a distinct URL per the education routing
// convention.
import type { Metadata } from "next";
import { toolMetadata } from "@/features/education/route-helpers";
import { EduNoteWorkspace } from "@/features/education/notes/EduNoteWorkspace";

export const metadata: Metadata = toolMetadata("notes");

export default async function NoteEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <EduNoteWorkspace noteId={id} />;
}
