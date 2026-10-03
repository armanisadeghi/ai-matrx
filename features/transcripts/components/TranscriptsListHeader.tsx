"use client";

import { usePathname } from "next/navigation";
import {
  deriveTranscriptsMode,
  getTranscriptsModeHref,
  TRANSCRIPTS_MODES,
} from "@/features/transcripts/constants/transcriptsRoutes";
import { MandateDoorLink } from "@/features/mandates/components/MandateDoorLink";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import {
  RouteModeNav,
  type RouteNavItem,
} from "@/features/shell/components/header/RouteModeNav";

const TRANSCRIPTS_NAV_ITEMS: RouteNavItem[] = TRANSCRIPTS_MODES.map(
  ({ label, icon, href, blurb }) => ({ name: label, href, icon, description: blurb }),
);

/**
 * Shared transcripts shell header — route nav + THE DOOR to Scribe's agents,
 * on the shared RouteHeader: the nav steps down (full → icons → menu) by the
 * main column's width and the door folds into "…" instead of the row
 * scrolling under its clip beside an open canvas.
 */
export function TranscriptsListHeader() {
  const pathname = usePathname();
  const activeHref = getTranscriptsModeHref(deriveTranscriptsMode(pathname));
  return (
    <RouteHeader
      center={<RouteModeNav items={TRANSCRIPTS_NAV_ITEMS} activeHref={activeHref} />}
      right={<MandateDoorLink feature="transcript_studio" label="Transcript agents" />}
    />
  );
}
