// features/spaces/page/linked-pages.ts — every page a Space's stored blocks point at (round 40).
//
// Sub-page rows and link-to-page blocks carry `props.spaceId`; an inline page mention carries its target
// inside the span's JSON (`{"kind":"space","spaceId":…}`), stored as an escaped string. One pass over the
// stored JSON finds both, at any depth (nested blocks, columns, toggles), so the route can ask for all of
// them in ONE read (`content.space_summaries`) instead of one full page read per link.

import type { SpaceBlock } from "../contract";

const SPACE_ID = /\\*"spaceId\\*"\s*:\s*\\*"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi;

/** The distinct page ids the blocks link to (self excluded). */
export function linkedPageIds(blocks: readonly SpaceBlock[], self?: string): string[] {
  const found = new Set<string>();
  for (const m of JSON.stringify(blocks).matchAll(SPACE_ID)) found.add(m[1].toLowerCase());
  if (self) found.delete(self.toLowerCase());
  return [...found];
}
