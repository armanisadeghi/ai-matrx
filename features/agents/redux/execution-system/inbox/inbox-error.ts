export interface InboxEnqueueError {
  message?: string | null;
  status?: number | null;
}

export interface InboxEnqueueFailure {
  message: string;
  reportAsSystemError: boolean;
  toastSeverity: "error" | "info";
}

/**
 * A missing conversation is recoverable stale client state, not a system fault.
 * The failed optimistic card and toast still tell the user that nothing queued.
 */
export function classifyInboxEnqueueFailure(
  error: InboxEnqueueError,
): InboxEnqueueFailure {
  if (error.status === 404) {
    return {
      message: "This conversation is no longer available. Open a current conversation and try again.",
      reportAsSystemError: false,
      toastSeverity: "info",
    };
  }

  return {
    message: error.message ?? "The server rejected the queued message.",
    reportAsSystemError: true,
    toastSeverity: "error",
  };
}
