// app/(core)/libraries/[id]/page.tsx
//
// One Library: metrics that fill in while the catalogue streams, the Sources
// list, the server's Actions on a selection, and the jobs they start.
// Feature: features/source-library/.

import { LibraryPage } from "@/features/source-library/components/LibraryPage";

export default async function LibraryRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <LibraryPage libraryId={id} />;
}
