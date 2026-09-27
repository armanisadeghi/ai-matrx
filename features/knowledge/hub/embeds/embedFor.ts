/**
 * features/knowledge/hub/embeds/embedFor.ts — WHICH full detail screen a hit
 * opens inside the hub's peek (KNOWLEDGE-HUB §5.2, H6b; Notion's side peek:
 * the full page in a pane), and where inside it to land.
 *
 * Per-kind parity: a kind gets an embed only once it is listed in
 * `EMBED_PARITY` — its own screen, rendered in the pane, doing what the full
 * page does. Every other kind (and an unknown Source kind) keeps the light
 * peek. Pure: the peek and the tests call the same function.
 */

import type { KnowledgeHit } from "@/features/knowledge/api/knowledgeSearch";
import type { SourceDeepLink } from "@/features/source-studio/sourceStudioModel";

/** The Source kinds the Source screen embed covers, by the screen path it takes. */
export const SOURCE_EMBED_VARIANT = {
  web_page: "web",
  scrape_parsed_page: "web",
  cld_file: "file",
  transcript: "transcript",
  youtube_video: "transcript",
} as const;

export type SourceEmbedVariant = (typeof SOURCE_EMBED_VARIANT)[keyof typeof SOURCE_EMBED_VARIANT];

/**
 * The parity register: each embedded kind, and the kind's own component it
 * renders (never a copy). A kind leaves this list → it falls back to the light
 * peek, nothing else changes.
 */
export const EMBED_PARITY = {
  web: "features/source-studio/components/SourceStudio.tsx (web path: WebSourceView)",
  file: "features/source-studio/components/SourceStudio.tsx (PDF/file path: OriginalPane → PDF studio viewer)",
  transcript: "features/source-studio/components/SourceStudio.tsx (timed path: OriginalPane players)",
  conversation: "features/agents/components/messages-display/AgentConversationDisplay.tsx",
  note: "features/notes/components/NoteContentEditor.tsx",
} as const;

export type EmbedKind = keyof typeof EMBED_PARITY;

export type HubEmbed =
  | { kind: SourceEmbedVariant; sourceId: string; deepLink: SourceDeepLink }
  | { kind: "conversation"; conversationId: string; messageId: string | null }
  | { kind: "note"; noteId: string };

function sourceVariant(sourceKind: string | null | undefined): SourceEmbedVariant | null {
  if (!sourceKind) return null;
  return (SOURCE_EMBED_VARIANT as Record<string, SourceEmbedVariant>)[sourceKind] ?? null;
}

/** "p. 12" → 12 (the server's locator for a paged passage). */
function pageFromLocator(locator: string | null | undefined): number | null {
  const m = locator ? /\bp\.?\s*(\d+)/i.exec(locator) : null;
  const n = m ? Number.parseInt(m[1], 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

function withParity(embed: HubEmbed | null): HubEmbed | null {
  return embed && embed.kind in EMBED_PARITY ? embed : null;
}

/** The embed a hit opens, or null → the light peek. */
export function embedFor(hit: KnowledgeHit): HubEmbed | null {
  if (hit.entity === "processed_document") {
    const kind = sourceVariant(hit.source_kind);
    return withParity(
      kind ? { kind, sourceId: hit.id, deepLink: { page: null, chunkId: null, assets: false, ms: null } } : null,
    );
  }
  if (hit.entity === "segment" && hit.segment?.source_id) {
    const seg = hit.segment;
    const kind = sourceVariant(hit.source_kind ?? seg.source_kind);
    if (!kind) return null;
    const page = seg.page_numbers?.find((n) => Number.isFinite(n) && n > 0) ?? pageFromLocator(seg.locator);
    const ms = typeof seg.t0_ms === "number" && Number.isFinite(seg.t0_ms) && seg.t0_ms >= 0 ? seg.t0_ms : null;
    return withParity({
      kind,
      sourceId: seg.source_id,
      // The Segment IS a chunk: the screen opens on its portion (and, timed,
      // plays from it); an explicit `t0_ms` wins over the portion's start.
      deepLink: { page: page ?? null, chunkId: hit.id, assets: false, ms },
    });
  }
  if (hit.entity === "conversation") {
    return withParity({
      kind: "conversation",
      conversationId: hit.id,
      messageId: hit.matches?.find((m) => !!m.message_id)?.message_id ?? null,
    });
  }
  if (hit.entity === "note") return withParity({ kind: "note", noteId: hit.id });
  return null;
}

/** A stable key for one embed target — the embed remounts when it changes. */
export function embedKey(embed: HubEmbed): string {
  switch (embed.kind) {
    case "conversation":
      return `conversation:${embed.conversationId}:${embed.messageId ?? ""}`;
    case "note":
      return `note:${embed.noteId}`;
    default:
      return `source:${embed.sourceId}:${embed.deepLink.chunkId ?? ""}:${embed.deepLink.page ?? ""}:${embed.deepLink.ms ?? ""}`;
  }
}

/** The group of a transcript that shows `messageId` (any member, not just the last). */
export function findMessageGroup(root: ParentNode, messageId: string): HTMLElement | null {
  for (const el of Array.from(root.querySelectorAll<HTMLElement>("[data-message-ids]"))) {
    if ((el.dataset.messageIds ?? "").split(" ").includes(messageId)) return el;
  }
  return null;
}
