import type { ContextObjectType } from "@/features/agents/types/agent-api-types";

const PREVIEW_MAX = 32;

export function contextSlotValuePreview(
  value: unknown,
  type: ContextObjectType,
): string {
  if (value === undefined || value === null) return "";
  if (type === "file_url" && typeof value === "string") {
    try {
      const url = new URL(value);
      return url.pathname.split("/").pop() || url.hostname;
    } catch {
      return value.slice(0, PREVIEW_MAX);
    }
  }
  if (typeof value === "string") {
    const collapsed = value.replace(/\s+/g, " ").trim();
    return collapsed.length > PREVIEW_MAX
      ? collapsed.slice(0, PREVIEW_MAX) + "…"
      : collapsed;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    const json = JSON.stringify(value);
    return json.length > PREVIEW_MAX ? json.slice(0, PREVIEW_MAX) + "…" : json;
  } catch {
    return "[object]";
  }
}
