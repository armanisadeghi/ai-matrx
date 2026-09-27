"use client";

/**
 * The Source embed: THE Source screen (`SourceStudio`) in the hub's peek, in
 * its `embedded` frame — the web page's scraper result view, the PDF studio's
 * viewer at the matched page, or the transcript with its player seeked to the
 * hit — with the version bar, Save, Edit, Process now, Capture again and
 * "Attached to" exactly as on /knowledge/sources/[id].
 */

import { SourceStudio } from "@/features/source-studio/components/SourceStudio";
import type { SourceDeepLink } from "@/features/source-studio/sourceStudioModel";

export function SourceEmbed({ sourceId, deepLink }: { sourceId: string; deepLink: SourceDeepLink }) {
  return (
    <div className="h-full min-h-0" data-testid="hub-embed-source">
      <SourceStudio documentId={sourceId} deepLink={deepLink} embedded />
    </div>
  );
}
