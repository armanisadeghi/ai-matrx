// Validation for the one safe game-room lifecycle write. A live game has
// timers, presence and study sessions, so agents may only retire the host's
// current waiting room. Pure by design: it runs before the approval card and
// again when the approved write is applied.

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
