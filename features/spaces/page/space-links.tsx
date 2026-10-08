"use client";

// features/spaces/page/space-links.tsx — the pages THIS Space links to, and the pages mentioning it, as the
// route read them (round 40).
//
// `space-page-seed.server.ts` reads every linked page's title, icon and trash state in one call
// (`content.space_summaries`) beside the page itself, so page rows and mentions draw their names in the
// server HTML and the browser asks nothing per link. Per id: a summary (archived = in Trash), null (the
// person cannot open it), or absent (not known at load — a link added later; the block asks through the
// provider's batched `requestLink`). Read-only: the open tree (`byId`) still wins when it holds the page.

import { createContext, useContext, type ReactNode } from "react";

import type { SpaceSummary } from "../contract";

export type SpaceLinks = Record<string, SpaceSummary | null>;

/** One page that mentions this one (`content.space_backlinks`, as the route read it). */
export interface SeededBacklink {
  id: string;
  title: string;
  icon: unknown;
}

interface Seeded {
  links: SpaceLinks | null;
  /** The page these backlinks are for, and the rows (the route's read; absent = the browser asks). */
  backlinks: { spaceId: string; rows: SeededBacklink[] } | null;
}

const SpaceLinksContext = createContext<Seeded>({ links: null, backlinks: null });

export function SpaceLinksProvider({
  links,
  backlinks,
  children,
}: {
  links?: SpaceLinks | null;
  backlinks?: { spaceId: string; rows: SeededBacklink[] } | null;
  children: ReactNode;
}) {
  return <SpaceLinksContext.Provider value={{ links: links ?? null, backlinks: backlinks ?? null }}>{children}</SpaceLinksContext.Provider>;
}

/** What the route knew about one linked page: summary, null (no access), undefined (not known at load). */
export function useSeededLink(id: string): SpaceSummary | null | undefined {
  const { links } = useContext(SpaceLinksContext);
  if (!links || !(id in links)) return undefined;
  return links[id];
}

/** The pages mentioning `spaceId`, as the route read them (undefined = not read: the block asks). */
export function useSeededBacklinks(spaceId: string): SeededBacklink[] | undefined {
  const { backlinks } = useContext(SpaceLinksContext);
  return backlinks && backlinks.spaceId === spaceId ? backlinks.rows : undefined;
}
