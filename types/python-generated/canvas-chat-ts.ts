// AUTO-GENERATED — do not edit manually.
// Source: aidream.services.conversation_context.opening_turn
// Run: uv run python scripts/generate_types.py canvas-chat
//   or fetch via `pnpm sync-types` (pulls /schema/bundle/canvas-chat-ts).
//
// Constants shared by the Studio's canvas chats and the agents behind
// them. Guard: aidream/services/conversation_context/tests/
// test_opening_turn_marker.py ties this value to the six live agents'
// authored opening user turns.

/** The sentence every canvas-chat agent's authored opening user turn ends
 *  with. `stripOpeningTurn` trims up to and including it on replay so the
 *  first bubble shows the Creator's own words, never the template. */
export const OPENING_TURN_MARKER = "My request follows.";
