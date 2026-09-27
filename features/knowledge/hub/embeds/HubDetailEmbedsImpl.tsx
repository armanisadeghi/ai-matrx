"use client";

/**
 * Every hub embed, compiled as ONE piece behind the one `dynamic` edge in
 * `HubDetailEmbed.tsx` (the code-splitting law: one boundary per surface, at
 * its edge).
 */

import type { HubEmbed } from "./embedFor";
import { ConversationEmbed } from "./ConversationEmbed";
import { NoteEmbed } from "./NoteEmbed";
import { SourceEmbed } from "./SourceEmbed";

export default function HubDetailEmbedsImpl({ embed }: { embed: HubEmbed }) {
  switch (embed.kind) {
    case "conversation":
      return <ConversationEmbed conversationId={embed.conversationId} messageId={embed.messageId} />;
    case "note":
      return <NoteEmbed noteId={embed.noteId} />;
    default:
      return <SourceEmbed sourceId={embed.sourceId} deepLink={embed.deepLink} />;
  }
}
