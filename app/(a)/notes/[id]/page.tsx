// app/(a)/notes/[id]/page.tsx
// Direct deep-link to a single note by id.
// The parent layout renders <NotesView /> which reads the [id] param via
// useParams() and opens the note as the active tab. This page is an empty
// placeholder so the route resolves — same pattern as app/(a)/notes/page.tsx.
export default function NoteByIdPage() {
  return null;
}
