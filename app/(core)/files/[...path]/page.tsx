/**
 * Legacy folder deep-link redirect.
 *
 * Older navigation pushed `/files/<folder-path>` (missing the `/all`
 * segment). Static section routes (`/files/trash`, `/files/f/…`, etc.)
 * take precedence over this catch-all; anything else is treated as a
 * folder path and forwarded to the canonical `/files/all/<path>` route.
 */

import { redirect } from "next/navigation";

interface PageProps {
  params: Promise<{ path: string[] }>;
}

export default async function LegacyFilesFolderRedirect({ params }: PageProps) {
  const { path } = await params;
  const segments = path.map(encodeURIComponent).join("/");
  redirect(`/files/all/${segments}`);
}
