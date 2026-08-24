import type {
  MessageRole,
  MessageTemplateDB,
} from "@/features/message-templates/types/message-templates-db";

export type TemplateSaveMode = "create" | "update";
export type TemplateUpdateMethod = "append" | "overwrite";

export function isMessageRole(value: string): value is MessageRole {
  return (
    value === "system" ||
    value === "user" ||
    value === "assistant" ||
    value === "tool"
  );
}

export function isTemplateUpdateMethod(
  value: string,
): value is TemplateUpdateMethod {
  return value === "append" || value === "overwrite";
}

export function composeTemplateContent(
  existingContent: string | null,
  incomingContent: string,
  method: TemplateUpdateMethod,
): string {
  const incoming = incomingContent.trim();
  if (method === "overwrite") return incoming;
  return [existingContent?.trim(), incoming].filter(Boolean).join("\n\n");
}

export function templateDisplayName(template: MessageTemplateDB): string {
  return template.label?.trim() || "Untitled template";
}
