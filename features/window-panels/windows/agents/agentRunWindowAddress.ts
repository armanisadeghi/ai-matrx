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
