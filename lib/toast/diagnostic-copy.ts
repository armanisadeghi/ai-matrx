/** Keep package diagnostics in the console; show people a short next step. */
export function diagnosticToastCopy(
  source: "messaging" | "meet",
  message: string,
): { title: string; description: string } {
  if (source === "meet") {
    if (/camera|microphone|device/i.test(message)) {
      return {
        title: "Camera or microphone unavailable",
        description: "Check your browser permissions and try again.",
      };
    }
    return {
      title: "Couldn't complete that call action",
      description: "Try again in a moment.",
    };
  }

  const operation = message.match(/^([A-Za-z]+):/)?.[1];
  if (operation === "listConversations") {
    return {
      title: "Couldn't load conversations",
      description: "Refresh to try again.",
    };
  }
  if (
    operation === "loadMoreConversations" ||
    operation === "refreshArchivedCount" ||
    operation === "inboxRefresh" ||
    operation === "inboxBackfill" ||
    operation === "backfillConversation" ||
    operation === "setArchiveFilter"
  ) {
    return {
      title: "Couldn't update conversations",
      description: "Refresh to try again.",
    };
  }
  if (operation === "openConversation" || operation === "loadOlderMessages") {
    return {
      title: "Couldn't load messages",
      description: "Refresh to try again.",
    };
  }
  if (operation === "editMessage" || operation === "deleteMessage") {
    return {
      title: "Couldn't update the message",
      description: "Try again.",
    };
  }
  if (operation === "markRead") {
    return {
      title: "Couldn't mark messages as read",
      description: "Try again.",
    };
  }
  return {
    title: "Messaging couldn't finish that action",
    description: "Try again in a moment.",
  };
}
