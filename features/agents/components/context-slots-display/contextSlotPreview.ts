import type { ContextObjectType } from "@/features/agents/types/agent-api-types";
import {
  previewKnownContext,
  resolveContextEntryValue,
} from "./knownContextValues";

const PREVIEW_MAX = 32;

/** Server `size_hint` for deferred context — NOT the document's byte length. */
const SIZE_HINT_RE = /^\d[\d,]*\s*chars$/i;

function formatCharCount(n: number): string {
  return `~${n.toLocaleString()} chars`;
}

/** Char length from a plain string or rich `{ content }` context object. */
function extractCharCount(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed || SIZE_HINT_RE.test(trimmed)) return null;
    return value.length;
  }
  if (typeof value === "object" && value !== null && "content" in value) {
    const content = (value as { content: unknown }).content;
    if (typeof content === "string" && content.length > 0) {
      return content.length;
    }
  }
  return null;
}

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
    if (SIZE_HINT_RE.test(collapsed)) return "";
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

/**
 * Preview line for a context entry on a message chip / popover row.
 *
 * Historical turns persist deferred context as `size_hint: "0 chars"` (zero
 * inlined — not zero document length). Prefer the live conversation value for
 * char count when the snapshot is a label placeholder or size hint.
 */
export function contextSlotEntryPreview(
  entry: { key: string; value: unknown; label?: string },
  type: ContextObjectType,
  liveValue?: unknown,
): string {
  const label = entry.label?.trim();
  const resolved = resolveContextEntryValue(entry, liveValue);

  const knownPreview = previewKnownContext(entry.key, resolved);
  if (knownPreview) return knownPreview;

  const liveChars = extractCharCount(liveValue);
  if (liveChars !== null) return formatCharCount(liveChars);

  const snapChars = extractCharCount(entry.value);
  if (snapChars !== null) return formatCharCount(snapChars);

  const textPreview = contextSlotValuePreview(resolved, type);
  if (!textPreview) return "";
  if (label && textPreview === label) return "";
  return textPreview;
}
