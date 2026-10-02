/** Every route under `/chat` already is chat mode, including the landing,
 * direct-to-agent, voice, template, and durable-conversation variants. */
export function isChatRoutePath(pathname: string | null): boolean {
  return pathname === "/chat" || pathname?.startsWith("/chat/") === true;
}

/**
 * Builder manual runs keep a stable browser-local conversation key while each
 * turn is persisted under a fresh wire conversation id. The action must open
 * the durable row announced by that turn, never the local display key.
 */
export function resolveContinueInChatConversationId(
  localConversationId: string,
  reservedConversationId: string | null | undefined,
): string {
  return reservedConversationId ?? localConversationId;
}
