"use client";

/**
 * THE ONE body of the topic detail panel (CONTRACTS.md §5).
 *
 * Every host renders THIS: the floating window, the mobile drawer, the peek,
 * and later the canvas. There is no second copy anywhere — a panel wraps the
 * canonical component, it never grows a bespoke body (CLAUDE.md § A WINDOW
 * PANEL WRAPS THE CANONICAL COMPONENT).
 *
 * 🚨 PHASE 0 SHIPS AN HONEST STUB, NOT A PLACEHOLDER THAT PRETENDS.
 * It shows the topic's real name and its real path from the store, and then
 * says in one sentence that the panel is still being built. That is the whole
 * of the "nothing fails silently" law here: a person who opens this knows
 * exactly what they are looking at and that nothing is broken. Lane D fills the
 * body in; nothing about these props changes when it does.
 *
 * It reads ONLY from the slice — no fetch of its own. The workspace that opened
 * it already loaded the tree, so the panel is instant; a host that opens it
 * over an unloaded map says so rather than spinning forever (see below).
 */

import { Network } from "lucide-react";

import { useAppSelector } from "@/lib/redux/hooks";

import { TopicalMapFailed } from "../components/TopicalMapStates";
import type { MapHost } from "../components/TopicalMapWorkspaceBody";
import { selectMapLoadedAt, selectMapTopic, selectMapTopicPath } from "../redux/selectors";

export interface TopicDetailBodyProps {
  mapId: string;
  slug: string;
  siteId: string | null;
  host: MapHost;
  readOnly?: boolean;
}

export function TopicDetailBody({ mapId, slug, host }: TopicDetailBodyProps) {
  const topic = useAppSelector(selectMapTopic(mapId, slug));
  const path = useAppSelector(selectMapTopicPath(mapId, slug));
  const loadedAt = useAppSelector(selectMapLoadedAt(mapId));

  if (!topic) {
    /**
     * An unknown slug is exactly what `seo.*` answers `P0002` for, and the two
     * cases a reader needs told apart are "this map is not open here" and "this
     * map has no such topic" — so they are two different sentences, carrying
     * the same shape every other refusal in this feature uses.
     */
    const error = new Error(
      loadedAt
        ? `This map has no topic "${slug}". A rejected or retired topic answers exactly like an invented one, on purpose — look on the map's History screen.`
        : `This map's topics are not loaded here yet, so "${slug}" cannot be shown. Open the map's workspace and try again.`,
    );
    return (
      <div className="p-4">
        <TopicalMapFailed what="this topic" error={error} />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto p-4">
      <div className="flex items-start gap-2">
        <Network
          className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
          aria-hidden
        />
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold">{topic.name}</h2>
          <p className="truncate font-mono text-xs text-muted-foreground">
            {slug}
          </p>
        </div>
      </div>

      {/* Root-first crumbs, straight from `selectMapTopicPath`. Slugs address
          topics; this is the path the map itself reasons in. */}
      <p className="mt-3 break-words text-xs text-muted-foreground">
        {path.join(" › ")}
      </p>

      {topic.description ? (
        <p className="mt-3 whitespace-pre-wrap text-sm">{topic.description}</p>
      ) : null}

      <p className="mt-4 rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
        The topic panel is being built; what you see here is the placeholder that
        will become it.
      </p>

      {/* The host is printed because this body renders in five of them and a
          reviewer needs to see which one they are looking at while the panel is
          still being assembled. It is one word, not chrome. */}
      <p className="mt-2 text-xs text-muted-foreground">Opened as: {host}</p>
    </div>
  );
}
