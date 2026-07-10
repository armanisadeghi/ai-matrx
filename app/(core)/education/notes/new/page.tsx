// /education/notes/new — create a note and open it.
import type { Metadata } from "next";
import { toolMetadata } from "@/features/education/route-helpers";
import { EduNoteNew } from "@/features/education/notes/EduNoteNew";

export const metadata: Metadata = toolMetadata("notes");

export default function NewNotePage() {
  return <EduNoteNew />;
}
