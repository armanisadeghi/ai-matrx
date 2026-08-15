import type { Database } from "@/types/database.types";
import { type JsonObject, isJsonObject } from "@/types/json";

type MessageTemplateTable = Database["agent"]["Tables"]["message_template"];

export type MessageTemplateDB = MessageTemplateTable["Row"];
export type MessageTemplateUpdate = MessageTemplateTable["Update"];
export type MessageTemplateEditorSource = Pick<
  MessageTemplateDB,
  "id" | "label" | "content" | "metadata" | "role" | "tags" | "visibility"
>;
export type MessageRole = NonNullable<MessageTemplateDB["role"]>;
export type MessageVisibility = MessageTemplateDB["visibility"];

export type CreateMessageTemplateInput = Pick<
  MessageTemplateTable["Insert"],
  "label" | "content" | "role" | "tags"
> & {
  label: string;
  content: string;
  role: MessageRole;
  metadata?: JsonObject;
  visibility?: MessageVisibility;
};

export type UpdateMessageTemplateInput = Partial<CreateMessageTemplateInput> & {
  id: string;
};

export interface MessageTemplateQueryOptions {
  role?: MessageRole;
  visibility?: MessageVisibility;
  search?: string;
  tags?: string[];
  limit?: number;
  offset?: number;
  order_by?: "label" | "created_at" | "updated_at" | "role";
  order_direction?: "asc" | "desc";
}

export interface MessageTemplatesResponse {
  templates: MessageTemplateDB[];
  total: number;
}

export interface TemplatesByRole {
  [role: string]: MessageTemplateDB[];
}

/** Narrow only the JSONB field; the generated row remains the source of truth. */
export function readMessageTemplateMetadata(value: unknown): JsonObject {
  return isJsonObject(value) ? value : {};
}
