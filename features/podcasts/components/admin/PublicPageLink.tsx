"use client";

/**
 * PublicPageLink — the door beside every "copy public link" button.
 *
 * THE DOOR LAW (common-docs/policies/no-dead-ends.md): the podcast admin
 * consoles have always been able to hand the user the public URL of a show or
 * episode as a STRING (clipboard) while offering no way to open it. The public
 * route (`app/(core)/podcast/[slug]`) resolves a show or an episode, by slug or
 * uuid, filtering only `deleted_at is null` — publication state does not gate
 * it — so a draft is reachable here too, exactly as the copied link is.
 *
 * Deliberately narrow: it is one anchor, so it can sit inside the existing
 * hover action clusters without restyling them. Doors to the RECORD itself
 * (open / new tab / peek) come from `EntityRef`, never from here.
 */

import NextLink from "next/link";
import { Globe } from "lucide-react";
import { podcastPublicHref } from "../../utils";

export function PublicPageLink({
  slug,
  label,
  className,
}: {
  /** The record's public slug (a uuid also resolves). */
  slug: string;
  /** Show/episode title — used for the control's accessible name only. */
  label: string;
  className?: string;
}) {
  return (
    <NextLink
      href={podcastPublicHref(slug)}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      title={`Open the public page for ${label}`}
      aria-label={`Open the public page for ${label}`}
      className={`rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground ${className ?? ""}`}
    >
      <Globe className="h-3.5 w-3.5" />
    </NextLink>
  );
}
