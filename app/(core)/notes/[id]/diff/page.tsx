import { NoteVersionDiffPage } from "@/features/notes/components/diff/NoteVersionDiffPage";

export const metadata = { title: "Note Version History | AI Matrx" };

export default async function NoteDiffRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <NoteVersionDiffPage noteId={id} />;
}
