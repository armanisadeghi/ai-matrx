/**
 * THE merge for a list row the CLIENT built from its own execution state
 * (`buildConversationListItemFromExecution`) landing on a row a list already
 * holds — the history scopes and the `conversationList` entity store both use
 * it, so the two can never disagree.
 *
 * A client-built row is a placeholder for everything the page did not know:
 * title/description "" until the history loads, messageCount 1, createdAt and
 * updatedAt "now", favorite/KG flags false. A stream re-announces a known
 * conversation on every cold rejoin (replay starts at frame one), so letting
 * those placeholders win blanked a known title to "Conversation <id>"
 * (real test 2026-10-03). Rule: a known value is never replaced by an unknown
 * one; the activity itself still moves the row to the newer `updatedAt`.
 *
 * Server fetches do NOT use this — a fetched row is truth and replaces.
 */
import type { ConversationListItem } from "./conversation-list.types";

function known(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function later(a: string | undefined, b: string | undefined): string | undefined {
  if (!a) return b;
  if (!b) return a;
  return +new Date(b) > +new Date(a) ? b : a;
}

function earlier(a: string | undefined, b: string | undefined): string | undefined {
  if (!a) return b;
  if (!b) return a;
  return +new Date(b) < +new Date(a) ? b : a;
}

export function mergeLiveListRow<T extends ConversationListItem>(
  existing: T,
  incoming: Partial<T> & { conversationId: string },
): T {
  return {
    ...existing,
    ...incoming,
    title: known(incoming.title) ? incoming.title : existing.title,
    description: known(incoming.description)
      ? incoming.description
      : existing.description,
    createdAt: earlier(existing.createdAt, incoming.createdAt),
    updatedAt: later(existing.updatedAt, incoming.updatedAt) ?? existing.updatedAt,
    messageCount: Math.max(existing.messageCount ?? 0, incoming.messageCount ?? 0),
    // Placeholder flags are always false; only an explicit true is news.
    isFavorite: existing.isFavorite || incoming.isFavorite === true,
    excludeFromKg: existing.excludeFromKg || incoming.excludeFromKg === true,
  };
}
