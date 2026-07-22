/**
 * Legacy folder deep-link redirect.
 *
 * Older navigation pushed `/files/<folder-path>` (missing the `/all`
 * segment). Static section routes (`/files/trash`, `/files/f/…`, etc.)
 * take precedence over this catch-all; anything else is treated as a
 * folder path and forwarded to the canonical `/files/all/<path>` route.
 *
 * SELF-HEAL GUARD (2026-07-22): in dev, while sibling static routes are
 * still compiling on-demand, the router can bounce URLs that belong to
 * `/files/all/[[...path]]` or `/files/f/[fileId]` through this catch-all.
 * Unguarded, that compounds — `/files/all` → `/files/all/all` → … — into
 * an infinite redirect loop that makes the whole Files area unusable.
 * So: strip any accumulated `all` prefix segments, and if what remains
 * starts with a known static section, send it back to that section's
 * canonical URL instead of prefixing `/all/` onto it.
 */

import { redirect } from "next/navigation";

/** First segments owned by static sibling routes — never folder paths. */
const STATIC_SECTIONS = new Set([
  "f",
  "trash",
  "shared",
  "requests",
  "starred",
  "recents",
  "folders",
  "photos",
  "webhooks",
  "activity",
  "admin",
]);

interface PageProps {
  params: Promise<{ path: string[] }>;
}

export default async function LegacyFilesFolderRedirect({ params }: PageProps) {
  const { path } = await params;

  // Strip mis-accumulated `all` prefixes (see SELF-HEAL GUARD above).
  const rest = [...path];
  while (rest[0] === "all") rest.shift();

  if (rest.length === 0) {
    redirect("/files/all");
  }

  const segments = rest.map(encodeURIComponent).join("/");

  if (STATIC_SECTIONS.has(rest[0])) {
    redirect(`/files/${segments}`);
  }

  redirect(`/files/all/${segments}`);
}
