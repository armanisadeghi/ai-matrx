// features/scopes/service/favoriteOverlay.ts
//
// The ONE way a list surface learns and changes the caller's favorite stars.
//
// Favorites are per-PERSON state and live in `platform.user_entity_state`
// (reached only through the `favoritesService` chokepoint). The duplicated
// `is_favorite` columns on entity tables (`agent.definition`,
// `workflow.definition`, `chat.conversation`) are retired: nothing reads or
// writes them from the client. A list reads its rows, then asks for the stars
// of exactly that page in ONE `ues_get_bulk` round trip, and overlays them.
//
// A failed star read never blocks the list — it logs loudly and the stars
// render unset. A failed star WRITE is a refusal in words, thrown as an Error.

import { favoritesService } from "@/features/scopes/service/favoritesService";
import { describeWriteFailure } from "@/lib/errors/writeFailure";

/** Entity tokens whose stars live in user_entity_state. */
export type FavoriteEntityType = "agent" | "workflow" | "conversation";

/**
 * The caller's favorite ids among `ids`, in one round trip. `null` when the
 * read failed (already logged) — callers keep whatever they had.
 */
export async function readFavoriteIds(
  entityType: FavoriteEntityType,
  ids: readonly string[],
): Promise<Set<string> | null> {
  if (ids.length === 0) return new Set();
  const result = await favoritesService.getBulk(entityType, [...ids]);
  if (!result.ok) {
    console.error(
      `[favorites] ${entityType} favorites bulk read failed — rendering stars unset`,
      result.error,
    );
    return null;
  }
  return new Set(
    result.data.items.filter((s) => s.isFavorite).map((s) => s.entityId),
  );
}

/**
 * Overlay the caller's stars onto freshly-read rows. Every row's favorite is
 * set from user_entity_state (true iff it has the flag) — the row's own
 * column value, if the read still carried one, is never trusted. On a failed
 * read every row renders unset.
 */
export async function overlayFavorites<T>(
  entityType: FavoriteEntityType,
  rows: readonly T[],
  getId: (row: T) => string,
  withFavorite: (row: T, isFavorite: boolean) => T,
): Promise<T[]> {
  if (rows.length === 0) return [...rows];
  const favorites = await readFavoriteIds(entityType, rows.map(getId));
  return rows.map((row) => withFavorite(row, favorites?.has(getId(row)) ?? false));
}

/**
 * Star or unstar one record for the caller. Resolves when the store agreed;
 * throws an Error carrying the refusal in words otherwise.
 */
export async function writeFavorite(
  entityType: FavoriteEntityType,
  entityId: string,
  isFavorite: boolean,
): Promise<void> {
  const result = await favoritesService.setFavorite(
    entityType,
    entityId,
    isFavorite,
  );
  if (!result.ok) {
    const w = describeWriteFailure(result.error, {
      action: isFavorite
        ? `add this ${entityType} to your favorites`
        : `remove this ${entityType} from your favorites`,
      remedy: "Try again.",
    });
    throw new Error(`${w.title} ${w.description}`);
  }
}
