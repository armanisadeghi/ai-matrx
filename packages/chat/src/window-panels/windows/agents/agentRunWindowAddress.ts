/**
 * The Chat window's address, in one place.
 *
 * `agentRunWindow` and the agent display-mode shells (`agentFlexiblePanel`,
 * `agentFloatingChat`, …) share the `agent` URL key, and they are not the same
 * kind of thing: a shell IS one conversation, while the Chat window HOSTS
 * conversations and outlives any of them. Both wrote `agent:<id>` and nothing
 * else, so a restored Chat link was read as a conversation id and reopened as
 * a floating chat on a conversation that never existed.
 *
 * The `m` arg is what tells them apart, so the value lives here and both the
 * window that mints it and the hydrator that reads it import it.
 */
export const AGENT_RUN_WINDOW_URL_MODE = "run";

/** `?panels=` arg carrying the agent the Chat window is bound to. */
export const AGENT_RUN_WINDOW_AGENT_ARG = "a";

/** `?panels=` arg carrying the conversation the Chat window has open. */
export const AGENT_RUN_WINDOW_CONVERSATION_ARG = "c";

/**
 * The conversation id the Chat window may put in its address (`c-<id>`).
 *
 * A conversation the person OPENED (picked from history) always exists on the
 * server, so it is always addressable. The window's own FRESH conversation has
 * no `chat.conversation` row until its first turn is sent — the hydrator reads
 * an addressed id back from the server with `expectMaterialized: true`, so
 * naming an unsent one made every reload of a never-used window paint "Couldn't
 * load this conversation… the read failed". An unsent window therefore leaves
 * the id out: the address still says "a Chat window on this agent" (`m-run`,
 * `a-<agent>`), and the restore opens it as an empty new chat.
 */
export function addressableConversationId(args: {
  selectedConversationId: string | null;
  liveConversationId: string | null;
  liveConversationHasMessages: boolean;
}): string | null {
  if (args.selectedConversationId) return args.selectedConversationId;
  return args.liveConversationHasMessages ? args.liveConversationId : null;
}
