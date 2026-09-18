/**
 * The identity of a floating topic panel: (map, topic) — never the moment it
 * was opened.
 *
 * ONE owner of the format, because two places have to agree on it and they are
 * in different features: the opener
 * (`features/overlays/openers/topicalMapTopicPanel.tsx`) mints the instance id
 * when someone clicks a topic, and the URL hydrator
 * (`features/window-panels/url-sync/initUrlHydration.ts`) reads it back out of
 * `?panels=topic:<instanceId>` after a reload. A second hand-written split in
 * the hydrator would be a copy of this format that drifts the day the id gains
 * a third part.
 *
 * `|` is the separator because `?panels=` tokens are split on `:` and their
 * args on `_` and `-` (see `UrlPanelManager.parseParams`), and a topic slug or
 * a UUID map id can legitimately contain `-`.
 */

const SEPARATOR = "|";

export interface TopicPanelIdentity {
  mapId: string;
  /** Topics are addressed by SLUG everywhere the map reasons. */
  slug: string;
}

/** The deterministic instance id for one topic of one map. */
export function topicPanelInstanceId({ mapId, slug }: TopicPanelIdentity): string {
  return `${mapId}${SEPARATOR}${slug}`;
}

/**
 * Read an instance id back. Returns null for anything that is not a complete
 * (map, topic) pair — a panel with half an identity has no topic to show, and
 * the caller must say so rather than open an empty frame.
 */
export function parseTopicPanelInstanceId(
  instanceId: string | null | undefined,
): TopicPanelIdentity | null {
  if (!instanceId) return null;
  const separatorAt = instanceId.indexOf(SEPARATOR);
  if (separatorAt <= 0) return null;
  const mapId = instanceId.slice(0, separatorAt);
  const slug = instanceId.slice(separatorAt + SEPARATOR.length);
  if (!mapId || !slug) return null;
  return { mapId, slug };
}
