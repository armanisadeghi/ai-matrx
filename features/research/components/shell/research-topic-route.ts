// The route family that owns the Research topic menu in the app shell sidebar.
// Kept beside the menu and free of React so the shell registry and tests can
// import it without pulling the menu into their chunk.

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/** `/research/topics/<uuid>` and every sub-route under it. */
export const RESEARCH_TOPIC_PATH_PATTERN = new RegExp(
  `^\\/research\\/topics\\/${UUID}(?:\\/|$)`,
  "i",
);

/** The topic id carried by a topic workspace path, or null outside one. */
export function researchTopicIdFromPath(pathname: string): string | null {
  const match = pathname.match(
    new RegExp(`^\\/research\\/topics\\/(${UUID})(?:\\/|$)`, "i"),
  );
  return match?.[1] ?? null;
}
