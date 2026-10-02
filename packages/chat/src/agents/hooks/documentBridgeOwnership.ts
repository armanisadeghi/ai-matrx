const activeBridgeMounts = new Map<string, number>();

/**
 * Register a mounted document bridge. Only the first mount for a conversation
 * owns hydration; sibling controls still subscribe to the shared Redux state.
 */
export function acquireDocumentBridge(conversationId: string): boolean {
  const mounts = activeBridgeMounts.get(conversationId) ?? 0;
  activeBridgeMounts.set(conversationId, mounts + 1);
  return mounts === 0;
}

export function releaseDocumentBridge(conversationId: string): void {
  const mounts = activeBridgeMounts.get(conversationId) ?? 0;
  if (mounts <= 1) {
    activeBridgeMounts.delete(conversationId);
    return;
  }
  activeBridgeMounts.set(conversationId, mounts - 1);
}

