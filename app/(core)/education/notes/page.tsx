// /education/notes — Smart Notes home (list-first "savior" view).
import type { Metadata } from "next";
import { toolMetadata } from "@/features/education/route-helpers";
import { EduNotesHome } from "@/features/education/notes/EduNotesHome";

export const metadata: Metadata = toolMetadata("notes");

export default function NotesToolPage() {
  return <EduNotesHome />;
}
