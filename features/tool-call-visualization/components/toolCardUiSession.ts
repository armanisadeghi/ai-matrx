/**
 * toolCardUiSession — module-scoped (session-lived) UI memory for tool cards,
 * keyed by callId.
 *
 * WHY THIS EXISTS: tool cards get remounted constantly during a live turn —
 * a single tool slot becomes a `tool_batch` the moment the next consecutive
 * tool starts (the card moves under a new parent), and at stream end the
 * whole turn flips from the live path (`InlineToolCard`) to the persisted
 * path (`DbToolCard`) with a different key scheme. When expand state lived in
 * component `useState`, every one of those remounts wiped it and re-ran the
 * "auto-expand → 3s → auto-collapse" cycle — finished tools popping open and
 * slamming shut all over the transcript (the "jumpy" bug).
 *
 * This map is the single source of truth for:
 *   - `userChoice`   — the user's explicit expand/collapse toggle. Sticks for
 *                      the whole session, across remounts and the
 *                      live→persisted flip.
 *   - `liveOpened`   — callIds that rendered live (non-persisted) this
 *                      session. A card that streamed in front of the user
 *                      STAYS open after the live→persisted flip; only a
 *                      reload (fresh session) mounts it collapsed.
 *
 * Deliberately NOT Redux: this is throwaway per-tab UI memory, not app state.
 * Unbounded growth is fine — a few booleans per tool call.
 */

const userChoiceByKey = new Map<string, boolean>();
const liveOpenedKeys = new Set<string>();

export function getToolCardUserChoice(key: string | null): boolean | null {
  if (!key) return null;
  return userChoiceByKey.get(key) ?? null;
}

export function setToolCardUserChoice(key: string | null, open: boolean): void {
  if (!key) return;
  userChoiceByKey.set(key, open);
}

export function markToolCardLive(key: string | null): void {
  if (!key) return;
  liveOpenedKeys.add(key);
}

export function wasToolCardLive(key: string | null): boolean {
  if (!key) return false;
  return liveOpenedKeys.has(key);
}
