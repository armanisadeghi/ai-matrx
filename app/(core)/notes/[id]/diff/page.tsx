import { NoteVersionDiffPage } from "@/features/notes/components/diff/NoteVersionDiffPage";


export default async function NoteDiffRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <NoteVersionDiffPage noteId={id} />;
}
