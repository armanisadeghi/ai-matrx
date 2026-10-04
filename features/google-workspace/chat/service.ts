import type { components } from "@ai-matrx/agents/generated/api-types";
import { postGoogleBackend } from "@/features/marketing/google/service";
import { requireOrganizationContext } from "@/lib/api/organization-context";

export type ChatMessagesRequest = components["schemas"]["ChatMessagesRequest"];
export type ChatMessagesPreview = components["schemas"]["ChatMessagesPreview"];

const instantPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const spacePattern = /^spaces\/[A-Za-z0-9_-]+$/;
const messagePattern = /^spaces\/[A-Za-z0-9_-]+\/messages\/[A-Za-z0-9_-]+$/;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function instant(value: unknown): value is string {
  return typeof value === "string" && instantPattern.test(value) &&
    Number.isFinite(Date.parse(value));
}

function optionalText(value: unknown): boolean {
  return value === undefined || value === null || typeof value === "string";
}

export function validateChatRequest(request: ChatMessagesRequest): void {
  if (
    !request.connection_id.trim() ||
    !spacePattern.test(request.space_resource_name) ||
    !instant(request.start_time) || !instant(request.end_time) ||
    Date.parse(request.start_time) >= Date.parse(request.end_time) ||
    !Number.isInteger(request.page_size) || request.page_size < 1 || request.page_size > 1000 ||
    (request.order_by !== "createTime ASC" && request.order_by !== "createTime DESC") ||
    (request.continuation !== undefined &&
      (typeof request.continuation !== "string" || !request.continuation.trim()))
  ) throw new Error("Check the space, time window, page size, and order.");
}

export function validateChatPreview(value: unknown, request: ChatMessagesRequest): ChatMessagesPreview {
  if (!record(value) ||
    typeof value.account_label !== "string" || !value.account_label.trim() ||
    value.connection_id !== request.connection_id ||
    value.space_resource_name !== request.space_resource_name ||
    value.start_time !== request.start_time || value.end_time !== request.end_time ||
    value.page_size !== request.page_size || value.order_by !== request.order_by ||
    value.omitted_system_messages !== true ||
    !Array.isArray(value.messages) || value.messages.length > request.page_size ||
    !optionalText(value.continuation) ||
    (typeof value.continuation === "string" && !value.continuation.trim())
  ) throw new Error("Google Chat returned an invalid page.");

  for (const message of value.messages) {
    if (!record(message) || typeof message.resource_name !== "string" ||
      !messagePattern.test(message.resource_name) ||
      !message.resource_name.startsWith(`${request.space_resource_name}/messages/`) ||
      !optionalText(message.thread_resource_name) ||
      !optionalText(message.sender_resource_name) ||
      !optionalText(message.sender_type) ||
      !optionalText(message.create_time) ||
      (message.create_time != null && !instant(message.create_time)) ||
      !optionalText(message.text) ||
      !["text", "text_with_other_content", "other_content", "unavailable"].includes(String(message.content_state)) ||
      ((message.content_state === "text" || message.content_state === "text_with_other_content") &&
        typeof message.text !== "string")
    ) throw new Error("Google Chat returned an invalid message.");
  }
  return value as ChatMessagesPreview;
}

export async function previewChatMessages(request: ChatMessagesRequest, organizationId: string): Promise<ChatMessagesPreview> {
  validateChatRequest(request);
  const context = requireOrganizationContext(organizationId);
  const response = await postGoogleBackend(
    "/google-workspace/chat/messages/preview", request,
    "Google Chat messages could not load. Try again.", context,
  );
  return validateChatPreview(await response.json(), request);
}
