import EditByIdClient from "./EditByIdClient";

/**
 * /images/edit/[id]
 *
 * Canonical entry for editing a known cloud file. The id IS the source of
 * truth — refresh-safe, share-safe, version-history-safe. Any path that
 * lands here without an id renders the landing page at /images/edit.
 *
 * Header + outer chrome are owned by `app/(a)/images/layout.tsx`.
 */

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ folder?: string }>;
}

export default async function EditByIdPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { folder } = await searchParams;
  return <EditByIdClient cloudFileId={id} folder={folder} />;
}
