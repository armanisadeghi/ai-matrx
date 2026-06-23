/**
 * Derive a human-friendly dataset name for chat table conversion.
 *
 * Priority:
 * 1. Last markdown heading (# …) in the source message before this table
 * 2. Canvas artifact title
 * 3. Short label from column headers
 * 4. Generic fallback (caller may still pass through resolveUniqueDatasetName)
 */

import { supabase } from "@/utils/supabase/client";
import { convertCxContentToDisplay } from "@/features/cx-chat/utils/cx-content-converter";
import { normalizeDatasetDisplayName } from "@/features/data-tables/resolve-unique-dataset-name";

const HEADING_RE = /^(#{1,6})[ \t]+(.+?)\s*#*\s*$/;

function cleanHeadingText(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .trim();
}

function findHeadingAtLineStart(
  content: string,
  lineStartIndex: number,
): { level: number; text: string } | null {
  const lineEnd = content.indexOf("\n", lineStartIndex);
  const line = content.slice(
    lineStartIndex,
    lineEnd === -1 ? content.length : lineEnd,
  );
  const match = HEADING_RE.exec(line);
  if (!match) return null;
  return { level: match[1].length, text: match[2].trim() };
}

/** Walk backwards from `offset` to find the nearest ATX heading above. */
export function findLastHeadingBeforeOffset(
  content: string,
  offset: number,
): string | null {
  if (!content) return null;

  const clamped = Math.max(0, Math.min(offset, content.length));
  let searchFrom = clamped;

  while (searchFrom >= 0) {
    const lineStart =
      searchFrom === 0 ? 0 : content.lastIndexOf("\n", searchFrom - 1) + 1;
    const found = findHeadingAtLineStart(content, lineStart);
    if (found) {
      const cleaned = cleanHeadingText(found.text);
      return cleaned || null;
    }
    if (lineStart === 0) break;
    searchFrom = lineStart - 1;
  }

  return null;
}

async function fetchMessageDisplayText(
  messageId: string | null | undefined,
): Promise<string | null> {
  if (!messageId) return null;
  const { data, error } = await supabase
    .from("cx_message")
    .select("content")
    .eq("id", messageId)
    .maybeSingle();
  if (error || !data) return null;
  return convertCxContentToDisplay(data.content).content;
}

/** Locate the table in flattened message text for heading lookup. */
export function findTableOffsetInMessage(
  messageText: string,
  canvasItemId: string,
  tableMarkdown: string,
): number {
  const artifactIdx = messageText.indexOf(`id="${canvasItemId}"`);
  if (artifactIdx >= 0) return artifactIdx;

  const firstLine = tableMarkdown
    .split("\n")
    .map((l) => l.trim())
    .find(Boolean);
  if (firstLine) {
    const lineIdx = messageText.indexOf(firstLine);
    if (lineIdx >= 0) return lineIdx;
  }

  return messageText.length;
}

function deriveNameFromHeaders(headers: string[]): string | null {
  const cleaned = headers
    .map((h) => h.trim())
    .filter((h) => h && !/^column\s*\d+$/i.test(h));
  if (cleaned.length === 0) return null;

  if (cleaned.length === 1 && cleaned[0].length >= 3) {
    return cleaned[0];
  }

  const short = cleaned.filter((h) => h.length <= 28).slice(0, 2);
  if (short.length >= 2) return short.join(" · ");
  if (cleaned[0].length <= 48) return cleaned[0];
  return null;
}

export interface DeriveDatasetNameForChatTableArgs {
  sourceMessageId?: string | null;
  canvasItemId: string;
  artifactTitle?: string | null;
  tableMarkdown: string;
  headers: string[];
}

/**
 * Best-effort preferred name before uniqueness resolution.
 */
export async function deriveDatasetNameForChatTable(
  args: DeriveDatasetNameForChatTableArgs,
): Promise<string> {
  const messageText = await fetchMessageDisplayText(args.sourceMessageId);
  if (messageText) {
    const offset = findTableOffsetInMessage(
      messageText,
      args.canvasItemId,
      args.tableMarkdown,
    );
    const heading = findLastHeadingBeforeOffset(messageText, offset);
    if (heading) {
      const normalized = normalizeDatasetDisplayName(heading);
      if (normalized) return normalized;
    }
  }

  const title = args.artifactTitle?.trim();
  if (title) return normalizeDatasetDisplayName(title);

  const fromHeaders = deriveNameFromHeaders(args.headers);
  if (fromHeaders) return normalizeDatasetDisplayName(fromHeaders);

  return "Table from chat";
}
