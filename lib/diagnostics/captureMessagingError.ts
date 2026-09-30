import { captureError, getSnapshot, resolveCapturedError, type CapturedOperation } from "./errorCaptureStore";
import { supabaseErrorCaptureId } from "./supabaseErrorCapture";

/** Structural so older package diagnostics still produce a useful capture. */
export interface MessagingDiagnostic {
  level: "info" | "warn" | "error";
  message: string;
  remedy?: string | undefined;
  code?: string | undefined;
  operation?: string | undefined;
  conversationId?: string | undefined;
  error?: unknown;
}

export function captureMessagingError(event: MessagingDiagnostic, userMessage: string): void {
  try {
    const id = supabaseErrorCaptureId(event.error);
    if (id && getSnapshot().some((entry) => entry.id === id)) {
      resolveCapturedError(id, {
        conversationId: event.conversationId,
        userMessage,
        name: event.error instanceof Error ? event.error.name : undefined,
        stack: event.error instanceof Error ? event.error.stack : undefined,
      });
      return;
    }
    const operationName = event.operation ?? event.message.match(/^([A-Za-z]+):/)?.[1];
    const operation: CapturedOperation =
      operationName === "markRead" || operationName === "setConversationFlags" ||
      operationName === "removeMember" || operationName === "setMemberRole" ? "update" : "unknown";
    captureError({
      source: "messaging",
      operation,
      relation: operation === "update" ? "dm_conversation_participants" : operationName ?? "messaging",
      schema: operation === "update" ? "communication" : undefined,
      code: event.code,
      message: event.message,
      hint: event.remedy,
      userMessage,
      conversationId: event.conversationId,
      name: event.error instanceof Error ? event.error.name : undefined,
      stack: event.error instanceof Error ? event.error.stack : undefined,
      raw: event,
    });
  } catch { /* Diagnostic capture must not interrupt the operation or its toast. */ }
}
