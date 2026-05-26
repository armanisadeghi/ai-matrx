import EditLandingClient from "./EditLandingClient";

/**
 * /images/edit
 *
 * Landing screen. Resolves the user's chosen source (upload / paste / drop /
 * URL / "My Files" picker) to a cloud-file id, then routes them to
 * /images/edit/[id] — the canonical editor surface.
 *
 * The URL is the source of truth: refresh-safe, share-safe, version-safe.
 */

interface PageProps {
  searchParams: Promise<{ folder?: string }>;
}

export default async function EditLandingPage({ searchParams }: PageProps) {
  const { folder } = await searchParams;
  return <EditLandingClient folder={folder} />;
}
