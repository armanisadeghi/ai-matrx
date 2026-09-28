// Validation for the one safe game-room lifecycle write. A live game has
// timers, presence and study sessions, so agents may only retire the host's
// current waiting room. Pure by design: it runs before the approval card and
// again when the approved write is applied.

/**
 * An agent may create one room from the host composer currently on screen.
 * The target intentionally accepts no source, room size, or game config: those
 * values belong to the learner's visible host form and use the same path as
 * its Create room button.
 */
export function parseCurrentHostRoomCreation(value: unknown): void {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).length !== 1 ||
    (value as { source?: unknown }).source !== "current_host_composer"
  ) {
    throw new Error(
      'create_game_room expects { "source": "current_host_composer" }. It can only create the room currently configured on this page. Nothing was changed.',
    );
  }
}

/** Read the sole current-room id from a delete_game_rooms request. */
export function parseLobbyRoomCancellation(
  value: unknown,
  currentRoomId: string | null,
): string {
  if (!Array.isArray(value)) {
    throw new Error(
      "delete_game_rooms expects an array with this room's id. Nothing was changed.",
    );
  }
  if (value.length !== 1) {
    throw new Error(
      "delete_game_rooms can cancel only this one waiting room, so send an array containing exactly one id. Nothing was changed.",
    );
  }
  const [id] = value;
  if (typeof id !== "string" || !id.trim()) {
    throw new Error(
      "delete_game_rooms[0] must be this room's id as text. Nothing was changed.",
    );
  }
  if (!currentRoomId || id !== currentRoomId) {
    throw new Error(
      "delete_game_rooms can only cancel the waiting room currently open on this page. Nothing was changed.",
    );
  }
  return id;
}
