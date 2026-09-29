import type { Database } from "@/types/database.types";
import { type JsonObject, isJsonObject } from "@/types/json";

type MessageTemplateTable = Database["agent"]["Tables"]["message_template"];

export type MessageTemplateDB = MessageTemplateTable["Row"];
export type MessageTemplateUpdate = MessageTemplateTable["Update"];
export type MessageTemplateEditorSource = Pick<
  MessageTemplateDB,
  "id" | "label" | "content" | "metadata" | "role" | "tags" | "published_to_web"
>;
export type MessageRole = NonNullable<MessageTemplateDB["role"]>;

export type CreateMessageTemplateInput = Pick<
  MessageTemplateTable["Insert"],
  "label" | "content" | "role" | "tags" | "organization_id"
> & {
  label: string;
  content: string;
  role: MessageRole;
  metadata?: JsonObject;
  /** "Published to the web" — the row's only anonymous lane. */
  published_to_web?: boolean;
};

export type UpdateMessageTemplateInput = Partial<CreateMessageTemplateInput> & {
  id: string;
};

export interface MessageTemplateQueryOptions {
  role?: MessageRole;
  /** Set = a deliberate library browse filtered by "Published to the web". */
  publishedToWeb?: boolean;
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
