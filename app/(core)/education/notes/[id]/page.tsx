// /education/notes/[id] — the Smart Notes editor + convert/capture surface.
// Editable rich note (workbench-backed) with one-click conversion to study
// artifacts. Access is gated client-side (P7 useAccess) inside the reused notes
// editor + RLS; a view-only sharee sees a read-only editor + duplicate-to-edit.
import type { Metadata } from "next";
import { toolMetadata } from "@/features/education/route-helpers";
import { EduNoteWorkspace } from "@/features/education/notes/EduNoteWorkspace";

export const metadata: Metadata = toolMetadata("notes");

export default async function NoteReadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <EduNoteWorkspace noteId={id} />;
}
